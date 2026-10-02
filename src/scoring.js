"use strict";

/**
 * BaitBlock risk engine (Node). Scores an article on six independent
 * dimensions and combines them into one 0-100 risk score plus a five-tier
 * verdict that names the *kind* of problem instead of a yes/no:
 *
 *   bait          learned headline-style model + curiosity-gap rules
 *   sensational   loaded/hyperbolic language, shouting punctuation and caps
 *   consistency   does the body support the headline? (stemmed coverage of
 *                 headline terms, figures and names grounded in the body,
 *                 certainty in the headline vs hedging in the body)
 *   sourcing      named attribution, quotes and evidence vs anonymous/rumor
 *   transparency  byline, date, publisher, transport, sponsored labels
 *   manipulation  urgency, scams, miracle cures, conspiracy, lookalike domains
 *
 * Signal definitions live in ./data/rules.json (shared with app.py).
 * Dimensions combine as a noisy-OR with a dead zone: one strong red flag is
 * enough to raise the score, several moderate flags compound, and low-level
 * noise spread across dimensions doesn't add up.
 */

const nlp = require("compromise");
const RULES = require("./data/rules.json");
const config = require("./config");
const { normalizeWhitespace, getTokens, stem, splitSentences } = require("./textUtils");
const { predictHeadline } = require("./headlineModel");

const S = config.scoring;
const STOP_WORDS = new Set(RULES.stop_words);
const SATIRE = new Set(RULES.satire_domains);
const PATTERNS = RULES.patterns.map((p) => ({ ...p, regex: new RegExp(p.re, "gi") }));
const LEX = Object.fromEntries(
  Object.entries(RULES.lexicons).map(([k, re]) => [k, new RegExp(re, "gi")])
);
const QUOTE_RE = /["“][^"”]{20,}["”]/g;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

// Page-level checks that can't run when only the link's words are available.
const UNASSESSED_WHEN_LIMITED = new Set(["consistency", "sourcing", "transparency"]);

const TIERS = [
  { risk_level: "minimal", bucket: "safe", verdict: "Straight Reporting" },
  { risk_level: "low", bucket: "safe", verdict: "Likely Legit" },
  { risk_level: "moderate", bucket: "warning", verdict: "Borderline" },
  { risk_level: "high", bucket: "risky", verdict: null }, // named after the main concern
  { risk_level: "severe", bucket: "risky", verdict: null },
];

const SUMMARY_LEAD = {
  minimal: "Low risk: the headline and article read like straight reporting.",
  low: "Mostly sound, with minor warning signs.",
  moderate: "Mixed signals: read critically before trusting the framing.",
  high: "High risk of misleading or manipulative framing.",
  severe: "Severe risk: several strong deception signals stack up.",
};

const matchesOf = (regex, text) => (text ? text.match(regex) || [] : []);
const saturate = (points) => Math.round(100 * (1 - Math.exp(-Math.max(0, points) / S.saturation)));
const pct = (x) => `${Math.round(x * 100)}%`;
const numbersIn = (text) =>
  (text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ""));

function contentStems(text) {
  return new Set(
    getTokens(text)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
      .map(stem)
  );
}

function share(needles, haystack) {
  if (!needles.size) return 0;
  let hit = 0;
  needles.forEach((n) => haystack.has(n) && (hit += 1));
  return hit / needles.size;
}

/** VADER-style normalised valence of `text` in [-1, 1]. */
function computeSentimentPolarity(text) {
  let sum = 0;
  getTokens(text).forEach((t) => (sum += RULES.valence[t] || 0));
  return sum === 0 ? 0 : sum / Math.sqrt(sum * sum + 15);
}

function loadedIntensity(tokens) {
  const hits = [];
  let sum = 0;
  tokens.forEach((t) => {
    const v = RULES.loaded_words[t];
    if (v) {
      sum += v;
      hits.push(t);
    }
  });
  return { sum, hits };
}

/* ---------------- dimensions ---------------- */

