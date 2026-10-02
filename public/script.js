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
  tierScale: $("tierScale"),
  summary: $("resultSummary"),
  confidenceChip: $("confidenceChip"),
  confidenceNotes: $("confidenceNotes"),
  engineChip: $("engineChip"),
  sourceChip: $("sourceChip"),
  analyzedChip: $("analyzedChip"),
  headline: $("headlineText"),
  highlightLegend: $("highlightLegend"),
  contextLabels: $("contextLabels"),
  dimensions: $("dimensionList"),
  guidance: $("guidanceList"),
  strengths: $("strengthList"),
  signals: $("signalsList"),
  claims: $("claimList"),
  metrics: $("metricsList"),
  articleInfo: $("articleInfoList"),
  bodySnippet: $("bodySnippetText"),
  intel: $("intelList"),
  entityGroups: $("entityGroupList"),
  supporting: $("supportingSentenceList"),
  analyzeAnother: $("analyzeAnotherBtn"),
  copyReport: $("copyReportBtn"),
  copyLink: $("copyLinkBtn"),
  print: $("printBtn"),
  copyStatus: $("copyStatus"),
  toTop: $("toTopBtn"),
  scrollProgress: $("scrollProgress"),
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52;
let lastResult = null;

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

/* ---------- Scroll progress + back-to-top ---------- */
function onScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
  if (els.scrollProgress) els.scrollProgress.style.width = `${pct}%`;
  if (els.toTop) els.toTop.classList.toggle("hidden", window.scrollY < 600);
}
window.addEventListener("scroll", onScroll, { passive: true });
if (els.toTop) {
  els.toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    els.input.focus({ preventScroll: true });
  });
}

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
function listInto(node, items, emptyText, className) {
  clear(node);
  if (!items.length) {
    node.appendChild(el("li", "is-empty", emptyText));
    return;
  }
  items.forEach((t) => node.appendChild(el("li", className, t)));
}

/* ---------- UI state transitions ---------- */
function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("is-error", isError);
}
function setInputInvalid(invalid) {
  els.input.setAttribute("aria-invalid", String(invalid));
}
function showError(message) {
  els.errorText.textContent = message;
  els.errorBanner.classList.remove("hidden");
}
function hideError() {
  els.errorBanner.classList.add("hidden");
}

const LOADING_STEPS = [
  "Fetching the article…",
  "Extracting headline, body and byline…",
  "Running the six-point inspection…",
  "Checking sources and claims…",
  "Still working: trying fallback routes for a stubborn site…",
];
let loadingTimer = null;
function setLoading(on) {
  els.analyzeBtn.disabled = on;
  els.analyzeBtn.classList.toggle("is-loading", on);
  els.loadingCard.classList.toggle("hidden", !on);
  els.loadingCard.setAttribute("aria-hidden", "true");
  clearInterval(loadingTimer);
  if (on) {
    els.emptyState.classList.add("hidden");
    els.resultCard.classList.add("hidden");
    let step = 0;
    setStatus(LOADING_STEPS[0]);
    loadingTimer = setInterval(() => {
      step = Math.min(step + 1, LOADING_STEPS.length - 1);
      setStatus(LOADING_STEPS[step]);
    }, 2200);
  }
}

els.errorDismiss.addEventListener("click", hideError);
els.input.addEventListener("input", () => setInputInvalid(false));

/* ---------- Example chips ---------- */
document.querySelectorAll(".chip-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    els.input.value = btn.dataset.example || "";
    setInputInvalid(false);
    els.input.focus();
  });
});

els.analyzeAnother.addEventListener("click", () => {
  els.resultCard.classList.add("hidden");
  els.emptyState.classList.remove("hidden");
  history.replaceState(null, "", location.pathname);
  els.input.focus();
  els.input.select();
});

/* ---------- URL hygiene ---------- */
/** Validate and strip tracking params (utm_*, fbclid, gclid…) so equal stories share a cache entry. */
function cleanUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    try {
      u = new URL(`https://${raw}`); // tolerate a pasted bare domain
    } catch {
      return null;
    }
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname.includes(".")) return null;
  [...u.searchParams.keys()].forEach((k) => {
    if (/^(utm_|fbclid$|gclid$|mc_|igshid$|at_medium$|at_campaign$|ns_)/i.test(k)) {
      u.searchParams.delete(k);
    }
  });
  return u.toString();
}

/* ---------- Response normalization (tolerates both backends) ---------- */
const LEGACY_BUCKETS = { Clickbait: "risky", Sensationalist: "warning", Borderline: "warning" };

