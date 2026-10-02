"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  computeScore,
  classifyScore,
  computeSentimentPolarity,
  impersonatedOutlet,
} = require("../src/scoring");
const { predictHeadline } = require("../src/headlineModel");

const NEUTRAL_BODY =
  "The city council approves the annual water infrastructure budget after a public meeting about the municipal water supply and budget planning for infrastructure. Officials said the plan funds pipeline repairs, according to the published report, and council members confirmed the review would continue next year. ".repeat(
    2
  );
const BYLINE = { authors: ["Jane Doe"], publishedAt: "2026-09-01", siteName: "Gazette" };

const dim = (r, key) => r.dimensions.find((d) => d.key === key);

test("clickbait headline scores high and is named Clickbait", () => {
  const r = computeScore(
    "You won't believe this SHOCKING secret doctors hate!",
    "A neutral article body about water infrastructure and budget planning that shares no vocabulary with the teaser headline above.",
    BYLINE
  );
  assert.ok(r.score >= 80, `expected >=80, got ${r.score}`);
  assert.equal(r.verdict, "Clickbait");
  assert.equal(r.bucket, "risky");
  assert.ok(dim(r, "bait").score >= 70);
  assert.ok(r.headline_highlights.some((h) => /won't believe/i.test(h)));
});

test("neutral, well-aligned, sourced article is Straight Reporting", () => {
  const r = computeScore(
    "City council approves annual water infrastructure budget",
    NEUTRAL_BODY,
    BYLINE
  );
  assert.ok(r.score < 20, `expected <20, got ${r.score}`);
  assert.equal(r.verdict, "Straight Reporting");
  assert.equal(r.bucket, "safe");
  assert.ok(r.cosine_similarity_score >= 0.6);
  assert.ok(r.strengths.length > 0);
});

test("headline certainty vs hedged body is flagged as a consistency problem", () => {
  const r = computeScore(
    "Coffee cures cancer, scientists prove",
    "A small study suggests coffee may be linked to lower risk in mice. The findings are preliminary and more research is needed, researchers said. ".repeat(
      4
    ),
    BYLINE
  );
  assert.ok(dim(r, "consistency").signals.some((s) => /states it as certain/.test(s.text)));
  assert.equal(r.primary_concern, "Misleading Headline");
});

test("a headline figure missing from the body is flagged", () => {
  const r = computeScore("Prices jump 47% in a single month", NEUTRAL_BODY, BYLINE);
  assert.ok(dim(r, "consistency").signals.some((s) => /"47"/.test(s.text)));
});

test("scam language drives the Manipulative verdict", () => {
  const r = computeScore(
    "Act now: miracle pill melts belly fat",
    "Click here to claim your discount before it's too late. Share this with everyone before they delete it. ".repeat(
      8
    ),
    {}
  );
  assert.equal(r.primary_concern, "Manipulative");
  assert.ok(r.score >= 80);
});

test("missing headline lowers analysis confidence instead of faking a score", () => {
  const r = computeScore("", NEUTRAL_BODY, BYLINE);
  assert.ok(r.analysis_confidence.score <= 60);
  assert.ok(dim(r, "transparency").signals.some((s) => /No headline/.test(s.text)));
});

test("classifyScore tiers and content-label overrides", () => {
  assert.equal(classifyScore(19).verdict, "Straight Reporting");
  assert.equal(classifyScore(20).verdict, "Likely Legit");
  assert.equal(classifyScore(40).verdict, "Borderline");
  assert.equal(classifyScore(40).bucket, "warning");
  assert.deepEqual(classifyScore(60, "Unsubstantiated"), {
    tier: 4,
    risk_level: "high",
    bucket: "risky",
    verdict: "Unsubstantiated",
  });
  assert.equal(classifyScore(85, "Manipulative").risk_level, "severe");
  assert.equal(classifyScore(10, null, "Satire").verdict, "Satire");
  assert.equal(classifyScore(90, "Clickbait", "Satire").verdict, "Clickbait"); // risk wins
});

test("impersonatedOutlet catches lookalikes but not real outlet domains", () => {
  assert.ok(impersonatedOutlet("abcnews.com.co"));
  assert.ok(impersonatedOutlet("cnn-breaking.net"));
  assert.ok(impersonatedOutlet("www.bbc.co.uk.news-alerts.info"));
  assert.equal(impersonatedOutlet("www.bbc.co.uk"), null);
  assert.equal(impersonatedOutlet("www.dailymail.com"), null);
  assert.equal(impersonatedOutlet("cnnindonesia.com"), null);
  assert.equal(impersonatedOutlet("example.com"), null);
});

test("computeSentimentPolarity reflects valence and stays in [-1, 1]", () => {
  assert.ok(computeSentimentPolarity("great success benefit") > 0);
  assert.ok(computeSentimentPolarity("scam fraud crisis disaster") < -0.5);
  assert.equal(computeSentimentPolarity("the a of to"), 0);
});

test("headline model separates classic clickbait from wire-style headlines", () => {
  assert.ok(predictHeadline("17 Things Only 90s Kids Will Understand").probability > 0.9);
  assert.ok(predictHeadline("Federal Reserve holds interest rates steady").probability < 0.1);
});

test("all scores stay within 0..100", () => {
  const r = computeScore(
    "SHOCKING secret exposed! You won't believe this miracle cure — 100% proof!!!",
    "Totally unrelated body text about gardening tips and weekend recipes.",
    {}
  );
  assert.ok(r.score >= 0 && r.score <= 100);
  r.dimensions.forEach((d) => assert.ok(d.score >= 0 && d.score <= 100, d.key));
});
