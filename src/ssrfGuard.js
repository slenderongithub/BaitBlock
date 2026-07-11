"use strict";

/**
 * SSRF (Server-Side Request Forgery) protection.
 *
 * The /api/analyze endpoint fetches an arbitrary user-supplied URL server-side.
 * Without guarding, a caller could point it at internal services
 * (http://127.0.0.1:6379, the cloud metadata endpoint 169.254.169.254, RFC1918
 * hosts, etc.) and use the server as a proxy to probe or hit them.
 *
 * Strategy:
 *   1. Only allow http/https.
 *   2. Reject obviously-internal hostnames before we even resolve DNS.
 *   3. Resolve the hostname to every A/AAAA record and reject if ANY resolved
 *      address falls in a private/reserved/loopback/link-local range.
 *   4. Re-run this check on every redirect hop (done in safeFetch.js).
 *
 * Residual risk: DNS rebinding (a hostname that resolves to a public IP at
 * validation time and a private IP at fetch time) is not fully closed here —
 * that would require pinning the connection to the validated IP. For a
 * best-effort heuristic tool this is an accepted, documented trade-off.
 */

const dns = require("dns").promises;
const ipaddr = require("ipaddr.js");
const config = require("./config");
const { FetchError } = require("./errors");

// Hostnames we refuse without needing DNS.
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i, // mDNS / Bonjour
  /^metadata\.google\.internal$/i,
];

// IPv4 ranges (per ipaddr.js .range()) that are NOT safe to fetch.
const UNSAFE_V4_RANGES = new Set([
  "private", // 10/8, 172.16/12, 192.168/16
  "loopback", // 127/8
  "linkLocal", // 169.254/16 (incl. cloud metadata 169.254.169.254)
  "carrierGradeNat", // 100.64/10
  "broadcast", // 255.255.255.255
  "reserved", // 240/4 etc.
  "unspecified", // 0.0.0.0
]);

// IPv6 ranges that are NOT safe to fetch.
const UNSAFE_V6_RANGES = new Set([
  "loopback", // ::1
  "linkLocal", // fe80::/10
  "uniqueLocal", // fc00::/7
  "reserved",
  "unspecified", // ::
]);

/**
 * @returns {true|string} true if the literal IP is safe to fetch, otherwise a
 *   human-readable reason string explaining why it was blocked.
 */
function classifyAddress(ip) {
  let addr;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return `Could not parse resolved address "${ip}".`;
  }

  // Normalise IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) down to IPv4 so the
  // range check can't be bypassed by encoding a v4 address as v6.
  if (addr.kind() === "ipv6" && addr.isIPv4MappedAddress()) {
    addr = addr.toIPv4Address();
  }

  const range = addr.range();
  const unsafe = addr.kind() === "ipv4" ? UNSAFE_V4_RANGES : UNSAFE_V6_RANGES;
  if (unsafe.has(range)) {
    return `Address ${ip} is in the disallowed "${range}" range.`;
  }
  return true;
}

/**
 * Validate a parsed URL against the SSRF policy.
 * @param {URL} parsedUrl
 * @throws {Error} with a safe, user-facing message if the URL is not allowed.
 */
async function assertUrlAllowed(parsedUrl) {
  if (!/^https?:$/.test(parsedUrl.protocol)) {
    throw new FetchError("Only http and https URLs are supported.");
  }

  if (config.ssrf.allowPrivateAddresses) {
    return; // Explicit opt-out (tests / trusted internal deployments).
  }

  const hostname = parsedUrl.hostname;

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new FetchError("Refusing to fetch an internal or reserved hostname.");
    }
  }

  // If the host is already an IP literal, validate it directly.
  if (ipaddr.isValid(hostname)) {
    const verdict = classifyAddress(hostname);
    if (verdict !== true) {
      throw new FetchError("Refusing to fetch a private or reserved address.");
    }
    return;
  }

  // Otherwise resolve every address and require them all to be public.
  let records;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new FetchError("Could not resolve the host for that URL.");
  }

  if (!records.length) {
    throw new FetchError("Could not resolve the host for that URL.");
  }

  for (const { address } of records) {
    const verdict = classifyAddress(address);
    if (verdict !== true) {
      throw new FetchError("Refusing to fetch a private or reserved address.");
    }
  }
}

module.exports = { assertUrlAllowed, classifyAddress };
