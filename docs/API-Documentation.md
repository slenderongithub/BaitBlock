# API Documentation

Single endpoint, implemented independently (with the same contract) in both backends.

## `POST /api/analyze`

### Request

```http
POST /api/analyze
Content-Type: application/json

{ "url": "https://example.com/news-story" }
```

- `url` (string, required): an `http://` or `https://` URL, at most 2,048 characters.
- The body must be JSON (`Content-Type: application/json`) and at most 4 KB.
- Same-origin only: a request with a foreign `Origin` header or `Sec-Fetch-Site: cross-site` is refused.

### Success Response — `200 OK`

```jsonc
{
  "url": "https://example.com/news-story",
  "headline": "Coffee cures cancer, scientists prove",
  "headline_extracted": true,

  // ---- verdict ----
  "score": 77, // 0-100 overall risk
  "tier": 4, // 1..5
  "risk_level": "high", // minimal | low | moderate | high | severe
  "bucket": "risky", // safe | warning | risky (UI colour)
  "verdict": "Misleading Headline", // see README "How The Verdict Is Made"
  "primary_concern": "Misleading Headline", // null when nothing scores >= 25
  "summary": "High risk of misleading or manipulative framing. Biggest issue: …",

  // ---- the six dimensions, each with its evidence ----
  "dimensions": [
    {
      "key": "consistency", // bait | sensational | consistency | sourcing | transparency | manipulation
      "label": "Headline vs. body",
      "weight": 1.0,
      "score": 63,
      "assessed": true, // false = not checked (e.g. url-only read); the UI shows N/A
      "signals": [
        { "text": "Headline states it as certain (\"cures\") while the article hedges 11 times …", "points": 45 }
      ]
    }
  ],
  "signals": ["…"], // all dimension signals, most important first (max 8)
  "strengths": ["3 attributed statements.", "Byline and publication date are present."],
  "context_labels": [{ "label": "Opinion", "detail": "Opinion piece: arguments, not straight news." }],
  "guidance": ["The article doesn't clearly back up its own headline. …"],

  // ---- headline ----
  "headline_highlights": ["cures"], // phrases the UI marks in the headline
  "headline_model": { "probability": 0.231, "terms": [] },

  // ---- reliability of the analysis itself ----
  "analysis_confidence": { "score": 85, "notes": ["Short article text limits the sourcing analysis."] },
  "evidence_metrics": { "attributions": 3, "quotes": 0, "anonymous": 0, "rumor": 0, "evidence": 4, "loaded_density": 0 },

  // ---- article facts ----
  "source_domain": "example.com",
  "site_name": "Example Gazette",
  "article_type": "NewsArticle",
  "published_at": "2026-09-01T09:00:00Z", // or "Not available"
  "authors": ["Jane Doe"],
  "extraction_method": "Paragraph extraction (article p)",
  "fetch_via": "http", // http | amp | feed | headless | wayback | url-only (Node)
  "partial": false, // true when only part of the page (or only the link) could be read
  "word_count": 99,
  "headline_word_count": 5,
  "estimated_read_time_minutes": 1,
  "numeric_claim_count": 0,
  "body_snippet": "…",
  "meta_description": "…",
  "key_phrases": ["lower risk", "coffee"],
  "entity_groups": { "People": ["…"], "Places": ["…"], "Organizations": ["…"] },
  "named_entities": ["…"],
  "supporting_sentences": ["…"], // body sentences that best match the headline
  "claims_to_verify": ["…"], // sentences with figures / attributed claims
  "analyzed_at": "2026-10-02T02:13:00.000Z",
  "engine": "node-nlp", // or "python-nlp (<model>)"

  // ---- legacy fields (kept for older clients) ----
  "composite_sensationalism_score": 77,
  "legitimacy_confidence_score": 23, // = 100 - score; NOT the analysis confidence
  "cosine_similarity_score": 0.4, // Node: stemmed lexical alignment; Python: SBERT cosine
  "sentiment_polarity": 0,
  "semantic_gap": false,
  "sensational_tone": false,
  "score_breakdown": { "semantic_gap_points": 63, "sentiment_points": 0, "hook_points": 0, "synergy_points": 0 }
}
```

Both engines emit every field above. The frontend's `normalizeApiResponse()` still defaults any
missing field, so an older engine that omits the v2 fields renders with the legacy 4-bar breakdown.

A site that blocks automated readers outright does **not** produce an error: the response is a
normal 200 with `fetch_via: "url-only"`, `partial: true`, `verdict: "Headline Only"` (unless the
headline itself is high-risk) and `analysis_confidence.score: 15`.

### Error Responses

All errors are `{ "error": "<message>" }`. No stack traces or internal details are ever returned.

| Status | Condition |
| ------ | --------- |
| 400 | Missing/invalid `url`, malformed JSON, non-http(s) scheme, private/reserved destination (SSRF), unreadable article |
| 403 | Cross-origin request |
| 404 | The article URL doesn't exist (origin returned 404/410) |
| 404 | Unknown `/api/*` route (JSON body) |
| 413 | Request body over 4 KB, or the article page over the fetch size cap |
| 414 | `url` longer than 2,048 characters |
| 415 | Request body not JSON, or the target isn't an HTML page |
| 429 | Per-IP rate limit exceeded |
| 502 / 504 | Upstream site unreachable, blocking, or too slow |
| 503 | Too many analyses in flight (`Retry-After: 5`) |
| 500 | Unexpected failure (logged server-side) |

API responses carry `Cache-Control: no-store`.

## `GET /healthz`

`{ "status": "ok" }`

## Static Routes

`GET /` and any other unmatched non-API `GET` serve `public/index.html`. `/?url=<encoded url>`
pre-fills the form and runs the analysis (used by the "Copy link" button).
