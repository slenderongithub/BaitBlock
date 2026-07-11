"use strict";

/**
 * Public-archive fallback: the Wayback Machine (Internet Archive). When the live
 * site is behind a hard bot wall or paywall, a public snapshot of the article
 * usually already exists and can be read without fighting the origin's defenses.
 *
 * This is a legitimate, widely-used public archive — not an evasion technique.
 */

const { safeHttpGet } = require("./safeFetch");

async function findWaybackSnapshot(url) {
  try {
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const res = await safeHttpGet(api);
    if (!res.ok) return null;
    const data = JSON.parse(res.html);
    const closest = data && data.archived_snapshots && data.archived_snapshots.closest;
    if (closest && closest.available && closest.url) return closest.url;
  } catch {
    /* ignore — no snapshot */
  }
  return null;
}

/**
 * @returns {Promise<{ html: string|null, finalUrl: string, via: string, snapshotUrl: string } | null>}
 */
async function fetchFromArchive(url) {
  const snap = await findWaybackSnapshot(url);
  if (!snap) return null;

  // The `id_` raw form returns the original page without the Wayback toolbar.
  const raw = snap.replace(/(\/web\/\d+)\//, "$1id_/");
  for (const candidate of [raw, snap]) {
    try {
      const res = await safeHttpGet(candidate);
      if (res.ok && res.html) {
        return { html: res.html, finalUrl: url, via: "wayback", snapshotUrl: snap };
      }
    } catch {
      /* try next form */
    }
  }
  // Snapshot exists but couldn't be fetched — still surface the hint.
  return { html: null, finalUrl: url, via: "wayback", snapshotUrl: snap };
}

module.exports = { findWaybackSnapshot, fetchFromArchive };
