"use strict";

/**
 * HTML -> structured article extraction (headline, body, metadata).
 *
 * Moved verbatim from the original monolithic server.js. The multi-tier
 * fallback strategy (JSON-LD -> semantic selectors -> generic paragraph scan)
 * is the most valuable, battle-tested part of the codebase; behaviour is
 * intentionally unchanged by this refactor.
 */

const { normalizeWhitespace, getTokens } = require("./textUtils");

function parseJsonLdNodes($) {
  const nodes = [];

  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const queue = Array.isArray(parsed) ? parsed : [parsed];

      while (queue.length > 0) {
        const node = queue.shift();
        if (!node || typeof node !== "object") continue;
        nodes.push(node);

        if (Array.isArray(node["@graph"])) {
          node["@graph"].forEach((graphNode) => queue.push(graphNode));
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  });

  return nodes;
}

function extractPublishedAt($, jsonLdNodes) {
  const metaPublished = normalizeWhitespace(
    $("meta[property='article:published_time']").attr("content") ||
      $("meta[name='article:published_time']").attr("content") ||
      $("meta[name='pubdate']").attr("content") ||
      $("time").first().attr("datetime") ||
      ""
  );

  if (metaPublished) return metaPublished;

  for (const node of jsonLdNodes) {
    const dateValue = normalizeWhitespace(node.datePublished || node.dateCreated || "");
    if (dateValue) return dateValue;
  }

  return "Not available";
}

function extractAuthors($, jsonLdNodes) {
  const authorSet = new Set();

  const metaAuthor = normalizeWhitespace(
    $("meta[name='author']").attr("content") ||
      $("meta[property='article:author']").attr("content") ||
      ""
  );

  if (metaAuthor) {
    metaAuthor
      .split(/,|\||&| and /i)
      .map((name) => normalizeWhitespace(name))
      .filter(Boolean)
      .forEach((name) => authorSet.add(name));
  }

  for (const node of jsonLdNodes) {
    const author = node.author;
    const authorList = Array.isArray(author) ? author : author ? [author] : [];

    authorList.forEach((entry) => {
      if (typeof entry === "string") {
        const value = normalizeWhitespace(entry);
        if (value) authorSet.add(value);
      } else if (entry && typeof entry === "object") {
        const value = normalizeWhitespace(entry.name || "");
        if (value) authorSet.add(value);
      }
    });
  }

  return Array.from(authorSet).slice(0, 5);
}

function extractMetaDescription($) {
  return normalizeWhitespace(
    $("meta[name='description']").attr("content") ||
      $("meta[property='og:description']").attr("content") ||
      $("meta[name='twitter:description']").attr("content") ||
      ""
  );
}

function extractTitle($) {
  const ogTitle = $("meta[property='og:title']").attr("content") || "";
  const twitterTitle = $("meta[name='twitter:title']").attr("content") || "";
  const h1 = $("h1").first().text() || "";
  const titleTag = $("title").text() || "";

  return normalizeWhitespace(ogTitle || twitterTitle || h1 || titleTag);
}

