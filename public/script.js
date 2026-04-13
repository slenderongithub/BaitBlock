const articleUrlInput = document.getElementById("articleUrl");
const analyzeBtn = document.getElementById("analyzeBtn");
const statusText = document.getElementById("statusText");

const resultCard = document.getElementById("resultCard");
const resultLabel = document.getElementById("resultLabel");
const resultScore = document.getElementById("resultScore");
const confidenceScore = document.getElementById("confidenceScore");
const resultSummary = document.getElementById("resultSummary");
const headlineText = document.getElementById("headlineText");
const signalsList = document.getElementById("signalsList");
const metricsList = document.getElementById("metricsList");
const bodySnippetText = document.getElementById("bodySnippetText");
const articleInfoList = document.getElementById("articleInfoList");
const breakdownList = document.getElementById("breakdownList");
const intelList = document.getElementById("intelList");
const entityGroupList = document.getElementById("entityGroupList");
const supportingSentenceList = document.getElementById("supportingSentenceList");

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "#d11a2a" : "#111111";
}

function clearNode(node) {
  node.textContent = "";
}

function addChip(container, text, className = "tag-chip") {
  const chip = document.createElement("span");
  chip.className = className;
  chip.textContent = text;
  container.appendChild(chip);
}

function renderSignals(signals) {
  signalsList.textContent = "";

  if (!signals || signals.length === 0) {
    addChip(signalsList, "No major clickbait signals detected.", "tag-chip is-label");
    return;
  }

  signals.forEach(signal => {
    addChip(signalsList, signal, "tag-chip is-signal");
  });
}

function renderChipRows(container, rows, className = "tag-chip") {
  clearNode(container);
  rows.forEach(row => addChip(container, row, className));
}

function renderEntityGroups(container, groups) {
  clearNode(container);
  const groupEntries = Object.entries(groups || {});

  if (groupEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sentence-card";
    empty.textContent = "No named entities were extracted.";
    container.appendChild(empty);
    return;
  }

  groupEntries.forEach(([label, values]) => {
    const groupCard = document.createElement("div");
    groupCard.className = "group-card";

    const title = document.createElement("span");
    title.className = "group-title";
    title.textContent = label;
    groupCard.appendChild(title);

    const chipsWrap = document.createElement("div");
    chipsWrap.className = "tag-cloud";
    values.forEach(value => addChip(chipsWrap, value, "tag-chip is-entity"));
    groupCard.appendChild(chipsWrap);

    container.appendChild(groupCard);
  });
}

function renderSupportingSentences(container, sentences) {
  clearNode(container);

  if (!sentences || sentences.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sentence-card";
    empty.textContent = "No supporting sentences could be extracted.";
    container.appendChild(empty);
    return;
  }

  sentences.forEach(sentence => {
    const item = document.createElement("div");
    item.className = "sentence-card";
    item.textContent = sentence;
    container.appendChild(item);
  });
}

function normalizeApiResponse(data = {}) {
  const score = Number(data.composite_sensationalism_score ?? data.score ?? 0);
  const confidence = Number(data.legitimacy_confidence_score ?? (100 - score));
  const verdict = data.verdict
    || (data.bucket === "risky" ? "Clickbait" : data.bucket === "warning" ? "Borderline" : "Likely Legit");

  return {
    ...data,
    verdict,
    composite_sensationalism_score: score,
    legitimacy_confidence_score: confidence,
    headline: data.headline || data.title || "",
    headline_extracted: data.headline_extracted ?? Boolean(data.title),
    body_snippet: data.body_snippet || "",
    source_domain: data.source_domain || (data.url ? new URL(data.url).hostname : "Unknown"),
    published_at: data.published_at || "Not available",
    authors: Array.isArray(data.authors) ? data.authors : [],
    extraction_method: data.extraction_method || "Heuristic parser",
    headline_word_count: data.headline_word_count ?? (data.title ? data.title.split(/\s+/).filter(Boolean).length : 0),
    word_count: data.word_count ?? 0,
    estimated_read_time_minutes: data.estimated_read_time_minutes ?? 0,
    numeric_claim_count: data.numeric_claim_count ?? 0,
    score_breakdown: data.score_breakdown || {
      semantic_gap_points: 0,
      sentiment_points: 0,
      hook_points: 0,
      synergy_points: 0,
    },
    key_phrases: Array.isArray(data.key_phrases) ? data.key_phrases : [],
    named_entities: Array.isArray(data.named_entities) ? data.named_entities : [],
    entity_groups: data.entity_groups || {},
    supporting_sentences: Array.isArray(data.supporting_sentences) ? data.supporting_sentences : [],
    cosine_similarity_score: Number(data.cosine_similarity_score ?? 0),
    sentiment_polarity: Number(data.sentiment_polarity ?? 0),
    semantic_gap: Boolean(data.semantic_gap),
    sensational_tone: Boolean(data.sensational_tone),
    signals: Array.isArray(data.signals) ? data.signals : [],
    summary: data.summary || "Analysis completed.",
  };
}

