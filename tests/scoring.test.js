"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  computeScore,
  classifyScore,
  buildSummary,
  computeLexicalSimilarity,
  computeSentimentPolarity,
} = require("../src/scoring");

test("clickbait headline scores high and classifies as Clickbait", () => {
  const title = "You won't believe this SHOCKING secret doctors hate!";
  const body =
    "A neutral article body about water infrastructure and budget planning that shares no vocabulary with the teaser headline above.";
  const result = computeScore(title, body);

  assert.ok(result.score >= 70, `expected >=70, got ${result.score}`);
  assert.equal(classifyScore(result.score).verdict, "Clickbait");
  assert.equal(classifyScore(result.score).bucket, "risky");
  assert.ok(result.signals.length > 0);
  assert.ok(result.semanticGap, "low lexical overlap should flag a semantic gap");
});

test("neutral, well-aligned headline scores low and classifies as Likely Legit", () => {
  const title = "City council approves annual water infrastructure budget";
  const body =
    "The city council approves the annual water infrastructure budget after a public meeting about the municipal water supply and budget planning for infrastructure.";
  const result = computeScore(title, body);

  assert.ok(result.score < 40, `expected <40, got ${result.score}`);
  assert.equal(classifyScore(result.score).verdict, "Likely Legit");
  assert.equal(classifyScore(result.score).bucket, "safe");
});

test("missing headline returns the no-headline fallback score", () => {
  const result = computeScore("", "Some body text here.");
  assert.equal(result.score, 65);
  assert.equal(result.semanticGap, true);
  assert.equal(result.signals[0], "Could not extract a reliable headline from the page.");
});

test("classifyScore boundaries", () => {
  assert.deepEqual(classifyScore(70), { bucket: "risky", verdict: "Clickbait" });
  assert.deepEqual(classifyScore(69), { bucket: "warning", verdict: "Borderline" });
  assert.deepEqual(classifyScore(40), { bucket: "warning", verdict: "Borderline" });
  assert.deepEqual(classifyScore(39), { bucket: "safe", verdict: "Likely Legit" });
});

test("buildSummary matches verdict bands", () => {
  assert.match(buildSummary(80), /strong clickbait/i);
  assert.match(buildSummary(50), /some clickbait characteristics/i);
  assert.match(buildSummary(10), /relatively neutral/i);
});

test("computeLexicalSimilarity: identical content overlaps fully, disjoint content is zero", () => {
  assert.equal(computeLexicalSimilarity("water budget report", "water budget report today"), 1);
  assert.equal(computeLexicalSimilarity("alpha bravo charlie", "delta echo foxtrot"), 0);
});

test("computeSentimentPolarity reflects positive and negative cue words", () => {
  assert.ok(computeSentimentPolarity("great success safe benefit") > 0);
  assert.ok(computeSentimentPolarity("scam fraud danger crisis") < 0);
  assert.equal(computeSentimentPolarity("the a of to"), 0);
});

test("score is always clamped to 0..100", () => {
  const extreme = computeScore(
    "SHOCKING secret exposed! You won't believe this miracle cure — 100% proof!!!",
    "Totally unrelated body text about gardening tips and weekend recipes."
  );
  assert.ok(extreme.score >= 0 && extreme.score <= 100);
});
