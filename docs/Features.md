# Features

## Implemented (Node/live backend, `src/server.js`)

- **URL validation** — must parse as a well-formed `http(s)://` URL before any fetch happens.
- **Server-side article fetch** with a spoofed `User-Agent` and `redirect: "follow"`.
- **Title extraction** — priority order: `og:title` → `twitter:title` → first `<h1>` → `<title>`.
- **Body extraction** — priority order: JSON-LD `articleBody` → a ranked list of CSS selectors (`article p`, `main p`, `.post-content p`, …) → generic readable-paragraph fallback → whole-`<body>` fallback. Noisy DOM (`nav`, `footer`, ads, cookie banners, analytics) is pruned first (`pruneNoisyDom`), and candidate paragraphs are filtered by a heuristic "readability" check (`isReadableParagraph`/`isNoisyTextCandidate`).
- **Metadata extraction** — meta description, published date (meta tags → JSON-LD → "Not available"), authors (meta tags + JSON-LD, deduped, capped at 5).
- **Clickbait scoring** — composite 0-100 score built from:
  - Regex "bait pattern" and "deception hint" matches in the headline (`BAIT_PATTERNS`, `DECEPTION_HINTS`)
  - Punctuation abuse (`!`, `?`) and excessive uppercase ratio
  - Abnormal headline length (too short or too long)
  - **Semantic gap** — lexical token-overlap ratio between headline and body < 0.35
  - **Sensational tone** — simple positive/negative word-count sentiment polarity with |value| > 0.5
  - Teaser words in the headline not echoed anywhere in the body
  - A synergy bonus when hook language *and* a semantic gap co-occur
- **Verdict buckets** — Clickbait (≥70), Borderline (≥40), Likely Legit (<40), each with a plain-language summary sentence.
- **Explainability** — up to 6 human-readable `signals` strings plus a `score_breakdown` object (semantic gap / sentiment / hook / synergy points) returned to the client.
- **Auxiliary NLP-ish extras** — top 8 key phrases (frequency count over headline+body), up to 12 "named entities" (capitalized-word regex, not real NER), grouped under a single "Proper Nouns" bucket, up to 4 supporting sentences (keyword-scored).
- **Result dashboard UI** — verdict banner, score/confidence pills, NLP metrics panel, score breakdown panel, top signals, body snippet, key phrases/entities, entity groups, supporting sentences. Color-coded safe/warning/risky theme. Responsive down to mobile widths.
- **Graceful error states** — invalid URL, fetch failure (non-2xx), and unexpected exceptions each produce a distinct user-facing message.

## Implemented but Disconnected (Python backend, `app.py`)

All of the above, but with real components instead of regex heuristics:
- Two-tier scraping: `newspaper3k` first, BeautifulSoup4 fallback.
- Real sentence embeddings (SBERT `all-MiniLM-L6-v2`) with cosine similarity for the semantic-gap signal, with a deterministic hashed-embedding fallback if the model can't load.
- Real sentiment analysis via NLTK VADER, with TextBlob fallback.
- Real named-entity recognition and grouping via spaCy (`ORG`, `PERSON`, `GPE`, `DATE`, `PRODUCT`, `MONEY`, `EVENT`, `NORP`).
- Sentence-level supporting-sentence ranking using lemmatized term overlap with the headline.

This is a materially more sophisticated engine than the shipped Node one, but it is not reachable from the actual UI in its current state — see [[Known-Issues]].

## Missing / Not Implemented

- Any form of user account, history, saved results, or multi-URL/batch analysis.
- Caching of previously analyzed URLs (every request re-fetches and re-computes from scratch).
- Authentication or rate limiting on `POST /api/analyze` (open to abuse — see [[Known-Issues]] SSRF note).
- Automated tests of any kind (unit, integration, e2e).
- CI/CD pipeline.
- Non-HTML content handling (PDF, AMP-only pages, JS-rendered SPAs are not handled — no headless browser).
- Real evaluation harness that runs the live scorer against a labeled dataset (the current charts are from static sample CSVs, not measured results).
- Config to choose which backend (Node vs Python) serves a given deployment, or a shared/single implementation.
