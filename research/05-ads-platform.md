# 05 — Ads Platform Design, Student Ad Market, and Privacy Constraints

*Research track for a free "operating system" for college clubs (hub + chat + events + roles + payments + feed) with a Meta-style self-serve ad platform. Researched 2026-09-10. Web search budget was exhausted mid-session; items marked (†) rely on general knowledge and should be re-verified before external use.*

---

## 1. How Meta's ads stack works end to end

### 1.1 Objects and objectives
Meta's Marketing API (and Ads Manager, which is a UI on top of it) has a strict three-level hierarchy: **Campaign → Ad Set → Ad**. The campaign carries a single **objective**, which "enforces validation on any ads you add to that campaign." The ad set carries **budget, schedule, audience, placements and bid strategy** ("all ads within a set target the same people"; Meta advises "one ad set per audience" to control spend). The ad carries the **creative** (image/video/copy/link). Source: [Meta Marketing API — Campaign Structure](https://developers.facebook.com/docs/marketing-api/campaign-structure/).

Since the 2024–2025 "ODAX" simplification there are six objectives (Awareness, Traffic, Engagement, Leads, App promotion, Sales), and in 2025 Meta folded its Advantage+ Shopping / App / Leads campaigns into the standard flow so that automation ("Advantage+ on") is the default rather than a separate campaign type; legacy campaign-creation API paths were deprecated in Q1 2026 ([GregHal, 2026 Meta algorithm guide](https://greghal.no/en/blog/meta-ads-algorithm-2026-complete-guide/)). (†)

### 1.2 Audiences
- **Core audiences**: location, age, gender, language, detailed targeting (interests, behaviors, demographics), connections.
- **Custom audiences**: advertiser first-party lists (hashed emails/phones), website visitors (Pixel), app users (SDK), engagement audiences (people who interacted with a Page/IG/video/lead form).
- **Lookalikes**: 1–10% similarity expansions seeded from a custom audience.
- **Advantage+ audience**: advertiser inputs become *suggestions*; delivery is allowed to go broad. Third-party explainers converge on the same conclusion: after the "Andromeda" retrieval upgrade, "your creative is your targeting" and interest/lookalike targeting matters much less ([LucidMedia](https://www.lucidmedia.co.nz/blog/meta-ads-algorithm-explained-2026/)).

### 1.3 The auction
Meta's own explainer describes the mechanism: for each eligible impression it "gathers ads that include a person in an advertiser's chosen audience," computes an **advertiser value = bid × estimated action rate**, adds an **ad quality score** ("feedback of people viewing or hiding the ad" plus penalties for excessive text, sensationalism, engagement bait), and the highest **total value** wins. "Ads with lower bids often win if our system predicts a person is more likely to respond to them, or finds that they're higher quality." ([Meta for Business — how machine learning delivers ads](https://www.facebook.com/business/news/good-questions-real-answers-how-does-facebook-use-machine-learning-to-deliver-ads)). Practitioner explainers write it as:

> Total value = (Bid × Estimated Action Rate) + Ad Quality/Relevance ([Dotidot](https://www.dotidot.io/post/meta-ads-auction-how-facebook-decides-which-ads-win), [RocketShip HQ](https://www.rocketshiphq.com/how-meta-ad-auction-works/))

with EAR for conversion campaigns decomposed as estimated CTR × estimated click-to-conversion rate ([LucidMedia](https://www.lucidmedia.co.nz/blog/meta-ads-algorithm-explained-2026/)). Winner pricing is a generalized second-price variant: the winner pays the minimum needed to beat the runner-up's total value, not its own bid (†).

**Bid strategies**: lowest cost (default; system bids to spend the budget), cost cap, bid cap, ROAS goal. **Learning phase**: an ad set needs ~50 optimization events in 7 days to exit learning; a practical minimum daily budget is `(target CPA × 50) / 7` ([GregHal](https://greghal.no/en/blog/meta-ads-algorithm-2026-complete-guide/)).

### 1.4 Pacing and budget optimization
Pacing spreads a daily or lifetime budget across the day/flight so the advertiser does not exhaust budget in the morning; Meta's pacer effectively scales the bid up/down over the day to hit the budget (†). **Advantage+ campaign budget** (formerly CBO) sets budget at the campaign level and lets the system shift spend between ad sets toward the cheapest results.

### 1.5 Measurement: Pixel, Conversions API, attribution
- The **Meta Pixel** (browser) and **Conversions API** (server) both send events; server events "are processed like events sent using the Meta Pixel," help "decrease cost per result," and enable offline-event attribution ([Meta CAPI docs](https://developers.facebook.com/docs/marketing-api/conversions-api/)).
- **Deduplication**: Pixel `eventID` must match CAPI `event_id` and `event` must match `event_name`; Meta keeps the first-received event and only dedupes within **48 hours** ([Meta dedup docs](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/)).
- **Attribution windows**: the default attribution setting is 7-day click / 1-day view, with 1-day click and (for some objectives) 28-day click options; post-iOS 14.5 reported attribution "underestimates true performance by 20–40%," so incrementality tools are standard ([GregHal](https://greghal.no/en/blog/meta-ads-algorithm-2026-complete-guide/)). (†)

### 1.6 Ad review, brand safety, frequency
- **Review**: automated review before an ad goes live, "typically within 24 hours," covering "images, video, text and targeting information, as well as an ad's associated landing page," with re-review after launch and appeals in Account Quality. Restricted categories: alcohol ads "may not be targeted to people under 18," online gambling "only allowed with our prior written permission," dating requires permission, weight-loss/cosmetics 18+. Targeting rules forbid "wrongfully" targeting or excluding groups ([Meta Advertising Standards](https://transparency.meta.com/policies/ad-standards/)).
- **Brand safety**: inventory filters (expanded/moderate/limited) and block lists for in-stream/Audience Network placements (†).
- **Frequency**: no hard cap in auction buying; Reach & Frequency buying allows an explicit cap (e.g., 2 per 7 days) (†).

### 1.7 Delivery ML and the two-stage / multi-stage funnel
Meta's engineering blog now describes ads ranking as a multi-stage pipeline fed by a foundation model:
- **GEM (Generative Ads Model)**, an "LLM-scale" model trained on "thousands of GPUs" that transfers knowledge to "hundreds of user-facing vertical models"; it produced "a 5% increase in ad conversions on Instagram and a 3% increase … on Facebook Feed" and is explicitly headed toward "a unified engagement model that can intelligently rank both organic content and ads" ([Meta Engineering, Nov 2025](https://engineering.fb.com/2025/11/10/ml-applications/metas-generative-ads-model-gem-the-central-brain-accelerating-ads-recommendation-ai-innovation/)).
- A **two-stage user-sequence architecture**: an offline user model that caches embeddings from thousands of behavioral events, and an online ranking model that combines them with real-time ad signals under millisecond latency; it lifted conversions 6% on Instagram and 3% on Facebook ([Meta Engineering, Aug 2026](https://engineering.fb.com/2026/08/05/ml-applications/from-user-sequences-to-scaling-laws-a-multi-stage-architecture-for-metas-ads-ranking/)).
- Third-party synthesis of Meta talks: **Andromeda** (retrieval) narrows "millions of eligible ads to approximately 1,000–1,500 candidates per impression," **Lattice** unifies hundreds of ranking models into one (≈12% ad-quality lift), and **UTIS** (User True Interest Survey) calibrates ranking to daily 1–5 relevance surveys because behavioral signals reach only "48.3% precision in identifying true user interests" ([GregHal](https://greghal.no/en/blog/meta-ads-algorithm-2026-complete-guide/); [LucidMedia](https://www.lucidmedia.co.nz/blog/meta-ads-algorithm-explained-2026/)).

**Lesson for a club OS**: the modern stack is (1) candidate retrieval by eligibility + targeting, (2) lightweight scoring, (3) heavy scoring of pCTR/pCVR, (4) an auction on `bid × p(action) + quality`, (5) a blender that decides *whether* an ad slot is worth taking at all. Only (1), (4) and (5) are needed in a v1.

---

## 2. TikTok, Snapchat and Reddit — how they differ

| Platform | Self-serve minimum | Targeting most relevant to "club targeting" | Young-audience notes | Typical CPM (2025–26) |
|---|---|---|---|---|
| **Meta** | ~$1/day (effectively $5–$10 for delivery) | Interests, custom/lookalike, Advantage+ broad | Under-18: **age + location only** since Feb 2023; no gender/interest/activity targeting ([Search Engine Land](https://searchengineland.com/meta-introduces-new-ad-targeting-limits-for-teens-391259), [Lewis Silkin](https://www.lewissilkin.com/insights/2023/01/23/new-year-new-restrictions-on-advertisers-access-to-teenagers-data-on-facebook-102i5cg)) | Avg $11.82 (2025) → $13.48–$14.19 (2026); food & beverage median $2.82; retail $15.72 ([Adamigo](https://www.adamigo.ai/blog/meta-ads-cpm-benchmarks-by-industry-2026), [Digital Applied](https://www.digitalapplied.com/blog/facebook-ads-benchmarks-2026-cpc-cpm-ctr-industry)) |
| **TikTok** | $50 campaign / $20 ad-group per day | Interest & behavior (video/creator interactions), hashtags, custom/lookalike | 18–24 is the most contested demo; costs at the high end of range | $4.20–$9.00 (planning range $4–$13) ([Stackmatix](https://www.stackmatix.com/blog/tiktok-ads-cost-2026-pricing-breakdown), [AdManage](https://admanage.ai/blog/tiktok-ads-cost)) |
| **Snapchat** | **$5/day per ad set** — lowest of majors | 100+ "Lifestyle" categories from in-app behavior; ZIP-level location; custom (50–70% US match) & lookalike 1/5/10% | Reaches **90% of US 13–24**; ~60% of users are 13–24; age targetable from 13 in one-year increments ([Coinis](https://coinis.com/glossary/snapchat-ads), [Stackmatix](https://www.stackmatix.com/blog/snapchat-ads-cost)) | $2.95–$8 broad; $8–$13 in 2025 windows; CPC $0.20–$0.80 |
| **Reddit** | **$5/day, $25 lifetime** | **Community (subreddit) targeting** — pick 10–15 named communities; plus interests, keywords, custom | Skews 18–34 | CPM ≈ $3–$8, CPC ≈ $0.30–$1.00 ([Stackmatix Reddit minimums](https://www.stackmatix.com/blog/reddit-ads-minimum-budget-requirements-2026), [Recho](https://recho.co/blog/how-much-do-reddit-ads-cost-in-2026)) |

Reddit's community targeting is the closest analog to targeting by club: the advertiser names the *groups* (r/UCLA, r/premed, r/climbing) instead of inferred interests. It works because communities are self-declared, stable and semantically clean — exactly what club membership gives you. Snap shows the pricing floor a youth-heavy audience commands ($3–8 CPM broad) and the operational floor ($5/day) local businesses will tolerate.

---

## 3. The student ad market

### 3.1 Student spending
- Refuel Agency's College Explorer: **44 million college consumers** with **$347 billion** in annual discretionary spending. Top categories: **groceries/food $78.3B**, automotive $57.3B, smartphones & plans $29.7B, clothing & shoes $28.5B, **dining out $25B**. 84% pay for their own clothing, 75% their own food and drink, 74% their own electronics ([Refuel College Explorer](https://www.refuelagency.com/college-explorer/); [Refuel spending habits](https://www.refuelagency.com/blog/college/spending-habits-of-college-students/)).
- Older benchmark widely quoted by campus media: 22 million students, $400B+ buying power; 76% read their campus paper monthly and 73% "look at the ads" ([The College VOICE rate page](https://www.mcccvoice.org/adrates/)).

### 3.2 Who sells to students today
| Player | Model | Scale / price points |
|---|---|---|
| **Fizz** (anonymous campus app) | Native top-of-feed ad, direct buys only, **school-level targeting only**, tested one-advertiser-per-day takeovers; pricing "not yet defined"; no sales team | 700+ campuses, users doubled fall 2024→2025; CTR **4–18% among unique users** vs 0.5–2% on TikTok/Meta; a dating app saw 11.5% CTR and App Store rank ~200→40 in one day; advertisers: Perplexity, Quizlet, a delivery company (25% conversion vs 1% on Meta), betting, dating, job platforms ([MediaPost](https://www.mediapost.com/publications/article/405653/the-fizz-ad-biz-a-conversation-with-teddy-solomon.html), [AdExchanger](https://www.adexchanger.com/marketers/new-social-media-platform-fizz-gives-brands-a-crash-course-in-marketing-to-college-students/)). Raised $41.5M; marketplace launched 2024 with 50K listings on 240 campuses ([TechCrunch](https://techcrunch.com/2024/07/03/fizz-the-anonymous-gen-z-social-app-adds-a-marketplace-for-college-students/)). |
| **Student Beans** | Verification + discount marketplace + campaigns; brands pay per plan/CPA | "175 million verified students across 100 countries," "$1.5bn worth of sales per year," 1,000+ brands incl. Amazon Prime Student ([Student Beans partners](https://partner.studentbeans.com/)) |
| **UNiDAYS** | Verified-student ID + perk marketplace, "low cost customer acquisition" for brands | 29M members, 115 markets, 7M app users, 800+ brands, "1 in 3 students" in US/UK ([UNiDAYS corporate](https://corporate.myunidays.com/)) |
| **SheerID** (verification API) | Gates Spotify/Amazon-style student offers; Spotify Premium Student requires SheerID re-verification every 12 months for up to 4 years ([Spotify support](https://support.spotify.com/us/article/premium-student/)) | — |
| **Riddle & Bloom → NEXT GEN·TEAM** | Campus ambassador programs, sampling/tabling, student creators | Ambassador stipends "$100–$270 weekly," 5–15 hrs/week, 4–12 week programs; clients Amazon Prime Student, HBO Max, Microsoft, Hulu, Xfinity, Jimmy John's, Zipcar, LaCroix ([NEXT GEN·TEAM](http://nextgen.team/)) |
| **Campus newspapers** | Flat-rate display; local restaurants, apartments, bars | NCCU Campus Echo 300×250 web box: **$50 / 2 weeks, $100 / month, $250 / semester, $475 / year** ([Campus Echo](https://campusecho.com/printonline-advertising-dates-rates-sizes/)); USC Daily Trojan publishes a 2025–26 rate card ([PDF](https://dailytrojan.com/wp-content/uploads/2025/12/Rate-Card-2025-26-SPRING-UPDATEs.pdf)) |

How Amazon and Spotify acquire students: a deep discount (6-month free Prime trial then ~50% off; Spotify Premium Student bundled with Hulu) gated by third-party verification (SheerID / Student Beans / UNiDAYS), amplified by paid ambassador programs run through agencies like NEXT GEN·TEAM. The pattern is **perk + verification + peer distribution**, not banner ads — a strong hint for the club OS.

### 3.3 Local businesses near campus
Small-business marketing budgets typically run 5–10% of revenue, restaurants 3–6% (†). A campus-adjacent bar, pizza place, gym, tutoring center, phone store, credit union, or student-housing complex spends $200–$2,000/month on digital, mostly Meta and Google, with essentially no way to buy "students in the pre-med club" or "members of clubs meeting on Thursday nights." Nextdoor, the closest analog, reports sponsored-post CPCs of roughly $0.50–$2.00 and Local Deals with setup fees plus 5–15% redemption commissions ([SimiCart analysis](https://simicart.com/blog/how-does-nextdoor-make-money/), unofficial).

### 3.4 CPM/CPC benchmarks for 18–24 (2025–26)
No source publishes an official 18–24 CPM. Triangulating: Meta all-industry avg $11.82 (2025) → ~$13.5–14.2 (2026), CPC $0.70→$0.78, with 18–24 targeting often *cheaper* per impression because Meta's youngest cohort is less contested on Facebook but pricier on Instagram Reels; TikTok $4–$13; Snap $3–$13; Reddit $3–$8. A realistic **blended youth CPM of $5–$10** for direct-response and **$15–$30 for guaranteed, school-targeted native placements** (Fizz-style takeovers) is the planning range.

---

## 4. Clubs as economic actors

| Evidence | Numbers | Source |
|---|---|---|
| **SGA allocations** — Northeastern FY25 | 222 requests totaling **$6.8M**; **$4.026M approved to 204 orgs**; average **$19,733**, median **$5,855**; funded by a **$174/semester** activity fee ($4.5M pool) | [Huntington News](https://huntnewsnu.com/81863/campus/sga-publishes-club-budget-reports-for-the-first-time-in-years-allocates-4-million-to-student-organizations/) |
| Auburn FY25 | **~$2.5M** student activity budget; University Program Council $832K, Student Media $221K, International Student Org $114K | [Auburn Plainsman](https://www.theplainsman.com/article/2024/09/student-government-association-approves-2024-2025-student-budget) |
| Ohio State | fixed **$1.41M** of activity-fee revenue for student org resources and Signature Funding | [OSU Student Activities](https://activities.osu.edu/about/student-activity-fee/) |
| GW (spring 2026) | $279,500 general allocations for one semester | [GW Hatchet](https://gwhatchet.com/2025/12/08/sga-passes-spring-student-organization-funding-finalizing-return-to-old-budget-model/) |
| **Greek life dues** | $500–$3,000 per semester typical; WVU $200–$800/semester; U. Arizona active fees $125–$360/semester; chapter housing $5,000–$8,000/semester (URI); all-in $5–10K/year common | [Credible](https://www.credible.com/student-loans/greek-life), [US News](https://www.usnews.com/education/best-colleges/paying-for-college/articles/joining-a-sorority-or-fraternity-comes-with-a-cost) |
| **Club sports** | American U.: ice hockey $700 new-member dues/semester, equestrian $450/semester; university allocations $5K–$15K per team; clubs must raise ≥50% of expenses via dues + fundraising; Berkeley dues "$20 per semester to over $5,000 per year"; Towson $0–$1,000/yr | [The Eagle (AU)](https://www.theeagleonline.com/article/2024/12/the-ins-and-outs-of-american-university-club-sports-funding-and-dues), [UC Berkeley RecWell](https://recwell.berkeley.edu/programs-events/sport-clubs/join-a-club-team), [Towson](https://www.towson.edu/studentlife/activities/recreation/campusrec/sports/clubs/faq.html) |
| **Ticketing/food** | SGA budgets are overwhelmingly spent on events, food, travel, and merch; Northeastern's median club ($5.9K) is a "pizza-and-speakers" org, its mean ($19.7K) is pulled up by performing arts, competition teams, and cultural orgs | inferred from the Northeastern report |

Rough scaling: a 20,000-student campus with a $150–$200/semester activity fee generates **$6–8M/year** in fee revenue, of which **$1.5–4M** typically flows to student orgs, plus dues (Greek life alone at a 20%-Greek campus is $4,000 students × ~$1,500/yr ≈ **$6M**), club-sport dues, ticket sales and merch. Total money *moving through clubs* on a large campus plausibly exceeds **$10–15M/year**, most of it via Venmo, GroupMe polls, Google Forms and spreadsheets. Payments and sponsorship are therefore at least as large an opportunity as ads.

---

## 5. Ad products that fit a club OS — and how others monetize without feeling gross

### 5.1 Comparable monetization models
| Product | How it makes money | Does it alienate free users? |
|---|---|---|
| **Nextdoor** | ~All revenue from ads; 2025 revenue **$257.6M**, ARPU **$11.94** per WAU (Q4: $3.31), 21.0M WAU, 340k+ neighborhoods, 4.1M claimed business pages; self-serve ≈60% of revenue; formats: sponsored posts, local deals, business posts, lead forms, neighborhood sponsorships; targeting by neighborhood, homeownership, income, age, interests | Ads are tolerated because they are *local* — "1 in 4 neighbors consider Nextdoor ads trustworthy, 2.4x competitor average"; frequent complaints are about spammy national advertisers, not local ones ([Nextdoor 10-K](https://www.sec.gov/Archives/edgar/data/1846069/000184606926000023/kind-20251231.htm), [Nextdoor Q4 2025](https://www.sec.gov/Archives/edgar/data/1846069/000184606925000015/exhibit992-pressreleasexye.htm), [business.nextdoor.com](https://business.nextdoor.com/en-us/)) |
| **Eventbrite** | Free events are free; paid tickets **3.7% + $1.79/ticket + 2.9% processing**; Eventbrite Ads (sponsored placements in its marketplace); Pro email from $15/mo | Fees are passed to attendees; organizers accept because distribution comes with it ([Eventbrite pricing](https://www.eventbrite.com/organizer/pricing/)) |
| **Luma** | Free unlimited events; **5% platform fee** on paid tickets; Luma Plus $59/mo removes fee | Clean; no ads at all ([Luma pricing](https://luma.com/pricing)) |
| **Discord** | Nitro subscriptions + **Quests** (opt-in sponsored tasks with in-game rewards) + server boosts | Quests are opt-in, rewarded, and off-feed; the community mostly accepted them (†) |
| **Strava** | Subscriptions + sponsored challenges/segments (runs its ad server on Kevel) | Sponsored challenges feel like content because they're participatory (†) |
| **Reddit** | Ads targeted by community; Q4 2025 **US ARPU $10.79/quarter**, global $5.98; FY25 revenue $2.2B | Ads look native, are labeled, and communities can't be bought directly — the platform never lets brands post *as* the community ([Reddit Q4 2025](https://www.sec.gov/Archives/edgar/data/1713445/000171344526000020/earningspressreleaseq425.htm)) |
| **Partiful / Canva / Notion / Slack** | No ads; freemium or free (Partiful unmonetized) | n/a (†) |

### 5.2 Candidate ad products, ranked by fit
1. **Sponsored events in the feed** (a local business or brand promotes an event to students by school/club category). Native, time-bound, obviously useful. *Best v1 product.*
2. **Sponsored club perks** ("Chipotle: 20% off for members of any club on campus this week; show your club card"). Verification is native to the platform (you're already the roster of record), so this reproduces the Student Beans/UNiDAYS model with *better* verification and zero acquisition cost. Brands pay per redemption or flat monthly.
3. **Sponsorship marketplace** — brands/local businesses fund a club's event or season directly (banner at the event, logo on merch, table at the fair); the platform takes a **10–15% cut** and handles payment, contract and proof-of-performance (photos, attendance). This is the "non-gross" money: the club gets paid, the brand gets real-world presence, students see a sponsor logo rather than a targeted ad.
4. **Employer-sponsored posts by club category** ("Deloitte is hosting a case workshop — targeted to consulting, finance, and business fraternity members"). High CPM ($30–$60 equivalent), low volume, seasonal (Sept–Nov, Jan–Feb).
5. **Local deals near events** ("You RSVP'd to the 7pm show; Insomnia Cookies is 2 min away, 15% off with this code until midnight"). Contextual rather than behavioral; can be run with zero user profiling.
6. **Sponsored polls / surveys** (brand pays for a poll in the feed). Cheap to build, but risks feeling like market research spam; keep for later.
7. **Club-run campaigns** (a club pays $10–$50 to boost a recruitment post or event to non-members by interest/year). Useful, but clubs are cash-poor and SGA rules may forbid spending fee money on ads; make the first N boosts free and let *SGA or the university* buy campus-wide reach for orientation, elections, wellness.

**Verdict:** sponsorship marketplace + sponsored events + verified perks is the trio that makes money without turning the feed into Instagram. Pure programmatic display should be a last resort and never appear inside club chat, rosters, or payment flows.

---

## 6. Privacy and legal constraints

### 6.1 FERPA
- FERPA covers **education records** maintained by the institution or a party acting for it. A student-run club app that students join on their own is generally *not* covered: "When students independently sign up for apps or services outside school channels, FERPA generally does not apply unless the school has enrolled them or provided their records to the vendor as a school official" ([ED Vendor FAQ](https://studentprivacy.ed.gov/sites/default/files/resource_document/file/Vendor%20FAQ.pdf)).
- If a university **adopts** the platform (SSO, roster feeds, SGA finance integration), the vendor becomes a **"school official"** and must be under the school's **direct control**, use records only for authorized purposes, not re-disclose, and — critically — **may not use education records "to market products or services to students" or target ads** ([ED Vendor FAQ](https://studentprivacy.ed.gov/sites/default/files/resource_document/file/Vendor%20FAQ.pdf); [FERPA exceptions summary](https://studentprivacy.ed.gov/sites/default/files/resource_document/file/FERPA%20Exceptions_HANDOUT_portrait_0.pdf)).
- **Directory information** (name, email, major, "participation in officially recognized activities and sports," dates of attendance) may be disclosed without consent *if* the school gives notice and honors opt-outs, per 34 CFR §99.3/§99.37 ([ED Directory Information](https://studentprivacy.ed.gov/content/directory-information)). Club membership of a *registered* org is directory-class data at most schools — but the safe design is to never depend on the school for it.
- **Design rule:** keep two data planes. Anything received *from* a university under contract is FERPA-restricted and walled off from ads entirely; ad targeting uses only data the student gave the platform directly under its own privacy policy.

### 6.2 COPPA and minors
COPPA applies under 13 and is irrelevant except that you must not knowingly collect from under-13s. The real issue is **17-year-old freshmen** (roughly 5–10% of a fall entering class for the first semester †). Meta's precedent: under-18s can be targeted only by **age and location** ([Search Engine Land](https://searchengineland.com/meta-introduces-new-ad-targeting-limits-for-teens-391259)). Snap and TikTok removed interest targeting for under-18s similarly (†).

### 6.3 State privacy laws
- **CCPA/CPRA** applies at ≥$26.625M revenue, or ≥100,000 California consumers' PI, or ≥50% revenue from selling/sharing PI; grants opt-out of "sale" and "sharing for cross-context behavioral advertising," and requires honoring Global Privacy Control ([CPPA FAQ](https://cppa.ca.gov/faq.html)). Selling/sharing PI of consumers **under 16 requires opt-in** (statute §1798.120(c)) (†). A 100K-user California footprint is a plausible Year-2 milestone, so build for it now.
- Colorado, Connecticut, Virginia, Oregon, Texas, Maryland and ~15 other states have comprehensive laws with **opt-out of targeted advertising**; since 2024–2025 Connecticut (SB 3), Colorado (SB 24-041), Maryland (Kids Code) and others **require opt-in consent or prohibit targeted advertising to consumers the controller knows are under 18** (†). Many state student-privacy laws (SOPIPA-style) apply to K-12 operators only, not higher ed (†).
- **Practical baseline:** treat every under-18 account as "age + school only"; provide a global "Don't personalize ads" toggle honored in-app and via GPC; no data sale; no third-party pixels on student surfaces.

### 6.4 University rules
- **Trademarks/branding:** universities license their marks; a club app can display a club's own name and logo but must not imply university endorsement or use wordmarks/mascots in ads without a license; most schools run trademark licensing offices (†).
- **Commercial solicitation:** campuses regulate who can sell or advertise to students on university property and via university channels (e.g., UT Austin's Institutional Rules appendix on speech, expression and solicitation) ([UT Austin catalog](https://catalog.utexas.edu/general-information/appendices/appendix-c/speech-expression-and-assembly/)). A privately-run app is off-campus speech, but the moment the university sponsors or SSO-integrates it, its solicitation policy applies — which is why a **school-blessed tier should have an ad-free or ads-off-by-default configuration**.
- **Student elections:** SGA election codes typically cap campaign spending (often $100–$1,500) and require disclosure; paid promotion in the app could count as spend or violate rules on using non-university media (†). Do not sell election ads; offer free, equal-exposure candidate pages instead.

### 6.5 Alcohol, gambling, and other restricted categories
- **Alcohol:** industry codes (Beer Institute, DISCUS, Wine Institute) require placements where **at least 73.8% of the audience is 21+**, which a college feed cannot certify ([Beer Institute Advertising & Marketing Code](https://www.beerinstitute.org/responsibility/advertising-marketing-code/)) (†). Meta bars alcohol ads to under-18s ([Meta Ad Standards](https://transparency.meta.com/policies/ad-standards/)); most universities bar alcohol ads in student media. **Ban alcohol brand ads entirely; allow venue ads (a bar's trivia night) only with 21+ age-gating and no drink specials.**
- **Sports betting:** nine states (CT, DE, IL, IA, ME, MA, SD, WA, WI) ban bets on in-state college teams; LA, MD, OH, VT banned college player props; the NCAA "actively and aggressively advocates" prop-bet bans and keeps sportsbook ads out of its championships; the AGA code bars sportsbook–college partnerships ([NCAA sports betting protections](https://www.ncaa.org/sports-betting-protections/), [Journalist's Resource](https://journalistsresource.org/education/sports-betting-on-campus/), [NCAA prop-bet advocacy](https://www.ncaa.org/news/2026/1/15/media-center-ncaa-urges-gambling-commissions-to-eliminate-prop-bets.aspx)). Note Fizz *does* take betting advertisers ([MediaPost](https://www.mediapost.com/publications/article/405653/the-fizz-ad-biz-a-conversation-with-teddy-solomon.html)) — a reputational risk to avoid. **Prohibit gambling, vaping, payday/BNPL, crypto, and "study drug" categories outright.**

### 6.6 Consent and opt-out design
1. Age at signup (self-declared + .edu verification); under-18 → contextual ads only.
2. Ad personalization toggle default ON for 18+, OFF for under-18, honored via GPC.
3. Per-ad "Why am I seeing this?" listing the exact dimensions used (school, club category, year) — Meta-style transparency.
4. Club-level opt-out: a club president can turn off "target my members by club" (the club is the community owner, like a subreddit mod).
5. No lookalikes seeded from club rosters; no export of user-level data to advertisers; reporting only in cohorts ≥100.

---

## 7. Ad-tech architecture for a small team

### 7.1 Build vs. buy
| Option | Cost | Fit |
|---|---|---|
| **Kevel** (APIs for custom ad servers; customers Ticketmaster, Yelp, Strava, Mozilla) | plans from ~$3K/month, request-volume priced ([Capterra](https://www.capterra.com/p/170897/Kevel/), [Kevel blog](https://www.kevel.com/blog/open-source-ad-server)) | Good once revenue >$100K/yr; overkill pre-revenue |
| **Revive Adserver** (open source, ex-OpenX) | free, self-hosted; PHP; 2020 supply-chain malware incident hit "at least sixty publishers" ([Kevel](https://www.kevel.com/blog/open-source-ad-server)) | Built for display banners, not native feed/auction; not recommended |
| **Moloco Commerce Media / Promoted.ai** | managed, typically rev-share; ML ranking for marketplaces | Consider at 1M+ MAU; too heavy now (†) |
| **Build minimal** | 1–2 engineers, 6–8 weeks | Right answer for v1: the inventory is *your* feed, the targeting keys are *your* first-party graph |

### 7.2 Minimal viable ad server
- **Inventory**: named slots (`feed_slot_3`, `event_list_top`, `perks_tab`, `event_detail_nearby`). Each slot has an ad-load rule (e.g., max 1 per 8 feed items, ≤2 per session).
- **Objects**: mirror Meta — `advertiser`, `campaign(objective, budget, flight)`, `ad_group(targeting, bid, pacing)`, `creative(format, assets, landing)`. Objectives: reach, event RSVPs, perk redemptions, link clicks.
- **Targeting keys** (all first-party): school, campus geo, class year, club category (from a controlled taxonomy of ~40), specific club (only if club opts in), event RSVP context, time-of-day. No inferred interests in v1.
- **Auction**: for each eligible impression, score = `bid × p(action)`; p(action) starts as a Bayesian smoothed CTR per (creative × slot × school) with a global prior; add a quality multiplier from hide/report rates. Pay second price + $0.01 per click or per 1,000 impressions.
- **Pacing**: classic budget pacer — target spend curve proportional to expected traffic by hour; throttle participation probability when ahead of curve.
- **Billing**: Stripe; prepaid credits for local businesses (avoid collections); invoice for brands.
- **Reporting**: impressions, clicks, RSVPs, redemptions, spend, by day and school; cohort-only.
- **Review**: category blocklist + keyword/image checks + human review queue (<24h SLA, same posture as Meta).

### 7.3 Blending ads into an organic recommender
The organic ranker scores each candidate item by predicted value to the student (e.g., `p(open) + 3·p(RSVP) + 5·p(join)`), and the ad candidate carries an *ad value* = expected revenue × λ plus its own user-value estimate. Insert an ad in a slot only when `ad_user_value + λ·revenue ≥ organic_value_at_that_slot − ε` and the ad-load cap is not hit. λ is the single knob trading revenue for engagement; ε protects the top of the feed. This is precisely the "integrated auction and allocation" problem studied by e-commerce feed teams — joint mechanisms that consider display-position externalities and stay incentive compatible ([Deep Automated Mechanism Design for Integrating Ad Auction and Allocation in Feed](https://arxiv.org/abs/2401.01656); [Merging Mechanisms for Ads and Organic Items](https://arxiv.org/abs/2511.22925)), and Meta's stated end-state is a single model ranking "both organic content and ads" ([Meta GEM](https://engineering.fb.com/2025/11/10/ml-applications/metas-generative-ads-model-gem-the-central-brain-accelerating-ads-recommendation-ai-innovation/)). In practice for v1: fixed slots + value threshold + hard cap beats any clever mechanism.

---

## 8. Unit economics

### 8.1 Comparables (annual revenue per user)
| Platform | Metric | Value |
|---|---|---|
| Meta, worldwide | Family ARPP FY2025 | $57.03; Q4 2025 $16.56/quarter ([StockDividendScreener](https://stockdividendscreener.com/information-technology/comparison-of-average-revenue-per-user-for-social-media-companies/), [Yahoo Finance](https://finance.yahoo.com/news/meta-platforms-meta-q4-earnings-230001269.html)) |
| Meta, US & Canada | Facebook ARPU, last reported FY2023 | $226.93; US&C ad revenue $25.64B in Q4 2025 alone |
| Snap, North America | ARPU FY2025 | $36.82 (global $12.61) |
| Pinterest, US & Canada | ARPU FY2025 | $30.84 |
| Reddit, US | ARPU Q4 2025 | $10.79/quarter (≈$35–43 annualized) ([Reddit Q4 2025](https://www.sec.gov/Archives/edgar/data/1713445/000171344526000020/earningspressreleaseq425.htm)) |
| Nextdoor | ARPU per WAU FY2025 | $11.94 ([Nextdoor](https://www.sec.gov/Archives/edgar/data/1846069/000184606925000135/exhibit992-pressreleasexq3.htm)) |
| Fizz | undisclosed | school-level sold-out takeovers; no public rate |

### 8.2 Ad revenue per student per year (ARPU model)
Assumptions: a monthly-active student opens the app ~12 days/month (club chat, events), ~1.5 feed sessions per active day, ~12 items per feed session.

| Ad load | Impressions / MAU / month | CPM $4 (Snap-like DR) | CPM $10 (Meta-like) | CPM $25 (guaranteed school-targeted native) |
|---|---|---|---|---|
| Light (1 in 12 items, ≤1/session) | 18 | $0.86/yr | $2.16/yr | $5.40/yr |
| Medium (1 in 8, ≤2/session) | 36 | $1.73 | $4.32 | $10.80 |
| Nextdoor-like (1 in 5, ≤3/session) | 54 | $2.59 | $6.48 | $16.20 |
| Heavy/Instagram-like (1 in 4, plus stories) | 120 | $5.76 | $14.40 | $36.00 |

Add non-ad take: payments on dues/tickets (net 1–1.5% after processing on, say, $150/student/yr flowing through ≈ **$1.50–$2.25**) and sponsorship marketplace (10–15% of, say, $10–$20 of sponsorship dollars per student ≈ **$1–$3**).

**Realistic path:** Year 1–2 blended **$3–6 ARPU** (light-to-medium load, mostly $15–25 CPM sponsored events/perks sold direct to local businesses, few impressions), rising to **$10–15** at scale as self-serve local demand fills inventory and marketplace/payments layer in. That lands between Nextdoor ($11.94) and Pinterest/Snap NA ($31–37), which is the right neighborhood for a local-first, low-ad-load community product. On a 20,000-student campus at 50% MAU, that is **$30–60K/year per campus early** and **$100–150K at maturity** — comparable to what a healthy campus newspaper grossed at its peak, and enough to make each campus contribution-margin positive at ~$1/MAU/yr infrastructure cost.

Supply check: a campus with ~200 student-facing local businesses spending $200–$1,000/month on digital represents **$0.5–2.4M/year** of addressable local spend; capturing 10–15% yields $50–360K, consistent with the model above.

---

## Ads product implications (opinionated takeaways)

1. **Ship a sponsorship marketplace before an ad server.** Brands and local businesses paying clubs directly (platform takes 10–15%) is the only monetization that makes clubs *richer*; it aligns incentives, needs no user profiling, and gives sales a warm intro to every local business the clubs already work with.
2. **v1 ad product = Sponsored Events + Sponsored Perks, sold direct, school-targeted, at flat weekly rates.** Copy Fizz's proof (4–18% CTR from school-level targeting alone) and its constraint (no user-level targeting). Price like a campus newspaper: $150–$500/week per campus slot, $25–$60 effective CPM, one sponsor per slot per day.
3. **Targeting dimensions v1: school, class year, club *category* (taxonomy of ~40), event context, campus geo-radius.** Add specific-club targeting only when the club opts in (the "subreddit mod" model borrowed from Reddit). Never build inferred interests or lookalikes off rosters.
4. **Ad load ceiling: 1 ad per 8 feed items, ≤2 per session, zero ads in chat, rosters, payments, and event pages the user already RSVP'd to.** Enforce it in the blender as a hard cap, not a λ tuning.
5. **Blend with a value threshold, not a fixed slot.** Show an ad only when `user_value(ad) + λ·revenue` clears the organic item it displaces; start with fixed positions and a hard cap, and let λ be your only revenue knob.
6. **Self-serve for local businesses, Reddit/Snap-style $5/day minimum, prepaid credits.** Structure objects exactly like Meta (campaign → ad group → creative) so any agency intern can run it and so a future Marketing-API-style integration is trivial.
7. **Under-18 accounts get contextual-only ads (age + school), full stop.** It's Meta's rule since 2023, it's where state law is going, and a "17-year-old freshman" leak is the fastest way to a headline.
8. **Two data planes: university-sourced (FERPA/school-official) data never touches ads.** If a school integrates, ads are off by default for that tenant unless the school turns them on; this also satisfies campus commercial-solicitation policies.
9. **Category bans: alcohol brands, gambling/sportsbooks, vaping/nicotine, crypto, payday/BNPL, nootropics, essay mills.** Bars and venues allowed only with 21+ gating and no drink specials. Fizz takes betting money; be the platform that visibly doesn't.
10. **Verification is the moat, not the feed.** You are the roster of record — a "member of X club at Y school" perk is more verifiable than a Student Beans/UNiDAYS code. Sell *perks with redemption tracking* (CPA or flat) before selling impressions.
11. **Employer campaigns are the high-CPM seasonal cash (Sept–Nov, Jan–Feb).** Target by club category (consulting, engineering, pre-law), charge $30–60 effective CPM or per-RSVP, and cap employers to a dedicated "Careers" slot so they never crowd out student content.
12. **Club-initiated boosts should be free-first.** Give every club N free boosts per semester (recruitment fair season), and sell campus-wide reach to SGA/university units (orientation, elections, wellness) rather than to cash-poor clubs; never sell election ads.
13. **Privacy UX: "Why this ad" on every unit, personalization toggle honored via GPC, cohort-only reporting (≥100), no third-party pixels, no data sale.** Design for CCPA thresholds from day one — 100K California users is a Year-2 milestone.
14. **ARPU plan: $3–6 in years 1–2, $10–15 at maturity** (ads + payments take + marketplace cut), i.e., Nextdoor-to-Pinterest territory, at 20–30% of Instagram's ad load. Don't underwrite the business on Meta-like $200 US ARPU; underwrite it on Nextdoor's $12 and on being the payment rail for the $10M+ that moves through clubs on a large campus each year.
15. **Build minimal, buy later.** A slot-based server with first-party targeting, a smoothed-CTR auction, a pacer, Stripe billing and a review queue is a 6–8 week job for two engineers; graduate to Kevel (~$3K/mo) or a managed rev-share partner only when ad revenue clears ~$100K/yr.
