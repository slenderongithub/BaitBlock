"use strict";

/**
 * Sanctioned "readable-alt" content routes publishers expose: the AMP version
 * of a page and RSS/Atom feeds. These are often lighter and less gated than the
 * main article, and publishers publish feeds precisely to be consumed.
 */

const cheerio = require("cheerio");
const { XMLParser } = require("fast-xml-parser");

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function findAmpUrl(html, baseUrl) {
  try {
    const $ = cheerio.load(html);
    const href = $('link[rel="amphtml"]').attr("href");
    if (!href) return null;
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function findFeedUrls(html, baseUrl) {
  const out = [];
  try {
    const $ = cheerio.load(html);
    $('link[rel="alternate"]').each((_, el) => {
      const type = ($(el).attr("type") || "").toLowerCase();
      const href = $(el).attr("href");
      if (!href) return;
      if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
        try {
          out.push(new URL(href, baseUrl).toString());
        } catch {
          /* skip malformed */
        }
      }
    });
  } catch {
    /* ignore */
  }
  return out;
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    return (url.origin + url.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(u || "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

function textOf(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v["#text"] || v["@_href"] || "";
  return String(v);
}

/**
 * Find the feed item/entry whose link matches targetUrl.
 * @returns {{ title: string, html: string } | null}
 */
function matchFeedItem(feedXml, targetUrl) {
  let doc;
  try {
    doc = xml.parse(feedXml);
  } catch {
    return null;
  }

  const target = normalizeUrl(targetUrl);
  const items = [];
  if (doc && doc.rss && doc.rss.channel) {
    const it = doc.rss.channel.item;
    if (Array.isArray(it)) items.push(...it);
    else if (it) items.push(it);
  }
  if (doc && doc.feed && doc.feed.entry) {
    const it = doc.feed.entry;
    if (Array.isArray(it)) items.push(...it);
    else if (it) items.push(it);
  }

  for (const item of items) {
    let link = textOf(item.link);
    if (Array.isArray(item.link)) {
      const alt =
        item.link.find((l) => (l["@_rel"] || "alternate") === "alternate") || item.link[0];
      link = textOf(alt);
    }
    if (normalizeUrl(link) !== target) continue;

    const title = textOf(item.title);
    const body =
      textOf(item["content:encoded"]) ||
      textOf(item.content) ||
      textOf(item.description) ||
      textOf(item.summary);
    if (title || body) return { title, html: body };
  }
  return null;
}

module.exports = { findAmpUrl, findFeedUrls, matchFeedItem };
