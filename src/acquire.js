"use strict";

/**
 * Tiered article acquisition. Tries progressively heavier strategies and stops
 * at the first that yields a *usable* article (a real title + enough body):
 *
 *   0. Direct HTTP with browser headers, one retry on transient failure (safeFetch)
 *   1. Readable-alt routes: AMP version, RSS/Atom feed item   (altRoutes)
 *   2. Headless browser render (Playwright / installed Chrome)   (headless)  [live-only]
 *   3. Public archive snapshot (Wayback)        (archive)    [robots-exempt]
 *
 * If no tier yields a full article it degrades instead of failing:
 *   - partial: the best real page seen (title + whatever body it had), or
 *   - url-only: the headline words in the link slug, when the site walls off
 *     automated readers entirely (403/challenge) and no archive copy exists.
 * Both are flagged (`partial`) so the analysis reports low confidence.
 * Pages that genuinely don't exist (404/410) still fail with a clear error.
 *
 * Cross-cutting: tracking parameters stripped (canonical URL), robots.txt for
 * live tiers, per-domain politeness, in-memory cache. Every network hop stays
 * behind the SSRF guard (via safeHttpGet / headless's own validation).
 *
 * Returns { html, finalUrl, via, partial? }.
 */

const cheerio = require("cheerio");
const config = require("./config");
const { FetchError } = require("./errors");
const { assertUrlAllowed } = require("./ssrfGuard");
const { safeHttpGet, isAllowedContentType } = require("./safeFetch");
const { parseJsonLdNodes, extractTitle, extractBodyText } = require("./extraction");
const { getTokens } = require("./textUtils");
const cache = require("./cache");
const robots = require("./robots");
const politeness = require("./politeness");
const altRoutes = require("./altRoutes");
const archive = require("./archive");

// Lazy so the app still boots if Playwright isn't installed.
let headlessMod = null;
function headless() {
  if (headlessMod === null) {
    try {
      headlessMod = require("./headless");
    } catch {
      headlessMod = false;
    }
  }
  return headlessMod;
}

// Query params that only track the click. Stripping them gives one cache entry
// per story, and some robots.txt files disallow exactly these variants
// (e.g. Al Jazeera: Disallow: /*?traffic_source=).
const TRACKING_PARAM =
  /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|traffic_source|at_medium|at_campaign|ns_\w+|ito|cmpid|ocid|smid|sref|ref_src|guccounter)$/i;

function canonicalUrl(rawUrl) {
  const u = new URL(rawUrl);
  [...u.searchParams.keys()].forEach((k) => TRACKING_PARAM.test(k) && u.searchParams.delete(k));
  u.hash = "";
  return u.toString();
}

// Bot-wall / interstitial pages that must never be analyzed as the article.
const CHALLENGE_TITLE =
  /just a moment|access denied|attention required|are you a (robot|human)|confirm you are human|verify you are human|human verification|security check|pardon our interruption|request blocked|captcha|403 forbidden|404 not found|page not found|^(\w+\.)?\w+\.(com|org|net)$/i;

function probe(html) {
  try {
    const $ = cheerio.load(html);
    const jsonLd = parseJsonLdNodes($);
    const title = extractTitle($);
    const { bodyText } = extractBodyText($, jsonLd, html);
    return { title, words: getTokens(bodyText).length };
  } catch {
    return { title: "", words: 0 };
  }
}

const isChallenge = (title) => !title || CHALLENGE_TITLE.test(title.trim());

