"use strict";

/**
 * Central configuration for the BaitBlock Node backend.
 *
 * Everything here was previously hard-coded as bare literals scattered through
 * server.js. Extracting it into one place makes the scoring behaviour auditable
 * and tunable, and documents *why* each threshold has the value it does.
 *
 * IMPORTANT: the default scoring weights/thresholds below are intentionally
 * identical to the original heuristic so behaviour is preserved after the
 * refactor. Change them deliberately, not casually — they are calibrated
 * against the verdict buckets the UI and README describe.
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

  // ---- Scoring thresholds ----
  scoring: {
    // Below this headline/body similarity we call it a "semantic gap": the
    // headline and article don't appear to be about the same thing. 0.35 was
    // the original hand-tuned cutoff. NOTE: in the Node engine `similarity` is
    // lexical token overlap, so this is deliberately lenient.
    semanticGapThreshold: 0.35,
    // Absolute headline sentiment above this is treated as "sensational tone".
    sentimentMagnitudeThreshold: 0.5,
    // Verdict bucket cutoffs on the final 0-100 composite score.
    verdict: {
      clickbait: 70, // >= 70 -> "Clickbait" (risky)
      borderline: 40, // >= 40 -> "Borderline" (warning); else "Likely Legit"
    },
    // Point contributions per signal. Kept identical to the original engine.
    points: {
      baitPattern: 14,
      deceptionHint: 10,
      exclamationPer: 4,
      exclamationMax: 12,
      questionPer: 4,
      questionMax: 10,
      excessiveUppercase: 10,
      unusualLength: 6,
      semanticGap: 18,
      sensationalTone: 12,
      teaserNotEchoed: 12,
      synergyBonus: 6,
    },
    // A headline shorter/longer than these word counts reads as unusual.
    headline: {
      minWords: 4,
      maxWords: 20,
      uppercaseRatio: 0.45, // fraction of letters that are uppercase
      minLengthForUppercaseCheck: 16,
    },
    // Fallback score used when no headline could be extracted at all.
    noHeadlineScore: 65,
  },
};

module.exports = config;
