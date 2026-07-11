# Extraction Fallback Chains

Parent: [[Home]]

Both backends independently implement the same idea: real-world article HTML is inconsistent, so try several strategies in order of trustworthiness and take the first one that clears a quality bar.

## Title (Node: `extractTitle`)

```mermaid
flowchart LR
    A["og:title meta"] -->|empty| B["twitter:title meta"]
    B -->|empty| C["first h1 text"]
    C -->|empty| D["title tag text"]
    D --> E[first non-empty wins]
```

## Body (Node: `extractBodyText`)

```mermaid
flowchart TD
    P["Prune noisy DOM: script/style/nav/footer/ads/cookie/consent/analytics/tracking/share/related/comment selectors"]
    P --> J["JSON-LD articleBody (NewsArticle/Article/Report types)"]
    J -->|length > 220 & not noisy| DONE1[Use it]
    J -->|fails| S["Ranked CSS selectors: article p, main p, role=main p, .article p, .post-content p, .entry-content p, .story-content p, .content p"]
    S -->|first selector yielding ≥80 tokens, >200 chars, passes readability filter| DONE2[Use it]
    S -->|all fail| F1["Fallback: all p tags, readability-filtered, first 20"]
    F1 -->|>200 chars, not noisy| DONE3[Use it]
    F1 -->|fails| F2["Final fallback: p tags scoped to body only"]
    F2 -->|not noisy| DONE4[Use it, or empty if still noisy]
```

`isReadableParagraph` filters out anything under 60 chars, under 10 words, containing boilerplate phrases ("cookie", "subscribe", "privacy policy", "sign in", "disclaimer"), or with more than 2 abnormally long "words" (a proxy for encoded/minified junk). `isNoisyTextCandidate` additionally flags text with ≥2 tracking/ad-related keyword hits, high punctuation density, or low alphabetic-character ratio.

The response's `extraction_method` field records which tier succeeded — useful for debugging why a given article extracted poorly.

## Python Equivalent

`app.py`'s `scrape_article()` is coarser — two tiers only: `newspaper3k` (used if it returns both a headline and >180 chars of body), else BeautifulSoup4 with a shorter selector list (`article`, `main`, `[role='main']`, `.post-content`, `.entry-content`, else raw `<p>` tags with no readability filtering at all). See [[Python-Backend]].

## Related

- [[Request-Lifecycle]]
- [[Node-Backend]]
- [[Python-Backend]]
