"use strict";

/**
 * Error type for expected, user-facing fetch/validation failures.
 * Carries an HTTP `status` so the route can respond appropriately instead of
 * treating these as unexpected 500s.
 */
class FetchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

module.exports = { FetchError };
