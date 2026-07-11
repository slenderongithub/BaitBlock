"use strict";

/* ============================================================
   BaitBlock frontend logic.
   All remote-derived text is written via textContent / createElement
   (never innerHTML) so a malicious page's content cannot inject markup.
   ============================================================ */

const $ = (id) => document.getElementById(id);

const els = {
  form: $("analyzeForm"),
  input: $("articleUrl"),
  analyzeBtn: $("analyzeBtn"),
  status: $("statusText"),
  themeToggle: $("themeToggle"),
  errorBanner: $("errorBanner"),
  errorText: $("errorText"),
  errorDismiss: $("errorDismiss"),
  loadingCard: $("loadingCard"),
  emptyState: $("emptyState"),
  resultCard: $("resultCard"),
  gaugeFill: $("gaugeFill"),
  gaugeScore: $("gaugeScore"),
  verdictBadge: $("verdictBadge"),
  summary: $("resultSummary"),
  confidenceChip: $("confidenceChip"),
  engineChip: $("engineChip"),
  sourceChip: $("sourceChip"),
  headline: $("headlineText"),
  breakdownBars: $("breakdownBars"),
  signals: $("signalsList"),
  metrics: $("metricsList"),
  articleInfo: $("articleInfoList"),
  bodySnippet: $("bodySnippetText"),
  intel: $("intelList"),
  entityGroups: $("entityGroupList"),
  supporting: $("supportingSentenceList"),
  analyzeAnother: $("analyzeAnotherBtn"),
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52;

/* ---------- Theme ---------- */
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
function syncThemeToggle() {
  els.themeToggle.setAttribute("aria-pressed", String(currentTheme() === "dark"));
}
els.themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("baitblock-theme", next);
  } catch {
    /* ignore storage errors */
  }
  syncThemeToggle();
});
syncThemeToggle();

/* ---------- Masthead dateline ---------- */
(function stampMastheadDate() {
  const node = document.getElementById("mastheadDate");
  if (!node) return;
  try {
    node.textContent = new Date()
      .toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
      .toUpperCase();
  } catch {
    /* keep placeholder on failure */
  }
})();

/* ---------- Small DOM helpers ---------- */
function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function defRow(dl, term, value) {
  const wrap = el("div");
  wrap.appendChild(el("dt", null, term));
  wrap.appendChild(el("dd", null, value));
  dl.appendChild(wrap);
}
function tagList(container, values) {
  const list = el("div", "tag-list");
  values.forEach((v) => list.appendChild(el("span", "tag", v)));
  container.appendChild(list);
}

/* ---------- UI state transitions ---------- */
function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("is-error", isError);
}
function showError(message) {
  els.errorText.textContent = message;
  els.errorBanner.classList.remove("hidden");
}
function hideError() {
  els.errorBanner.classList.add("hidden");
}
function setLoading(on) {
  els.analyzeBtn.disabled = on;
  els.analyzeBtn.classList.toggle("is-loading", on);
  els.loadingCard.classList.toggle("hidden", !on);
  els.loadingCard.setAttribute("aria-hidden", "true");
  if (on) {
    els.emptyState.classList.add("hidden");
    els.resultCard.classList.add("hidden");
  }
}

els.errorDismiss.addEventListener("click", hideError);

/* ---------- Example chips ---------- */
document.querySelectorAll(".chip-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    els.input.value = btn.dataset.example || "";
    els.input.focus();
  });
});

els.analyzeAnother.addEventListener("click", () => {
  els.resultCard.classList.add("hidden");
  els.emptyState.classList.remove("hidden");
  els.input.focus();
  els.input.select();
});