function normalizeApiResponse(data = {}) {
  const score = Number(data.composite_sensationalism_score ?? data.score ?? 0);
  const verdict =
    data.verdict ||
    (data.bucket === "risky"
      ? "Clickbait"
      : data.bucket === "warning"
        ? "Borderline"
        : "Likely Legit");
  const conf = data.analysis_confidence;

  return {
    ...data,
    verdict,
    bucket: data.bucket || LEGACY_BUCKETS[verdict] || "safe",
    tier: Number(
      data.tier ?? (score >= 80 ? 5 : score >= 60 ? 4 : score >= 40 ? 3 : score >= 20 ? 2 : 1)
    ),
    composite_sensationalism_score: score,
    legitimacy_confidence_score: Number(data.legitimacy_confidence_score ?? 100 - score),
    analysis_confidence: {
      score: Number(conf?.score ?? 100),
      notes: Array.isArray(conf?.notes) ? conf.notes : [],
    },
    headline: data.headline || data.title || "",
    headline_extracted: data.headline_extracted ?? Boolean(data.title),
    headline_highlights: Array.isArray(data.headline_highlights) ? data.headline_highlights : [],
    headline_model: data.headline_model || null,
    body_snippet: data.body_snippet || "",
    source_domain: data.source_domain || (data.url ? safeHostname(data.url) : "Unknown"),
    site_name: data.site_name || "",
    published_at: data.published_at || "Not available",
    authors: Array.isArray(data.authors) ? data.authors : [],
    extraction_method: data.extraction_method || "Heuristic parser",
    engine: data.engine || "unknown",
    headline_word_count: data.headline_word_count ?? 0,
    word_count: data.word_count ?? 0,
    estimated_read_time_minutes: data.estimated_read_time_minutes ?? 0,
    numeric_claim_count: data.numeric_claim_count ?? 0,
    dimensions: Array.isArray(data.dimensions) ? data.dimensions : [],
    strengths: Array.isArray(data.strengths) ? data.strengths : [],
    context_labels: Array.isArray(data.context_labels) ? data.context_labels : [],
    guidance: Array.isArray(data.guidance) ? data.guidance : [],
    claims_to_verify: Array.isArray(data.claims_to_verify) ? data.claims_to_verify : [],
    evidence_metrics: data.evidence_metrics || {},
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
    partial: Boolean(data.partial),
    analyzed_at: data.analyzed_at || new Date().toISOString(),
  };
}

