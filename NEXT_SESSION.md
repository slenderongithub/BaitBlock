# NEXT_SESSION.md

Priorities after the **v1.1.0 production-readiness upgrade** (2026-07-11). The critical/high items from the previous plan are done ([[CHANGELOG]]); what remains is forward-looking.

## 1. Commit & Deploy

- Review `git status`/`git diff` and commit the upgrade in logical groups (security, module split, frontend, python, tests/CI, docs).
- The app is now safe to deploy beyond localhost **provided** `CLICKBAIT_ALLOW_PRIVATE` stays off. Consider a container + reverse proxy + the existing rate limiting.

## 2. Strategic: Engine Unification

Decide whether to keep two engines or converge (see [[docs/Decision-Log]]). This is the single biggest open architectural question; it determines where future scoring work lives (JS vs Python) and resolves the `cosine_similarity_score` divergence.

## 3. Quality / Feature Follow-ups

- Real evaluation harness (replace the illustrative chart CSVs with measured output).
- Result caching (in-memory LRU/TTL).
- `flask-limiter` on the Python engine (Node already rate-limited).
- Full DNS-rebinding mitigation (pin connection to validated IP).
- Refreshed UI screenshots; optional real NER for the Node engine.

## Guardrails (unchanged)

- Keep `npm test` at 28/28, lint + format clean (CI enforces).
- Preserve the SSRF guard and `textContent`-only rendering.
- Don't change scoring weights/thresholds in `src/config.js` without updating the contract tests deliberately.

Full context: [[AI_HANDOFF]], [[CURRENT_STATE]], [[docs/Known-Issues]], [[docs/Future-Roadmap]].
