"use strict";

/**
 * Central configuration for the BaitBlock Node backend.
 *
 * Everything here was previously hard-coded as bare literals scattered through
 * server.js. Extracting it into one place makes the scoring behaviour auditable
 * and tunable, and documents *why* each threshold has the value it does.
 *
 * IMPORTANT: the scoring constants below are contract-tested
 * (tests/scoring.test.js, tests/analyze.test.js). Change them deliberately —
 * they are calibrated against the tier cutoffs the UI and README describe.
 */

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
};

const config = {
  // ---- HTTP server ----
  port: toInt(process.env.PORT, 3000),
  // Server-wide cap on analyses running at once (each may open several
  // outbound connections and a headless browser). Excess requests get 503.
  maxConcurrentAnalyses: toInt(process.env.CLICKBAIT_MAX_CONCURRENT, 8),

  // ---- Outbound fetch safety (see safeFetch.js / ssrfGuard.js) ----
  fetch: {
    // Hard ceiling on how long we wait for the target article to respond.
    // The original Node backend had NO timeout, so a slow host could pin a
    // request open forever. 15s matches typical reverse-proxy read timeouts.
    timeoutMs: toInt(process.env.CLICKBAIT_FETCH_TIMEOUT_MS, 15000),
    // Cap the response body we will buffer before parsing. Article HTML is
    // rarely >2-3MB; anything larger is almost certainly not an article and
    // is a memory/DoS risk when handed to cheerio. 5MB is a generous ceiling.
    maxBytes: toInt(process.env.CLICKBAIT_FETCH_MAX_BYTES, 5 * 1024 * 1024),
    // Redirects are followed manually so each hop can be re-validated against
    // the SSRF guard (a public URL can 3xx to an internal one).
    maxRedirects: toInt(process.env.CLICKBAIT_FETCH_MAX_REDIRECTS, 5),
    // A realistic desktop-browser UA. The old self-identifying "BaitBlock/1.0"
    // bot UA was 403'd by most large news sites' bot protection. This gets past
    // header-sniffing filters; sites behind JS-challenge walls (Cloudflare, etc.)
    // will still block a plain server-side fetch regardless of UA.
    userAgent:
      process.env.CLICKBAIT_USER_AGENT ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    // Only these top-level content types are parsed as articles.
    allowedContentTypes: ["text/html", "application/xhtml+xml"],

    // ---- Tiered acquisition (see acquire.js) ----
    // Respect the target site's robots.txt for the LIVE fetch. The archive
    // fallback is exempt: it reads a separate public copy, not the origin.
    respectRobots: toBool(process.env.CLICKBAIT_RESPECT_ROBOTS, true),
    // Minimum extracted body words for a fetch result to count as "usable"
    // before we escalate to the next tier.
    minBodyWords: toInt(process.env.CLICKBAIT_MIN_BODY_WORDS, 60),
    // Polite minimum gap between requests to the same host.
    perDomainMinIntervalMs: toInt(process.env.CLICKBAIT_DOMAIN_MIN_INTERVAL_MS, 1000),
    // In-memory response cache (avoids re-fetching the same URL).
    cacheTtlMs: toInt(process.env.CLICKBAIT_CACHE_TTL_MS, 15 * 60 * 1000),
    cacheMax: toInt(process.env.CLICKBAIT_CACHE_MAX, 200),
    // Tier 2: headless browser rendering (Playwright) for JS-rendered pages.
    headless: {
      enabled: toBool(process.env.CLICKBAIT_HEADLESS, true),
      timeoutMs: toInt(process.env.CLICKBAIT_HEADLESS_TIMEOUT_MS, 20000),
      networkIdleMs: toInt(process.env.CLICKBAIT_HEADLESS_NETWORKIDLE_MS, 3000),
      // Chromium pages are memory-heavy; beyond this, skip straight to the archive tier.
      maxConcurrent: toInt(process.env.CLICKBAIT_HEADLESS_MAX_CONCURRENT, 2),
      // How long a request waits for a free render slot before skipping the tier.
      queueWaitMs: toInt(process.env.CLICKBAIT_HEADLESS_QUEUE_WAIT_MS, 30000),
    },
    // Tier 3: public archive fallback (Wayback Machine).
    archive: {
      enabled: toBool(process.env.CLICKBAIT_ARCHIVE_FALLBACK, true),
    },
  },

  // ---- SSRF policy ----
  ssrf: {
    // When true, private / loopback / link-local / reserved addresses are
    // allowed. This MUST stay false in any internet-facing deployment; it
    // exists so the integration tests can point at a local fixture server,
    // and so trusted internal deployments can opt in explicitly.
    allowPrivateAddresses: toBool(process.env.CLICKBAIT_ALLOW_PRIVATE, false),
  },

  // ---- Rate limiting (see server.js) ----
  rateLimit: {
    windowMs: toInt(process.env.CLICKBAIT_RATE_WINDOW_MS, 60 * 1000),
    max: toInt(process.env.CLICKBAIT_RATE_MAX, 20), // requests per window per IP
  },

  // ---- Scoring (see scoring.js; signal definitions in data/rules.json) ----
  scoring: {
    // Dimension points -> 0-100 via 100*(1-e^(-points/saturation)): 50 points
    // reads as ~63, 100 as ~86, so stacking signals has diminishing returns.
    saturation: 50,
    // Dimension risks below this are treated as noise when combining (noisy-OR
    // dead zone), so many tiny flags can't add up to a high overall score.
    deadZone: 15,
    // Overall-score tier cutoffs: <20 minimal, <40 low, <60 moderate, <80 high, else severe.
    tiers: [20, 40, 60, 80],
    // Headline model: probabilities below the floor add nothing; 1.0 adds max.
    modelFloor: 0.35,
    modelMaxPoints: 70,
    // Headline/body alignment (0-1) at or above this adds no consistency risk.
    alignmentOk: 0.6,
    // Below this alignment the legacy `semantic_gap` flag is set.
    semanticGapThreshold: 0.35,
    // |sentiment polarity| above this sets the legacy `sensational_tone` flag.
    sentimentMagnitudeThreshold: 0.5,
    // Bodies shorter than this (words) are too thin to judge sourcing/consistency.
    minBodyWords: 80,
  },
};

module.exports = config;
