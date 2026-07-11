"use strict";

/**
 * Per-domain politeness gate: enforce a minimum interval between outbound
 * requests to the same host so we don't hammer a site (and get IP-banned).
 * Reserves the slot synchronously so concurrent callers queue in order.
 */

const config = require("./config");

const nextAllowedAt = new Map(); // host -> timestamp

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitTurn(host) {
  const min = config.fetch.perDomainMinIntervalMs;
  if (!min || !host) return;
  const now = Date.now();
  const earliest = Math.max(now, nextAllowedAt.get(host) || 0);
  // Reserve this host's next slot before yielding.
  nextAllowedAt.set(host, earliest + min);
  const wait = earliest - now;
  if (wait > 0) await sleep(wait);
}

module.exports = { waitTurn };