function sanitizeTextBlock(text = "") {
  return normalizeWhitespace(text)
    .replace(/[{}[\]"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoisyTextCandidate(text = "") {
  const value = normalizeWhitespace(text);
  if (!value) return true;

  const lower = value.toLowerCase();
  const noisyMarkers = [
    "gtm",
    "googletag",
    "dataLayer",
    "pageview",
    "event",
    "client_id",
    "widget",
    "cookie",
    "consent",
    "analytics",
    "json",
    "schema",
    "script",
  ];

  const markerHits = noisyMarkers.reduce(
    (acc, marker) => acc + (lower.includes(marker.toLowerCase()) ? 1 : 0),
    0
  );
  const punctuationDensity =
    (value.match(/[{}[\]"=:;,_]/g) || []).length / Math.max(1, value.length);
  const alphaChars = (value.match(/[A-Za-z]/g) || []).length;
  const alphaRatio = alphaChars / Math.max(1, value.length);

  return markerHits >= 2 || punctuationDensity > 0.12 || alphaRatio < 0.45;
}

function isReadableParagraph(text = "") {
  const value = sanitizeTextBlock(text);
  if (value.length < 60) return false;
  if (isNoisyTextCandidate(value)) return false;
  if (
    /cookie|consent|privacy policy|terms of use|all rights reserved|subscribe|sign in|log in|disclaimer/i.test(
      value
    )
  )
    return false;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 10) return false;

  const longWordCount = words.filter((word) => word.length > 20).length;
  if (longWordCount > 2) return false;

  return true;
}

function pruneNoisyDom($) {
  const noisySelectors = [
    "script",
    "style",
    "noscript",
    "svg",
    "iframe",
    "form",
    "nav",
    "footer",
    "header",
    "aside",
    ".advertisement",
    ".ad",
    "[id*='ad-']",
    "[class*='ad-']",
    "[class*='ads']",
    "[id*='cookie']",
    "[class*='cookie']",
    "[id*='consent']",
    "[class*='consent']",
    "[id*='analytics']",
    "[class*='analytics']",
    "[id*='tracking']",
    "[class*='tracking']",
    "[id*='share']",
    "[class*='share']",
    "[id*='related']",
    "[class*='related']",
    "[id*='comment']",
    "[class*='comment']",
  ];

  $(noisySelectors.join(",")).remove();
}

function extractBodyFromJsonLd(jsonLdNodes) {
  for (const node of jsonLdNodes || []) {
    const nodeType = Array.isArray(node["@type"]) ? node["@type"].join(" ") : node["@type"] || "";
    if (!/article|newsarticle|report/i.test(String(nodeType))) continue;

    const body = sanitizeTextBlock(node.articleBody || "");
    if (body.length > 220 && !isNoisyTextCandidate(body)) {
      return body;
    }
  }

  return "";
}

function extractBodyText($, jsonLdNodes) {
  pruneNoisyDom($);

  const jsonLdBody = extractBodyFromJsonLd(jsonLdNodes);
  if (jsonLdBody) {
    return {
      bodyText: jsonLdBody,
      extractionMethod: "JSON-LD articleBody",
    };
  }

  const selectors = [
    "article p",
    "main p",
    "[role='main'] p",
    ".article p",
    ".post-content p",
    ".entry-content p",
    ".story-content p",
    ".content p",
  ];

  for (const selector of selectors) {
    const paragraphs = $(selector)
      .map((_, el) => sanitizeTextBlock($(el).text()))
      .get()
      .filter(isReadableParagraph);

    const text = normalizeWhitespace(paragraphs.slice(0, 18).join(" "));

    if (!text) continue;

    const textWords = getTokens(text).length;
    if (textWords < 80) continue;

    if (isNoisyTextCandidate(text)) continue;

    if (text.length > 200) {
      return {
        bodyText: text,
        extractionMethod: `Paragraph extraction (${selector})`,
      };
    }
  }

  const fallbackParagraphs = $("p")
    .map((_, el) => sanitizeTextBlock($(el).text()))
    .get()
    .filter(isReadableParagraph)
    .slice(0, 20);

  const fallbackFromParagraphs = normalizeWhitespace(fallbackParagraphs.join(" "));
  if (fallbackFromParagraphs.length > 200 && !isNoisyTextCandidate(fallbackFromParagraphs)) {
    return {
      bodyText: fallbackFromParagraphs,
      extractionMethod: "Readable paragraph fallback",
    };
  }

  const bodyFallback = normalizeWhitespace(
    $("body")
      .find("p")
      .map((_, el) => sanitizeTextBlock($(el).text()))
      .get()
      .filter(isReadableParagraph)
      .slice(0, 20)
      .join(" ")
  );

  return {
    bodyText: isNoisyTextCandidate(bodyFallback) ? "" : bodyFallback,
    extractionMethod: bodyFallback ? "Body paragraph fallback" : "No readable article body found",
  };
}

module.exports = {
  parseJsonLdNodes,
  extractPublishedAt,
  extractAuthors,
  extractMetaDescription,
  extractTitle,
  extractBodyText,
  // exported for unit testing
  sanitizeTextBlock,
  isNoisyTextCandidate,
  isReadableParagraph,
};
