"use strict";

/**
 * HTML fixtures for tests (no network). Each one models a distinct kind of
 * article, so the contract tests can pin down not just "risky vs safe" but the
 * *kind* of problem the engine reports.
 */

function page({ title, head = "", body }) {
  return `<!doctype html><html><head><meta property="og:title" content="${title}">${head}</head><body><article>${body
    .map((p) => `<p>${p}</p>`)
    .join("")}</article></body></html>`;
}

const BYLINE = `<meta name="author" content="Jane Doe"><meta property="article:published_time" content="2026-09-01T09:00:00Z"><meta property="og:site_name" content="Example Gazette">`;

const CLICKBAIT_HTML = page({
  title: "You won't believe this SHOCKING secret doctors hate!",
  head: `<meta name="description" content="A sensational teaser article."><meta property="article:published_time" content="2026-01-01T00:00:00Z"><meta name="author" content="Jane Doe">`,
  body: [
    "This is a perfectly ordinary paragraph about municipal water infrastructure and long-term budget planning for the coming fiscal year, containing more than enough words to comfortably pass the readability filter used by the extractor.",
    "According to the published city report, officials confirmed the study found no significant change in the 42 percent figure that was cited earlier by several council members during the public meeting held on Tuesday afternoon.",
    "Residents who attended the session raised additional questions about maintenance scheduling, and the department promised to release a follow-up statement within the next several weeks about the ongoing review.",
  ],
});

const LEGIT_HTML = page({
  title: "City council approves annual water infrastructure budget",
  head: `<meta name="description" content="The council voted to approve the fiscal budget.">${BYLINE}`,
  body: [
    "The city council voted on Tuesday to approve the annual water infrastructure budget after a lengthy public meeting that covered maintenance scheduling and long-term planning for the municipal supply network.",
    'Officials said the approved budget maintains current service levels and funds several scheduled pipeline repairs across the district over the coming fiscal year, according to the published report. "This keeps the system reliable for another decade," said finance director Maria Lopez.',
    'Council members confirmed that the review process will continue, and the department announced it would publish a detailed breakdown of the spending plan for residents to examine in the weeks ahead. "We want every resident to see where the money goes," council president Tom Reyes said in a statement.',
  ],
});

const MISLEADING_SCIENCE_HTML = page({
  title: "Coffee cures cancer, scientists prove",
  head: BYLINE,
  body: [
    "A small study published this month suggests that people who drink coffee may have a slightly lower risk of some cancers, researchers said, although the findings are preliminary and were observed in mice.",
    "The authors cautioned that the results only show the habit is associated with lower risk and could reflect other lifestyle factors. More research is needed before any recommendation can be made, they said.",
    "Independent experts said the work was interesting but unclear in its implications for people, and noted that coffee consumption is linked to many other health behaviours that the study could not control for.",
  ],
});

const SCAM_HTML = page({
  title: "Act now: this miracle pill melts belly fat overnight",
  body: [
    "Doctors are stunned by this natural cure that big pharma doesn't want you to know about. Thousands of people are already using it to lose 30 pounds in a month without diet or exercise, and the results are incredible.",
    "This offer is for a limited time only, and there are only 7 left in stock. Click here to claim your discount before it's too late, and use code SLIM50 at checkout to get 50% off your first order today.",
    "Share this with everyone you love before they delete it. The mainstream media won't report on this amazing breakthrough because they are paid to stay silent.",
  ],
});

const RUMOR_HTML = page({
  title: "Tech giant reportedly planning secret layoffs, insiders claim",
  body: [
    "Sources say the company is allegedly preparing a round of cuts that could affect thousands of workers, according to people familiar with the matter who spoke on condition of anonymity because the plans are not public.",
    "Insiders claim that managers have reportedly been told to prepare lists, though the details remain unconfirmed. Some believe the move is linked to slowing sales, while others speculate it may be a cost-saving exercise ahead of a reorganization.",
    "It is rumored that the announcement could come within weeks. Many people are saying the atmosphere inside the offices has become tense, and some employees reportedly began updating their resumes in anticipation of the cuts.",
  ],
});

const SPONSORED_HTML = page({
  title: "How one family cut their energy bills with smart home upgrades",
  head: `<meta property="article:section" content="Sponsored Content">${BYLINE}`,
  body: [
    "This content is paid for by an advertiser. When the Martinez family moved into their house last spring they noticed their energy bills were much higher than expected, so they started looking for ways to reduce consumption.",
    "After installing a smart thermostat and LED lighting, the family said their monthly bill fell noticeably over the winter, according to the figures they shared with the installer's customer team.",
    "The family said they were happy with the upgrades and planned to add solar panels next year once they had compared quotes from several local providers in their area.",
  ],
});

const SATIRE_HTML = page({
  title: "Area man confident he could land plane in emergency",
  head: BYLINE,
  body: [
    "Despite having never set foot in a cockpit, local man Dale Hutchins said Tuesday that he was fully confident he could land a commercial airliner if both pilots were suddenly incapacitated during a flight.",
    '"How hard can it be, you just point it at the runway and go slow," said Hutchins, who added that he had watched several videos online and once played a flight simulator for about twenty minutes in 2009.',
    "Hutchins then told reporters he would also be able to perform emergency surgery if necessary, citing a television show he had watched in its entirety over a single weekend.",
  ],
});

module.exports = {
  CLICKBAIT_HTML,
  LEGIT_HTML,
  MISLEADING_SCIENCE_HTML,
  SCAM_HTML,
  RUMOR_HTML,
  SPONSORED_HTML,
  SATIRE_HTML,
};
