# Known Issues

Status as of **v2.0.0 (2026-10-02)**. Most of the original inventory was resolved in the production-readiness upgrade — see [[../CHANGELOG]]. Items are marked ✅ Resolved, 🟡 Partially addressed, or ⬜ Open.

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

## ✅ Resolved in v2.0.0

- ✅ **DNS-rebinding TOCTOU (Node, was #20)** — SSRF validation now runs inside the socket's DNS lookup (`guardedLookup` on an undici `Agent` in `safeFetch.js`).
- ✅ **Python SSRF via redirects** — newspaper3k/requests followed redirects without re-validation. `safe_get` in `app.py` now follows each hop manually and validates it.
- ✅ **Python backend had no rate limiter (was #21)** — in-memory per-IP limiter + concurrency cap + security headers + 4 KB body cap; 500s no longer leak exception text.
- ✅ **Node "named entities" were a capitalized-word regex (was #22)** — now `compromise` People / Places / Organizations.
- ✅ **No evaluation harness (was #23), partially** — the headline model has a measured held-out score (98.2% acc.). See the open item below for article-level evaluation.
- ✅ **Single-word sentiment false positives** — one positive/negative word used to set |polarity| = 1.0 and flag "sensational tone"; replaced by a VADER-style normalised score plus a separate loaded-language lexicon.

## ✅ Resolved in v2.1.0

- ✅ **Articles without `<p>` paragraphs weren't extracted** (BuzzFeed, CBS, The Hindu, …) — Readability (Node) and a leaf-block scan (Python).
- ✅ **Headless tier silently skipped when Playwright's Chromium wasn't downloaded** — falls back to installed Chrome/Edge.
- ✅ **Tracked URLs blocked by robots.txt** (e.g. `?traffic_source=`) — tracking params stripped server-side.
- ✅ **Hard failures for walled sites** — now a labelled Headline Only read; real 404s get a clear 404.

## 🟡 Partially addressed

19. 🟡 **Two engines diverge on `cosine_similarity_score`** — still true by design (Node = lexical overlap; Python = real SBERT cosine). Now explicitly documented in code comments, the response `engine` field, [[Architecture]], and [[Glossary]]. Unifying on one engine remains a strategic (out-of-scope) decision.
20. 🟡 **DNS-rebinding TOCTOU** — closed for the Node fetch path (connect-time validation). The Python engine still resolves-then-fetches per hop, so a hostname that changes its DNS answer between validation and connect remains a residual risk there.

26. 🟡 **Headless browser DNS** — Chromium resolves names itself, so the headless tier validates each request's host up front but can't pin the connection the way the Node fetch path does.

## ⬜ Open (lower priority)

27. ⬜ **No labelled full-article benchmark** — article-level behaviour is pinned by seven archetype fixtures and spot-checked on live BBC / Guardian / Daily Mail / BuzzFeed articles, not measured on a corpus. Adding one (e.g. FakeNewsNet, or hand-labelled samples) would let the dimension weights be fitted instead of hand-set.
28. ⬜ **English only** — lexicons and the headline model are English; non-English pages get a low `analysis_confidence`.
29. ⬜ **Headline model domain** — trained on 2015-era BuzzFeed/Upworthy vs. NYT/Wikinews headlines; explainer headlines ("Why the housing market is cooling") can read as mildly clickbait-like (~0.7). The rules and dead zone keep these out of the high tiers.
30. ⬜ **In-memory limits** — rate limit and concurrency counters are per process; use a shared store if running several instances.

24. 🟡 **Result caching** — Node caches fetched articles in memory (15 min); scoring is re-run per request (cheap). The Python engine has no cache.
25. ⬜ **JS↔Python response casing** — the Node response still mixes conventions in places; low impact.
