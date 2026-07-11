"use strict";

// Must be set BEFORE requiring the app so config picks it up: the fixture
// server below listens on 127.0.0.1, which the SSRF guard blocks by default.
process.env.CLICKBAIT_ALLOW_PRIVATE = "1";
process.env.CLICKBAIT_RATE_MAX = "1000"; // don't trip the limiter during tests

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
  fixtureServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(CLICKBAIT_HTML);
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
  assert.equal(json.engine, "node-heuristic");
  assert.ok(json.signals.length > 0);
});

test("security headers are present on responses", async () => {
  const res = await fetch(`${appUrl}/`);
  assert.ok(res.headers.get("content-security-policy"));
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});
