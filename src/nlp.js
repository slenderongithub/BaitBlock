"use strict";

/**
 * Lightweight text-analysis extras shown in the result dashboard (key phrases,
 * pseudo entities, supporting sentences).
 *
 * These are display aids, not part of the risk score. NOTE: `extractNamedEntities`
 * is a capitalized-word heuristic, NOT real NER — the Python backend (app.py)
 * provides genuine spaCy entities. `groupEntities` therefore only ever returns a
 * single "Proper Nouns" group from this engine.
 */

const { normalizeWhitespace, getTokens } = require("./textUtils");
const { STOP_WORDS } = require("./lexicons");
const { isNoisyTextCandidate } = require("./extraction");

function extractKeyPhrases(text, headline) {
  const frequency = new Map();
  const tokens = getTokens(`${headline} ${text}`).filter(
    (token) => token.length > 3 && !STOP_WORDS.has(token)
  );

  tokens.forEach((token) => {
    frequency.set(token, (frequency.get(token) || 0) + 1);
  });

  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function extractNamedEntities(headline, bodyText) {
  const pool = `${headline}. ${bodyText.slice(0, 2200)}`;
  const matches = pool.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) || [];
  const cleaned = matches
    .map((value) => normalizeWhitespace(value))
    .filter((value) => value.length > 2 && !/^The$|This$|That$|And$|But$/.test(value));

  return Array.from(new Set(cleaned)).slice(0, 12);
}

function groupEntities(entities) {
  if (!entities.length) return {};
  return { "Proper Nouns": entities };
}

function extractSupportingSentences(bodyText) {
  const sentences = bodyText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 30 && !isNoisyTextCandidate(sentence));

  const ranked = sentences.filter((sentence) =>
    /\d|claim|said|report|according|announced|confirmed|study/i.test(sentence)
  );
  const chosen = (ranked.length ? ranked : sentences).slice(0, 4);
  return chosen;
}

module.exports = {
  extractKeyPhrases,
  extractNamedEntities,
  groupEntities,
  extractSupportingSentences,
};
