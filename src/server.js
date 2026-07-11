"use strict";

/**
 * BaitBlock — Node/Express backend (entry point).
 *
 * Responsibilities are now split across focused modules:
 *   config.js      - tunable thresholds / limits
 *   ssrfGuard.js   - private-address protection
 *   safeFetch.js   - hardened outbound fetch (timeout, size cap, redirects)
 *   extraction.js  - HTML -> headline/body/metadata
 *   scoring.js     - the composite risk score
 *   nlp.js         - key phrases / entities / supporting sentences
 *   analyze.js     - orchestration (testable, network-injectable)
 *
 * This file only wires HTTP concerns: security headers, rate limiting, static
 * assets, and the two routes.
 */

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const config = require("./config");
const { analyzeUrl, FetchError } = require("./analyze");

const PUBLIC_DIR = path.join(__dirname, "..", "public");

function createApp() {
  const app = express();

  // Trust the first proxy hop so express-rate-limit sees real client IPs
  // behind a reverse proxy, without trusting arbitrary X-Forwarded-For chains.
  app.set("trust proxy", 1);

  // Security headers. CSP is strict because every asset is same-origin
  // (system fonts, self-hosted CSS/JS) — no external CDNs to allowlist.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
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
    })
  );

  app.use(express.json({ limit: "16kb" })); // request bodies are tiny { url }

  // Malformed JSON -> clean 400 instead of a stack trace.
  app.use((err, _req, res, next) => {
    if (err && err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Request body must be valid JSON." });
    }
    return next(err);
  });

  app.use(express.static(PUBLIC_DIR));

  const analyzeLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down and try again shortly." },
  });

  app.post("/api/analyze", analyzeLimiter, async (req, res) => {
    const { url } = req.body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Please provide a valid URL." });
    }

    try {
      const result = await analyzeUrl(url.trim());
      return res.json(result);
    } catch (error) {
      if (error instanceof FetchError) {
        return res.status(error.status).json({ error: error.message });
      }
      // Unexpected: log server-side, return a safe generic message.
      console.error("[analyze] unexpected error:", error);
      return res.status(500).json({
        error: "Could not analyze this URL right now. Please try a different link.",
      });
    }
  });

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  // SPA-style fallback: any other GET returns the single page.
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
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

module.exports = { createApp };