/* ---------- Response normalization (tolerates both backends) ---------- */
function normalizeApiResponse(data = {}) {
  const score = Number(data.composite_sensationalism_score ?? data.score ?? 0);
  const confidence = Number(data.legitimacy_confidence_score ?? 100 - score);
  const verdict =
    data.verdict ||
    (data.bucket === "risky"
      ? "Clickbait"
      : data.bucket === "warning"
        ? "Borderline"
        : "Likely Legit");

  return {
    ...data,
    verdict,
    composite_sensationalism_score: score,
    legitimacy_confidence_score: confidence,
    headline: data.headline || data.title || "",
    headline_extracted: data.headline_extracted ?? Boolean(data.title),
    body_snippet: data.body_snippet || "",
    source_domain: data.source_domain || (data.url ? safeHostname(data.url) : "Unknown"),
    published_at: data.published_at || "Not available",
    authors: Array.isArray(data.authors) ? data.authors : [],
    extraction_method: data.extraction_method || "Heuristic parser",
    engine: data.engine || "unknown",
    headline_word_count: data.headline_word_count ?? 0,
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
    meta_description: data.meta_description || "Not available",
    fetch_via: data.fetch_via || "direct fetch",
  };
}

/* Human labels for how the article was acquired (Node tiered fetcher). */
const VIA_LABELS = {
  http: "Direct fetch",
  amp: "AMP version",
  feed: "RSS feed",
  headless: "Headless browser",
  wayback: "Web archive",
  "direct fetch": "Direct fetch",
};
function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Unknown";
  }
}

