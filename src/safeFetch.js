"use strict";

/**
 * Hardened, SSRF-safe outbound fetch primitives used by the acquisition tiers.
 *
 * Protections the original one-line `fetch()` lacked:
 *   - SSRF validation of the initial URL *and every redirect hop*
 *   - a request timeout (AbortController)
 *   - a response-body size cap enforced while streaming (Content-Length is not
 *     trusted; it can be absent or lie)
 *   - browser-like request headers so header-sniffing bot filters don't 403 us
 *
 * `safeHttpGet` is the low-level primitive: it returns the response info even
 * for non-2xx statuses so callers (the tiered acquirer) can branch on 403/etc.
 * `safeFetchArticle` is the back-compatible article fetch that throws friendly
 * errors on non-OK / non-HTML responses.
 */

const { assertUrlAllowed } = require("./ssrfGuard");
const config = require("./config");
const { FetchError } = require("./errors");

// Browser-like headers so header-sniffing bot filters don't 403 us. Accept-Encoding
// is intentionally omitted so undici negotiates compression and decodes for us.
const BROWSER_HEADERS = {
  "User-Agent": config.fetch.userAgent,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function isAllowedContentType(headerValue) {
  if (!headerValue) return true; // Be lenient when the server omits it.
  const type = headerValue.split(";")[0].trim().toLowerCase();
  return config.fetch.allowedContentTypes.includes(type);
}

/**
 * Read a fetch Response body as text, aborting if it exceeds maxBytes.
 */
async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new FetchError("The article page is too large to analyze.", 413);
  }

  const body = response.body;
  if (!body) {
    return await response.text();
  }

  const reader = body.getReader();
  const chunks = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > maxBytes) {
        await reader.cancel();
        throw new FetchError("The article page is too large to analyze.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * SSRF-safe GET that follows redirects manually and returns the response info
 * WITHOUT throwing on HTTP status (so callers can branch on 403/429/etc.).
 * Throws FetchError only for invalid URL / network / timeout / SSRF / size /
 * redirect loop.
 * @param {string} rawUrl
 * @param {{ headers?: Record<string,string> }} [opts]
 * @returns {Promise<{status:number, ok:boolean, contentType:string, html:string, finalUrl:string}>}
 */
async function safeHttpGet(rawUrl, { headers = BROWSER_HEADERS } = {}) {
  let currentUrl;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new FetchError("URL format is invalid.", 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetch.timeoutMs);

  try {
    for (let hop = 0; hop <= config.fetch.maxRedirects; hop += 1) {
      // Validate BEFORE each network call so a redirect can't smuggle us to an
      // internal address.
      await assertUrlAllowed(currentUrl);

      let response;
      try {
        response = await fetch(currentUrl.toString(), {
          method: "GET",
          headers,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (err) {
        if (err.name === "AbortError") {
          throw new FetchError("The article took too long to respond.", 504);
        }
        throw new FetchError(
          "Could not reach that URL. The site may be down or blocking requests.",
          502
        );
      }

      // Manual redirect handling.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new FetchError("The article redirected without a destination.", 502);
        }
        currentUrl = new URL(location, currentUrl); // resolve relative redirects
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      const html = await readCapped(response, config.fetch.maxBytes);
      return {
        status: response.status,
        ok: response.ok,
        contentType,
        html,
        finalUrl: currentUrl.toString(),
      };
    }

    throw new FetchError("The article redirected too many times.", 508);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch an article URL, throwing friendly errors on non-OK / non-HTML.
 * Kept for backward compatibility and as the Tier-0 "strict" variant.
 * @param {string} rawUrl
 * @returns {Promise<{ html: string, finalUrl: string }>}
 */
async function safeFetchArticle(rawUrl) {
  const res = await safeHttpGet(rawUrl);

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new FetchError(
        `The site blocked our request (HTTP ${res.status}). Many large news sites sit behind bot protection that refuses automated readers.`,
        502
      );
    }
    if (res.status === 429) {
      throw new FetchError(
        "The site is rate-limiting automated requests (HTTP 429). Try again in a little while.",
        502
      );
    }
    throw new FetchError(`Failed to fetch article: HTTP ${res.status}`, 502);
  }

  if (!isAllowedContentType(res.contentType)) {
    throw new FetchError("That URL doesn't appear to be an HTML article.", 415);
  }

  return { html: res.html, finalUrl: res.finalUrl };
}

module.exports = {
  safeFetchArticle,
  safeHttpGet,
  isAllowedContentType,
  BROWSER_HEADERS,
  FetchError,
};
