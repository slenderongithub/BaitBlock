# Known Issues

Status as of **v1.1.0 (2026-07-11)**. Most of the original inventory was resolved in the production-readiness upgrade — see [[../CHANGELOG]]. Items are marked ✅ Resolved, 🟡 Partially addressed, or ⬜ Open.

## ✅ Resolved in v1.1.0

1. ✅ **Python backend static path** — `app.py` now serves `public/` (`GET /` no longer 404s). The NLP engine is reachable.
2. ✅ **SSRF on `/api/analyze`** — both engines now reject private/loopback/link-local/reserved/metadata addresses and non-http(s) schemes; Node re-validates each redirect hop. (`src/ssrfGuard.js`, `assert_url_allowed` in `app.py`.)
3. ✅ **No rate limiting** — `express-rate-limit` on the Node analyze route (configurable via `CLICKBAIT_RATE_*`).
4. ✅ **No fetch timeout / size cap (Node)** — `AbortController` timeout + streamed size cap + Content-Type allowlist (`src/safeFetch.js`).
5. ✅ **Content-Type not checked** — both engines reject non-HTML responses (415 / clean error).
6. ✅ **Python silent `verify=False`** — removed; TLS verification is always on, global urllib3 warning suppression removed.
7. ✅ **Duplicate untracked root files** (`script.js`, `server.js`) — deleted.
8. ✅ **Dead code** — `toSentenceCase()` and the unused `isLikelyClickbait` field removed.
9. ✅ **`requirements.txt` unpinned** — pinned to known-good versions; spaCy/NLTK setup documented.
10. ✅ **Undocumented Python setup** — README documents `spacy download en_core_web_sm` and the VADER lexicon.
11. ✅ **No security headers** — Helmet with a strict same-origin CSP.
12. ✅ **No SEO/favicon** — meta description, Open Graph/Twitter tags, canonical, inline SVG favicon, `robots.txt`.
13. ✅ **No tests / CI / lint** — `node:test` suite (28 tests), ESLint + Prettier, GitHub Actions, Dependabot.
14. ✅ **Magic numbers** — centralized in `src/config.js` with rationale.
15. ✅ **No `engines` field / `.env.example` / `LICENSE`** — all added.
16. ✅ **Evaluation charts read as a benchmark** — README now carries an "illustrative, not measured" disclaimer.
17. ✅ **Express one patch behind + audit findings** — `npm audit fix` applied, 0 vulnerabilities.
18. ✅ **Windows-only launcher** — `start.sh` added for macOS/Linux.

## 🟡 Partially addressed

19. 🟡 **Two engines diverge on `cosine_similarity_score`** — still true by design (Node = lexical overlap; Python = real SBERT cosine). Now explicitly documented in code comments, the response `engine` field, [[Architecture]], and [[Glossary]]. Unifying on one engine remains a strategic (out-of-scope) decision.
20. 🟡 **DNS-rebinding TOCTOU** — the SSRF guard resolves-then-fetches and re-validates redirects, which closes the common cases, but does not pin the connection to the validated IP. A hostname that changes its DNS answer between validation and fetch is a residual, documented risk on both engines.
21. 🟡 **Python backend has no rate limiter** — the Node (default) engine does; adding `flask-limiter` to the Python engine is a documented follow-up.

## ⬜ Open (lower priority)

22. ⬜ **Node "named entities" are a capitalized-word regex**, grouped into a single "Proper Nouns" bucket — real NER only comes from the Python engine (`ORG`/`PERSON`/`GPE`/…).
23. ⬜ **No real evaluation harness** — the charts still come from hand-authored sample CSVs; nothing runs the live engine against a labeled corpus. See [[Future-Roadmap]].
24. ⬜ **No result caching** — every request re-fetches and re-computes; costly for the Python engine's model path. See [[Improvement-Ideas]].
25. ⬜ **JS↔Python response casing** — the Node response still mixes conventions in places; low impact.
