# Node Backend (Live)

Parent: [[System-Architecture]]

**File:** `src/server.js` (685 lines, single file, no exports/modules)
**Entry point:** `npm start` → `node src/server.js`
**Stack:** Express `^4.21.2`, Cheerio `^1.0.0`, native `fetch()`

## Responsibilities

1. Serve `public/` as static files (`PUBLIC_DIR = path.join(__dirname, "..", "public")`).
2. Handle `POST /api/analyze` — the entire product logic.
3. Catch-all `GET *` → always serves `public/index.html`.

## Internal Structure

- **Extraction:** `parseJsonLdNodes`, `extractTitle`, `extractBodyText` (+ helpers `pruneNoisyDom`, `isReadableParagraph`, `isNoisyTextCandidate`, `sanitizeTextBlock`, `extractBodyFromJsonLd`), `extractMetaDescription`, `extractPublishedAt`, `extractAuthors`. See [[Extraction-Fallback-Chains]].
- **NLP-lite:** `computeLexicalSimilarity` (misleadingly named — token overlap, not cosine similarity), `computeSentimentPolarity` (word-list based), `extractKeyPhrases`, `extractNamedEntities` (regex, not real NER), `groupEntities`, `extractSupportingSentences`.
- **Scoring:** `computeScore`, `buildSummary`. See [[Scoring-Algorithm]].
- **Constant tables:** `BAIT_PATTERNS`, `DECEPTION_HINTS`, `STOP_WORDS`, `POSITIVE_WORDS`, `NEGATIVE_WORDS`.

## Known Gaps

- No SSRF guard on the outbound fetch.
- No request timeout.
- No content-type check before parsing.
- `toSentenceCase()` defined but never called (dead code).

Full detail: [[Known-Issues]].

## Related

- [[System-Architecture]]
- [[Scoring-Algorithm]]
- [[Frontend]] (consumes this backend's JSON)
