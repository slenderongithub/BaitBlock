"use strict";

/**
 * Article analysis orchestration: fetch -> extract -> score -> shape response.
 *
 * Kept separate from the Express wiring so it can be unit/integration tested
 * without a live server. The fetcher is injectable (`deps.fetchArticle`) so
 * tests can supply fixture HTML instead of hitting the network.
 */

const cheerio = require("cheerio");
const { normalizeWhitespace, getTokens } = require("./textUtils");
const { acquireArticle } = require("./acquire");
const { FetchError } = require("./safeFetch");
const {
  parseJsonLdNodes,
  extractTitle,
  extractBodyText,
  extractMetaDescription,
  extractPublishedAt,
  extractAuthors,
  extractSiteName,
  extractArticleType,
  extractLabels,
} = require("./extraction");
const {
  extractKeyPhrases,
  groupEntities,
  extractSupportingSentences,
  extractClaims,
} = require("./nlp");
const { computeScore } = require("./scoring");

/**
 * Analyze a single article URL.
 * @param {string} url
 * @param {{ fetchArticle?: (url: string) => Promise<{ html: string, finalUrl: string, via?: string }> }} [deps]
 * @returns {Promise<object>} the JSON response payload
 */
async function analyzeUrl(url, deps = {}) {
  const fetchArticle = deps.fetchArticle || acquireArticle;

  const { html, finalUrl, via, partial } = await fetchArticle(url);
  const parsed = new URL(finalUrl);

  const $ = cheerio.load(html);
  const jsonLdNodes = parseJsonLdNodes($);

  // Metadata first: extractBodyText prunes the DOM.
  const title = extractTitle($);
  const metaDescription = extractMetaDescription($);
  const publishedAt = extractPublishedAt($, jsonLdNodes);
  const authors = extractAuthors($, jsonLdNodes);
  const siteName = extractSiteName($, jsonLdNodes);
  const articleType = extractArticleType($, jsonLdNodes);
  const labels = extractLabels($);
  const { bodyText, extractionMethod } = extractBodyText($, jsonLdNodes, html);

  const assessment = computeScore(title, bodyText, {
    authors,
    publishedAt,
    siteName,
    articleType,
    labels,
    hostname: parsed.hostname,
    protocol: parsed.protocol,
    urlPath: parsed.pathname,
    fetchVia: via,
    extractionMethod,
    partial: Boolean(partial),
  });

  const entityGroups = groupEntities(title, bodyText);
  const supportingSentences = extractSupportingSentences(bodyText, title);
  const wordCount = getTokens(bodyText).length;

  return {
    url: parsed.toString(),
    title,
    headline: title,
    headline_extracted: Boolean(title),
    ...assessment,
    composite_sensationalism_score: assessment.score,
    legitimacy_confidence_score: 100 - assessment.score,
    signals: assessment.signals.slice(0, 8),
    body_snippet: normalizeWhitespace(bodyText).slice(0, 300) || "Body text was unavailable.",
    source_domain: parsed.hostname,
    site_name: siteName || null,
    article_type: articleType || null,
    published_at: publishedAt || "Not available",
    authors,
    extraction_method: extractionMethod,
    headline_word_count: getTokens(title).length,
    word_count: wordCount,
    estimated_read_time_minutes: wordCount ? Math.max(1, Math.round(wordCount / 220)) : 0,
    numeric_claim_count: (bodyText.match(/\b\d+(?:\.\d+)?%?\b/g) || []).length,
    key_phrases: extractKeyPhrases(bodyText, title),
    named_entities: Object.values(entityGroups).flat().slice(0, 12),
    entity_groups: entityGroups,
    supporting_sentences: supportingSentences,
    claims_to_verify: extractClaims(bodyText, supportingSentences),
    meta_description: metaDescription || "Not available",
    fetch_via: via || "direct fetch",
    partial: Boolean(partial),
    analyzed_at: new Date().toISOString(),
    engine: "node-nlp",
  };
}

module.exports = { analyzeUrl, FetchError };
