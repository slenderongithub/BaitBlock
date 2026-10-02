"use strict";

/**
 * BaitBlock — Node/Express backend (entry point).
 *
 * Responsibilities are split across focused modules:
 *   config.js      - tunable thresholds / limits
 *   ssrfGuard.js   - private-address protection (validation + connect-time)
 *   safeFetch.js   - hardened outbound fetch (timeout, size cap, redirects)
 *   acquire.js     - tiered article acquisition
 *   extraction.js  - HTML -> headline/body/metadata
 *   scoring.js     - the six-dimension risk engine
 *   nlp.js         - key phrases / entities / supporting sentences / claims
 *   analyze.js     - orchestration (testable, network-injectable)
 *
 * This file only wires HTTP concerns: security headers, request validation,
 * abuse limits, security logging, static assets, and the routes.
 */

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const config = require("./config");
const { analyzeUrl, FetchError } = require("./analyze");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const MAX_URL_LENGTH = 2048;

/** One JSON line per security-relevant event, to stderr (picked up by any log drain). */
function securityLog(event, req, details = {}) {
  console.warn(
    JSON.stringify({
      at: new Date().toISOString(),
      type: "security",
      event,
      ip: req.ip,
      ...details,
    })
  );
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function createApp() {
  const app = express();

  // Trust the first proxy hop so express-rate-limit sees real client IPs
  // behind a reverse proxy, without trusting arbitrary X-Forwarded-For chains.
  app.set("trust proxy", 1);

  // Security headers. CSP is strict because every asset is same-origin and no
  // markup uses inline styles/scripts (JS styling goes through the CSSOM,
  // which CSP doesn't restrict). Helmet also sends HSTS (1 year,
  // includeSubDomains), nosniff, frame-ancestors none, and drops X-Powered-By.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );
  app.use((_req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
    );
    next();
  });

  app.use(express.static(PUBLIC_DIR, { dotfiles: "ignore", index: "index.html" }));

  // ---- API ----
  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Same-origin only. The page and API share an origin and no CORS headers
  // are ever sent; on top of that, refuse requests a browser marks as
  // cross-site so other sites can't drive our fetcher with their visitors.
  api.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    const origin = req.get("origin");
    const crossSite = req.get("sec-fetch-site") === "cross-site";
    if (crossSite || (origin && hostOf(origin) !== req.hostname)) {
      securityLog("cross_origin_blocked", req, { origin });
      return res.status(403).json({ error: "Cross-origin requests are not allowed." });
    }
    return next();
  });

  api.use((req, res, next) => {
    if (req.method === "POST" && !req.is("application/json")) {
      securityLog("bad_content_type", req, { contentType: req.get("content-type") });
      return res.status(415).json({ error: "Request body must be JSON." });
    }
    return next();
  });
  api.use(express.json({ limit: "4kb" })); // bodies are a single { url }

  const analyzeLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      securityLog("rate_limited", req);
      res.status(options.statusCode).json({
        error: "Too many requests. Please slow down and try again shortly.",
      });
    },
  });

  // Cap concurrent analyses server-wide: each one can open several outbound
  // connections and possibly a headless browser, so a burst from many IPs
  // shouldn't be able to exhaust memory.
  let inFlight = 0;

  api.post("/analyze", analyzeLimiter, async (req, res) => {
    const { url } = req.body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Please provide a valid URL." });
    }
    if (url.length > MAX_URL_LENGTH) {
      securityLog("url_too_long", req, { length: url.length });
      return res.status(414).json({ error: "That URL is too long." });
    }
    if (inFlight >= config.maxConcurrentAnalyses) {
      securityLog("concurrency_cap", req, { inFlight });
      res.setHeader("Retry-After", "5");
      return res.status(503).json({ error: "The press is busy. Please try again in a moment." });
    }

    inFlight += 1;
    try {
      const result = await analyzeUrl(url.trim());
      return res.json(result);
    } catch (error) {
      if (error instanceof FetchError) {
        if (error.code === "ssrf_blocked") {
          securityLog("ssrf_blocked", req, { host: hostOf(url.trim()) });
        }
        return res.status(error.status).json({ error: error.message });
      }
      // Unexpected: log server-side, return a safe generic message.
      console.error("[analyze] unexpected error:", error);
      return res.status(500).json({
        error: "Could not analyze this URL right now. Please try a different link.",
      });
    } finally {
      inFlight -= 1;
    }
  });

  api.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use("/api", api);

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  // SPA-style fallback: any other GET returns the single page.
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });

  // Final error handler: JSON only, never a stack trace (Express's default
  // handler prints one whenever NODE_ENV isn't "production").
  app.use((err, req, res, _next) => {
    if (err && err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Request body must be valid JSON." });
    }
    if (err && err.type === "entity.too.large") {
      securityLog("payload_too_large", req, { length: req.get("content-length") });
      return res.status(413).json({ error: "Request body is too large." });
    }
    console.error("[server] unhandled error:", err);
    return res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

// Only listen when executed directly (not when imported by tests).
if (require.main === module) {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`BaitBlock is running at http://localhost:${config.port}`);
  });
}

module.exports = { createApp, securityLog };
