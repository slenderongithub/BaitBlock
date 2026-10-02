"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { analyzeUrl } = require("../src/analyze");
const F = require("./fixtures");

const run = (html, finalUrl = "https://example.com/news/story") =>
  analyzeUrl(finalUrl, { fetchArticle: async () => ({ html, finalUrl }) });

// The heart of the contract: each kind of article gets its own verdict.
const CASES = [
  ["CLICKBAIT_HTML", undefined, "Clickbait", "risky"],
  ["LEGIT_HTML", undefined, "Straight Reporting", "safe"],
  ["MISLEADING_SCIENCE_HTML", undefined, "Misleading Headline", "risky"],
  ["SCAM_HTML", "http://abcnews.com.co/health/pill", "Manipulative", "risky"],
  ["RUMOR_HTML", undefined, "Unsubstantiated", "risky"],
  ["SPONSORED_HTML", undefined, "Sponsored Content", "warning"],
  ["SATIRE_HTML", "https://www.theonion.com/area-man", "Satire", "warning"],
];

for (const [name, url, verdict, bucket] of CASES) {
  test(`${name} -> ${verdict}`, async () => {
    const r = await run(F[name], url);
    assert.equal(r.verdict, verdict, `score ${r.score}: ${r.signals.join(" | ")}`);
    assert.equal(r.bucket, bucket);
  });
}

test("analyzeUrl response contains the full documented field contract", async () => {
  const result = await run(F.CLICKBAIT_HTML);
  for (const field of [
    "url",
    "headline",
    "verdict",
    "bucket",
    "tier",
    "risk_level",
    "primary_concern",
    "dimensions",
    "strengths",
    "context_labels",
    "guidance",
    "headline_highlights",
    "headline_model",
    "analysis_confidence",
    "claims_to_verify",
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
    "analyzed_at",
  ]) {
    assert.ok(field in result, `missing field: ${field}`);
  }
  assert.equal(result.engine, "node-nlp");
  assert.equal(result.dimensions.length, 6);
  assert.equal("isLikelyClickbait" in result, false);
});

test("entities are grouped into people / organizations", async () => {
  const r = await run(F.LEGIT_HTML);
  assert.ok(r.entity_groups.People.includes("Maria Lopez"));
  assert.ok(r.entity_groups.People.includes("Tom Reyes"));
  assert.ok(r.supporting_sentences.length > 0);
});
