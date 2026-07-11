"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { analyzeUrl } = require("../src/analyze");
const { CLICKBAIT_HTML, LEGIT_HTML } = require("./fixtures");

function fixtureFetcher(html, finalUrl = "https://example.com/news") {
  return async () => ({ html, finalUrl });
}

test("analyzeUrl produces a Clickbait verdict for a sensational fixture", async () => {
  const result = await analyzeUrl("https://example.com/news", {
    fetchArticle: fixtureFetcher(CLICKBAIT_HTML),
  });

  assert.equal(result.verdict, "Clickbait");
  assert.equal(result.bucket, "risky");
  assert.equal(result.engine, "node-heuristic");
  assert.equal(result.headline_extracted, true);
  assert.match(result.headline, /SHOCKING secret/);
  assert.ok(Array.isArray(result.signals) && result.signals.length > 0);
  assert.ok(result.score_breakdown.hook_points > 0);
});

test("analyzeUrl produces a low-risk verdict for an aligned legit fixture", async () => {
  const result = await analyzeUrl("https://example.com/news", {
    fetchArticle: fixtureFetcher(LEGIT_HTML),
  });

  assert.ok(["Likely Legit", "Borderline"].includes(result.verdict));
  assert.ok(result.score < 70);
});

test("analyzeUrl response contains the full documented field contract", async () => {
  const result = await analyzeUrl("https://example.com/news", {
    fetchArticle: fixtureFetcher(CLICKBAIT_HTML),
  });

  for (const field of [
    "url",
    "headline",
    "verdict",
    "composite_sensationalism_score",
    "legitimacy_confidence_score",
    "summary",
    "signals",
    "body_snippet",
    "source_domain",
    "score_breakdown",
    "key_phrases",
    "named_entities",
    "entity_groups",
    "supporting_sentences",
    "cosine_similarity_score",
    "sentiment_polarity",
    "meta_description",
  ]) {
    assert.ok(field in result, `missing field: ${field}`);
  }

  // Dead field from the old engine must NOT reappear.
  assert.equal("isLikelyClickbait" in result, false);
});
