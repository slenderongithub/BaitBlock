"use strict";

/**
 * The clickbait scoring engine.
 *
 * `computeScore(title, bodyText)` returns the composite 0-100 risk score plus
 * an explainable breakdown and the human-readable signals shown in the UI.
 *
 * Behaviour is preserved from the original monolith; the only change is that
 * every threshold / weight now comes from ./config instead of being a bare
 * literal, so the heuristic can be audited and tuned in one place.
 *
 * NOTE: `computeLexicalSimilarity` returns non-stopword token *overlap*, not a
 * true cosine similarity, even though the API field is named
 * `cosine_similarity_score` for wire-compatibility with the Python engine.
 */

const { normalizeWhitespace, clamp, getTokens } = require("./textUtils");
const { STOP_WORDS, POSITIVE_WORDS, NEGATIVE_WORDS } = require("./lexicons");
const config = require("./config");

const {
  points,
  headline: H,
  verdict: V,
  semanticGapThreshold,
  sentimentMagnitudeThreshold,
} = config.scoring;

const BAIT_PATTERNS = [
  /you won't believe/i,
  /what happened next/i,
  /shocking/i,
  /mind.?blowing/i,
  /this one trick/i,
  /secret/i,
  /doctors hate/i,
  /gone wrong/i,
  /won't believe/i,
  /instantly/i,
  /guaranteed/i,
  /must see/i,
  /exposed/i,
  /you need to see/i,
  /this is why/i,
  /number \d+/i,
  /\b(top|best|worst)\s+\d+/i,
];

const DECEPTION_HINTS = [
  /miracle/i,
  /cure/i,
  /100%/i,
  /proof/i,
  /the truth about/i,
  /they don't want you to know/i,
  /conspiracy/i,
  /hoax/i,
];

function describePattern(pattern) {
  return pattern.source
    .replace(/\\b|\\s\+/g, " ")
    .replace(/[\\^$.*+?()[\]{}|]/g, "")
    .trim();
}

