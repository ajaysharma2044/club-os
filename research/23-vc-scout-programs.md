# VC Scout Networks & Campus Funds: Would They Pay for Verified Student Activity Data?

Research date: 2026-09-10. All facts below were pulled via direct fetch of the cited URLs (or web search where the primary page didn't disclose the fact) on this date. Anything not independently confirmed is flagged **[UNVERIFIED]**.

## Context

The question: would VC scout networks, accelerators, and campus-focused funds pay for premium access to a verified record of student activity (club officer roles, budgets managed, events run, teams led) as a talent-sourcing layer, alongside a mainstream employer-facing product?

---

## 1. The landscape, firm by firm

### Dorm Room Fund (backed by First Round Capital) — [dormroomfund.com](https://dormroomfund.com)

Student-run, pre-seed fund that writes first checks to founders still in school or just out. Per the site:

- **339+ portfolio companies** backed over **12+ years**.
- Those companies have gone on to raise **$6B+** in follow-on capital.
- Advisor network spans Sequoia, a16z, Bessemer, and founders from companies like Cursor and Dandy.
- The site does **not** disclose current fund size/AUM, the number of active student partners, or how many campus chapters exist today **[UNVERIFIED — fund size/chapter count]**. (DRF has historically been organized as regional partner teams at dozens of universities, but the current live figure isn't posted.)
- Sourcing model: student partners embedded on campuses surface deals from their own peer networks — i.e., the fund's entire moat is proprietary access to signal about who's building things *before* it's visible externally. This is structurally the same problem a verified-activity graph would solve.

### Contrary Capital / Contrary — [contrary.com](https://contrary.com), [contrary.com/partners](https://contrary.com/partners)

- Describes itself as "a talent and research-driven investment firm."
- **Venture Partner program**: over **50 Venture Partners** embedded at "North America's most entrepreneurial universities," including Berkeley, Columbia, Dartmouth, Duke, Georgia Tech, Harvard, MIT, Michigan, Penn, Princeton, Stanford, and Waterloo.
- Venture Partners function as campus talent scouts, identifying engineering/product/design talent and early founders.
- Fund size, compensation structure, and precise vetting criteria for partners were not disclosed on the pages fetched **[UNVERIFIED]**.
- This is the closest structural match to a paying customer: a firm literally staffing humans on campuses to do informally what a verified-activity database would do at scale and with less bias.

### a16z Speedrun — [a16z.com/speedrun](https://a16z.com/speedrun/)

- Accelerator, not campus-specific — "open to founders around the world," not limited to students.
- Up to **$1M per startup**; **$180M+ deployed** across **200+ startups** since 2023 launch.
- Community described as **600+ founders**.
- Next cohort (SR008) targeted for early 2027, based in San Francisco.
- Sourcing is global/application-based rather than campus-embedded, so a student-club data layer is a weaker fit here — Speedrun would care about a founder's shipped product, not their club title.

### a16z Talent x Opportunity

- The dedicated URL (`a16z.com/txo/`) now **301-redirects to `speedrun.a16z.com`**, indicating the program has been folded into or superseded by Speedrun as of this fetch. Could not independently confirm current program status, funding amount, or whether it still targets underrepresented founders/students specifically **[UNVERIFIED — TxO appears merged into Speedrun; original standalone program details not confirmed live]**.

### Sequoia Arc — [sequoiacap.com/arc](https://www.sequoiacap.com/arc/)

- A bi-annual "open call" for **pre-seed and seed stage founders** (already running companies), not students or early-career job-seekers. Not a talent-scouting-in-school program.
- Structure: 4-day "Arc Intensive" workshops, ~**10 companies per cohort**, access to Sequoia's Ampersand hub and 200+ corporate credits ($3K–$500K).
- Sequoia states it finds founders through "cold outreach, chance encounters, data science signals, and more" — notable because "data science signals" is explicitly named as an existing sourcing input, suggesting Sequoia already buys/builds structured signal data and would be a plausible buyer for a new signal source, even if Arc itself isn't the point of entry.
- Poor fit for a *student-club* dataset specifically, since Arc's bar is an already-operating company.

### Neo (Ali Partovi) Scholars — [neo.com](https://neo.com)

- Per TechCrunch and Neo's own Substack (site itself returned largely unrenderable/JS-gated content on direct fetch, so figures below come from secondary reporting) **[secondary-source confirmed, not primary-page confirmed]**:
- Selects roughly **20–30 exceptional CS undergraduates per year** as "Neo Scholars," though at least one source cites a broader ~120/year figure for Neo's total scouted cohort across programs — the core "Scholars" number most consistently cited is **~30/year**.
- Program has run for **8 years** per TechCrunch's April 2025 profile ("Ali Partovi's eight-year experiment").
- Neo raised a **$320M Fund IV** (April 2025) and is described by TBPN as "Silicon Valley's most selective college talent incubator."
- Vetting reportedly began historically with hard technical coding tests, evolving into a broader network-and-referral-based scouting model — exact current vetting mechanics **[UNVERIFIED — not confirmed directly from neo.com]**.
- Neo is arguably the single closest existing analog to what a verified-activity graph would formalize: it exists specifically to find "the most exceptional CS undergrads in the country" before anyone else does, via manual scouting. A structured, verifiable dataset of who's actually leading things on campus is a direct input to that job.

---

## 2. Adjacent tooling: what VCs already pay for signal

### Harmonic.ai — [harmonic.ai](https://harmonic.ai)

- Tracks **30M+ companies and 190M+ people**, aiming to help VCs "discover the best companies 6 months before the competition."
- Product includes an AI research agent ("Scout") for market maps, team analysis, and real-time alerts on hiring/fundraising/leadership moves.
- Customers listed include Brex, HubSpot, Khosla Ventures, Goldman Sachs, Accel.
- **Pricing is not public** — gated behind "Get pricing"/demo requests across Console, API, and Bulk Data (warehouse export) tiers **[UNVERIFIED — no dollar figures disclosed]**. The existence of a bulk-data/warehouse tier (S3, BigQuery, Snowflake, weekly refresh) is the relevant precedent: sophisticated VCs already buy structured people/company signal as a data feed, not just a dashboard — which is the same delivery model a verified student-activity API would use.

### PitchBook — typical VC seat pricing

No public list price; sold via direct sales, scaled by seat count, modules, and contract term. Aggregated from multiple pricing-intelligence sources (Vendr, SlideGenius, CostBench, EasyVC):

| Metric | Reported figure |
|---|---|
| Per-seat range | ~$12,000–$30,000+/year (some sources: $4,900–$13,500/seat depending on volume) |
| Typical full contract range | $12,000–$70,000+/year |
| Median contract value (Vendr, 114 transactions) | ~$30,000/year |
| Average contract value (Vendr) | ~$56,000/year |

Sources: [SlideGenius](https://www.slidegenius.com/cm-faq-question/what-are-the-typical-costs-associated-with-using-pitchbook), [Vendr](https://www.vendr.com/marketplace/pitchbook), [CostBench](https://costbench.com/software/financial-data-terminals/pitchbook/), [EasyVC](https://easyvc.ai/vs/pitchbook-pricing/). These are third-party pricing-intelligence estimates, not PitchBook's own disclosed rate card — treat as directionally accurate, not exact **[partially unverified — no primary PitchBook pricing page]**.

This matters as a reference point: it tells us what a VC firm's finance team considers a normal annual line-item for a data/intelligence subscription (roughly $15K–$70K per firm per year depending on seats), which brackets what a "verified student talent" add-on could plausibly command if it were positioned as a research tool rather than a recruiting tool.

### How many potential buyers exist?

Estimates vary widely by definition:
- **~2,500–3,400 actively investing U.S. VC firms** (aggregated web estimates, not a single authoritative count) **[UNVERIFIED — no single NVCA figure found for "active firms"]**.
- NVCA/PitchBook's 2026 Venture Monitor reports **585 U.S. VC funds raised capital in 2025** — a *fundraising* count, not a count of all active firms, and it's well below 2021's peak, reflecting industry consolidation. Source: [venturecapitaltracker.com summary of the 2026 NVCA Yearbook](https://venturecapitaltracker.com/2026-nvca-yearbook-industry-in-transition).
- Broader firm/fund databases (Tracxn) list **14,753 VC funds in the U.S.**, but this almost certainly double-counts funds-within-firms and includes dormant entities.

Bottom line: the realistic buyer pool of firms that (a) actively invest and (b) care specifically about early/campus-stage talent sourcing (the DRF/Contrary/Neo archetype) is small — likely **low hundreds of firms**, not thousands.

---

## 3. What investors say they're actually looking for

Three grounded quotes on the underlying signal (agency, self-direction, shipping) that a verified-activity graph would help surface:

1. Paul Graham, ["How to Be an Expert in a Changing World" / relentlessly resourceful essay], paulgraham.com: **"Be relentlessly resourceful."** — his shorthand for the trait he says separates founders who succeed from those who don't when circumstances change. Source: [paulgraham.com/relres.html](http://paulgraham.com/relres.html).

2. Same essay, expanded: **"What would someone who was the opposite of hapless be like? They'd be relentlessly resourceful."** — Graham frames resourcefulness as the inverse of the failure mode he sees most in founders who quit.

3. Keith Rabois (via Delian Asparouhov's notes on Rabois's talent-assessment framework): **"You want to look for someone that has shown an ability to learn outside of a structured school setting, since there won't be any professors or problem sets teaching them how to sell software."** Source: [delian.io/lessons-5](https://delian.io/lessons-5). This is precisely the gap a verified club-activity record fills — it's evidence of self-directed execution (running a budget, leading a team, shipping an event) that never appears in a transcript or professor's problem set.

Naval Ravikant's public commentary (aggregated from secondary sources, not a single primary essay page fetched) consistently emphasizes "specific knowledge" gained through self-directed pursuit of genuine interest rather than credentialed paths, and argues young people increasingly won't have "a normal job" or a single linear career — reinforcing the same thesis that verifiable, non-credential evidence of initiative is the scarce signal **[secondary-source aggregation, not a single primary Naval quote independently confirmed]**.

---

## 4. Ranked verdict: who would plausibly pay

| Rank | Organization | Plausibility of paying | Why |
|---|---|---|---|
| 1 | **Contrary Capital** | High | Already pays ~50 humans (Venture Partners) to do this job manually at named universities. A verified data feed is a direct productivity/coverage multiplier on an existing budget line, not a new behavior. |
| 2 | **Neo (Ali Partovi)** | High | Entire fund thesis is "find the best CS undergrads before anyone else." A verified activity graph is a scouting input, not a nice-to-have — but Neo's edge is partly its manual, high-touch reputation, so it may prefer to keep sourcing proprietary rather than buy a shared dataset. |
| 3 | **Dorm Room Fund** | Medium | Structurally identical need (peer-sourced signal on students), but likely to have a smaller budget than a fund like Neo or Contrary; more probable as a design partner / free pilot than a paid enterprise seat initially. |
| 4 | **Smaller campus-focused / pre-seed micro-funds generally** | Medium | Long tail of funds with the same sourcing pain, aggregate demand could matter more than any single logo, but per-firm willingness-to-pay is low and sales cycles are slow for small checks. |
| 5 | **Harmonic.ai (as a distribution partner, not a buyer)** | Medium (different role) | Not a direct customer — more plausible as a data-partnership/licensing conversation (they already sell bulk data feeds to VCs) than as someone paying for a seat. |
| 6 | **a16z Speedrun / Sequoia Arc** | Low | Both select already-operating companies/founders, not students by club activity; the data isn't decision-relevant at their stage. |
| 7 | **PitchBook** | Low as a buyer, but a useful pricing anchor | Wouldn't buy student club data directly, but its ~$15K–$70K/seat pricing shows the ceiling a VC-facing data add-on could realistically charge without being a rounding-error freebie. |

**Realistic annual contract value (ACV) estimate:** If sold as an enterprise data add-on to the 2-3 highest-fit buyers (Contrary, Neo, and similar campus-embedded funds), a defensible ACV sits in the **$5,000–$25,000/year per firm** range — well below PitchBook's typical seat cost, since this is a narrow, single-purpose feed (not a full market-intelligence platform) being sold into a firm that already runs a cheaper manual process (human Venture Partners) as its baseline alternative. At the very top of ambition — a Neo or Contrary buying a bulk/API feed akin to Harmonic's warehouse tier and treating it as a scouting-automation tool — $25K-$50K/year is plausible but unconfirmed, since none of these firms publish what they currently spend on sourcing tools **[UNVERIFIED — no firm's actual sourcing-tool budget was found]**.

With a buyer pool realistically in the **low hundreds of firms** (campus-focused pre-seed funds, university venture-partner programs, and talent-scout operations like Neo) rather than thousands, and typical per-firm ACV in the $5K–$25K band, total addressable revenue for this premium tier is likely in the **low-to-mid single-digit millions of dollars at full penetration** — before accounting for realistic penetration rates, which for a new, unproven data product sold to a conservative, relationship-driven buyer (VCs) would likely be well under 20% in the first several years.

---

## 5. Honest verdict

This is a real, logical adjacency — not a fantasy. Contrary and Neo already pay real money (staff time, fund overhead) to do exactly the job a verified student-activity graph would do better and at lower marginal cost, and Sequoia explicitly names "data science signals" as part of its existing sourcing stack, confirming that top-tier VCs already buy structured signal rather than relying purely on human networks. But it is a **small, niche revenue line, not a second core business**: the buyer pool is a few hundred firms at most, the plausible per-firm price is a fraction of what a full platform like PitchBook or Harmonic commands (because the dataset is narrower and the buyer has cheap manual alternatives already in place), and several of the highest-profile programs people assume are relevant (a16z Speedrun, Sequoia Arc) turn out on inspection to target already-operating founders rather than students, which shrinks the addressable list further. Best framed as a **credible, defensible enterprise upsell** worth pursuing opportunistically with a small number of named-account pilots (Contrary and Neo first) — not as a justification for the core product roadmap or a headline revenue projection.

---

*Sources fetched directly for this report: dormroomfund.com, contrary.com, contrary.com/partners, a16z.com/speedrun, a16z.com/txo (redirect confirmed), sequoiacap.com/arc, neo.com (limited — JS-gated), harmonic.ai, harmonic.ai/pricing, paulgraham.com/relres.html, delian.io/lessons-5. Secondary/search-derived: NVCA 2026 Yearbook coverage via venturecapitaltracker.com, PitchBook pricing via Vendr/SlideGenius/CostBench/EasyVC aggregation, Neo Scholars figures via TechCrunch (Apr 2025) and TBPN Digest (Apr 2025).*
