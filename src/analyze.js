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
} = require("./extraction");
const {
  extractKeyPhrases,
  extractNamedEntities,
  groupEntities,
  extractSupportingSentences,
} = require("./nlp");
const { computeScore, buildSummary, classifyScore } = require("./scoring");

/**
 * Analyze a single article URL.
 * @param {string} url
 * @param {{ fetchArticle?: (url: string) => Promise<{ html: string, finalUrl: string }> }} [deps]
 * @returns {Promise<object>} the JSON response payload
 */
async function analyzeUrl(url, deps = {}) {
  const fetchArticle = deps.fetchArticle || acquireArticle;

  const { html, finalUrl, via } = await fetchArticle(url);
  const parsed = new URL(finalUrl);

  const $ = cheerio.load(html);
  const jsonLdNodes = parseJsonLdNodes($);

  const title = extractTitle($);
  const { bodyText, extractionMethod } = extractBodyText($, jsonLdNodes);
  const metaDescription = extractMetaDescription($);
  const publishedAt = extractPublishedAt($, jsonLdNodes);
  const authors = extractAuthors($, jsonLdNodes);
  const keyPhrases = extractKeyPhrases(bodyText, title);
  const namedEntities = extractNamedEntities(title, bodyText);
  const entityGroups = groupEntities(namedEntities);
  const supportingSentences = extractSupportingSentences(bodyText);
  const bodySnippet = normalizeWhitespace(bodyText).slice(0, 300) || "Body text was unavailable.";

  const wordCount = getTokens(bodyText).length;
  const headlineWordCount = getTokens(title).length;
  const numericClaimCount = (bodyText.match(/\b\d+(?:\.\d+)?%?\b/g) || []).length;
  const estimatedReadTimeMinutes = Math.max(1, Math.round(wordCount / 220));

  const {
    score,
    signals,
    scoreBreakdown,
    cosineSimilarityScore,
    sentimentPolarity,
    semanticGap,
    sensationalTone,
  } = computeScore(title, bodyText);

  const { bucket, verdict } = classifyScore(score);
  const confidence = Math.max(0, Math.min(100, 100 - score));

  return {
    url: parsed.toString(),
    title,
    headline: title,
    headline_extracted: Boolean(title),
    score,
    bucket,
    verdict,
    composite_sensationalism_score: score,
    legitimacy_confidence_score: confidence,
    summary: buildSummary(score),
    signals: signals.slice(0, 6),
    body_snippet: bodySnippet,
    source_domain: parsed.hostname,
    published_at: publishedAt,
    authors,
    extraction_method: extractionMethod,
    headline_word_count: headlineWordCount,
    word_count: wordCount,
    estimated_read_time_minutes: estimatedReadTimeMinutes,
    numeric_claim_count: numericClaimCount,
    score_breakdown: scoreBreakdown,
    key_phrases: keyPhrases,
    named_entities: namedEntities,
    entity_groups: entityGroups,
    supporting_sentences: supportingSentences,
    cosine_similarity_score: cosineSimilarityScore,
    sentiment_polarity: sentimentPolarity,
    semantic_gap: semanticGap,
    sensational_tone: sensationalTone,
    meta_description: metaDescription || "Not available",
    fetch_via: via || "direct fetch",
    engine: "node-heuristic",
  };
}

module.exports = { analyzeUrl, FetchError };
