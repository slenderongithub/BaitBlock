# Changelog

## [2.1.0] — 2026-10-02 — Dependable acquisition

Measured with a harness over ~30 outlets' live RSS feeds: on the same 51 links, readable results
went from 27 to 45; on a fresh set of 48 article links, every link returned a result (36 full
articles, 12 limited reads from hard bot walls) instead of an error.

- **Readability extraction**: Mozilla Readability (Firefox Reader View) over `linkedom` now runs
  alongside the `<p>`-selector extractor. Fixes sites whose paragraphs are `<div>`/`<span>`/`<h2>`
  (BuzzFeed, CBS, The Hindu, TechCrunch, WaPo, …). The Python engine gained an equivalent
  leaf-block scan.
- **Tracking parameters stripped server-side** (`utm_*`, `fbclid`, `traffic_source`, …): one cache
  entry per story, and fixes sites whose robots.txt disallows only the tracked variants (Al Jazeera).
- **Headless tier works without the Playwright download**: falls back to installed Chrome / Edge;
  the render pool now queues (up to 30 s) instead of skipping when busy. Recovers Cloudflare-
  challenged sites such as Politico.
- **Retry** once on transient failures (timeouts, 429, 5xx); **charset-correct decoding**
  (windows-1252, Shift_JIS, …) instead of always UTF-8.
- **Never analyze an interstitial**: "Just a moment…", "Access Denied", "confirm you are human"
  and bare-domain titles are rejected as article candidates; Wayback snapshots must be HTTP 200.
- **Degrade instead of failing**: the best partial page is used when no tier yields a full body;
  for hard bot walls (403/challenge, no archive copy) a link-only read analyzes the headline words
  in the URL slug. Both are flagged (`partial`, `fetch_via: "url-only"`, verdict "Headline Only",
  15% confidence) and unchecked dimensions are reported as `assessed: false` (N/A in the UI), never
  as clean.
- **Clear errors**: a page that doesn't exist returns 404 "That page doesn't exist", and a hard
  wall says it is a wall, instead of a generic "could not extract".
- Python engine now uses the same headline precedence as Node (og:title first), so both engines
  judge the same headline.
- New context labels: Live blog, Video page.

## [2.0.0] — 2026-10-02 — Six-dimension pipeline, security hardening, UI upgrade

### Analysis pipeline (breaking: verdict scale and response contract extended)
- **Six independent dimensions** replace the single additive heuristic: headline bait,
  sensational tone, headline vs. body, sourcing, transparency, manipulation & scam tactics. Each
  is scored 0–100 with point-level evidence; they combine as a noisy-OR with a dead zone.
- **Five-tier verdict that names the problem**: Straight Reporting / Likely Legit / Borderline,
  then Clickbait · Sensationalist · Misleading Headline · Unsubstantiated · Low Transparency ·
  Manipulative at high/severe risk; Satire and Sponsored Content get their own verdicts.
- **Learned headline model**: logistic regression on the public Stop Clickbait corpus,
  98.2% accuracy / F1 0.981 on 6,400 held-out headlines (`scripts/train-headline-model.js`).
- New checks: figures and names in the headline missing from the body; certainty in the headline
  vs hedging in the body; anonymous sourcing, rumor wording, attribution density, quotes,
  evidence references; byline/date/publisher/HTTP; sponsored, opinion, press-release, satire and
  old-story labels; urgency, CTAs, miracle-cure, money-scheme, conspiracy, share-pressure and
  prize-lure language; lookalike outlet domains.
- Fixed false positives found by live testing: a single sentiment word no longer flags
  "sensational tone" (VADER-style normalisation + separate loaded-language lexicon); body quotes
  are no longer stripped during extraction; real outlet domains such as `dailymail.com` aren't
  flagged as lookalikes.
- Real NER on Node via `compromise` (People / Places / Organizations); supporting sentences ranked
  by headline match; new `claims_to_verify`, `strengths`, `guidance`, `context_labels`,
  `headline_highlights`, `analysis_confidence`.
- Signal definitions live in `src/data/rules.json` and are shared by **both** engines. The Python
  engine was ported to the same design and adds SBERT semantic similarity and spaCy NER.
- `src/lexicons.js` removed (moved into `rules.json`). Engine id `node-heuristic` → `node-nlp`.

### Security
- **Python SSRF fix**: redirects were followed by requests/newspaper3k without re-validation; the
  Python engine now does one guarded fetch with manually validated redirect hops.
- **DNS rebinding closed (Node)**: SSRF validation runs in the socket's DNS lookup via an undici
  `Agent`, so the dialled address is the validated one.
- Same-origin API: cross-site POSTs (Origin / Sec-Fetch-Site) → 403; non-JSON bodies → 415.
- Request limits: 4 KB bodies, 2,048-char URLs; server-wide concurrent-analysis cap (503) and a
  headless-render concurrency cap.
- CSP no longer allows `unsafe-inline` styles; added Permissions-Policy and Referrer-Policy;
  `Cache-Control: no-store` on the API; JSON 404 for unknown API routes; a final error handler so
  Express never prints stack traces.
- Structured security-event log (SSRF blocks, cross-origin, rate limits, oversize, capacity).
- Python engine gained security headers (HSTS, CSP, …), a rate limiter, a concurrency cap, a
  body-size limit, and no longer returns exception details on 500.

### Frontend
- Six-point inspection with expandable evidence, five-segment tier scale, highlighted headline
  terms, "Before You Share" guidance and "What checks out", claims worth verifying, context labels,
  analysis-confidence notes, analyzed-at timestamp.
- Copy report, copy shareable link (`/?url=` deep links auto-run), print stylesheet, back-to-top
  button, scroll progress bar, staged loading messages, client-side URL validation with an error
  state, tracking-parameter stripping (utm_*, fbclid, …), FAQ.
- Fixed a masthead overflow at phone widths.

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
