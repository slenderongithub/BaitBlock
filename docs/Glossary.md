# Glossary

**Bucket** — Node backend's coarse risk category (`safe` / `warning` / `risky`) derived from `score`; drives the frontend's card color.

**Clickbait pattern (`BAIT_PATTERNS`)** — Node-side regex list matching known hook phrasing ("you won't believe", "shocking", "this one trick", etc.).

**Composite score / `composite_sensationalism_score`** — the final 0–100 clickbait risk score, sum of all weighted signal contributions, clamped to range.

**Confidence / `legitimacy_confidence_score`** — `100 - score`; framed as "how confident are we this is legitimate," inversely tied to the same number as the risk score (not an independent confidence measure).

**Deception hint (`DECEPTION_HINTS`)** — Node-side regex list for phrasing associated with misleading claims ("miracle", "proof", "the truth about", "they don't want you to know", etc.).

**Entity groups** — named entities bucketed by type; only one bucket ("Proper Nouns") in the Node backend vs real spaCy label groups (`ORG`, `PERSON`, `GPE`, ...) in the Python backend.

**Extraction method** — a string in the API response describing which fallback strategy successfully pulled the article body (e.g. `"JSON-LD articleBody"`, `"Paragraph extraction (article p)"`).

**Hook points** — score sub-component from headline "bait"/"deception" pattern matches, punctuation abuse, uppercase ratio, and unusual length.

**JSON-LD** — structured data (`<script type="application/ld+json">`) many news sites embed for SEO; both backends prefer it as the highest-trust source for headline/body/author/date metadata when present.

**Score breakdown** — object decomposing the composite score into `semantic_gap_points`, `sentiment_points`, `hook_points`, `synergy_points`.

**Semantic gap** — flag set when headline/body similarity falls below the 0.35 threshold; means "headline and body don't seem to be talking about the same thing" (lexical overlap in Node, embedding cosine similarity in Python — see [[Known-Issues]] #2).

**Sensational tone** — flag set when headline sentiment polarity's absolute value exceeds 0.5.

**Signals** — human-readable strings explaining *why* a given score was assigned; returned alongside the numeric score for explainability.

**Supporting sentences** — a handful of body sentences ranked as most relevant to the headline's claims, surfaced to help a reader spot-check the article without reading the whole thing.

**Synergy points** — small bonus (+6 Node / +8 Python) added when both a semantic gap *and* sensational/hook language are present simultaneously — the idea being that either signal alone is weaker evidence than both together.

**Verdict** — the human-facing label for the score bucket: Node uses `Clickbait` / `Borderline` / `Likely Legit`; Python uses `Clickbait` / `Sensationalist` / `Borderline` / `Legitimate` (four buckets, not three — see [[Known-Issues]] #2).
