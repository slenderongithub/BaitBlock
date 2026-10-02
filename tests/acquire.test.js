"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const cheerio = require("cheerio");

const { canonicalUrl, headlineFromSlug, isChallenge } = require("../src/acquire");
const { extractBodyText, parseJsonLdNodes } = require("../src/extraction");
const { decodeBody } = require("../src/safeFetch");
const { computeScore } = require("../src/scoring");
const { getTokens } = require("../src/textUtils");

test("canonicalUrl strips tracking params but keeps meaningful ones", () => {
  assert.equal(
    canonicalUrl("https://www.aljazeera.com/news/a-b?traffic_source=rss&utm_source=x&id=7#top"),
    "https://www.aljazeera.com/news/a-b?id=7"
  );
});

test("headlineFromSlug reads descriptive slugs and rejects opaque ones", () => {
  assert.equal(
    headlineFromSlug(
      "https://www.buzzfeed.com/jamieko/nikki-glaser-briel-adams-wheatley-apology-joke"
    ),
    "Nikki glaser briel adams wheatley apology joke"
  );
  assert.equal(headlineFromSlug("https://example.com/story.php?storyId=1001"), "");
  assert.equal(headlineFromSlug("https://example.com/a/123456"), "");
});

test("bot-wall interstitials are never treated as the article", () => {
  for (const t of [
    "Just a moment...",
    "Access Denied",
    "Let's confirm you are human",
    "forbes.com",
    "",
  ]) {
    assert.ok(isChallenge(t), t);
  }
  assert.equal(isChallenge("City council approves water budget"), false);
});

test("articles written in <span>/<div> blocks (no <p>) are still extracted", () => {
  const para = (i) =>
    `<div class="subbuzz"><span class="js-subbuzz__title-text">Paragraph ${i} explains in plain words what happened at the council meeting on Tuesday, who said what about the budget, and why residents care about it this year</span></div>`;
  const html = `<html><head><title>T</title></head><body><nav>Home News</nav><article>${Array.from(
    { length: 8 },
    (_, i) => para(i)
  ).join("")}</article></body></html>`;
  const $ = cheerio.load(html);
  const r = extractBodyText($, parseJsonLdNodes($), html);
  assert.equal(r.extractionMethod, "Readability (reader view)");
  assert.ok(getTokens(r.bodyText).length > 150);
  assert.match(r.bodyText, /Tuesday, who said what/);
});

test("decodeBody honours the declared charset", () => {
  assert.equal(
    decodeBody(Buffer.from([0x63, 0x61, 0x66, 0xe9]), "text/html; charset=windows-1252"),
    "café"
  );
});

test("a link-only read skips page checks instead of penalising them", () => {
  const r = computeScore("Nikki glaser briel adams wheatley apology joke", "", {
    fetchVia: "url-only",
    hostname: "www.buzzfeed.com",
  });
  const dim = (k) => r.dimensions.find((d) => d.key === k);
  assert.equal(dim("sourcing").score, 0);
  assert.equal(dim("transparency").score, 0);
  assert.equal(r.analysis_confidence.score, 15);
  assert.equal(r.verdict, "Headline Only"); // never "Straight Reporting" for an unread article
  assert.equal(dim("sourcing").assessed, false);
  assert.equal(dim("bait").assessed, true);
  assert.ok(r.context_labels.some((l) => l.label === "Headline only"));
});
