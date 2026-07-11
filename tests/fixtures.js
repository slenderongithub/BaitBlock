"use strict";

/** Shared HTML fixtures for tests (no network required). */

const CLICKBAIT_HTML = `<!doctype html>
<html><head>
<meta property="og:title" content="You won't believe this SHOCKING secret doctors hate!">
<meta name="description" content="A sensational teaser article.">
<meta property="article:published_time" content="2026-01-01T00:00:00Z">
<meta name="author" content="Jane Doe">
</head><body><article>
<p>This is a perfectly ordinary paragraph about municipal water infrastructure and long-term budget planning for the coming fiscal year, containing more than enough words to comfortably pass the readability filter used by the extractor.</p>
<p>According to the published city report, officials confirmed the study found no significant change in the 42 percent figure that was cited earlier by several council members during the public meeting held on Tuesday afternoon.</p>
<p>Residents who attended the session raised additional questions about maintenance scheduling, and the department promised to release a follow-up statement within the next several weeks about the ongoing review.</p>
</article></body></html>`;

const LEGIT_HTML = `<!doctype html>
<html><head>
<meta property="og:title" content="City council approves annual water infrastructure budget">
<meta name="description" content="The council voted to approve the fiscal budget.">
<meta name="author" content="John Smith">
</head><body><article>
<p>The city council voted on Tuesday to approve the annual water infrastructure budget after a lengthy public meeting that covered maintenance scheduling and long-term planning for the municipal supply network.</p>
<p>Officials said the approved budget maintains current service levels and funds several scheduled pipeline repairs across the district over the coming fiscal year, according to the published report.</p>
<p>Council members confirmed that the review process will continue, and the department announced it would publish a detailed breakdown of the spending plan for residents to examine in the weeks ahead.</p>
</article></body></html>`;

module.exports = { CLICKBAIT_HTML, LEGIT_HTML };
