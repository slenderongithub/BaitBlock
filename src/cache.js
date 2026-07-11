"use strict";

/**
 * Tiny in-memory TTL + LRU cache for acquired articles, so re-analyzing the
 * same URL (or a retry) doesn't hammer the origin again. Bounded by cacheMax.
 */

const config = require("./config");

const store = new Map(); // key -> { value, expires }

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  // Refresh recency (Map preserves insertion order → re-insert = most recent).
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

function set(key, value) {
  while (store.size >= config.fetch.cacheMax) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + config.fetch.cacheTtlMs });
}

function clear() {
  store.clear();
}

module.exports = { get, set, clear };
