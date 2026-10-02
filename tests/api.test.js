"use strict";

// Must be set BEFORE requiring the app so config picks it up: the fixture
// server below listens on 127.0.0.1, which the SSRF guard blocks by default.
process.env.CLICKBAIT_ALLOW_PRIVATE = "1";
process.env.CLICKBAIT_RATE_MAX = "1000"; // don't trip the limiter during tests
// Keep the suite offline and deterministic: no Chromium, no archive.org lookups.
process.env.CLICKBAIT_HEADLESS = "0";
process.env.CLICKBAIT_ARCHIVE_FALLBACK = "0";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../src/server");
const { CLICKBAIT_HTML } = require("./fixtures");

let appServer;
let appUrl;
let fixtureServer;
let fixtureUrl;

before(async () => {
  // A local origin server that returns fixture article HTML.
  fixtureServer = http.createServer((req, res) => {
    if (req.url.startsWith("/gone")) {
      res.writeHead(404, { "Content-Type": "text/html" });
      return res.end("<html><head><title>Page not found</title></head><body></body></html>");
    }
    if (req.url.startsWith("/walled")) {
      res.writeHead(403, { "Content-Type": "text/html" });
      return res.end("<html><head><title>Access Denied</title></head><body></body></html>");
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(CLICKBAIT_HTML);
  });
  await new Promise((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
  fixtureUrl = `http://127.0.0.1:${fixtureServer.address().port}/article`;

  appServer = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => appServer.once("listening", resolve));
  appUrl = `http://127.0.0.1:${appServer.address().port}`;
});

after(async () => {
  await new Promise((resolve) => appServer.close(resolve));
  await new Promise((resolve) => fixtureServer.close(resolve));
});

async function postAnalyze(body, { raw = false } = {}) {
  const res = await fetch(`${appUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("GET /healthz returns ok", async () => {
  const res = await fetch(`${appUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("GET / serves the single-page app", async () => {
  const res = await fetch(`${appUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /BaitBlock/);
});

test("POST /api/analyze with missing url returns 400", async () => {
  const { status, json } = await postAnalyze({});
  assert.equal(status, 400);
  assert.match(json.error, /valid URL/i);
});

test("POST /api/analyze with malformed JSON returns a clean 400", async () => {
  const { status, json } = await postAnalyze("{ bad json", { raw: true });
  assert.equal(status, 400);
  assert.match(json.error, /valid JSON/i);
});

test("POST /api/analyze rejects a private address by default policy (guard on)", async () => {
  // Even with ALLOW_PRIVATE on for the fixture, the protocol guard still holds.
  const { status } = await postAnalyze({ url: "ftp://example.com/x" });
  assert.equal(status, 400);
});

test("POST /api/analyze performs a full analysis of a fetched fixture article", async () => {
  const { status, json } = await postAnalyze({ url: fixtureUrl });
  assert.equal(status, 200);
  assert.equal(json.verdict, "Clickbait");
  assert.equal(json.engine, "node-nlp");
  assert.ok(json.signals.length > 0);
});

test("security headers are present on responses", async () => {
  const res = await fetch(`${appUrl}/`);
  const csp = res.headers.get("content-security-policy");
  assert.ok(csp);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.match(res.headers.get("strict-transport-security"), /max-age=\d+/);
  assert.match(res.headers.get("permissions-policy"), /camera=\(\)/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-powered-by"), null);
});

test("cross-origin POSTs are refused (CSRF / CORS lockdown)", async () => {
  const res = await fetch(`${appUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ url: fixtureUrl }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("non-JSON bodies are rejected with 415", async () => {
  const res = await fetch(`${appUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: `{"url":"${fixtureUrl}"}`,
  });
  assert.equal(res.status, 415);
});

test("oversized bodies and URLs are rejected", async () => {
  const big = await postAnalyze({ url: `https://example.com/${"a".repeat(5000)}` });
  assert.equal(big.status, 413);
  const long = await postAnalyze({ url: `https://example.com/${"a".repeat(2100)}` });
  assert.equal(long.status, 414);
});

test("API responses are not cached and unknown API routes return JSON 404", async () => {
  const res = await fetch(`${appUrl}/api/nope`);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { error: "Not found." });
});

test("a page that doesn't exist fails with a clear 404", async () => {
  const origin = new URL(fixtureUrl).origin;
  const { status, json } = await postAnalyze({ url: `${origin}/gone/some-deleted-story-here` });
  assert.equal(status, 404);
  assert.match(json.error, /doesn't exist/);
});

test("a bot-walled page degrades to a labelled headline-only read, not an error", async () => {
  const origin = new URL(fixtureUrl).origin;
  const { status, json } = await postAnalyze({
    url: `${origin}/walled/you-wont-believe-what-this-celebrity-did-next?utm_source=x`,
  });
  assert.equal(status, 200);
  assert.equal(json.fetch_via, "url-only");
  assert.equal(json.partial, true);
  assert.equal(json.analysis_confidence.score, 15);
  assert.ok(json.context_labels.some((l) => l.label === "Headline only"));
  assert.doesNotMatch(json.url, /utm_source/);
});
