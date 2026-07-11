# Known Issues

Parent: [[Home]]

Full ranked list lives in `../../docs/Known-Issues.md` — this note cross-links the highest-impact items into the vault's graph.

## Top Issues (by impact)

1. **[[Python-Backend]] can't serve the UI** — broken static file path (`static_folder="."` at repo root instead of `public/`).
2. **[[Scoring-Algorithm]] divergence** — `cosine_similarity_score` means different things in [[Node-Backend]] vs [[Python-Backend]] despite sharing a name and threshold.
3. **SSRF exposure** — `POST /api/analyze` performs an unrestricted server-side fetch of any user-supplied URL, no allowlist/denylist for internal address ranges, no auth, no rate limiting.
4. **Illustrative evaluation charts** — the `fig*.png` charts in `README.md` come from small hand-authored CSVs, not from running either backend against real data. See [[Technical-Debt]].
5. **TLS verification silently disabled on fallback** — Python's `scrape_with_bs4` retries with `verify=False` on `SSLError`, with global urllib3 warning suppression masking it.

See [[Technical-Debt]] for structural/duplication issues and `../../docs/Known-Issues.md` for the complete 18-item inventory including reliability, reproducibility, and cosmetic issues.
