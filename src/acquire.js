"use strict";

/**
 * Tiered article acquisition. Tries progressively heavier strategies and stops
 * at the first that yields a *usable* article (a real title + enough body):
 *
 *   0. Direct HTTP with browser headers        (safeFetch)
 *   1. Readable-alt routes: AMP version, RSS/Atom feed item   (altRoutes)
 *   2. Headless browser render (Playwright)     (headless)   [live-only]
 *   3. Public archive snapshot (Wayback)        (archive)    [robots-exempt]
 *
 * Cross-cutting: robots.txt compliance for the live tiers, per-domain
 * politeness, and an in-memory response cache. Every network hop stays behind
 * the SSRF guard (via safeHttpGet / headless's own validation).
 *
 * Returns { html, finalUrl, via } — `via` records which tier succeeded.
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

// Lazy so the app still boots if Playwright/its browser isn't installed.
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

function probe(html) {
  try {
    const $ = cheerio.load(html);
    const jsonLd = parseJsonLdNodes($);
    const title = extractTitle($);
    const { bodyText } = extractBodyText($, jsonLd);
    return { title, words: getTokens(bodyText).length };
  } catch {
    return { title: "", words: 0 };
  }
}

function usable(html) {
  if (!html) return false;
  const { title, words } = probe(html);
  return Boolean(title) && words >= config.fetch.minBodyWords;
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/**
 * @param {string} rawUrl
 * @returns {Promise<{ html: string, finalUrl: string, via: string }>}
 */
async function acquireArticle(rawUrl) {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new FetchError("URL format is invalid.", 400);
  }

  const cached = cache.get(rawUrl);
  if (cached) return cached;

  // Enforce the SSRF / protocol policy up front so a blocked URL fails cleanly
  // (400) instead of being swallowed by tier escalation. Each tier re-validates
  // its own hops (incl. redirects) as defense-in-depth.
  await assertUrlAllowed(target);

  const done = (result) => {
    cache.set(rawUrl, result);
    return result;
  };

  const ua = config.fetch.userAgent;
  const allowLive = await robots.isAllowed(rawUrl, ua);

  let seedHtml = null;
  let seedUrl = rawUrl;
  let snapshotHint = null;

  if (allowLive) {
    // Tier 0 — direct HTTP with browser headers.
    try {
      await politeness.waitTurn(target.hostname);
      const r = await safeHttpGet(rawUrl);
      seedHtml = r.html;
      seedUrl = r.finalUrl;
      if (r.ok && isAllowedContentType(r.contentType) && usable(r.html)) {
        return done({ html: r.html, finalUrl: r.finalUrl, via: "http" });
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
          if (r.ok && usable(r.html)) {
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
            if (usable(wrapped)) {
              return done({ html: wrapped, finalUrl: seedUrl, via: "feed" });
            }
          }
        } catch {
          /* continue */
        }
      }
    }

    // Tier 2 — headless browser render.
    const h = headless();
    if (h && config.fetch.headless.enabled) {
      try {
        const r = await h.renderArticle(rawUrl);
        if (usable(r.html)) {
          return done({ html: r.html, finalUrl: r.finalUrl, via: "headless" });
        }
        if (!seedHtml) {
          seedHtml = r.html;
          seedUrl = r.finalUrl;
        }
      } catch {
        /* escalate */
      }
    }
  }

  // Tier 3 — public archive (exempt from the origin's robots: a separate copy).
  if (config.fetch.archive.enabled) {
    try {
      const r = await archive.fetchFromArchive(rawUrl);
      if (r) {
        snapshotHint = r.snapshotUrl || null;
        if (usable(r.html)) {
          return done({ html: r.html, finalUrl: r.finalUrl, via: "wayback" });
        }
      }
    } catch {
      /* fall through to the failure message */
    }
  }

  const hint = snapshotHint ? ` A public archive snapshot exists: ${snapshotHint}` : "";
  if (!allowLive) {
    throw new FetchError(
      `This site disallows automated fetching in its robots.txt, and no readable archive copy was available.${hint}`,
      502
    );
  }
  throw new FetchError(
    `Could not extract a readable article (tried direct fetch, AMP, headless browser, and web archive).${hint}`,
    502
  );
}

module.exports = { acquireArticle };
