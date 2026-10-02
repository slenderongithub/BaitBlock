"use strict";

/**
 * Text-analysis extras shown in the result dashboard: key phrases, named
 * entities (people / places / organizations via `compromise`), the sentences
 * that best support the headline, and check-worthy claims.
 *
 * These are display aids; the risk score itself comes from scoring.js.
 */

const nlp = require("compromise");
const { normalizeWhitespace, getTokens, stem, splitSentences } = require("./textUtils");
const { isNoisyTextCandidate } = require("./extraction");
const { contentStems } = require("./scoring");
const RULES = require("./data/rules.json");

const STOP_WORDS = new Set(RULES.stop_words);
const ATTRIBUTION = new RegExp(RULES.lexicons.attribution, "i");

/** Most frequent content words, with repeated two-word phrases ranked first. */
function extractKeyPhrases(text, headline) {
  const tokens = getTokens(`${headline} ${text}`);
  const uni = new Map();
  const bi = new Map();
  tokens.forEach((t, i) => {
    if (t.length <= 3 || STOP_WORDS.has(t) || /^\d+$/.test(t)) return;
    uni.set(t, (uni.get(t) || 0) + 1);
    const prev = tokens[i - 1];
    if (prev && prev.length > 3 && !STOP_WORDS.has(prev) && !/^\d+$/.test(prev)) {
      const k = `${prev} ${t}`;
      bi.set(k, (bi.get(k) || 0) + 1);
    }
  });
  const top = (m, min) =>
    [...m]
      .filter(([, c]) => c >= min)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  const phrases = top(bi, 2).slice(0, 4);
  const covered = new Set(phrases.flatMap((p) => p.split(" ")));
  return [...phrases, ...top(uni, 1).filter((u) => !covered.has(u))].slice(0, 8);
}

const tidy = (list) => [
  ...new Set(
    list
      .map((e) =>
        normalizeWhitespace(
          e
            .replace(/['’]s$/i, "")
            .replace(/[^\w\s.&'-]|\.$/g, "")
            .replace(/^([a-z][\w-]*\s+)+/, "") // "president Tom Reyes" -> "Tom Reyes"
        )
      )
      .filter((e) => e.length > 2)
  ),
];

/** @returns {{ People: string[], Places: string[], Organizations: string[] }} (empty groups omitted) */
function groupEntities(headline, bodyText) {
  const doc = nlp(`${headline}. ${bodyText.slice(0, 6000)}`);
  const groups = {
    People: tidy(doc.people().out("array")).slice(0, 8),
    Places: tidy(doc.places().out("array")).slice(0, 8),
    Organizations: tidy(doc.organizations().out("array")).slice(0, 8),
  };
  return Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length));
}

function cleanSentences(bodyText) {
  return splitSentences(bodyText).filter(
    (s) => s.length > 30 && s.length < 400 && !isNoisyTextCandidate(s)
  );
}

/** Body sentences that best match the headline's key terms (evidence for the headline). */
function extractSupportingSentences(bodyText, headline = "") {
  const sentences = cleanSentences(bodyText);
  const H = contentStems(headline);
  if (!H.size) return sentences.slice(0, 3);
  return sentences
    .map((s, i) => {
      const toks = new Set(getTokens(s).map(stem));
      let hit = 0;
      H.forEach((h) => toks.has(h) && (hit += 1));
      return { s, rank: hit / H.size - i * 0.002 }; // ties go to earlier sentences
    })
    .filter((x) => x.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3)
    .map((x) => x.s);
}

/** Factual, check-worthy sentences: figures, money, percentages, attributed claims. */
function extractClaims(bodyText, exclude = []) {
  const skip = new Set(exclude);
  return cleanSentences(bodyText)
    .filter((s) => !skip.has(s))
    .map((s) => {
      const figures = (s.match(/\d[\d,.]*\s*(%|percent|million|billion|trillion)?|\$\s?\d/gi) || [])
        .length;
      return { s, rank: figures * 2 + (ATTRIBUTION.test(s) ? 1 : 0) };
    })
    .filter((x) => x.rank >= 2)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 4)
    .map((x) => x.s);
}

module.exports = {
  extractKeyPhrases,
  groupEntities,
  extractSupportingSentences,
  extractClaims,
};
