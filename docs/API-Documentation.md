# API Documentation

Single endpoint, implemented independently (but with a compatible contract) in both backends.

## `POST /api/analyze`

### Request

```json
{ "url": "https://example.com/news-story" }
```

- `url` (string, required) — must be a well-formed `http://` or `https://` URL.

### Success Response — `200 OK`

Node backend (`src/server.js`) response shape:

```json
{
  "url": "https://example.com/news-story",
  "title": "...",
  "headline": "...",
  "headline_extracted": true,
  "score": 62,
  "bucket": "warning",
  "isLikelyClickbait": true,
  "verdict": "Borderline",
  "composite_sensationalism_score": 62,
  "legitimacy_confidence_score": 38,
  "summary": "This article has some clickbait characteristics...",
  "signals": ["..."],
  "body_snippet": "...",
  "source_domain": "example.com",
  "published_at": "2026-01-01T00:00:00Z",
  "authors": ["..."],
  "extraction_method": "Paragraph extraction (article p)",
  "headline_word_count": 9,
  "word_count": 512,
  "estimated_read_time_minutes": 2,
  "numeric_claim_count": 3,
  "score_breakdown": {
    "semantic_gap_points": 18,
    "sentiment_points": 0,
    "hook_points": 30,
    "synergy_points": 6
  },
  "key_phrases": ["..."],
  "named_entities": ["..."],
  "entity_groups": { "Proper Nouns": ["..."] },
  "supporting_sentences": ["..."],
  "cosine_similarity_score": 0.28,
  "sentiment_polarity": 0.1,
  "semantic_gap": true,
  "sensational_tone": false,
  "meta_description": "..."
}
```

Python backend (`app.py`) — same field names for the fields the frontend actually reads (`verdict`, `composite_sensationalism_score`, `legitimacy_confidence_score`, `score_breakdown`, `entity_groups` grouped by real spaCy labels like `ORG`/`PERSON` instead of one `Proper Nouns` bucket, `supporting_sentences`, etc.), but does **not** include `bucket` or `isLikelyClickbait` — the frontend's `normalizeApiResponse()` derives verdict from `bucket` only when `verdict` is absent, so this is handled gracefully.

### Error Responses

| Status | Condition | Body |
|---|---|---|
| 400 | Missing/non-string `url` | `{ "error": "Please provide a valid URL." }` |
| 400 | URL fails `new URL()` or protocol isn't http/https | `{ "error": "URL format is invalid." }` |
| 400 | Upstream fetch returned non-2xx | `{ "error": "Failed to fetch article: HTTP <status>" }` |
| 500 | Any other exception during fetch/parse/score | `{ "error": "Could not analyze this URL right now. The site may block automated fetches.", "detail": "<message>" }` |

Python backend error shapes are similar but distinct: `{"error": "Please provide a valid URL."}` (400), `ValueError` message passthrough (400, e.g. "Could not extract enough article body text."), or `{"error": "Analysis failed.", "detail": "..."}` (500).

### Static Routes

- `GET /` and any unmatched `GET *` → `index.html` (Node backend serves from `public/`; Python backend serves from repo root, which is broken — see [[Known-Issues]]).
- All other static assets (`script.js`, `styles.css`, fonts via CDN) served automatically by `express.static`.

## No Other Endpoints

No auth endpoints, no health check, no versioning (`/api/v1/...`), no OpenAPI/Swagger spec. See [[Known-Issues]] for the SSRF and rate-limiting gaps on this single endpoint.