function renderResult(data) {
  resultCard.classList.remove("hidden", "safe", "warning", "risky");
  const bucketClass = data.verdict === "Clickbait"
    ? "risky"
    : data.verdict === "Sensationalist" || data.verdict === "Borderline"
      ? "warning"
      : "safe";
  resultCard.classList.add(bucketClass);

  resultLabel.textContent = data.verdict || "Analysis";
  resultScore.textContent = `${data.composite_sensationalism_score ?? 0}% risk`;
  confidenceScore.textContent = `${data.legitimacy_confidence_score ?? 0}% confidence`;
  resultSummary.textContent = data.summary;
  const headlinePrefix = data.headline_extracted ? "" : "(inferred) ";
  headlineText.textContent = `${headlinePrefix}${data.headline || "Could not extract a clean headline."}`;
  bodySnippetText.textContent = data.body_snippet || "Body text was unavailable.";

  const metricRows = [
    `Cosine similarity: ${(data.cosine_similarity_score ?? 0).toFixed(3)}`,
    `Sentiment polarity: ${(data.sentiment_polarity ?? 0).toFixed(3)}`,
    `Semantic gap detected: ${data.semantic_gap ? "Yes" : "No"}`,
    `Sensational tone detected: ${data.sensational_tone ? "Yes" : "No"}`,
    `Semantic gap threshold: < 0.350`,
    `Sensational polarity threshold: |polarity| > 0.500`,
  ];
  renderChipRows(metricsList, metricRows, "tag-chip is-metric");

  const infoRows = [
    `Source: ${data.source_domain || "Unknown"}`,
    `Published: ${data.published_at || "Not available"}`,
    `Authors: ${(data.authors && data.authors.length > 0) ? data.authors.join(", ") : "Unknown"}`,
    `Extraction: ${data.extraction_method || "Unknown"}`,
    `Headline words: ${data.headline_word_count ?? 0}`,
    `Article words: ${data.word_count ?? 0}`,
    `Est. read time: ${data.estimated_read_time_minutes ?? 0} min`,
    `Numeric claims found: ${data.numeric_claim_count ?? 0}`,
  ];
  renderChipRows(articleInfoList, infoRows, "tag-chip is-label");

  const breakdown = data.score_breakdown || {};
  const breakdownRows = [
    `Semantic gap points: ${breakdown.semantic_gap_points ?? 0}`,
    `Sentiment points: ${breakdown.sentiment_points ?? 0}`,
    `Hook phrase points: ${breakdown.hook_points ?? 0}`,
    `Combined boost points: ${breakdown.synergy_points ?? 0}`,
  ];
  renderChipRows(breakdownList, breakdownRows, "tag-chip is-metric");

  const phrases = data.key_phrases || [];
  const entities = data.named_entities || [];
  const intelRows = [
    `Meta description: ${data.meta_description || "Not available"}`,
    `Top key phrases: ${phrases.length ? phrases.join(", ") : "Not available"}`,
    `Named entities: ${entities.length ? entities.join(", ") : "Not available"}`,
  ];
  renderChipRows(intelList, intelRows, "tag-chip is-keyword is-block");

  renderEntityGroups(entityGroupList, data.entity_groups || {});
  renderSupportingSentences(supportingSentenceList, data.supporting_sentences || []);

  renderSignals(data.signals || []);
}

async function analyzeUrl() {
  const url = articleUrlInput.value.trim();

  if (!url) {
    setStatus("Paste a URL first.", true);
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";
  setStatus("Fetching article and checking deception signals...");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to analyze the URL.");
    }

    renderResult(normalizeApiResponse(data));
    setStatus("Analysis complete.");
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analyze";
  }
}

analyzeBtn.addEventListener("click", analyzeUrl);
articleUrlInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    analyzeUrl();
  }
});
