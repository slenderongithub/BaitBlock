# ARCHITECTURE_CONTEXT.md

> **Updated for v1.1.0.** The Node backend is now split into modules (`config`, `ssrfGuard`, `safeFetch`, `extraction`, `scoring`, `nlp`, `analyze`, `errors`, `textUtils`, `lexicons`, `server`), and the Python backend is reachable (static path fixed). Every outbound fetch passes an SSRF guard + timeout + size cap + content-type check. The `cosine_similarity_score` divergence between engines noted below is unchanged and intentional. See [[CHANGELOG]].

Condensed architecture reference for AI sessions. Full version: `docs/Architecture.md` + `docs/Data-Flow.md`.

## Shape

```
Browser (public/index.html + script.js)
   │  POST /api/analyze { url }
   ▼
Express server (src/server.js)  ◄── LIVE, this is what npm start runs
   │  fetch(url) server-side
   ▼
Target article site (arbitrary, user-supplied — SSRF risk, see Known-Issues)
   │  HTML
   ▼
cheerio.load(html) → JSON-LD parse → title/body/meta extraction (multi-tier fallback)
   ▼
computeScore(title, body) → { score, signals, score_breakdown, cosineSimilarityScore, sentimentPolarity }
   ▼
JSON response → browser renders result card
```

A second, parallel pipeline exists in `app.py` (Flask) implementing the same contract with real NLP (spaCy/SBERT/VADER) instead of regex heuristics — but it cannot currently serve the frontend because `static_folder`/`send_from_directory` point at the repo root, where `index.html` does not exist (it's under `public/`). Treat `app.py` as **not runnable end-to-end** until that's fixed.

## Layering

- No MVC, no service layer, no repository pattern — each backend is a single file with function-level organization: HTTP handlers → extraction functions → scoring functions → small pure helpers.
- No shared code between the Node and Python backends (different languages; logic was independently reimplemented in each, and has drifted — see below).

## Key Divergence to Remember

Both backends emit a field called `cosine_similarity_score` compared against the same 0.35 "semantic gap" threshold, but:
- Node: plain non-stopword token-overlap ratio (`computeLexicalSimilarity`) — not actually cosine similarity of anything.
- Python: real SBERT sentence-embedding cosine similarity (`semantic_similarity`), with a hashed-bag-of-words fallback if the model fails to load.

These produce different distributions and different verdicts for the same article. Do not assume the two backends are interchangeable or that fixing one also fixes the other.

## Extension Points

- New extraction selectors: add to the ranked selector list in `extractBodyText` (Node) or `scrape_with_bs4` (Python).
- New scoring signals: add to `computeScore`/`compute_composite`, remember to also add the new points to `score_breakdown` and to `signals` for explainability, consistent with the existing pattern.
- New API fields: must be added to `public/script.js`'s `normalizeApiResponse()` defaults too, or the frontend will silently show `undefined`/blank for that field when the *other* backend (which doesn't emit it) is used.