/** Headline from a descriptive slug: /2026/10/nikki-glaser-apology-joke -> "Nikki glaser apology joke". */
function headlineFromSlug(url) {
  const segments = new URL(url).pathname
    .split("/")
    .map((s) => decodeURIComponent(s).replace(/\.\w{2,5}$/, ""))
    .filter(Boolean);
  const best = segments
    .map((s) =>
      s
        .split(/[-_]+/)
        .filter(
          (w) => /^[a-z']+$/i.test(w) && !/^(html?|php|amp|index|story|article|news)$/i.test(w)
        )
    )
    .sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 3) return "";
  const text = best.join(" ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tier 0 with one retry on a transient network/HTTP failure. */
async function directFetch(url, host) {
  for (let attempt = 0; ; attempt += 1) {
    await politeness.waitTurn(host);
    try {
      const r = await safeHttpGet(url);
      if (attempt === 0 && TRANSIENT.has(r.status)) {
        await sleep(1000);
        continue;
      }
      return r;
    } catch (err) {
      const transient = err instanceof FetchError && (err.status === 502 || err.status === 504);
      if (attempt === 0 && transient) {
        await sleep(1000);
        continue;
      }
      throw err;
    }
  }
}

/**
 * @param {string} rawUrl
 * @returns {Promise<{ html: string, finalUrl: string, via: string, partial?: boolean }>}
 */
async function acquireArticle(rawUrl) {
  let url;
  try {
    url = canonicalUrl(rawUrl);
  } catch {
    throw new FetchError("URL format is invalid.", 400);
  }
  const target = new URL(url);

  const cached = cache.get(url);
  if (cached) return cached;

  // Enforce the SSRF / protocol policy up front so a blocked URL fails cleanly
  // (400) instead of being swallowed by tier escalation. Each tier re-validates
  // its own hops (incl. redirects) as defense-in-depth.
  await assertUrlAllowed(target);

  const done = (result) => {
    cache.set(url, result);
    return result;
  };

  const statuses = []; // HTTP statuses seen from the live origin
  let partial = null; // best real (non-challenge) page that wasn't fully usable
  const consider = (html, finalUrl, via) => {
    if (!html) return false;
    const p = probe(html);
    if (isChallenge(p.title)) return false;
    if (p.words >= config.fetch.minBodyWords) return true;
    if (!partial || p.words > partial.words) partial = { html, finalUrl, via, words: p.words };
    return false;
  };

  const allowLive = await robots.isAllowed(url, config.fetch.userAgent);
  let seedHtml = null;
  let seedUrl = url;
  let snapshotHint = null;

  if (allowLive) {
    // Tier 0 — direct HTTP with browser headers.
    try {
      const r = await directFetch(url, target.hostname);
      statuses.push(r.status);
      if (r.ok && isAllowedContentType(r.contentType)) {
        seedHtml = r.html;
        seedUrl = r.finalUrl;
        if (consider(r.html, r.finalUrl, "http")) {
          return done({ html: r.html, finalUrl: r.finalUrl, via: "http" });
        }
      } else if (r.html) {
        seedHtml = r.html; // a 403 page can still advertise AMP / feed links
      }
    } catch {
      /* escalate */
    }

    // Tier 1 — readable-alt routes derived from whatever we saw.
    if (seedHtml) {
      const ampUrl = altRoutes.findAmpUrl(seedHtml, seedUrl);
      if (ampUrl && ampUrl !== seedUrl) {
        try {
          await politeness.waitTurn(new URL(ampUrl).hostname);
          const r = await safeHttpGet(ampUrl);
          if (r.ok && consider(r.html, r.finalUrl, "amp")) {
            return done({ html: r.html, finalUrl: r.finalUrl, via: "amp" });
          }
        } catch {
          /* continue */
        }
      }

      for (const feed of altRoutes.findFeedUrls(seedHtml, seedUrl).slice(0, 2)) {
        try {
          const r = await safeHttpGet(feed);
          if (!r.ok) continue;
          const item = altRoutes.matchFeedItem(r.html, seedUrl);
          if (item && (item.html || item.title)) {
            const wrapped =
              `<!doctype html><html><head><title>${escapeHtml(item.title)}</title></head>` +
              `<body><h1>${escapeHtml(item.title)}</h1>${item.html || ""}</body></html>`;
            if (consider(wrapped, seedUrl, "feed")) {
              return done({ html: wrapped, finalUrl: seedUrl, via: "feed" });
            }
          }
        } catch {
          /* continue */
        }
      }
    }

    // Tier 2 — headless browser render. Skipped for a confirmed 404/410.
    const h = headless();
    const gone = statuses.length && statuses.every((s) => s === 404 || s === 410);
    if (h && config.fetch.headless.enabled && !gone) {
      try {
        const r = await h.renderArticle(url);
        if (r.status) statuses.push(r.status);
        if (consider(r.html, r.finalUrl, "headless")) {
          return done({ html: r.html, finalUrl: r.finalUrl, via: "headless" });
        }
      } catch {
        /* escalate */
      }
    }
  }

  // Tier 3 — public archive (exempt from the origin's robots: a separate copy).
  if (config.fetch.archive.enabled) {
    try {
      const r = await archive.fetchFromArchive(url);
      if (r) {
        snapshotHint = r.snapshotUrl || null;
        if (consider(r.html, r.finalUrl, "wayback")) {
          return done({ html: r.html, finalUrl: r.finalUrl, via: "wayback" });
        }
      }
    } catch {
      /* fall through */
    }
  }

  // ---- Degrade instead of failing ----
  if (partial) {
    return done({
      html: partial.html,
      finalUrl: partial.finalUrl,
      via: partial.via,
      partial: true,
    });
  }

  if (statuses.length && statuses.every((s) => s === 404 || s === 410)) {
    throw new FetchError(
      `That page doesn't exist (HTTP ${statuses[0]}). Check the link — it may have been moved or deleted.`,
      404
    );
  }

  const slugHeadline = headlineFromSlug(url);
  if (slugHeadline) {
    const html =
      `<!doctype html><html><head><title>${escapeHtml(slugHeadline)}</title></head>` +
      `<body><h1>${escapeHtml(slugHeadline)}</h1></body></html>`;
    // Not cached: a later attempt may get the real page.
    return { html, finalUrl: url, via: "url-only", partial: true };
  }

  const hint = snapshotHint ? ` A public archive snapshot exists: ${snapshotHint}` : "";
  if (!allowLive) {
    throw new FetchError(
      `This site disallows automated fetching in its robots.txt, and no readable archive copy was available.${hint}`,
      502
    );
  }
  const blocked = statuses.some((s) => [401, 403, 405, 429, 451].includes(s));
  throw new FetchError(
    blocked
      ? `The site blocks automated readers (HTTP ${statuses.find((s) => s >= 400)}) and no archive copy exists yet.${hint}`
      : `Could not extract a readable article (tried direct fetch, AMP, RSS, headless browser, and web archive).${hint}`,
    502
  );
}

module.exports = { acquireArticle, canonicalUrl, headlineFromSlug, isChallenge };
