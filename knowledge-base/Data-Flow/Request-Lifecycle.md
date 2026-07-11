# Request Lifecycle

Parent: [[Home]]

## Full Sequence (Node/live backend)

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Express (src/server.js)
    participant T as Target Article Site

    B->>S: POST /api/analyze { url }
    S->>S: new URL(url) — validate protocol is http/https
    alt invalid URL
        S-->>B: 400 { error: "URL format is invalid." }
    end
    S->>T: fetch(url, User-Agent spoofed, redirect: follow)
    alt non-2xx response
        T-->>S: HTTP error status
        S-->>B: 400 { error: "Failed to fetch article: HTTP <status>" }
    end
    T-->>S: HTML body
    S->>S: cheerio.load(html)
    S->>S: parseJsonLdNodes($)
    S->>S: extractTitle / extractBodyText (see Extraction-Fallback-Chains)
    S->>S: extractMetaDescription / extractPublishedAt / extractAuthors
    S->>S: computeScore(title, bodyText) — see Scoring-Algorithm
    S-->>B: 200 { verdict, score, signals, score_breakdown, ... }
    B->>B: normalizeApiResponse(data)
    B->>B: renderResult(data) — DOM update
```

## Failure Paths

Any exception during fetch/parse/extract/score is caught by a single outer `try/catch` and returned as `500 { error: "Could not analyze this URL right now...", detail: error.message }` — a client-visible message but no server-side logging beyond the default Express/Node stderr trace.

## Related

- [[Extraction-Fallback-Chains]]
- [[Scoring-Algorithm]]
- [[Node-Backend]]
