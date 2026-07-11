# Components

There is no component framework (React/Vue/etc.) — "components" here means the discrete functional units within the single HTML page and the two server files.

## Frontend (`public/`)

| Unit | File | Responsibility |
|---|---|---|
| Hero card | `index.html` `.hero-card` | Static branding/tagline |
| Input card | `index.html` `.input-card` + `script.js` listeners | URL input, Analyze button, status line |
| Result card | `index.html` `#resultCard` | Hidden until first analysis; toggles `safe`/`warning`/`risky` classes |
| `normalizeApiResponse()` | `script.js` | Defensive shape-normalization layer that lets one frontend tolerate either backend's response (see [[Architecture]]) |
| `renderResult()` | `script.js` | Single large render function — pure DOM writes, no virtual DOM, no diffing |
| `renderChipRows()` / `addChip()` | `script.js` | Small reusable helpers for building "chip" UI (tag-cloud style pills) |
| `renderEntityGroups()` | `script.js` | Renders `entity_groups` map into labeled card groups |
| `renderSupportingSentences()` | `script.js` | Renders `supporting_sentences` array into sentence cards |

There is no componentization beyond function boundaries — everything targets fixed DOM ids grabbed once at the top of `script.js`. This is appropriate for a single static page but would not scale to multiple pages/views without introducing some templating.

## Backend (Node, `src/server.js`)

Grouped by responsibility (all in one file, function-level modularity only):

- **HTTP layer** — `app.post("/api/analyze", ...)`, `app.get("*", ...)`, `app.listen(...)`.
- **HTML/metadata extraction** — `parseJsonLdNodes`, `extractTitle`, `extractBodyText` (+ `pruneNoisyDom`, `extractBodyFromJsonLd`, `isReadableParagraph`, `isNoisyTextCandidate`, `sanitizeTextBlock`), `extractMetaDescription`, `extractPublishedAt`, `extractAuthors`.
- **NLP-lite utilities** — `getTokens`, `computeLexicalSimilarity`, `computeSentimentPolarity`, `extractKeyPhrases`, `extractNamedEntities`, `groupEntities`, `extractSupportingSentences`.
- **Scoring** — `computeScore`, `buildSummary`, plus module-level constant tables `BAIT_PATTERNS`, `DECEPTION_HINTS`, `STOP_WORDS`, `POSITIVE_WORDS`, `NEGATIVE_WORDS`.
- **Small generic helpers** — `normalizeWhitespace`, `clamp`, `toSentenceCase` (unused — see [[Known-Issues]]).

## Backend (Python, `app.py`)

Same grouping, mirrored:

- **Scraping** — `scrape_with_newspaper`, `scrape_with_bs4`, `scrape_article` (tries newspaper3k first, falls back to bs4).
- **NLP model accessors** — `get_nlp()`, `get_sbert_model()`, `get_sentiment_model()`, each `@lru_cache(maxsize=1)` so models load once per process.
- **Analysis utilities** — `preprocess_text`, `local_embedding` (hashed fallback embedding), `semantic_similarity`, `headline_sentiment`, `lexical_hook_score`, `key_phrases_from_body`, `entity_highlights`, `grouped_entities`, `supporting_sentences`.
- **Scoring** — `compute_composite`, `build_summary`.
- **Orchestration** — `analyze_article` (the Python equivalent of the whole Node request handler, but callable independently of Flask — better separated than the Node version).
- **HTTP layer** — `analyze_route`, `index`, `static_files`.

## Reusable vs One-Off

Both backends' extraction/scoring functions are pure and reusable in principle, but neither is exported as a module/package — everything lives in the single entry-point file, so nothing here is importable elsewhere without copy-pasting. See [[Coding-Conventions]] and [[Improvement-Ideas]].
