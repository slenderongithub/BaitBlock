"use strict";

/**
 * Tier 2: headless-browser rendering (Playwright/Chromium) for JS-rendered pages
 * and soft challenges that a plain fetch can't handle.
 *
 * SSRF SAFETY: the browser resolves DNS and connects itself, bypassing our
 * socket-level guard, so we re-apply the SSRF policy here — validate the initial
 * target, and intercept every request to (a) block non-http(s) schemes and
 * (b) re-validate main-frame navigations/redirects against assertUrlAllowed.
 * The Chromium sandbox is left ENABLED (we render untrusted pages).
 */

const config = require("./config");
const { assertUrlAllowed } = require("./ssrfGuard");
const { FetchError } = require("./errors");

let browserPromise = null;
let closing = false;

function getBrowser() {
  if (!browserPromise) {
    const { chromium } = require("playwright");
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

async function closeBrowser() {
  if (browserPromise && !closing) {
    closing = true;
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      /* ignore */
    }
    browserPromise = null;
    closing = false;
  }
}

/**
 * Render a URL in a headless browser and return its DOM HTML.
 * @returns {Promise<{ html: string, finalUrl: string }>}
 */
async function renderArticle(rawUrl) {
  if (!config.fetch.headless.enabled) {
    throw new FetchError("Headless rendering is disabled.", 501);
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new FetchError("URL format is invalid.", 400);
  }
  await assertUrlAllowed(target); // validate the initial navigation target

  let browser;
  try {
    browser = await getBrowser();
  } catch {
    throw new FetchError("Headless browser is unavailable.", 501);
  }

  const context = await browser.newContext({
    userAgent: config.fetch.userAgent,
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // SSRF: validate EVERY request's host (not just navigations) so a malicious
  // page can't make the browser hit an internal address via a sub-resource/XHR
  // and smuggle the response back into the DOM we scrape. Cached per host so a
  // page with many resources doesn't trigger a DNS lookup per request.
  const hostVerdicts = new Map(); // host -> Promise<boolean allowed>
  try {
    await context.route("**/*", async (route) => {
      const req = route.request();
      let u;
      try {
        u = new URL(req.url());
      } catch {
        return route.abort();
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") return route.abort();
      if (!hostVerdicts.has(u.host)) {
        hostVerdicts.set(
          u.host,
          assertUrlAllowed(u).then(
            () => true,
            () => false
          )
        );
      }
      const allowed = await hostVerdicts.get(u.host);
      if (!allowed) return route.abort();
      return route.continue();
    });

    await page.goto(rawUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.fetch.headless.timeoutMs,
    });
    try {
      await page.waitForLoadState("networkidle", {
        timeout: config.fetch.headless.networkIdleMs,
      });
    } catch {
      /* best-effort settle */
    }

    const html = await page.content();
    const finalUrl = page.url();
    return { html, finalUrl };
  } finally {
    await context.close();
  }
}

// Tear down the shared browser on shutdown (hooks register lazily on first use).
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.once(sig, async () => {
    await closeBrowser();
    process.exit(0);
  });
}

module.exports = { renderArticle, closeBrowser };
