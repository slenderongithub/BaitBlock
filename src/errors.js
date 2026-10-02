"use strict";

/**
 * Error type for expected, user-facing fetch/validation failures.
 * Carries an HTTP `status` so the route can respond appropriately instead of
 * treating these as unexpected 500s.
 */
class FetchError extends Error {
  /** @param {string} [code] machine-readable tag, e.g. "ssrf_blocked" (used for security logging) */
  constructor(message, status = 400, code = undefined) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.code = code;
  }
}

module.exports = { FetchError };