/* ---------- Animations ---------- */
function animateGauge(score) {
  const offset = GAUGE_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, score)) / 100);
  els.gaugeFill.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
  if (prefersReducedMotion) {
    els.gaugeFill.style.strokeDashoffset = String(offset);
    els.gaugeScore.textContent = String(score);
    return;
  }
  els.gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);
  requestAnimationFrame(() => {
    els.gaugeFill.style.strokeDashoffset = String(offset);
  });
  countUp(els.gaugeScore, score, 850);
}
function countUp(node, target, duration) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = String(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------- Rendering ---------- */
function bucketFor(verdict) {
  if (verdict === "Clickbait") return "risky";
  if (verdict === "Sensationalist" || verdict === "Borderline") return "warning";
  return "safe";
}

function renderBreakdown(breakdown) {
  clear(els.breakdownBars);
  const rows = [
    ["Semantic gap", breakdown.semantic_gap_points ?? 0],
    ["Sentiment", breakdown.sentiment_points ?? 0],
    ["Hook phrases", breakdown.hook_points ?? 0],
    ["Combined boost", breakdown.synergy_points ?? 0],
  ];
  const max = Math.max(1, ...rows.map(([, v]) => Number(v) || 0));
  rows.forEach(([label, value]) => {
    const row = el("div", "bar-row");
    const head = el("div", "bar-head");
    head.appendChild(el("span", null, label));
    head.appendChild(el("span", "bar-val", String(value)));
    row.appendChild(head);
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    track.appendChild(fill);
    row.appendChild(track);
    els.breakdownBars.appendChild(row);
    const pct = (Number(value) / max) * 100;
    if (prefersReducedMotion) {
      fill.style.width = pct + "%";
    } else {
      requestAnimationFrame(() => (fill.style.width = pct + "%"));
    }
  });
}

function renderSignals(signals) {
  clear(els.signals);
  if (!signals.length) {
    els.signals.appendChild(el("li", "is-empty", "No major clickbait signals detected."));
    return;
  }
  signals.forEach((s) => els.signals.appendChild(el("li", null, s)));
}

function renderMetrics(d) {
  clear(els.metrics);
  defRow(els.metrics, "Cosine similarity", d.cosine_similarity_score.toFixed(3));
  defRow(els.metrics, "Sentiment polarity", d.sentiment_polarity.toFixed(3));
  defRow(els.metrics, "Semantic gap", d.semantic_gap ? "Yes" : "No");
  defRow(els.metrics, "Sensational tone", d.sensational_tone ? "Yes" : "No");
  defRow(els.metrics, "Gap threshold", "< 0.350");
}

function renderArticleInfo(d) {
  clear(els.articleInfo);
  defRow(els.articleInfo, "Source", d.source_domain || "Unknown");
  defRow(els.articleInfo, "Published", d.published_at || "Not available");
  defRow(els.articleInfo, "Authors", d.authors.length ? d.authors.join(", ") : "Unknown");
  defRow(els.articleInfo, "Fetched via", VIA_LABELS[d.fetch_via] || d.fetch_via);
  defRow(els.articleInfo, "Extraction", d.extraction_method || "Unknown");
  defRow(els.articleInfo, "Headline words", String(d.headline_word_count));
  defRow(els.articleInfo, "Article words", String(d.word_count));
  defRow(els.articleInfo, "Read time", `${d.estimated_read_time_minutes} min`);
  defRow(els.articleInfo, "Numeric claims", String(d.numeric_claim_count));
}

function renderIntel(d) {
  clear(els.intel);

  const metaRow = el("div", "intel-row");
  metaRow.appendChild(el("span", "intel-label", "Meta description"));
  metaRow.appendChild(el("p", "intel-text", d.meta_description || "Not available"));
  els.intel.appendChild(metaRow);

  const phraseRow = el("div", "intel-row");
  phraseRow.appendChild(el("span", "intel-label", "Top key phrases"));
  if (d.key_phrases.length) tagList(phraseRow, d.key_phrases);
  else phraseRow.appendChild(el("p", "intel-text muted", "Not available"));
  els.intel.appendChild(phraseRow);

  const entRow = el("div", "intel-row");
  entRow.appendChild(el("span", "intel-label", "Named entities"));
  if (d.named_entities.length) tagList(entRow, d.named_entities);
  else entRow.appendChild(el("p", "intel-text muted", "Not available"));
  els.intel.appendChild(entRow);
}

function renderEntityGroups(groups) {
  clear(els.entityGroups);
  const entries = Object.entries(groups || {});
  if (!entries.length) {
    els.entityGroups.appendChild(el("p", "muted", "No named entities were extracted."));
    return;
  }
  entries.forEach(([label, values]) => {
    const card = el("div", "group-card");
    card.appendChild(el("span", "group-title", label));
    tagList(card, Array.isArray(values) ? values : []);
    els.entityGroups.appendChild(card);
  });
}

function renderSupporting(sentences) {
  clear(els.supporting);
  if (!sentences.length) {
    els.supporting.appendChild(el("p", "muted", "No supporting sentences could be extracted."));
    return;
  }
  sentences.forEach((s) => els.supporting.appendChild(el("div", "sentence-card", s)));
}

function renderResult(raw) {
  const d = normalizeApiResponse(raw);
  const bucket = bucketFor(d.verdict);

  els.resultCard.classList.remove("hidden", "safe", "warning", "risky", "reveal");
  els.resultCard.classList.add(bucket);
  // Force reflow so the reveal animation replays on each analysis.
  void els.resultCard.offsetWidth;
  els.resultCard.classList.add("reveal");

  animateGauge(d.composite_sensationalism_score);
  els.verdictBadge.textContent = d.verdict;
  els.summary.textContent = d.summary;
  els.confidenceChip.textContent = `Confidence: ${d.legitimacy_confidence_score}%`;
  els.engineChip.textContent = `Engine: ${d.engine}`;
  els.sourceChip.textContent = `Source: ${d.source_domain}`;

  const prefix = d.headline_extracted ? "" : "(inferred) ";
  els.headline.textContent = `${prefix}${d.headline || "Could not extract a clean headline."}`;
  els.bodySnippet.textContent = d.body_snippet || "Body text was unavailable.";

  renderBreakdown(d.score_breakdown);
  renderSignals(d.signals);
  renderMetrics(d);
  renderArticleInfo(d);
  renderIntel(d);
  renderEntityGroups(d.entity_groups);
  renderSupporting(d.supporting_sentences);

  els.emptyState.classList.add("hidden");
  els.resultCard.focus({ preventScroll: false });
}

/* ---------- Submit flow ---------- */
async function analyze() {
  const url = els.input.value.trim();
  hideError();

  if (!url) {
    setStatus("Paste a URL first.", true);
    els.input.focus();
    return;
  }

  setLoading(true);
  setStatus("Fetching article and checking deception signals…");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Analysis failed (HTTP ${response.status}).`);
    }

    setLoading(false);
    renderResult(data);
    setStatus("Analysis complete.");
  } catch (error) {
    setLoading(false);
    els.emptyState.classList.add("hidden");
    setStatus("Something went wrong.", true);
    showError(error.message || "Could not analyze that URL. Please try another link.");
  }
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  analyze();
});
