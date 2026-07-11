# Future Roadmap

> **Updated for v1.1.0.** Most near-term hardening items from the original roadmap are **done** (SSRF, rate limiting, tests, CI, Python backend fixed, frontend redesigned, deps pinned — see [[../CHANGELOG]]). The remaining forward-looking work is below.

## Still Ahead (post-1.1.0)

- **Strategic engine unification** — decide whether to keep two engines long-term or converge on one scoring source of truth (the `cosine_similarity_score` divergence is the clearest symptom). See [[Decision-Log]].
- **Real evaluation harness** — run the live engine(s) against a labeled corpus and regenerate the charts from measured output (replacing the current illustrative CSVs).
- **Result caching** — in-memory LRU/TTL keyed by normalized URL.
- **Python rate limiter** — add `flask-limiter` for parity with the Node engine.
- **Full DNS-rebinding mitigation** — pin the connection to the validated IP to close the residual TOCTOU window.
- **Refreshed screenshots** for the redesigned UI; optional real NER for the Node engine.

---

## Original roadmap (pre-upgrade, retained for context)


No roadmap document, issue tracker, or project board exists in the repository — everything below is **inferred** from code shape and gaps, not stated intent. Treat this as a starting point for a conversation with the project owner, not a committed plan.

## Inferred Near-Term (fixing what's half-built)

- Resolve the Node/Python backend duplication (see [[Improvement-Ideas]] #1, #10) — this is the single highest-leverage decision pending in the codebase, since it blocks confidently improving scoring logic in either direction.
- Clean up the uncommitted root-level duplicate files.
- Close the SSRF gap before any public deployment — the app is not currently safe to expose on the open internet.

## Plausible Mid-Term (extending current capability)

- Real evaluation harness replacing the static/illustrative chart CSVs, enabling actual before/after comparison when scoring logic changes.
- Result caching to reduce repeat-fetch cost and latency.
- Batch analysis (multiple URLs per request) — the current single-URL, single-page UI is the natural ceiling of the existing architecture; batch mode would need a queue or at least async job handling, which doesn't exist today.
- Browser extension or bookmarklet wrapping the same `/api/analyze` contract — plausible given the API is already decoupled from the UI, but would sharpen the SSRF/rate-limit gaps into a priority.

## Plausible Long-Term (speculative, not implied by current code)

- Replace the Node heuristic engine's `cosine_similarity_score` (currently lexical overlap) with real embeddings, closing the gap with the Python engine, or retire the Node engine's independent scoring math in favor of calling into a single shared scoring service.
- A stored history of past analyses (would require introducing a database — none exists today) and user accounts (would require [[Authentication]] to be built from scratch).
- A proper accuracy benchmark against a public clickbait-headline dataset, published as part of the README's evaluation section.

## What Would Need to Happen First

Before any of the above, the project has no tests and no CI — both should exist before behavior-changing work begins, so regressions in either scoring engine are caught mechanically rather than by manual spot-checking.
