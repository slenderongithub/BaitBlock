const express = require("express");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

const BAIT_PATTERNS = [
  /you won't believe/i,
  /what happened next/i,
  /shocking/i,
  /mind.?blowing/i,
  /this one trick/i,
  /secret/i,
  /doctors hate/i,
  /gone wrong/i,
  /won't believe/i,
  /instantly/i,
  /guaranteed/i,
  /must see/i,
  /exposed/i,
  /you need to see/i,
  /this is why/i,
  /number \d+/i,
  /\b(top|best|worst)\s+\d+/i,
];

const DECEPTION_HINTS = [
  /miracle/i,
  /cure/i,
  /100%/i,
  /proof/i,
  /the truth about/i,
  /they don't want you to know/i,
  /conspiracy/i,
  /hoax/i,
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "he",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "to", "was", "were", "will", "with",
  "this", "these", "those", "you", "your", "they", "their", "we", "our", "about", "after", "before",
  "into", "than", "then", "them", "who", "what", "when", "where", "why", "how", "can", "could",
  "should", "would", "may", "might", "also", "not", "no", "yes", "if", "else", "than", "because",
]);

const POSITIVE_WORDS = new Set([
  "good", "great", "win", "wins", "success", "safe", "secure", "improve", "improved", "benefit",
  "benefits", "trusted", "calm", "hope", "positive", "better", "best",
]);

const NEGATIVE_WORDS = new Set([
  "bad", "worse", "worst", "risk", "danger", "dangerous", "fear", "angry", "hate", "scam", "fraud",
  "hoax", "crisis", "shock", "shocking", "panic", "urgent", "warning", "exposed",
]);

