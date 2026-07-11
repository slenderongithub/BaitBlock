"use strict";

/**
 * Frontend render test.
 *
 * Loads the real public/index.html into jsdom, executes public/script.js in that
 * window, feeds it an actual backend-generated response via a mocked fetch, and
 * asserts the redesigned result UI (gauge, verdict, breakdown bars, panels)
 * populates correctly without throwing.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const { analyzeUrl } = require("../src/analyze");
const { CLICKBAIT_HTML } = require("./fixtures");

const PUBLIC = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
const scriptSrc = fs.readFileSync(path.join(PUBLIC, "script.js"), "utf8");

async function bootFrontend(apiResponse) {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true, // provides requestAnimationFrame
    url: "http://localhost/",
  });
  const { window } = dom;

  // jsdom doesn't implement matchMedia — provide a minimal stub.
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

  // Mock the analyze endpoint.
  window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => apiResponse,
  });

  // Execute the app script inside the jsdom window.
  const scriptEl = window.document.createElement("script");
  scriptEl.textContent = scriptSrc;
  window.document.body.appendChild(scriptEl);

  return dom;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

test("frontend renders a full result from a real backend response", async () => {
  const apiResponse = await analyzeUrl("https://example.com/news", {
    fetchArticle: async () => ({ html: CLICKBAIT_HTML, finalUrl: "https://example.com/news" }),
  });

  const dom = await bootFrontend(apiResponse);
  const { document } = dom.window;

  // Drive the form the way a user would.
  document.getElementById("articleUrl").value = "https://example.com/news";
  document.getElementById("analyzeForm").dispatchEvent(new dom.window.Event("submit"));
  await flush();

  const resultCard = document.getElementById("resultCard");
  assert.ok(!resultCard.classList.contains("hidden"), "result card should be visible");
  assert.ok(resultCard.classList.contains("risky"), "clickbait result should get the risky class");

  assert.equal(document.getElementById("verdictBadge").textContent, "Clickbait");
  assert.match(document.getElementById("headlineText").textContent, /SHOCKING secret/);
  assert.ok(
    document.getElementById("engineChip").textContent.includes("node-heuristic"),
    "engine chip should reflect the backend"
  );

  // Score breakdown bars rendered (4 rows).
  assert.equal(document.querySelectorAll("#breakdownBars .bar-row").length, 4);
  // At least one signal rendered.
  assert.ok(document.querySelectorAll("#signalsList li").length > 0);
  // Metrics and article-info definition lists populated.
  assert.ok(document.querySelectorAll("#metricsList div").length >= 4);
  assert.ok(document.querySelectorAll("#articleInfoList div").length >= 6);

  dom.window.close();
});

test("frontend shows an error banner when the API returns an error", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: "Refusing to fetch a private or reserved address." }),
  });
  const scriptEl = window.document.createElement("script");
  scriptEl.textContent = scriptSrc;
  window.document.body.appendChild(scriptEl);

  const { document } = window;
  document.getElementById("articleUrl").value = "http://127.0.0.1/";
  document.getElementById("analyzeForm").dispatchEvent(new window.Event("submit"));
  await flush();

  const banner = document.getElementById("errorBanner");
  assert.ok(!banner.classList.contains("hidden"), "error banner should be visible");
  assert.match(document.getElementById("errorText").textContent, /private or reserved/);
  window.close();
});

test("theme toggle flips data-theme and persists", async () => {
  const dom = await bootFrontend({ verdict: "Likely Legit", composite_sensationalism_score: 5 });
  const { document, localStorage } = dom.window;

  assert.equal(document.documentElement.getAttribute("data-theme"), "light");
  document.getElementById("themeToggle").dispatchEvent(new dom.window.Event("click"));
  assert.equal(document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(localStorage.getItem("baitblock-theme"), "dark");

  dom.window.close();
});
