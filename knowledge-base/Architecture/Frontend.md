# Frontend

Parent: [[System-Architecture]]

**Files:** `public/index.html`, `public/script.js`, `public/styles.css` — no framework, no bundler, no build step.

## Structure

Single page, three sections: hero (static branding), input (URL field + Analyze button + status line), result (hidden until first analysis, then an 8-panel grid: headline, article context, NLP metrics, score breakdown, top signals, body snippet, key phrases/entities, entity groups, supporting sentences).

## Key Logic (`script.js`)

- `normalizeApiResponse(data)` — defensively fills every expected field with a sane default. This is what allows the *same* frontend to render output from either [[Node-Backend]] or [[Python-Backend]] despite their differing response shapes (Node emits `bucket`/`isLikelyClickbait`, Python doesn't; verdict derivation falls back to `bucket` when `verdict` is missing).
- `renderResult(data)` — one large function, direct DOM writes (no virtual DOM/diffing), sets `safe`/`warning`/`risky` classes on the result card based on verdict.
- `renderChipRows`/`addChip`/`renderEntityGroups`/`renderSupportingSentences` — small reusable rendering helpers for the "chip"/pill UI pattern.

## Visual Design

"Neo-brutalist" theme in `styles.css`: thick black borders (`3-4px`), hard offset drop shadows (`box-shadow: Npx Npx 0 var(--ink)`), no border-radius softening on primary cards, flat saturated accent colors (teal/red/yellow) via CSS custom properties. One responsive breakpoint at 740px, desktop-first (not mobile-first).

## Related

- [[System-Architecture]]
- [[Request-Lifecycle]]