function scoreHeadline(title, add, highlights) {
  const model = predictHeadline(title);
  if (model) {
    const pts =
      (Math.max(0, model.probability - S.modelFloor) / (1 - S.modelFloor)) * S.modelMaxPoints;
    if (pts >= 1) {
      add(
        "bait",
        pts,
        `Headline style is ${pct(model.probability)} similar to known clickbait headlines.`
      );
    }
    if (model.probability >= 0.5) {
      model.terms.forEach((t) => !t.term.includes("<") && highlights.add(t.term));
    }
  }

  PATTERNS.filter((p) => p.scope === "headline").forEach((p) => {
    const found = matchesOf(p.regex, title);
    if (!found.length) return;
    const n = Math.min(found.length, p.max || 1);
    add(p.dim, p.weight * n, `${p.label}: "${found.slice(0, n).join('", "')}"`);
    found.forEach((f) => highlights.add(f));
  });

  const tokens = getTokens(title);
  const loaded = loadedIntensity(tokens);
  if (loaded.sum) {
    // Loaded words inside a quoted remark are someone's speech: half weight.
    const quoted = loadedIntensity(
      getTokens((title.match(/["'\u2018\u201c][^"'\u2019\u201d]+/g) || []).join(" "))
    );
    const pts = Math.min(40, (loaded.sum - quoted.sum / 2) * 6);
    add(
      "sensational",
      pts,
      `Loaded words: ${loaded.hits.join(", ")}${quoted.sum ? " (partly quoted)" : ""}`
    );
    loaded.hits.forEach((h) => highlights.add(h));
  }
  const intensifiers = matchesOf(LEX.intensifier, title);
  if (intensifiers.length) {
    add("sensational", intensifiers.length * 4, `Intensifiers: ${intensifiers.join(", ")}`);
  }

  const bangs = (title.match(/!/g) || []).length;
  if (bangs) add("sensational", Math.min(16, bangs * 8), "Exclamation marks in the headline.");

  const capsWords = (title.match(/\b[A-Z]{5,}\b/g) || []).length;
  const letters = title.replace(/[^A-Za-z]/g, "");
  const upperRatio = letters ? title.replace(/[^A-Z]/g, "").length / letters.length : 0;
  if (upperRatio > 0.45 && title.length > 16) {
    add("sensational", 15, "Headline is written mostly in capitals.");
  } else if (capsWords) {
    add("sensational", Math.min(20, 6 + capsWords * 5), "ALL-CAPS words for emphasis.");
  }
  if (EMOJI_RE.test(title)) add("sensational", 6, "Emoji in the headline.");
  if (/\?\s*$/.test(title)) add("bait", 6, "Headline is posed as a question.");

  const words = tokens.length;
  if (words && (words < 4 || words > 22)) {
    add("bait", 5, `Unusual headline length (${words} words).`);
  }
}

function scoreBodyTone(body, words, add) {
  if (words < S.minBodyWords) return 0;
  const per100 = words / 100;
  const density = loadedIntensity(getTokens(body)).sum / per100;
  if (density > 0.8) {
    add(
      "sensational",
      Math.min(25, (density - 0.8) * 10),
      `Body leans on loaded language (${density.toFixed(1)} intensity per 100 words).`
    );
  }
  const bangRate = (body.match(/!/g) || []).length / per100;
  if (bangRate > 0.5) add("sensational", 10, "Body is full of exclamation marks.");
  return density;
}

function scoreConsistency(title, body, sentences, add, strengths) {
  const H = contentStems(title);
  if (!H.size || !sentences.length) return null;

  const stemsOf = (s) => contentStems(s);
  const sentenceStems = sentences.map(stemsOf);
  const full = share(H, new Set(sentenceStems.flatMap((s) => [...s])));
  const lead = share(H, new Set(sentenceStems.slice(0, 3).flatMap((s) => [...s])));
  let best = 0;
  for (let i = 0; i < sentenceStems.length; i += 1) {
    const win = new Set([...sentenceStems[i], ...(sentenceStems[i + 1] || [])]);
    best = Math.max(best, share(H, win));
  }
  const alignment = 0.4 * full + 0.3 * lead + 0.3 * best;

  if (alignment < S.alignmentOk) {
    // Short headlines are noisy (one missing word = big swing), so scale down.
    const reliability = Math.min(1, H.size / 3);
    add(
      "consistency",
      ((S.alignmentOk - alignment) / S.alignmentOk) * 55 * reliability,
      `Only ${pct(full)} of the headline's key terms appear in the article (${pct(lead)} in the opening).`
    );
  } else {
    strengths.push(`The article's opening addresses the headline (${pct(lead)} term match).`);
  }

  const bodyLower = body.toLowerCase();
  const bodyNumbers = new Set(numbersIn(body));
  const missingNumbers = numbersIn(title).filter(
    (n) => !/^(19|20)\d\d$/.test(n) && !bodyNumbers.has(n)
  );
  if (missingNumbers.length) {
    add(
      "consistency",
      Math.min(2, missingNumbers.length) * 20,
      `Headline figure${missingNumbers.length > 1 ? "s" : ""} ${missingNumbers.map((n) => `"${n}"`).join(", ")} never appear${missingNumbers.length > 1 ? "" : "s"} in the article.`
    );
  }

  const missingNames = nlp(title)
    .topics()
    .out("array")
    .map((e) => e.replace(/[^\w\s'-]|[-']+$/g, "").trim())
    .filter(
      (e) => e.length > 2 && !getTokens(e).some((t) => t.length > 2 && bodyLower.includes(t))
    );
  if (missingNames.length) {
    add(
      "consistency",
      Math.min(2, missingNames.length) * 16,
      `Named in the headline but absent from the body: ${missingNames.slice(0, 2).join(", ")}.`
    );
  }

  const claims = matchesOf(LEX.overclaim, title);
  const hedges = matchesOf(LEX.hedge, body);
  if (claims.length && hedges.length >= 2) {
    add(
      "consistency",
      Math.min(45, 25 + hedges.length * 3),
      `Headline states it as certain ("${claims[0]}") while the article hedges ${hedges.length} times ("${[...new Set(hedges.map((h) => h.toLowerCase()))].slice(0, 3).join('", "')}").`
    );
  }
  return alignment;
}

function scoreSourcing(body, words, add, strengths) {
  if (words < S.minBodyWords) {
    add(
      "sourcing",
      20,
      `The article body is very thin (${words} words), so claims can't be checked.`
    );
    return {};
  }
  const per100 = words / 100;
  const m = {
    attributions: matchesOf(LEX.attribution, body).length,
    quotes: matchesOf(QUOTE_RE, body).length,
    anonymous: matchesOf(LEX.anonymous, body).length,
    rumor: matchesOf(LEX.rumor, body).length,
    evidence: matchesOf(LEX.evidence, body).length,
  };
  const rate = m.attributions / per100;

  if (words < 150)
    add("sourcing", 12, `Short article (${words} words) with little room for evidence.`);
  if (words >= 150 && rate < 0.25) {
    add("sourcing", 30, 'Almost no statements are attributed to anyone ("said", "according to").');
  } else if (words >= 150 && rate < 0.6) {
    add("sourcing", 14, `Few attributed statements (${m.attributions} in ${words} words).`);
  }
  if (m.quotes === 0 && words >= 250) add("sourcing", 8, "No direct quotes from anyone involved.");
  if (m.anonymous >= 2 && m.anonymous * 2 >= m.attributions) {
    add(
      "sourcing",
      Math.min(30, 10 + m.anonymous * 6),
      `Leans on vague or anonymous sources ("sources say", "experts warn"): ${m.anonymous} mentions.`
    );
  }
  if (m.rumor >= 2) {
    add(
      "sourcing",
      Math.min(24, m.rumor * 6),
      `Rumor / unverified wording ("reportedly", "allegedly"): ${m.rumor} times.`
    );
  }
  if (m.evidence === 0 && m.attributions < 3 && words >= 250) {
    add("sourcing", 10, "No reference to data, studies, documents or official figures.");
  }

  if (m.attributions >= 3) strengths.push(`${m.attributions} attributed statements.`);
  if (m.quotes >= 2) strengths.push(`${m.quotes} direct quotes.`);
  if (m.evidence >= 2)
    strengths.push(`Cites data, studies or documents (${m.evidence} references).`);
  return m;
}

function registrableDomain(host) {
  const parts = host.split(".");
  const n =
    parts.length >= 3 &&
    parts.at(-1).length === 2 &&
    /^(co|com|net|org|gov|ac|edu)$/.test(parts.at(-2))
      ? 3
      : 2;
  return parts.slice(-n).join(".");
}

/** Brand domain this host is dressed up as (abcnews.com.co, cnn-news24.net), or null. */
function impersonatedOutlet(hostname = "") {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const reg = registrableDomain(host);
  const official = Object.values(RULES.brand_domains).flat();
  if (official.includes(reg)) return null;
  const label = reg.split(".")[0];
  for (const [brand, domains] of Object.entries(RULES.brand_domains)) {
    const hit = domains.find((d) => host.startsWith(`${d}.`) || host.includes(`.${d}.`));
    if (hit) return hit;
    // Outlets own many TLDs (dailymail.com, cnn.it), so only a hyphenated
    // brand label ("cnn-breaking.net") counts on its own.
    if (label.startsWith(`${brand}-`)) return domains[0];
  }
  return null;
}

function scoreTransparency(meta, body, add, strengths, labels) {
  const host = (meta.hostname || "").toLowerCase().replace(/^www\./, "");
  if (meta.limited) {
    // Only domain-level checks apply when the page itself couldn't be read.
  } else if (!meta.title) {
    add("transparency", 15, "No headline could be extracted from the page.");
  }
  if (meta.limited) {
    /* byline / date / publisher unknown, not missing */
  } else if (!meta.authors || !meta.authors.length) {
    add("transparency", 25, "No byline: the author is not identified.");
  }
  if (!meta.limited && !meta.publishedAt) add("transparency", 20, "No publication date found.");
  if (!meta.limited && !meta.siteName) {
    add("transparency", 6, "Publisher name isn't declared in the page metadata.");
  }
  if (meta.protocol === "http:") add("transparency", 10, "Page is served over unencrypted HTTP.");
  if (meta.authors && meta.authors.length && meta.publishedAt) {
    strengths.push("Byline and publication date are present.");
  }

  const labelText = `${meta.articleType || ""} ${(meta.labels || []).join(" ")} ${meta.urlPath || ""}`;
  const opening = body.slice(0, 400);
  if (matchesOf(LEX.sponsored, `${labelText} ${opening}`).length) {
    add("transparency", 20, "Marked as sponsored / paid content.");
    labels.push({
      label: "Sponsored",
      detail: "Paid or partner content, not independent reporting.",
    });
  }
  if (
    /opinion|editorial/i.test(meta.articleType || "") ||
    matchesOf(LEX.opinion, labelText).length
  ) {
    labels.push({ label: "Opinion", detail: "Opinion piece: arguments, not straight news." });
  }
  if (matchesOf(LEX.press_release, `${labelText} ${opening}`).length) {
    labels.push({
      label: "Press release",
      detail: "Written by the subject itself, not a newsroom.",
    });
  }
  if (
    /liveblog/i.test(meta.articleType || "") ||
    /\/(live|live-updates|live-news)\//i.test(meta.urlPath || "")
  ) {
    labels.push({
      label: "Live blog",
      detail: "Rolling updates: the headline may describe only the latest entry.",
    });
  }
  if (/video/i.test(meta.articleType || "") || /\/videos?\//i.test(meta.urlPath || "")) {
    labels.push({
      label: "Video page",
      detail: "Mostly video; the text analyzed is only the page's description.",
    });
  }
  const satire = SATIRE.has(registrableDomain(host)) || /satiric/i.test(meta.articleType || "");
  if (satire) {
    labels.push({
      label: "Satire",
      detail: "This outlet publishes satire. It is not meant as news.",
    });
  }
  const published = Date.parse(meta.publishedAt || "");
  if (Number.isFinite(published)) {
    const years = (Date.now() - published) / (365.25 * 24 * 3600 * 1000);
    if (years >= 2) {
      labels.push({
        label: "Old story",
        detail: `Published ${Math.floor(years)} years ago. Check it isn't old news recirculating.`,
      });
    }
  }
  return satire;
}

function scoreManipulation(title, body, hostname, add) {
  const text = `${title}\n${body}`;
  PATTERNS.filter((p) => p.scope === "any").forEach((p) => {
    const found = matchesOf(p.regex, text);
    if (!found.length) return;
    const n = Math.min(found.length, p.max || 1);
    add(p.dim, p.weight * n, `${p.label}: "${[...new Set(found)].slice(0, 2).join('", "')}"`);
  });
  const outlet = impersonatedOutlet(hostname);
  if (outlet) add("manipulation", 45, `Domain imitates a well-known outlet (${outlet}).`);
}

/* ---------------- combination ---------------- */

function analysisConfidence({ title, words, englishShare, fetchVia, extractionMethod, partial }) {
  if (fetchVia === "url-only") {
    return {
      score: 15,
      notes: [
        "The site blocks automated readers, so only the headline words in the link were analyzed. Open the article yourself before relying on this.",
      ],
    };
  }
  let c = 100;
  const notes = [];
  if (partial) {
    c -= 25;
    notes.push("Only part of the page could be read (paywall, consent wall or partial render).");
  }
  if (!title) {
    c -= 40;
    notes.push("No headline could be extracted.");
  }
  if (words < S.minBodyWords) {
    c -= 35;
    notes.push("Very little article text was available.");
  } else if (words < 200) {
    c -= 15;
    notes.push("Short article text limits the sourcing analysis.");
  }
  if (words >= 40 && englishShare < 0.15) {
    c -= 35;
    notes.push(
      "The article may not be in English; the lexicons and headline model are English-only."
    );
  }
  if (fetchVia === "feed") {
    c -= 10;
    notes.push("Analyzed from the RSS feed copy, which may be a summary.");
  }
  if (fetchVia === "wayback") {
    c -= 5;
    notes.push("Analyzed from an archived snapshot.");
  }
  if (/fallback/i.test(extractionMethod || "")) {
    c -= 10;
    notes.push("The body was found by a generic fallback and may include non-article text.");
  }
  return { score: Math.max(5, c), notes };
}

/**
 * Map a 0-100 score to its tier. Below "high", a content label (Satire,
 * Sponsored Content) names the verdict instead, since the article isn't
 * deceptive in itself but shouldn't read as plain reporting.
 */
function classifyScore(score, concern = null, contentLabel = null) {
  const idx = S.tiers.filter((cut) => score >= cut).length;
  const tier = TIERS[idx];
  if (contentLabel && idx < 3) {
    return { tier: idx + 1, risk_level: tier.risk_level, bucket: "warning", verdict: contentLabel };
  }
  return {
    tier: idx + 1,
    risk_level: tier.risk_level,
    bucket: tier.bucket,
    verdict: tier.verdict || concern || "Clickbait",
  };
}

/**
 * Full assessment of an article.
 * @param {string} title
 * @param {string} bodyText
 * @param {object} [meta] { authors, publishedAt, siteName, hostname, protocol,
 *   urlPath, articleType, labels, fetchVia, extractionMethod }
 */
function computeScore(title, bodyText, meta = {}) {
  title = normalizeWhitespace(title || "");
  const body = normalizeWhitespace(bodyText || "");
  const tokens = getTokens(body);
  const words = tokens.length;
  const sentences = splitSentences(body);

  const dims = Object.fromEntries(
    RULES.dimensions.map((d) => [d.key, { ...d, points: 0, signals: [] }])
  );
  const add = (key, points, text) => {
    if (points < 1) return;
    dims[key].points += points;
    dims[key].signals.push({ text, points: Math.round(points) });
  };
  const strengths = [];
  const labels = [];
  const highlights = new Set();

  if (title) scoreHeadline(title, add, highlights);
  // url-only: there is no page to judge, so body/sourcing/byline checks are
  // skipped rather than scored as "missing" (a bot wall isn't a shady article).
  const limited = meta.fetchVia === "url-only";
  const loadedDensity = scoreBodyTone(body, words, add);
  const alignment =
    title && words >= S.minBodyWords
      ? scoreConsistency(title, body, sentences, add, strengths)
      : null;
  const sourcing = limited ? {} : scoreSourcing(body, words, add, strengths);
  const satire = scoreTransparency({ ...meta, title, limited }, body, add, strengths, labels);
  if (limited) {
    labels.push({
      label: "Headline only",
      detail: "The site blocked our reader; this verdict covers the link's headline words only.",
    });
  }
  scoreManipulation(title, body, meta.hostname || "", add);

  const dimensions = Object.values(dims).map((d) => {
    d.signals.sort((a, b) => b.points - a.points);
    return {
      key: d.key,
      label: d.label,
      weight: d.weight,
      score: saturate(d.points),
      signals: d.signals,
      // Not checked != checked and clean: the UI shows these as N/A.
      assessed: !(limited && UNASSESSED_WHEN_LIMITED.has(d.key) && !d.points),
    };
  });

  let keep = 1;
  dimensions.forEach((d) => {
    const r = Math.max(0, d.score - S.deadZone) / (100 - S.deadZone);
    keep *= 1 - d.weight * r;
  });
  const score = Math.round(100 * (1 - keep));

  const ranked = [...dimensions].sort((a, b) => b.weight * b.score - a.weight * a.score);
  const primaryDim = ranked[0].score >= 25 ? ranked[0] : null;
  const ruleOf = (key) => RULES.dimensions.find((d) => d.key === key);
  const primaryConcern = primaryDim ? ruleOf(primaryDim.key).concern : null;
  const sponsored = labels.some((l) => l.label === "Sponsored");
  const cls = classifyScore(
    score,
    primaryConcern,
    satire ? "Satire" : sponsored ? "Sponsored Content" : limited ? "Headline Only" : null
  );

  const guidance = ranked
    .filter((d) => d.score >= 40 || (d === primaryDim && d.score >= 25))
    .slice(0, 3)
    .map((d) => ruleOf(d.key).guidance);
  if (satire) guidance.unshift("This is satire. Don't share it as if it were real news.");
  if (limited) {
    guidance.unshift(
      "We couldn't read this article. Open it yourself and check who wrote it, when, and whether the body backs up the headline."
    );
  }

  let summary = limited
    ? "Only the headline could be checked; the article itself couldn't be read."
    : SUMMARY_LEAD[cls.risk_level];
  if (primaryDim && cls.tier >= 2) {
    summary += ` Biggest issue: ${primaryDim.label.toLowerCase()}. ${primaryDim.signals[0].text}`;
  }
  if (satire) summary = `Satire site. ${summary}`;

  const polarity = computeSentimentPolarity(title);
  const englishShare = words ? tokens.filter((t) => STOP_WORDS.has(t)).length / words : 1;
  const dimScore = (key) => dimensions.find((d) => d.key === key).score;
  const model = title ? predictHeadline(title) : null;

  return {
    score,
    ...cls,
    primary_concern: primaryConcern,
    summary,
    dimensions,
    signals: dimensions
      .flatMap((d) => d.signals.map((s) => ({ ...s, w: s.points * d.weight })))
      .sort((a, b) => b.w - a.w)
      .map((s) => s.text),
    strengths,
    context_labels: labels,
    guidance,
    headline_highlights: [
      ...new Map([...highlights].map((h) => [h.toLowerCase().trim(), h.trim()])).values(),
    ]
      .filter((h) => h.length > 1)
      .slice(0, 12),
    headline_model: model
      ? { probability: +model.probability.toFixed(3), terms: model.terms.map((t) => t.term) }
      : null,
    analysis_confidence: analysisConfidence({
      title,
      words,
      englishShare,
      fetchVia: meta.fetchVia,
      extractionMethod: meta.extractionMethod,
      partial: meta.partial,
    }),
    evidence_metrics: { ...sourcing, loaded_density: +loadedDensity.toFixed(2) },
    cosine_similarity_score: alignment === null ? 0 : +alignment.toFixed(3),
    sentiment_polarity: +polarity.toFixed(3),
    semantic_gap: alignment !== null && alignment < S.semanticGapThreshold,
    sensational_tone:
      Math.abs(polarity) > S.sentimentMagnitudeThreshold || dimScore("sensational") >= 50,
    // Legacy 4-bar breakdown, kept for older clients of the response contract.
    score_breakdown: {
      semantic_gap_points: dimScore("consistency"),
      sentiment_points: dimScore("sensational"),
      hook_points: dimScore("bait"),
      synergy_points: 0,
    },
  };
}

module.exports = {
  computeScore,
  classifyScore,
  computeSentimentPolarity,
  impersonatedOutlet,
  registrableDomain,
  contentStems,
};