function normalizeWhitespace(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTokens(text = "") {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function toSentenceCase(value = "") {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

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
          node["@graph"].forEach(graphNode => queue.push(graphNode));
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
    $("meta[property='article:published_time']").attr("content")
    || $("meta[name='article:published_time']").attr("content")
    || $("meta[name='pubdate']").attr("content")
    || $("time").first().attr("datetime")
    || ""
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
    $("meta[name='author']").attr("content")
    || $("meta[property='article:author']").attr("content")
    || ""
  );

  if (metaAuthor) {
    metaAuthor.split(/,|\||&| and /i).map(name => normalizeWhitespace(name)).filter(Boolean).forEach(name => authorSet.add(name));
  }

  for (const node of jsonLdNodes) {
    const author = node.author;
    const authorList = Array.isArray(author) ? author : (author ? [author] : []);

    authorList.forEach(entry => {
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
    $("meta[name='description']").attr("content")
    || $("meta[property='og:description']").attr("content")
    || $("meta[name='twitter:description']").attr("content")
    || ""
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
    .replace(/[{}\[\]"]+/g, " ")
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

  const markerHits = noisyMarkers.reduce((acc, marker) => acc + (lower.includes(marker.toLowerCase()) ? 1 : 0), 0);
  const punctuationDensity = (value.match(/[{}[\]"=:;,_]/g) || []).length / Math.max(1, value.length);
  const alphaChars = (value.match(/[A-Za-z]/g) || []).length;
  const alphaRatio = alphaChars / Math.max(1, value.length);

  return markerHits >= 2 || punctuationDensity > 0.12 || alphaRatio < 0.45;
}

function isReadableParagraph(text = "") {
  const value = sanitizeTextBlock(text);
  if (value.length < 60) return false;
  if (isNoisyTextCandidate(value)) return false;
  if (/cookie|consent|privacy policy|terms of use|all rights reserved|subscribe|sign in|log in|disclaimer/i.test(value)) return false;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 10) return false;

  const longWordCount = words.filter(word => word.length > 20).length;
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
    const nodeType = Array.isArray(node["@type"]) ? node["@type"].join(" ") : (node["@type"] || "");
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

    const text = normalizeWhitespace(
      paragraphs
        .slice(0, 18)
        .join(" ")
    );

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

function computeLexicalSimilarity(headline, bodyText) {
  const headlineTokens = new Set(getTokens(headline).filter(token => !STOP_WORDS.has(token)));
  const bodyTokens = new Set(getTokens(bodyText).filter(token => !STOP_WORDS.has(token)));

  if (headlineTokens.size === 0 || bodyTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  headlineTokens.forEach(token => {
    if (bodyTokens.has(token)) overlap += 1;
  });

  return overlap / headlineTokens.size;
}

function computeSentimentPolarity(text) {
  const tokens = getTokens(text);
  if (tokens.length === 0) return 0;

  let pos = 0;
  let neg = 0;

  tokens.forEach(token => {
    if (POSITIVE_WORDS.has(token)) pos += 1;
    if (NEGATIVE_WORDS.has(token)) neg += 1;
  });

  return clamp((pos - neg) / Math.max(1, pos + neg), -1, 1);
}

function extractKeyPhrases(text, headline) {
  const frequency = new Map();
  const tokens = getTokens(`${headline} ${text}`).filter(token => token.length > 3 && !STOP_WORDS.has(token));

  tokens.forEach(token => {
    frequency.set(token, (frequency.get(token) || 0) + 1);
  });

  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function extractNamedEntities(headline, bodyText) {
  const pool = `${headline}. ${bodyText.slice(0, 2200)}`;
  const matches = pool.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) || [];
  const cleaned = matches
    .map(value => normalizeWhitespace(value))
    .filter(value => value.length > 2 && !/^The$|This$|That$|And$|But$/.test(value));

  return Array.from(new Set(cleaned)).slice(0, 12);
}

function groupEntities(entities) {
  if (!entities.length) return {};

  return {
    "Proper Nouns": entities,
  };
}

function extractSupportingSentences(bodyText) {
  const sentences = bodyText
    .split(/(?<=[.!?])\s+/)
    .map(sentence => normalizeWhitespace(sentence))
    .filter(sentence => sentence.length > 30 && !isNoisyTextCandidate(sentence));

  const ranked = sentences.filter(sentence => /\d|claim|said|report|according|announced|confirmed|study/i.test(sentence));
  const chosen = (ranked.length ? ranked : sentences).slice(0, 4);
  return chosen;
}

function computeScore(title, bodyText) {
  let score = 0;
  const signals = [];
  let hookPoints = 0;
  let sentimentPoints = 0;
  let semanticGapPoints = 0;

  const cosineSimilarityScore = computeLexicalSimilarity(title, bodyText);
  const sentimentPolarity = computeSentimentPolarity(title);
  const semanticGap = cosineSimilarityScore < 0.35;
  const sensationalTone = Math.abs(sentimentPolarity) > 0.5;

  if (!title) {
    return {
      score: 65,
      signals: ["Could not extract a reliable headline from the page."],
      scoreBreakdown: {
        semantic_gap_points: 20,
        sentiment_points: 0,
        hook_points: 45,
        synergy_points: 0,
      },
      cosineSimilarityScore: 0,
      sentimentPolarity: 0,
      semanticGap: true,
      sensationalTone: false,
    };
  }

  BAIT_PATTERNS.forEach(pattern => {
    if (pattern.test(title)) {
      score += 14;
      hookPoints += 14;
      signals.push(`Headline matches pattern: \"${pattern.source.replace(/\\b|\\s\+/g, " ").replace(/[\\^$.*+?()[\]{}|]/g, "").trim()}\"`);
    }
  });

  DECEPTION_HINTS.forEach(pattern => {
    if (pattern.test(title)) {
      score += 10;
      hookPoints += 10;
      signals.push(`Potential deceptive cue found: \"${pattern.source.replace(/\\b|\\s\+/g, " ").replace(/[\\^$.*+?()[\]{}|]/g, "").trim()}\"`);
    }
  });

  const exclamationCount = (title.match(/!/g) || []).length;
  if (exclamationCount > 0) {
    const points = Math.min(12, exclamationCount * 4);
    score += points;
    hookPoints += points;
    signals.push("Headline uses high-emphasis punctuation.");
  }

  const questionCount = (title.match(/\?/g) || []).length;
  if (questionCount > 0) {
    const points = Math.min(10, questionCount * 4);
    score += points;
    hookPoints += points;
    signals.push("Headline is framed as a suspense question.");
  }

  const upperChars = title.replace(/[^A-Z]/g, "").length;
  const letterChars = title.replace(/[^A-Za-z]/g, "").length;
  const upperRatio = letterChars ? upperChars / letterChars : 0;
  if (upperRatio > 0.45 && title.length > 16) {
    score += 10;
    hookPoints += 10;
    signals.push("Headline has excessive uppercase emphasis.");
  }

  const titleWordCount = normalizeWhitespace(title).split(" ").filter(Boolean).length;
  if (titleWordCount < 4 || titleWordCount > 20) {
    score += 6;
    hookPoints += 6;
    signals.push("Headline length is unusual for balanced reporting.");
  }

  if (semanticGap) {
    score += 18;
    semanticGapPoints += 18;
    signals.push("Low lexical overlap between headline and body suggests a semantic gap.");
  }

  if (sensationalTone) {
    score += 12;
    sentimentPoints += 12;
    signals.push("Headline sentiment intensity is unusually high.");
  }

  if (bodyText && bodyText.length > 200) {
    const teaserWords = ["unbelievable", "shocking", "secret", "exposed", "truth", "must", "incredible"];
    const teaserHits = teaserWords.filter(word => new RegExp(`\\b${word}\\b`, "i").test(title));

    if (teaserHits.length > 0) {
      const bodyMentions = teaserHits.filter(word => new RegExp(`\\b${word}\\b`, "i").test(bodyText));
      if (bodyMentions.length === 0) {
        score += 12;
        semanticGapPoints += 12;
        signals.push("Headline teases claims not echoed in the article body.");
      }
    }
  }

  if (semanticGapPoints > 0 && hookPoints > 0) {
    score += 6;
    signals.push("Combined hook language and weak body support increased risk.");
  }

  score = clamp(score, 0, 100);

  return {
    score,
    signals,
    scoreBreakdown: {
      semantic_gap_points: semanticGapPoints,
      sentiment_points: sentimentPoints,
      hook_points: hookPoints,
      synergy_points: semanticGapPoints > 0 && hookPoints > 0 ? 6 : 0,
    },
    cosineSimilarityScore,
    sentimentPolarity,
    semanticGap,
    sensationalTone,
  };
}

function buildSummary(score) {
  if (score >= 70) {
    return "This article headline shows strong clickbait/deceptive signals.";
  }

  if (score >= 40) {
    return "This article has some clickbait characteristics. Read carefully before trusting the framing.";
  }

  return "This headline appears relatively neutral with limited clickbait signals.";
}

app.post("/api/analyze", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Please provide a valid URL." });
  }

  let parsed;
  try {
    parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return res.status(400).json({ error: "URL format is invalid." });
  }

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (ClickbaitDetector/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch article: HTTP ${response.status}` });
    }

    const html = await response.text();
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

    const isLikelyClickbait = score >= 55;
    const bucket = score >= 70 ? "risky" : score >= 40 ? "warning" : "safe";
    const verdict = score >= 70 ? "Clickbait" : score >= 40 ? "Borderline" : "Likely Legit";
    const confidence = clamp(100 - score, 0, 100);

    return res.json({
      url: parsed.toString(),
      title,
      headline: title,
      headline_extracted: Boolean(title),
      score,
      bucket,
      isLikelyClickbait,
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
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not analyze this URL right now. The site may block automated fetches.",
      detail: error.message,
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Clickbait detector is running at http://localhost:${PORT}`);
});