/* Human labels for how the article was acquired (Node tiered fetcher). */
const VIA_LABELS = {
  http: "Direct fetch",
  amp: "AMP version",
  feed: "RSS feed",
  headless: "Headless browser",
  wayback: "Web archive",
  "url-only": "Link only (site blocked our reader)",
  "direct fetch": "Direct fetch",
};
function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Unknown";
  }
}
function formatDate(value) {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return value || "Not available";
  return new Date(t).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
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
function fillBar(fill, pct) {
  if (prefersReducedMotion) fill.style.width = pct + "%";
  else requestAnimationFrame(() => (fill.style.width = pct + "%"));
}

/* ---------- Rendering ---------- */

/** Render the headline as text nodes, wrapping flagged phrases in <mark>. */
function renderHeadline(text, highlights) {
  clear(els.headline);
  const phrases = highlights
    .map((h) => h.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  const marks = []; // [start, end) ranges, longest phrases claim first
  phrases.forEach((p) => {
    const needle = p.toLowerCase();
    let from = 0;
    for (;;) {
      const i = lower.indexOf(needle, from);
      if (i < 0) break;
      const end = i + needle.length;
      const wordEdge = (k) => k <= 0 || k >= text.length || !/[a-z0-9]/i.test(text[k]);
      if (wordEdge(i - 1) && wordEdge(end) && !marks.some(([a, b]) => i < b && end > a)) {
        marks.push([i, end]);
      }
      from = end;
    }
  });
  marks.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  marks.forEach(([a, b]) => {
    if (a > pos) els.headline.appendChild(document.createTextNode(text.slice(pos, a)));
    els.headline.appendChild(el("mark", null, text.slice(a, b)));
    pos = b;
  });
  if (pos < text.length) els.headline.appendChild(document.createTextNode(text.slice(pos)));
  els.highlightLegend.classList.toggle("hidden", marks.length === 0);
}

function renderTierScale(tier) {
  els.tierScale.querySelectorAll("li").forEach((li) => {
    const t = Number(li.dataset.tier);
    li.classList.toggle("is-active", t === tier);
    if (t === tier) li.setAttribute("aria-current", "true");
    else li.removeAttribute("aria-current");
  });
}

function renderContextLabels(labels) {
  clear(els.contextLabels);
  labels.forEach((l) => {
    const chip = el("span", "context-chip", l.label);
    chip.title = l.detail || "";
    els.contextLabels.appendChild(chip);
    if (l.detail) els.contextLabels.appendChild(el("span", "context-detail", l.detail));
  });
}

function levelClass(score) {
  return score >= 60 ? "lvl-high" : score >= 30 ? "lvl-mid" : "lvl-low";
}

/** Six dimensions as expandable rows; falls back to the legacy 4-bar breakdown. */
function renderDimensions(d) {
  clear(els.dimensions);
  const rows = d.dimensions.length
    ? d.dimensions
    : [
        ["Headline–body gap", d.score_breakdown.semantic_gap_points],
        ["Sentiment", d.score_breakdown.sentiment_points],
        ["Hook phrases", d.score_breakdown.hook_points],
        ["Combined boost", d.score_breakdown.synergy_points],
      ].map(([label, score]) => ({ label, score: Number(score) || 0, signals: [] }));

  rows.forEach((dim) => {
    const score = Math.round(Number(dim.score) || 0);
    const assessed = dim.assessed !== false;
    const item = el("details", `dimension ${assessed ? levelClass(score) : "lvl-na"}`);
    const summary = el("summary", "dimension-head");
    summary.appendChild(el("span", "dimension-label", dim.label));
    summary.appendChild(el("span", "dimension-score", assessed ? String(score) : "N/A"));
    const track = el("span", "bar-track");
    const fill = el("span", "bar-fill");
    track.appendChild(fill);
    summary.appendChild(track);
    item.appendChild(summary);

    const signals = Array.isArray(dim.signals) ? dim.signals : [];
    const list = el("ul", "dimension-signals");
    if (signals.length) {
      signals.forEach((s) => {
        const li = el("li");
        li.appendChild(el("span", "sig-text", typeof s === "string" ? s : s.text));
        if (s.points) li.appendChild(el("span", "sig-points", `+${s.points}`));
        list.appendChild(li);
      });
    } else {
      list.appendChild(
        el(
          "li",
          "is-empty",
          assessed
            ? "Nothing flagged on this check."
            : "Not checked: the article text couldn't be read."
        )
      );
    }
    item.appendChild(list);
    if (score >= 30 && signals.length) item.open = true;
    els.dimensions.appendChild(item);
    fillBar(fill, assessed ? Math.max(2, score) : 0);
  });
}

function renderSignals(signals) {
  listInto(els.signals, signals, "No major warning signals detected.");
}

function renderMetrics(d) {
  clear(els.metrics);
  const m = d.evidence_metrics;
  defRow(
    els.metrics,
    "Headline–body fit",
    d.word_count ? `${Math.round(d.cosine_similarity_score * 100)}%` : "Not measured"
  );
  if (d.headline_model) {
    defRow(
      els.metrics,
      "Clickbait-style headline",
      `${Math.round(d.headline_model.probability * 100)}%`
    );
  }
  defRow(els.metrics, "Headline sentiment", d.sentiment_polarity.toFixed(2));
  if (m.attributions !== undefined)
    defRow(els.metrics, "Attributed statements", String(m.attributions));
  if (m.quotes !== undefined) defRow(els.metrics, "Direct quotes", String(m.quotes));
  if (m.anonymous !== undefined) defRow(els.metrics, "Anonymous sourcing", String(m.anonymous));
  if (m.evidence !== undefined) defRow(els.metrics, "Data / study references", String(m.evidence));
  if (!d.dimensions.length) {
    defRow(els.metrics, "Semantic gap", d.semantic_gap ? "Yes" : "No");
    defRow(els.metrics, "Sensational tone", d.sensational_tone ? "Yes" : "No");
  }
}

function renderArticleInfo(d) {
  clear(els.articleInfo);
  defRow(els.articleInfo, "Publisher", d.site_name || d.source_domain || "Unknown");
  defRow(els.articleInfo, "Published", formatDate(d.published_at));
  defRow(els.articleInfo, "Authors", d.authors.length ? d.authors.join(", ") : "Unknown");
  defRow(els.articleInfo, "Fetched via", VIA_LABELS[d.fetch_via] || d.fetch_via);
  defRow(els.articleInfo, "Extraction", d.extraction_method || "Unknown");
  defRow(els.articleInfo, "Article words", String(d.word_count));
  defRow(
    els.articleInfo,
    "Read time",
    d.estimated_read_time_minutes ? `${d.estimated_read_time_minutes} min` : "—"
  );
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

function renderSentences(node, sentences, emptyText) {
  clear(node);
  if (!sentences.length) {
    node.appendChild(el("p", "muted", emptyText));
    return;
  }
  sentences.forEach((s) => node.appendChild(el("div", "sentence-card", s)));
}

function renderResult(raw) {
  const d = normalizeApiResponse(raw);
  lastResult = d;

  els.resultCard.classList.remove("hidden", "safe", "warning", "risky", "reveal");
  els.resultCard.classList.add(d.bucket);
  // Force reflow so the reveal animation replays on each analysis.
  void els.resultCard.offsetWidth;
  els.resultCard.classList.add("reveal");

  animateGauge(d.composite_sensationalism_score);
  els.verdictBadge.textContent = d.verdict;
  renderTierScale(d.tier);
  els.summary.textContent = d.summary;
  els.confidenceChip.textContent = `Analysis confidence: ${d.analysis_confidence.score}%`;
  clear(els.confidenceNotes);
  d.analysis_confidence.notes.forEach((n) => els.confidenceNotes.appendChild(el("li", null, n)));
  els.engineChip.textContent = `Engine: ${d.engine}`;
  els.sourceChip.textContent = `Source: ${d.source_domain}`;
  els.analyzedChip.textContent = `Analyzed: ${formatDate(d.analyzed_at)}`;

  const headline = d.headline || "Could not extract a clean headline.";
  renderHeadline(`${d.headline_extracted ? "" : "(inferred) "}${headline}`, d.headline_highlights);
  renderContextLabels(d.context_labels);
  els.bodySnippet.textContent = d.body_snippet || "Body text was unavailable.";

  renderDimensions(d);
  listInto(
    els.guidance,
    d.guidance,
    "Nothing stands out. Still, check the date and the outlet before sharing."
  );
  listInto(els.strengths, d.strengths, "Nothing notable.");
  renderSignals(d.signals);
  renderSentences(els.claims, d.claims_to_verify, "No specific figures or claims stood out.");
  renderMetrics(d);
  renderArticleInfo(d);
  renderIntel(d);
  renderEntityGroups(d.entity_groups);
  renderSentences(
    els.supporting,
    d.supporting_sentences,
    "No sentence in the body clearly matches the headline."
  );

  els.copyStatus.textContent = "";
  els.emptyState.classList.add("hidden");
  els.resultCard.focus({ preventScroll: false });
}

/* ---------- Copy / share / print ---------- */
function reportText(d) {
  const lines = [
    `BaitBlock verdict: ${d.verdict} (${d.composite_sensationalism_score}/100 risk)`,
    `Headline: ${d.headline}`,
    `Source: ${d.url || d.source_domain}`,
    "",
    d.summary,
  ];
  if (d.dimensions.length) {
    lines.push("", "Inspection:");
    d.dimensions.forEach((x) => lines.push(`  ${x.label}: ${x.score}/100`));
  }
  if (d.signals.length) lines.push("", "Signals:", ...d.signals.slice(0, 6).map((s) => `  - ${s}`));
  if (d.guidance.length) lines.push("", "Before you share:", ...d.guidance.map((g) => `  - ${g}`));
  lines.push("", `Analysis confidence: ${d.analysis_confidence.score}%`);
  return lines.join("\n");
}

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    els.copyStatus.textContent = okMessage;
  } catch {
    els.copyStatus.textContent = "Couldn't access the clipboard. Select and copy manually.";
  }
}
els.copyReport.addEventListener("click", () => {
  if (lastResult) copyText(reportText(lastResult), "Report copied to clipboard.");
});
els.copyLink.addEventListener("click", () => {
  copyText(location.href, "Shareable link copied. It re-runs this check when opened.");
});
els.print.addEventListener("click", () => window.print());
// Closed <details> stay hidden in print whatever the CSS says, so expand them.
window.addEventListener("beforeprint", () => {
  els.dimensions.querySelectorAll("details").forEach((d) => (d.open = true));
});

/* ---------- Submit flow ---------- */
async function analyze() {
  hideError();
  const raw = els.input.value.trim();

  if (!raw) {
    setInputInvalid(true);
    setStatus("Paste a URL first.", true);
    els.input.focus();
    return;
  }
  const url = cleanUrl(raw);
  if (!url) {
    setInputInvalid(true);
    setStatus(
      "That doesn't look like a web address (it should start with http:// or https://).",
      true
    );
    els.input.focus();
    return;
  }
  els.input.value = url;
  setInputInvalid(false);
  setLoading(true);

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
    history.replaceState(null, "", `?url=${encodeURIComponent(url)}`);
    renderResult(data);
    setStatus("Analysis complete. The verdict is below.");
  } catch (error) {
    setLoading(false);
    els.emptyState.classList.remove("hidden");
    setStatus("Something went wrong.", true);
    showError(error.message || "Could not analyze that URL. Please try another link.");
  }
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  analyze();
});

/* ---------- Deep link: /?url=… pre-fills and runs ---------- */
(function runFromQuery() {
  const shared = new URLSearchParams(location.search).get("url");
  if (shared) {
    els.input.value = shared;
    analyze();
  }
})();