function computeLexicalSimilarity(headline, bodyText) {
  const headlineTokens = new Set(getTokens(headline).filter((token) => !STOP_WORDS.has(token)));
  const bodyTokens = new Set(getTokens(bodyText).filter((token) => !STOP_WORDS.has(token)));

  if (headlineTokens.size === 0 || bodyTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  headlineTokens.forEach((token) => {
    if (bodyTokens.has(token)) overlap += 1;
  });

  return overlap / headlineTokens.size;
}

function computeSentimentPolarity(text) {
  const tokens = getTokens(text);
  if (tokens.length === 0) return 0;

  let pos = 0;
  let neg = 0;

  tokens.forEach((token) => {
    if (POSITIVE_WORDS.has(token)) pos += 1;
    if (NEGATIVE_WORDS.has(token)) neg += 1;
  });

  return clamp((pos - neg) / Math.max(1, pos + neg), -1, 1);
}

function computeScore(title, bodyText) {
  let score = 0;
  const signals = [];
  let hookPoints = 0;
  let sentimentPoints = 0;
  let semanticGapPoints = 0;

  const cosineSimilarityScore = computeLexicalSimilarity(title, bodyText);
  const sentimentPolarity = computeSentimentPolarity(title);
  const semanticGap = cosineSimilarityScore < semanticGapThreshold;
  const sensationalTone = Math.abs(sentimentPolarity) > sentimentMagnitudeThreshold;

  if (!title) {
    return {
      score: config.scoring.noHeadlineScore,
      signals: ["Could not extract a reliable headline from the page."],
      scoreBreakdown: {
        semantic_gap_points: 20,
        sentiment_points: 0,
        hook_points: 45,
        synergy_points: 0,
      },
      cosineSimilarityScore: 0,
      sentimentPolarity: 0,
      semanticGap: true,
      sensationalTone: false,
    };
  }

  BAIT_PATTERNS.forEach((pattern) => {
    if (pattern.test(title)) {
      score += points.baitPattern;
      hookPoints += points.baitPattern;
      signals.push(`Headline matches pattern: "${describePattern(pattern)}"`);
    }
  });

  DECEPTION_HINTS.forEach((pattern) => {
    if (pattern.test(title)) {
      score += points.deceptionHint;
      hookPoints += points.deceptionHint;
      signals.push(`Potential deceptive cue found: "${describePattern(pattern)}"`);
    }
  });

  const exclamationCount = (title.match(/!/g) || []).length;
  if (exclamationCount > 0) {
    const pts = Math.min(points.exclamationMax, exclamationCount * points.exclamationPer);
    score += pts;
    hookPoints += pts;
    signals.push("Headline uses high-emphasis punctuation.");
  }

  const questionCount = (title.match(/\?/g) || []).length;
  if (questionCount > 0) {
    const pts = Math.min(points.questionMax, questionCount * points.questionPer);
    score += pts;
    hookPoints += pts;
    signals.push("Headline is framed as a suspense question.");
  }

  const upperChars = title.replace(/[^A-Z]/g, "").length;
  const letterChars = title.replace(/[^A-Za-z]/g, "").length;
  const upperRatio = letterChars ? upperChars / letterChars : 0;
  if (upperRatio > H.uppercaseRatio && title.length > H.minLengthForUppercaseCheck) {
    score += points.excessiveUppercase;
    hookPoints += points.excessiveUppercase;
    signals.push("Headline has excessive uppercase emphasis.");
  }

  const titleWordCount = normalizeWhitespace(title).split(" ").filter(Boolean).length;
  if (titleWordCount < H.minWords || titleWordCount > H.maxWords) {
    score += points.unusualLength;
    hookPoints += points.unusualLength;
    signals.push("Headline length is unusual for balanced reporting.");
  }

  if (semanticGap) {
    score += points.semanticGap;
    semanticGapPoints += points.semanticGap;
    signals.push("Low lexical overlap between headline and body suggests a semantic gap.");
  }

  if (sensationalTone) {
    score += points.sensationalTone;
    sentimentPoints += points.sensationalTone;
    signals.push("Headline sentiment intensity is unusually high.");
  }

  if (bodyText && bodyText.length > 200) {
    const teaserWords = [
      "unbelievable",
      "shocking",
      "secret",
      "exposed",
      "truth",
      "must",
      "incredible",
    ];
    const teaserHits = teaserWords.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(title));

    if (teaserHits.length > 0) {
      const bodyMentions = teaserHits.filter((word) =>
        new RegExp(`\\b${word}\\b`, "i").test(bodyText)
      );
      if (bodyMentions.length === 0) {
        score += points.teaserNotEchoed;
        semanticGapPoints += points.teaserNotEchoed;
        signals.push("Headline teases claims not echoed in the article body.");
      }
    }
  }

  if (semanticGapPoints > 0 && hookPoints > 0) {
    score += points.synergyBonus;
    signals.push("Combined hook language and weak body support increased risk.");
  }

  score = clamp(score, 0, 100);

  return {
    score,
    signals,
    scoreBreakdown: {
      semantic_gap_points: semanticGapPoints,
      sentiment_points: sentimentPoints,
      hook_points: hookPoints,
      synergy_points: semanticGapPoints > 0 && hookPoints > 0 ? points.synergyBonus : 0,
    },
    cosineSimilarityScore,
    sentimentPolarity,
    semanticGap,
    sensationalTone,
  };
}

function buildSummary(score) {
  if (score >= V.clickbait) {
    return "This article headline shows strong clickbait/deceptive signals.";
  }
  if (score >= V.borderline) {
    return "This article has some clickbait characteristics. Read carefully before trusting the framing.";
  }
  return "This headline appears relatively neutral with limited clickbait signals.";
}

/** Map a numeric score to the verdict/bucket used by the UI. */
function classifyScore(score) {
  const bucket = score >= V.clickbait ? "risky" : score >= V.borderline ? "warning" : "safe";
  const verdict =
    score >= V.clickbait ? "Clickbait" : score >= V.borderline ? "Borderline" : "Likely Legit";
  return { bucket, verdict };
}

module.exports = {
  computeScore,
  buildSummary,
  classifyScore,
  computeLexicalSimilarity,
  computeSentimentPolarity,
  BAIT_PATTERNS,
  DECEPTION_HINTS,
};
