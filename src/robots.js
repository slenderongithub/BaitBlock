"use strict";

/**
 * robots.txt compliance for the LIVE fetch tiers. Fetches + caches each origin's
 * robots.txt and checks our User-Agent against it. Fails open: if robots.txt is
 * missing or unreadable, the fetch is allowed (standard crawler behaviour).
 *
 * The archive fallback deliberately does NOT consult this — it reads a separate
 * public copy (the Internet Archive), not the origin.
 */

const robotsParser = require("robots-parser");
const config = require("./config");
const { safeHttpGet } = require("./safeFetch");

const cache = new Map(); // origin -> { parser: Robots|null, expires: number }

async function isAllowed(rawUrl, userAgent) {
  if (!config.fetch.respectRobots) return true;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }
  const origin = url.origin;

  let entry = cache.get(origin);
  if (!entry || Date.now() > entry.expires) {
    let parser = null;
    try {
      const robotsUrl = `${origin}/robots.txt`;
      const res = await safeHttpGet(robotsUrl);
      if (res.ok && res.contentType.toLowerCase().includes("text") && res.html) {
        parser = robotsParser(robotsUrl, res.html);
      }
    } catch {
      parser = null; // fail open
    }
    entry = { parser, expires: Date.now() + config.fetch.cacheTtlMs };
    cache.set(origin, entry);
  }

  if (!entry.parser) return true;
  // robots-parser returns true / false / undefined; treat undefined as allowed.
  return entry.parser.isAllowed(rawUrl, userAgent) !== false;
}

module.exports = { isAllowed };
