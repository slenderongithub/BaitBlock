# Changelog

## [1.1.0] — 2026-07-11 — Production-readiness upgrade

A large hardening + modernization pass. **No intended user-facing scoring behaviour changed** for the Node engine (the heuristic weights/thresholds/verdict cutoffs are preserved); everything else was made safer, more modular, tested, and modern.

### Security (Critical/High)
- **SSRF protection** added to both backends (`src/ssrfGuard.js`, `assert_url_allowed` in `app.py`): rejects `localhost`, RFC1918, loopback, link-local incl. the `169.254.169.254` metadata endpoint, reserved ranges, IPv4-mapped IPv6, and non-`http(s)` schemes. Node re-validates every redirect hop (manual redirect following).
- **Rate limiting** on `/api/analyze` (`express-rate-limit`).
- **Fetch timeout** (`AbortController`, Node) + **response size cap** (streamed, both engines) + **Content-Type allowlist** before parsing.
- **Helmet** security headers with a strict same-origin CSP.
- Python: removed the silent `verify=False` TLS-verification fallback and the global urllib3 warning suppression.
- `express.json` body-size limit (16kb) + clean 400 on malformed JSON.

### Architecture
- Split the 685-line monolithic `src/server.js` into focused modules: `config`, `ssrfGuard`, `safeFetch`, `extraction`, `scoring`, `nlp`, `analyze` (testable/network-injectable), `errors`, `textUtils`, `lexicons`, and a thin `server` for HTTP wiring.
- Extracted all magic numbers (0.35 gap threshold, 0.5 sentiment threshold, 70/40 verdict cutoffs, point weights) into `src/config.js` with rationale comments and env overrides.
- Removed dead code: `toSentenceCase()` and the never-read `isLikelyClickbait` response field.

### Python NLP backend (was completely unreachable → now works)
- **Fixed the broken static path** — Flask now serves `public/` (`GET /` used to 404). The advanced NLP engine is reachable for the first time.
- **Upgraded the embedding model**: default `all-MiniLM-L6-v2` → **`all-mpnet-base-v2`**, now env-configurable via `CLICKBAIT_EMBEDDING_MODEL`.
- Pinned `requirements.txt`; documented `spacy download en_core_web_sm` and the VADER lexicon.
- Added `start.sh` (macOS/Linux launcher) alongside `start.ps1`.
- Added `engine` field, `/healthz`, and an SPA 404 fallback.

### Frontend (major redesign)
- Rebuilt `index.html`/`styles.css`/`script.js` as a modern, **theme-aware (light/dark)** dashboard with a design-token system and **system fonts** (removed the external Google Fonts dependency → faster, private, strict-CSP-friendly).
- New **animated radial risk gauge** with score count-up, animated **score-breakdown bars**, verdict badge, meta chips (confidence/engine/source).
- **Loading skeleton**, dedicated **error banner**, **empty ("how it works") state**, "analyze another" reset, example chips.
- **Accessibility**: skip link, `aria-live` status + result regions, `role`/label semantics, visible focus, `prefers-reduced-motion` support, no-FOUC theme bootstrap (`theme.js`).
- XSS-safe: all remote-derived content rendered via `textContent`/`createElement` (no `innerHTML`).

### Testing / tooling / CI
- Added a `node:test` suite (28 tests): scoring, SSRF, analyze pipeline, HTTP API (live fixture round-trip), and a jsdom frontend render test.
- Added ESLint (flat config) + Prettier with configs and ignore files.
- Added GitHub Actions CI (lint + format check + tests on Node 18/20/22) and Dependabot.
- Ran `npm audit fix` (0 vulnerabilities; Express 4.22.1 → 4.22.2 patch, undici patched via cheerio).

### Housekeeping
- Deleted the untracked duplicate root files `script.js` and `server.js`.
- Added `.env.example`, `LICENSE` (MIT), `public/robots.txt`, `engines` field, and `.gitignore` entries for `.env` / `.code-review-graph/`.
- README: documented both engines, security, Python setup, and added the evaluation-chart "illustrative, not a benchmark" disclaimer.

### Known remaining items (see docs/Known-Issues.md)
- The two engines still compute `cosine_similarity_score` differently (documented, intentional).
- Node named-entity extraction is still a regex heuristic (single "Proper Nouns" group).
- No real evaluation harness yet; Python backend has no rate limiter yet; residual DNS-rebinding TOCTOU window on both engines.
