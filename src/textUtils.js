"use strict";

/** Small, dependency-free text helpers shared across extraction and scoring. */

function normalizeWhitespace(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTokens(text = "") {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// ponytail: crude suffix stripper, enough to match "approves"/"approved"; swap
// for a Porter stemmer if overlap recall on inflected words ever matters more.
function stem(word) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  for (const suffix of ["ing", "edly", "ed", "ly", "es", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** Split prose into sentences on terminal punctuation followed by a capital/quote/digit. */
function splitSentences(text = "") {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/)
    .filter(Boolean);
}

module.exports = { normalizeWhitespace, clamp, getTokens, stem, splitSentences };
