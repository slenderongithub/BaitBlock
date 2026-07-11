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

module.exports = { normalizeWhitespace, clamp, getTokens };
