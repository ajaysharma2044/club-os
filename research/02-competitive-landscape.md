# 02 — Competitive Landscape: Student Organization / Club Management Software

*Research date: 2026-09-10. Scope: institutional engagement platforms, the consumer tools clubs actually run on, startup entrants (alive and dead), adjacent community/alumni platforms, Greek-life finance software, general nonprofit membership tools, K-12 feeder tools, a feature matrix, and the white space.*

---

## 0. Executive framing

The "student org software" market is really two markets that barely touch:

1. **The compliance market** — $15K–$150K+/yr platforms sold to Student Affairs offices so the *university* can register orgs, approve events, book rooms, allocate SGA money, and report "engagement" numbers. Students are forced through them two or three times a year and otherwise ignore them. ([Vistingo pricing survey](https://vistingo.com/student-engagement-platforms/))
2. **The actual operating market** — a free, duct-taped stack of GroupMe/Discord/Slack + Instagram/Linktree + Google Forms/Sheets/Drive + When2Meet + Venmo/Zelle + Partiful/Luma that students choose themselves and that no one owns end-to-end.

The incumbents in market 1 have just gone through a brutal consolidation: the category creator (OrgSync → Campus Labs → Anthology Engage) was sold out of Chapter 11 in late 2025 as part of a $50M package, CampusGroups was rolled into PE-backed Ready Education, Presence was absorbed by Modern Campus, and Involvio disappeared into Cisco Webex. Meanwhile the nearest thing to a "students-first" consumer play (Geneva) was bought by Bumble for $17.5M, produced zero revenue, and was shut down. Nobody has yet built the thing that sits in the middle: student-adopted, officer-operated, institution-tolerated.

---

## 1. Institutional "campus engagement platforms"

### 1.1 Anthology Engage → Encoura Engage (formerly OrgSync / CollegiateLink / Campus Labs)

**Lineage.** OrgSync (Dallas, founded 2007) was acquired by Campus Labs in **March 2016**; Campus Labs already sold CollegiateLink, and the two were merged into "Engage." Campus Labs had been bought by Edcentric (Oct 2015), then bundled by Leeds Equity and sold to Veritas Capital (Jan 2020), which merged Campus Labs + Campus Management + iModules into **Anthology on July 7, 2020**, then bolted on Blackboard in Oct 2021. ([CB Insights / Campus Labs acquisitions](https://www.cbinsights.com/company/orgsync), [EdSurge](https://www.edsurge.com/news/2020-07-07-three-edtech-companies-merge-to-create-an-anthology-of-higher-ed-tools), [Veritas](https://www.veritascapital.com/anthology-emerges-as-new-company-with-combination-of-higher-education-technology-leaders-campus-management-campus-labs-and-imodules/))

**Bankruptcy.** Anthology filed Chapter 11 on **Sept 29, 2025** (S.D. Texas). Phil Hill's numbers: FY25 revenue **$450M** (down from ~$530M in FY23, ~8%/yr decline), **$1.7B funded debt**, **$185M/yr cash interest = 41% of revenue**, FY25 EBITDA **$4M**. The Lifecycle Engagement + Student Success business (which includes Engage, plus the CRM, Encompass/iModules alumni, Beacon) went to **Encoura as stalking-horse for $50M**; SIS/ERP went to **Ellucian for $70M**. Sales closed Dec 31 2025 / Jan 31 2026; Blackboard emerged Feb 27 2026 with ~$1.6B of debt wiped. ([Phil Hill — Anthology by the numbers](https://onedtech.philhillaa.com/p/anthologys-chapter-11-bankruptcy-by-the-numbers), [Davis Polk](https://www.davispolk.com/experience/anthology-chapter-11-restructuring), [EdWeek Market Brief](https://marketbrief.edweek.org/financing-investment/blackboards-parent-company-anthology-files-for-bankruptcy/2025/10), [Encoura press room](https://www.encoura.org/resources/press-room/encoura-anthology-bid/))

Read that again: the *entire* student-engagement + CRM + alumni line of the category leader was worth **$50M** to a buyer in a distressed sale. That is the market's own valuation of "the Engage business."

**Product today.** Encoura's Engage page pitches org management mirroring institutional structure, event RSVP, co-curricular records, "guided pathways" with badges, APIs, and analytics; it now advertises a partnership with Element451 (an admissions CRM). No pricing, no campus count on the page. ([Encoura Engage](https://www.encoura.org/student-success/engage/))

**Pricing.** Not published. Contracts are typically **five-year** terms (College of Charleston posted a *sole-source* intent-to-procure for Engage in Jan 2025, 5-year term, value undisclosed). Available through the E&I Cooperative contract ("Total Economic Benefit" of ~13.8%). ([Starbridge RFP record](https://starbridge.ai/rfp/anthology-inc-of-ny-engage-platform-sole-source), [E&I Anthology contract](https://www.eandi.org/contracts/anthology/))

**What people say.** Third-party comparisons are blunt: "the student experience layer, particularly on mobile, doesn't always match the expectations of today's students," "limited native ticketing," "web-based, limited native mobile," and the event execution layer "(ticketing, real-time check-in, attendance analytics) is thinner than what some campuses need." The same piece names the failure mode: "if the experience is clunky, they'll default to group chats and Instagram stories instead." ([iCommunify comparison](https://colleges.icommunify.com/blog/campusgroups-vs-anthology-engage-what-student-affairs-teams-should-compare)). SourceForge lists Engage with **zero** user reviews — telling for a product deployed at hundreds of campuses. ([SourceForge](https://sourceforge.net/software/product/Anthology-Engage/))

### 1.2 CampusGroups (Ready Education)

- Founded ~2010 in NYC; acquired by **Ready Education on May 16, 2022** — Ready's fourth acquisition after Collabco (UK), StuComm (NL) in July 2021 and AppScho (FR) in Dec 2021. Ready is backed by **Level Equity** (invested July 2021) and has reportedly raised ~**$162M** in total. Post-deal, Ready claims **700+ institutions, 7M students, 25 countries**. ([EDUCAUSE](https://www.educause.edu/about/corporate-participation/member-press-releases/ready-education-acquires-campusgroups), [Mergr](https://mergr.com/level-equity-management-invests-in-ready-education), [CB Insights](https://www.cbinsights.com/company/ready-education/financials))
- Product: **"30+ modules"** — clubs/groups, events, community, comms, student services, journeys/incentives, resource booking, dashboard, data, integrations; native iOS/Android; payments/e-commerce; budgeting for orgs. Customers cited: Johns Hopkins ("Hopkins Groups"), Case Western, UCI, Weill Cornell, Columbia SPS, Portland CC. ([Ready Education](https://www.readyeducation.com/campusgroups/), [JHU](https://studentaffairs.jhu.edu/leed/hopkinsgroups/), [Case Western budgeting guide](https://case.edu/studentlife/services/campusgroups/budgeting-guide))
- Pricing: custom quote only; "annual contracts with pricing tied to enrollment size." ([iCommunify](https://colleges.icommunify.com/blog/campusgroups-vs-anthology-engage-what-student-affairs-teams-should-compare))
- Reviews: Software Advice **5.0/5 on only 6 reviews** (all admins). Cons even from fans: "user experience in the browser and mobile app provided different navigation paths," "level of customization creates a learning curve," budgeting module has "a little more learning curve," minor mobile-app bugs. Lounge's competitive write-up cites "steep learning curve" and "performance issues." ([Software Advice](https://www.softwareadvice.com/event-management/campusgroups-profile/), [Lounge comparison](https://about.lounge.live/blog/top-student-engagement-platforms-how-they-compare))
- Verdict: the strongest incumbent *feature-wise* (it actually has chat, payments, budgeting, mobile), but it is an admin-configured portal; "student experience sometimes takes a back seat to the admin configuration layer."

### 1.3 Presence → Modern Campus Involve

- Founded by Reuben Pressman (St. Petersburg, FL); acquired by **Modern Campus on June 24, 2021** with **250+ institutions**; Modern Campus claims 1,400+ colleges overall and 98% retention. Renamed "Involve." ([Modern Campus press release](https://moderncampus.com/newsroom/modern-campus-acquires-presence.html))
- Capterra: **4.1/5 on 13 reviews** (8 five-star, 2 one-star). The one-stars are damning: "It takes 6–10 seconds to load each page," the site "commonly freezes up without explanation," mobile app "not as practical for students." Pros: customizable, good support, analytics. ([Capterra — Modern Campus Involve](https://www.capterra.com/p/255274/Presence/))
- Positioning: "SmartTranscript" co-curricular transcript, gamified pathways, retention analytics, org finance. No public pricing.

### 1.4 Suitable

- Pittsburgh-based, mobile-first, positioned on **co-curricular transcripts, badges/micro-credentials, NACE career-readiness assessment, guided pathways**, and a student-org module. Logos: Pitt, Florida, Miami, ASU, Penn State. No pricing; demo-gated. Small, venture-backed. ([Suitable](https://www.suitable.co/), [Suitable org management](https://www.suitable.co/products/student-organization-management))
- Lesson: Suitable sells *outcomes* (career readiness, retention) to provosts, not org management to students. Its org tools are a means to the transcript.

### 1.5 Involvio (dead as a standalone)

- Raised from Cisco Investments among others; **acquired by Cisco June 30, 2021** (undisclosed) and folded into Webex for Education. Effectively gone from the campus-engagement market. ([Crunchbase acquisition](https://www.crunchbase.com/acquisition/cisco-acquires-involvio--afcf7fbe), [Webex blog](https://blog.webex.com/video-conferencing/cisco-collab-blog-06-03-21/))

### 1.6 Symplicity (Engage / Organizations)

- Best known for CSM (career services) and Advocate (conduct); its student-affairs bundle covers org registration, events, budgeting, RSVPs, outcomes. Third-party estimates: **$10K–$20K+/yr for a mid-sized institution**, scaling with users and modules. PE-owned. ([Gitnux roundup](https://gitnux.org/best/student-organization-management-software/), [ZipDo roundup](https://zipdo.co/best/student-organization-management-software/))

### 1.7 GivePulse

- Volunteer/service-hour tracking that many campuses use alongside Engage/CampusGroups. **Free Basic plan; paid from $20/mo (annual) for small orgs; higher-ed pricing by institution size; no per-volunteer fees.** Canvas integration for service-learning courses; claims 650K+ organizations. ([GivePulse pricing](https://learn.givepulse.com/pricing), [GivePulse higher ed](https://learn.givepulse.com/higher-education), [Ohio University](https://www.ohio.edu/community-impact/givepulse))

### 1.8 Ellucian

- Not a club product. Ellucian bought Anthology's **SIS/ERP for $70M** in the bankruptcy; its relevance is as the system-of-record that engagement platforms must integrate with (roster sync, SSO). ([Phil Hill](https://onedtech.philhillaa.com/p/anthologys-chapter-11-bankruptcy-by-the-numbers))

### 1.9 "ClubHub"

- No single company: a scatter of App Store/Play Store apps, a GitHub student project, and campus-branded portals (e.g., Appalachian State's "Club Hub" is just their branded Engage). Zero market share. ([App Store — ClubHub Campus Connect](https://apps.apple.com/us/app/clubhub-campus-connect/id6760576301), [App State](https://campusactivities.appstate.edu/club-hub))

### 1.10 Newer institutional entrants

| Entrant | HQ / founded | Funding | Positioning | Notes |
|---|---|---|---|---|
| **Lounge.live** | London, 2021 | ~$4.4M (£3.2M round Nov 2023; Square Peg, Carthona) | "UX-first" Engage alternative; finance module (budgets, funding requests, reimbursements), analytics | ~9 employees; live at U. Nevada Reno; competitive blog explicitly targets Engage/CampusGroups/Involve ([PitchBook](https://pitchbook.com/profiles/company/509378-59), [UKTN](https://www.uktech.news/funding/social-media-startup-lounge-funding-20231106), [UNR](https://www.unr.edu/student-engagement/lounge)) |
| **iCommunify** | US | undisclosed | Mobile-first orgs/events/RSVP/ticketing/check-in; "pricing not gated by enrollment tiers" | Small; content-marketing against incumbents ([iCommunify](https://colleges.icommunify.com/blog/campusgroups-vs-anthology-engage-what-student-affairs-teams-should-compare)) |
| **Rubric** (hellorubric.com) | Australia/Canada | undisclosed | Sells to **student unions/guilds** (Arc UNSW, McMaster, SAIT, UOW): clubs, ticketing, grants, **elections**, room booking, tap-and-pay merch, training/compliance | Claims 2.5M students, 40+ orgs; "95% of student group activity" at partners ([Rubric](https://hellorubric.com/)) |
| **Encoura Engage + Element451** | — | (Encoura, PE-backed) | Rebundling Engage with admissions CRM | Watch for integration churn in 2026–27 ([Encoura](https://www.encoura.org/student-success/engage/)) |

### 1.11 Why students hate or ignore these platforms

Synthesizing reviews, vendor comparisons, and campus documentation:

1. **They are built for the buyer, not the user.** The buyer is a Student Activities director who needs org registration, event approval workflows, risk-management forms, room booking, and an "engagement" report for the VP. Every incumbent optimizes admin configuration; the student view is a by-product. ("Student experience sometimes takes a back seat to the admin configuration layer." — [iCommunify](https://colleges.icommunify.com/blog/campusgroups-vs-anthology-engage-what-student-affairs-teams-should-compare))
2. **Touch frequency is ~2–3 times a year.** Students hit the portal to re-register the org in September, submit an event form, or request SGA money. Nothing pulls them back daily, so notifications are ignored and the app is deleted.
3. **Performance and mobile.** "6–10 seconds to load each page," "commonly freezes," "not as practical for students" ([Capterra — Involve](https://www.capterra.com/p/255274/Presence/)); Engage is "web-based, limited native mobile."
4. **No real chat.** The one thing every club needs every day. CampusGroups has chat, but it competes with GroupMe/Discord where the members already are; Engage/Involve have none worth using.
5. **University-scoped identity and lifecycle.** Accounts die at graduation, alumni vanish, cross-campus or off-campus members can't join, and the data belongs to the school, not the club.
6. **Fee-funded, so nobody feels the price.** Contracts are 5-year, enrollment-priced, often bought off cooperative contracts — meaning switching is a procurement event, not a product decision. Vendors compete on RFP checklists, not adoption.
7. **Zero public voice.** SourceForge shows 0 reviews for Engage; Software Advice 6 for CampusGroups; Capterra 13 for Involve. A category with hundreds of campus deployments and effectively no user reviews is a category nobody loves.

---

## 2. The tools clubs actually run on

| Tool | What clubs use it for | Where it breaks |
|---|---|---|
| **GroupMe** (Microsoft) | Default club chat at most US campuses. "70%+ of US colleges," 200%+ surge in campus group creation in 2024; 2025: 50M people RSVP'd to events, groups now up to 10,000 members, 25 "Topics" per group, Copilot chat summaries, "GroupMe Campus" discovery by school/major/grad year. | Flat chat with no roles, no persistent docs, no forms, no dues; announcements drown; a 2025 *Teaching Sociology* study catalogs "use and misuse" (side-chats, exclusion, academic-integrity risk). Officers report "GroupMe messages not translating to event attendance." ([GroupMe 2025 review](https://groupme.com/blog/2025-year-in-review), [ExpandedRamblings stats](https://expandedramblings.com/index.php/groupme-statistics-facts/), [Huggins 2025](https://journals.sagepub.com/doi/10.1177/0092055X251344934), [Flare](https://www.theflareapp.com/post/the-best-app-to-manage-a-college-club)) |
| **Discord** | CS/gaming/esports/anime/engineering clubs; big servers with channels, roles, bots, voice. "200+ colleges" have official presence; Discord published "Ten tips to help your college club bloom." | Overwhelming for non-technical clubs; no events/payments/forms natively; Student Hubs (2021) never became the campus directory; moderation burden on officers. ([Discord blog](https://discord.com/blog/ten-tips-to-help-your-college-club-bloom-on-discord), [HEI](https://www.highereducationinquirer.org/2024/11/200-colleges-and-universities-use.html), [Inside Higher Ed](https://www.insidehighered.com/news/tech-innovation/teaching-learning/2023/04/26/how-do-college-students-use-discord)) |
| **Slack** | Pre-professional, consulting, business-school, grad-student orgs (Harris/UChicago publishes Slack community standards). | Free plan = **90-day history, 10 apps, 1:1 huddles only**; Pro is **$8.75/user/mo** — institutional knowledge evaporates every quarter. ([Slack pricing](https://slack.com/pricing), [Harris Slack standards](https://harris.uchicago.edu/files/harris_student_slack_community_standards_0.pdf)) |
| **WhatsApp** | International student orgs, cultural associations, anything with non-US members. | No campus identity, phone-number exposure, same flat-chat problems. |
| **Instagram + Linktree** | The club's *real* homepage: recruitment, event flyers, stories for day-of reminders. A typical ASU club stack: Instagram + GroupMe + Linktree + Google Forms. | Algorithmic reach, no RSVP/attendance, no member list; Linktree is a bandaid for "we have six Google Forms." ([ASU Sun Devil Central example](https://sundevilcentral.eoss.asu.edu/p4a/resources/)) |
| **Google Forms / Sheets / Drive** | Interest forms, applications, attendance, budgets, the "officer transition folder." | Ownership tied to a graduating student's account; sheets fork; no permissions model; forms don't know who a member is. |
| **When2Meet / Doodle / LettuceMeet** | Scheduling e-board meetings and rehearsals. | Stateless; no roster; re-created every week. |
| **Eventbrite / Luma / Partiful** | Ticketed galas, formals, conferences (Eventbrite); tech/founder-style events and recurring calendars (Luma: ~2M signups/month, 5x growth 2023→24, **5% platform fee** on paid tickets, 0% on Luma Plus); parties and socials (Partiful: **500K MAU in Q1 2025, +400% YoY, +2M users in 2025**, a16z-backed, ticketing only launched June 2026 at ~10% + $2/ticket per Luma's comparison). | None knows what a "member" or "officer" is; none integrates with university event approval, room booking, or SGA funding. ([CNBC on Partiful](https://www.cnbc.com/2025/04/19/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple.html), [Luma vs Partiful](https://help.luma.com/p/luma-vs-partiful), [Eventreels](https://eventreels.com/blog/partiful-vs-luma-comparison)) |
| **Venmo / Zelle / Cash App** | Dues, merch, formal tickets, splitting the Costco run. | "Works for the first semester," then members forget, payments arrive with no note, reconciliation takes 30+ min/week, no receipts parents will accept, public-by-default feed. Many universities **prohibit** P2P apps for org funds (Purdue: "Venmo, PayPal, CashApp… cannot be used"; UC Berkeley Law: P2P "not reimbursable"). ([Dueflow guide](https://www.dueflow.co/blog/collect-club-dues-online), [Purdue BOSO](https://www.purdue.edu/treasurer/finance/business-management/boso/manual/), [Berkeley Law](https://www.law.berkeley.edu/business-services/paying-students/student-group-reimbursements), [Crowded on Venmo risk](https://bankingcrowded.com/all-blogs/venmo-for-associations/)) |
| **Notion** | E-board wikis, task boards, transition docs for the more organized clubs. | Same account-ownership problem as Drive; free tier limits on guests; abandoned after one officer cycle. |
| **Band (Naver)** | Some sports clubs/ensembles (calendar + chat + attendance in one). | Little US campus mindshare; dated UI. |
| **Heylo** | Community app for in-person groups (run clubs, hobby groups). Bootstrapped to profitability, then **$1.5–2M seed (2022, Worklife, CapitalG, Precursor)**; ~6 employees. | Not campus-aware; no institutional layer. ([Crunchbase](https://www.crunchbase.com/organization/heylo-a6ce), [PitchBook](https://pitchbook.com/profiles/company/267848-74)) |
| **Geneva** (dead) | The best consumer "group home" product (chat rooms + events + audio). **Acquired by Bumble July 1, 2024 for $17.5M**; Bumble disclosed **zero revenue** from it; standalone app shut down by Sept 2025 and folded into Bumble BFF. | Lesson: beautiful group chat with no monetization and no institutional wedge gets sold for parts. ([Bumble IR](https://ir.bumble.com/news/news-details/2024/Bumble-Inc.-Signs-Agreement-to-Acquire-Group-and-Community-App-Geneva/default.aspx), [MarketScreener](https://www.marketscreener.com/quote/stock/BUMBLE-INC-118794453/news/Bumble-Inc-completed-the-acquisition-of-Geneva-for-17-5-million-47431868/), [Toarn](https://toarn.com/insights/geneva)) |
| **Fizz / Sidechat / YikYak** | Anonymous campus feeds; where students *hear* about events and gossip about clubs. Fizz: **$41M raised** ($25M Series B 2023; later strategic round at **$200M valuation cap**), 620–800+ campuses, 1M+ users, now monetizing via ads, marketplace and a Gopuff grocery partnership (Sept 2025). Sidechat bought YikYak in 2023. | Anonymity is antithetical to org management; but Fizz has the distribution every club wants. ([TechCrunch — Fizz/Gopuff](https://techcrunch.com/2025/09/03/college-social-app-fizz-expands-into-grocery-delivery), [Dealroom](https://app.dealroom.co/news/feed/fizz-raises-undisclosed-funding-at-200m-valuation-cap-as-college-social-app-eyes-global-expansion), [TechCrunch — Sidechat/YikYak](https://techcrunch.com/2023/03/16/anonymous-app-sidechat-picks-up-rival-yik-yak-and-users-arent-happy/)) |

**The pattern:** each tool wins one job (chat, flyer, form, money, RSVP) and none knows the roster. The roster — who is a member, who is an officer, who paid, who showed up — lives in a Google Sheet owned by a senior who graduates in May.

---

## 3. Direct startup competitors and adjacent startups

| Company | Status | Money | What happened / why it matters |
|---|---|---|---|
| **OrgSync** | Acquired 2016 (Campus Labs) → Engage | bootstrapped/small | The original; sold to the compliance buyer, which is where the product's soul went. ([CB Insights](https://www.cbinsights.com/company/orgsync)) |
| **Presence** | Acquired 2021 (Modern Campus) | small | 250 campuses at exit; now a slow, admin-centric module inside a CMS company. |
| **Involvio** | Acquired 2021 (Cisco) | Cisco Investments et al. | Absorbed into Webex; gone. |
| **CampusGroups** | Acquired 2022 (Ready Education / Level Equity) | Ready ~$162M raised | The PE roll-up play: 4 acquisitions in 10 months. |
| **Geneva** | Acquired 2024 ($17.5M, Bumble), shut 2025 | VC-backed | Zero revenue; the consumer-community graveyard's headline. |
| **Heylo** | Alive, tiny | ~$1.5–2M | Profitable-ish niche community app; not campus. |
| **Fizz** | Alive, growing | $41M, $200M cap | Owns anonymous campus attention; pivoting to commerce. Could add "clubs" as a tab any semester. |
| **Lounge.live** | Alive, early | ~$4.4M | Most credible "modern Engage" attacker, but sells to institutions. |
| **Flare** | Alive, tiny | undisclosed | "Best app to manage a college club": chats + events + QR tickets + points + alumni chat. Direct precedent for your thesis, sub-scale. ([Flare](https://www.theflareapp.com/post/the-best-app-to-manage-a-college-club)) |
| **DoorList** | Alive, growing | undisclosed | Greek-life events/invites/guest lists: **10,000+ student groups, 150+ campuses, free for hosts and guests, 0% on fundraising tickets.** Proof that a free, student-adopted org tool can spread bottom-up. ([DoorList](https://www.doorlist.app/blog/11-best-fraternity-management-software-solutions-for-2026)) |
| **Dueflow** | Alive, early | student-founded | "Free forever" chapter finance (dues, reimbursements, merch, AI), 3.3% processing; explicitly attacking OmegaFi/Billhighway/LegFi on price. ([Dueflow](https://www.dueflow.co/)) |
| **Rubric** | Alive | undisclosed | Student-union-sold; elections + grants + tap-to-pay. |
| **Campuswire** | Alive | reported ~$71M | Class Q&A / live-learning, not clubs. ([Tracxn](https://tracxn.com/d/companies/campuswire/__TfLdljy8Rfyjdcxe1lvUab4aBVoqtOS3tCkvAricmdg)) |
| **Nectir** | Alive | $6.3M | AI course chatbots; adjacent only. ([TechCrunch](https://techcrunch.com/2024/12/05/nectir-lets-teachers-tailor-ai-chatbots-to-provide-their-students-with-247-educational-support/)) |
| **Stellic** | Alive | $11M | Degree planning, 45+ institutions; adjacent. ([PR Newswire](https://www.prnewswire.com/news-releases/student-built-degree-progression-platform-raises-11-million-to-empower-students-and-solve-higher-educations-major-challenge-301507815.html)) |
| **Handshake** | Alive, pivoted | $434M raised, $3.5B (2022) | 1,600 universities, 20M students; now mostly an AI-data-labeling business (~$1.1B annualized gross revenue per Sacra, Apr 2026). Lesson: the campus network was worth more as *distribution* than as a job board. ([Sacra](https://sacra.com/c/handshake/), [Forbes 2021](https://www.forbes.com/sites/kristinstoller/2021/05/12/handshake-a-job-search-platform-for-college-students-valued-at-15-billion-after-new-funding-round/)) |
| **RippleMatch** | Acquired May 28, 2026 (JobGet) | $79.9M raised, $205M (2022) | Early-career recruiting consolidated into an hourly-hiring platform; terms undisclosed. ([JobGet press release](https://www.jobget.com/press/releases/jobget-acquires-ripplematch-expanding-ai-driven-hiring-platform)) |
| Cuely, Nex, "Untitled" | No verifiable footprint | — | Could not find evidence of traction; treat as noise. |

**Why they died or stalled.** Three recurring causes: (a) sold to the institution and became compliance software (OrgSync, Presence, Involvio); (b) built a lovely consumer group product with no wedge into money, identity, or institutional data, so no revenue (Geneva); (c) picked a job-to-be-done that a free giant already covers (chat → GroupMe/Discord; events → Partiful/Luma). The ones growing today (DoorList, Dueflow, Fizz) are **free to students, spread group-by-group, and monetize adjacent to money or attention.**

---

## 4. Alumni / community platforms that overlap

| Platform | Entry price | Funding / owner | Overlap with clubs | Gap |
|---|---|---|---|---|
| **Hivebrite** | ~$799/mo Connect plan; enterprise negotiated | $37M Series B (Oct 2023), $59–85M total, ~$320M valuation | Alumni networks, sub-communities, events, fundraising, mentoring | Far too expensive and heavy for a club; sold to advancement offices. ([Hivebrite](https://hivebrite.io/blog/series-b-funding/), [PitchBook](https://pitchbook.com/profiles/company/265701-61), [Innoloft](https://innoloft.com/en-us/blog/hivebrite-vs-mighty-networks)) |
| **Mighty Networks** | ~$41–79/mo | VC-backed | Courses + community + paid memberships | Creator-economy DNA; no roster/officer model. ([Ruzuku](https://www.ruzuku.com/learn/articles/circle-vs-mighty-networks)) |
| **Circle** | **$89/mo (2% txn), $199/mo (1%), Plus custom (0.5%)** | VC-backed | Spaces, events, paywalls, chat | Same: creator communities. ([Circle pricing](https://circle.so/pricing)) |
| **Bevy** | ~$49/mo Starter, ~$1,000/mo Pro, ~$1,500/mo Enterprise | VC-backed | Chapter-based community events (used by dev-rel programs like GDG) | Enterprise-priced; chapter model is the closest analog to "national org → campus chapters." ([Software Finder](https://softwarefinder.com/collaboration-productivity-software/bevy-software)) |
| **Meetup** | **$29.99/mo Standard; PRO ~$30/group/mo** | WeWork → AlleyCorp | Local groups, RSVPs | Organizer pays, members don't; no campus identity. ([Meetup help](https://help.meetup.com/hc/en-us/articles/28677808413197-Organizer-Subscription-prices-overview)) |
| **Graduway (Gravyty), PeopleGrove** | custom enterprise | PE / VC | Alumni mentoring, directories | The "day after graduation" product — exactly where club data currently goes to die. ([Gravyty](https://gravyty.com/graduway/), [TrustRadius PeopleGrove](https://www.trustradius.com/products/peoplegrove/reviews)) |

**Takeaway:** every one of these charges $1K–$10K+/yr and assumes a paid staff community manager. None is buyable by a club treasurer with a $400 SGA allocation. But the *chapter* concept (Bevy) and the *sub-community* concept (Hivebrite) are the right mental models for national orgs with campus chapters.

---

## 5. Greek life software — what dues and finance teach us

Greek life is the one corner of student-org land where software actually gets paid for, because money flows through it: dues of $500–$5,000+/semester per member, national HQ mandates, house corporations.

| Vendor | Owner | Model (as reported by competitors and invoices) | Notes |
|---|---|---|---|
| **OmegaFi** | **Togetherwork** (PE roll-up; also owns LegFi, Fonteva, Protech) | ~**$3/member/month** platform + **3.15% + 30¢** card; ~$3,600/yr for a 100-member chapter | Doesn't publish pricing; sold via nationals and house corps; also does recruitment (Vault), rent collection, alumni comms. ([Dueflow vs OmegaFi](https://www.dueflow.co/vs/omegafi), [Togetherwork](https://www.togetherwork.com/), [Crunchbase](https://www.crunchbase.com/acquisition/togetherwork-acquires-omegafi--f1a59bb2)) |
| **Billhighway** (now "re:Members Unified Finance") | re:Members | ~**$5,000/yr** for 100-member chapter; **2.7% + 1.3% service fee** on cards; 2.25–3% convenience fees passed to members; nationals dashboards cost extra | "Sold largely through national headquarters." ([Dueflow vs Billhighway](https://www.dueflow.co/vs/billhighway)) |
| **LegFi** | Togetherwork | **$3–9/member/month**; "up to 7%" effective take | ([Dueflow vs LegFi](https://www.dueflow.co/vs/legfi)) |
| **GreekTrack** | independent | unpublished; role-based access per officer standing | ([GreekTrack](https://www.greektrack.com/pricing)) |
| **ChapterBuilder** | TechniPhi / Phired Up | recruitment CRM, **3,900+ chapters** | Recruitment, not finance. ([SourceForge](https://sourceforge.net/software/product/ChapterBuilder/alternatives)) |
| **Dueflow** | student founders | **$0 platform fee, 3.3% processing** | Attacks incumbents on price; adds reimbursements, merch, AI. |
| **DoorList** | startup | free; 0% on fundraising tickets | Events/guest lists; 10K+ groups. |

**Lessons for a general club OS:**
1. **Per-member-per-month pricing is hated and is the wedge.** Every Greek incumbent charges $36–$108/member/year on top of 3–7% processing; challengers win by going to interchange-plus and zero platform fee.
2. **Sell through the org that mandates, not the chapter that uses.** OmegaFi/Billhighway distribute via national HQs — the analog for non-Greek clubs is SGA/student-union finance offices and national student orgs (SHPE, NSBE, ACM, Enactus, club sports governing bodies).
3. **Role-based officer access is table stakes** (GreekTrack's differentiator is that the social chair can't see the treasurer's ledger).
4. **Reimbursements are a bigger pain than dues.** Universities require receipts and forms; students front cash for weeks. The reimbursement request → treasurer approval → SGA disbursement workflow is unowned outside Greek life.
5. **Officer transition is built into Greek software** (annual elections, HQ-mandated rosters). No general club tool does this.

---

## 6. Nonprofit / general membership tools

| Tool | Pricing (2026) | Fit for a college club |
|---|---|---|
| **Wild Apricot** (Personify) | **$66/mo** for 100 contacts (annual $59.40/mo), tiers to 50,000 contacts (~$900/mo); "no per-transaction fees" but a surcharge to use a non-Personify gateway (one source: ~20% of subscription). No free plan. | Too expensive and too website-centric; built for Rotary clubs and HOAs. ([Wild Apricot pricing](https://www.wildapricot.com/pricing), [MemberDay comparison](https://memberday.com/compare/wild-apricot-alternative)) |
| **MemberPlanet** | Free Basic (4% platform fee), $50–$175/mo | Historically marketed to Greek alumni chapters and PTAs. ([Jotform comparison](https://www.jotform.com/nonprofit/wild-apricot-vs-memberplanet/)) |
| **Join It** | **$29–$199/mo** + transaction fees; Capterra 4.7 | Simple membership CRM with digital member cards and QR check-in; markets to student orgs. ([Join It roundup](https://joinit.com/blog/best-student-organization-management-system)) |
| **ClubExpress** | ~**$0.42/member/mo** (about $24–35/mo for ≤200 members) | Hobby/retiree clubs; dated. ([ITQlick](https://www.itqlick.com/compare/wild-apricot/clubexpress)) |
| **Glue Up** | **$3,000–6,500/yr Professional; $8,000–18,500 Advanced** | Chambers of commerce, associations. ([Capterra](https://www.capterra.com/p/134209/Glue-Up/pricing/)) |
| **Raklet / Springly** | freemium → ~$50–200/mo | Springly explicitly markets a "school club software" page; still generic. ([Springly](https://www.springly.org/en-us/nonprofit/school-club-software/)) |
| **VolunteerLocal / SignUpGenius / Track It Forward** | $0–$2,400/yr | Service-hour tracking and shift sign-ups; Track It Forward is free for high-school service clubs. |

None is designed for a 19-year-old treasurer with no budget, an .edu login requirement, and a 12-month tenure.

---

## 7. High school / K-12 club tools (feeder market)

The K-12 "club" market is really an after-school-program and parent-communication market: **AfterSchool HQ** (registration, payments, attendance, permission slips; sold to districts and 21st CCLC programs), **School Signals** (per-club instructor feeds and parent messaging), **Skooly**, **ClubCentric**, **Track It Forward** (free service-hour tracking). Buyers are districts and program directors; the student is not the user. ([AfterSchool HQ](https://go.afterschoolhq.com/solutions/school-club-management-software/), [School Signals](https://schoolsignals.net/solutions/afterschool-clubs-programs-communication/), [Track It Forward](https://www.trackitforward.com/content/boost-your-high-school-service-club-program-management-free))

Feeder implications: high-school students already run clubs on Instagram + Google Forms + (increasingly) Discord; there is no consumer-grade K-12 club OS either, but COPPA/under-18 constraints and district procurement make it a poor first market. Useful later as a "bring your club record with you to college" hook.

---

## 8. Feature matrix — top 10 (plus the consumer stack for reference)

Legend: ● strong, ◐ partial/weak, ○ absent. "Who buys" = who signs.

| Capability | Encoura Engage | CampusGroups | MC Involve | Suitable | Symplicity | Lounge | Rubric | OmegaFi | Wild Apricot | Circle | GroupMe/Discord + Google + Venmo (the real stack) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Roster / membership | ● (SIS-synced) | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ◐ (Sheet) |
| Roles / permissions | ◐ (officer positions) | ● | ◐ | ◐ | ◐ | ◐ | ● | ● (officer standing) | ◐ | ◐ | ○ |
| Events / RSVP / check-in | ◐ (weak ticketing) | ● (native app, QR) | ◐ (slow) | ◐ | ◐ | ● | ● (ticketing) | ◐ | ◐ | ◐ | ◐ (Partiful/Luma bolt-on) |
| Chat | ○ | ◐ | ○ | ○ | ○ | ◐ | ○ | ○ | ○ | ● | ● |
| Payments / dues | ◐ | ● | ◐ | ○ | ◐ | ◐ | ● (tap-to-pay) | ● | ● | ● (paywalls) | ◐ (Venmo, often banned) |
| Budget / SGA finance / reimbursements | ◐ (finance module) | ● (budgeting) | ◐ | ○ | ● | ● | ● (grants) | ● | ○ | ○ | ○ |
| Forms / applications | ● | ● | ● | ◐ | ● | ● | ● | ◐ | ◐ | ○ | ● (Google Forms) |
| Elections | ◐ | ◐ | ◐ | ○ | ◐ | ○ | ● | ◐ | ○ | ○ | ○ |
| Files / docs | ◐ | ◐ | ◐ | ○ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ● (Drive) |
| Officer transition | ◐ (re-registration) | ◐ | ◐ | ○ | ◐ | ○ | ◐ | ● (HQ rosters) | ○ | ○ | ○ |
| Analytics | ● (engagement, co-curricular) | ● | ● | ● (transcript) | ● | ● | ● | ● (finance) | ◐ | ◐ | ○ |
| Mobile app | ◐ (web-first) | ● | ◐ | ● | ◐ | ● | ● | ● | ◐ | ● | ● |
| Integrations (SIS/SSO/LMS/calendar) | ● (APIs, Element451) | ● | ● | ● | ● | ◐ | ◐ | ◐ | ◐ | ◐ (Zapier) | ◐ |
| Recommendation / discovery feed | ◐ (directory) | ◐ | ◐ | ◐ | ○ | ◐ | ◐ | ○ | ○ | ○ | ◐ (GroupMe Campus, Fizz) |
| Pricing | 5-yr contract, enrollment-priced; part of a $50M distressed sale | custom, enrollment-priced | custom | custom | ~$10–20K+/yr mid-size | undisclosed | undisclosed | ~$3/member/mo + 3.15%+30¢ | $66–900/mo | $89–199/mo + 1–2% | free (+ Venmo/Luma fees) |
| Who buys | Student Affairs / IT | Student Affairs | Student Affairs | Provost / career services | Student Affairs | Student Affairs | Student union | National HQ / house corp | Club treasurer | Community manager | Nobody — students self-assemble |

---

## 9. Key gaps — what nobody does well

1. **The roster is homeless.** No product is the canonical, student-owned, portable record of "who is in this club, in what role, since when." Institutions own it in Engage; clubs keep a Sheet.
2. **Chat and operations are separate products.** The daily surface (GroupMe/Discord) has no idea about events, dues, or roles; the ops surface (Engage) has no daily reason to open it.
3. **Officer transition is a yearly data-loss event.** Drive folders, Notion pages, Venmo balances, Instagram logins, and Slack workspaces all belong to individuals who graduate. Greek software solves this by mandate; nothing solves it for the other 90% of orgs.
4. **Money is either banned (Venmo) or expensive (OmegaFi/Billhighway at 3–7% plus per-member fees).** Reimbursement workflows between students, treasurers, and SGA are entirely manual.
5. **Discovery is broken in both directions.** Students find clubs via Instagram/word of mouth/Fizz; clubs find members via tabling. The "involvement fair" is still the primary acquisition channel, and post-fair conversion from interest form → active member is unmeasured.
6. **Nobody bridges chapter ↔ national ↔ university.** A SHPE or ACM chapter reports to a national org, registers with the university, and runs on GroupMe. Three systems, zero integration.
7. **Mobile-first, student-first UX is table stakes that incumbents miss.** "6–10 seconds per page" is a real review of a shipping product in 2026.
8. **Alumni continuity is nil.** Club alumni are the most natural mentors and donors; the data evaporates at graduation and is later rebuilt (badly) by Graduway/PeopleGrove at the institution level.
9. **Free tier does not exist in the institutional market.** Every incumbent requires a procurement cycle. DoorList and Dueflow show that free + bottom-up spreads fast in the same population.

---

## 10. White space and positioning — opinionated takeaways

1. **Do not sell to Student Affairs first.** The institutional category just marked itself to market at $50M for the leader's whole engagement + CRM line. Five-year, enrollment-priced contracts are why every incumbent became slow admin software. Be free for clubs; treat the university as a later integration and upsell, not the customer of record.
2. **Own the roster, not the chat.** GroupMe and Discord have won chat; you will not out-chat Microsoft. Win the *directory of membership and roles* and make chat a pluggable surface (native light chat plus deep links/bots into GroupMe, Discord, Slack). The roster is the asset that compounds year over year.
3. **Officer transition is the wedge feature no one has.** Build "handoff" as a first-class object: roles expire on a date, the incoming e-board inherits files, forms, payment accounts, social logins, and vendor contacts. Market it in March–April when elections happen, not in September.
4. **Money is the monetization, not SaaS.** Copy Dueflow/DoorList: $0 platform fee, interchange-plus processing, receipts that satisfy parents and SGA, reimbursement requests with approval chains. Universities *ban* Venmo; be the compliant alternative the treasurer can show the SGA advisor.
5. **Ship the "SGA funding request" workflow.** Budgets, allocation requests, and reimbursements are the only workflows where the club, the university, and money intersect. Winning this makes the university tolerate you and eventually pay for the admin view.
6. **Instagram is the homepage; be the Linktree that knows who you are.** Give every club a public page with join, RSVP, dues, and calendar behind one link, with .edu-verified identity so interest forms convert to roster entries automatically.
7. **The recommendation feed must be built on behavior, not tags.** Engage-style directories with 400 categories fail. Use roster overlap, event co-attendance, major/year, and friends' memberships (GroupMe Campus is already gesturing at this). Fizz owns anonymous attention; you can own *identified* discovery.
8. **Treat national orgs and club-sports governing bodies like Greek nationals.** They mandate rosters and dues for hundreds of chapters and currently use OmegaFi-class tools or spreadsheets. One national deal = hundreds of chapters on day one, without a university RFP.
9. **Design for the 12-month tenure.** Onboarding must take under 10 minutes, with no training webinars. Every incumbent review praises "customer support" because the product needs it.
10. **Make graduation a feature.** Alumni status is automatic; alumni keep read access, can donate, mentor, and get the newsletter. This is the seed of an alumni network that Hivebrite/Graduway charge $10K–$100K to reconstruct.
11. **Integrate with the compliance layer instead of replacing it.** Push events and rosters into Engage/CampusGroups via their APIs or CSV so officers stop double-entering. You become the system officers use; Engage becomes the report the university reads.
12. **Watch three threats, not the incumbents:** Microsoft (GroupMe Campus + Copilot summaries + event RSVPs are 60% of a club app), Fizz (attention + marketplace, could add clubs), and Discord (roles + events + bots for the technical third of clubs). Your moat is the roster, money, and transition workflows none of them wants to own.
13. **Feature matrix gaps to hit in v1:** roles with dated terms, roster with .edu identity, event RSVP/check-in that writes attendance back to the roster, dues/reimbursements with receipts, a public join link, and a transition handoff. Skip elections, room booking, and co-curricular transcripts until a university asks and pays.
14. **Expect a K-12 pull later, not now.** Under-18 consent and district procurement make it a bad first market; a "bring your club history to college" import is a cheap growth hook once the college product is dense on a campus.
15. **Positioning line:** *the operating system clubs choose, not the portal the university assigns.* Free for every club, paid by the money that already flows through clubs and, later, by the institutions that want the data students willingly put in.

---

### Source index (selected)
- Anthology bankruptcy: [Phil Hill](https://onedtech.philhillaa.com/p/anthologys-chapter-11-bankruptcy-by-the-numbers) · [Davis Polk](https://www.davispolk.com/experience/anthology-chapter-11-restructuring) · [EdWeek](https://marketbrief.edweek.org/financing-investment/blackboards-parent-company-anthology-files-for-bankruptcy/2025/10) · [Encoura](https://www.encoura.org/resources/press-room/encoura-anthology-bid/) · [Encoura Engage](https://www.encoura.org/student-success/engage/)
- Engage procurement: [Starbridge / College of Charleston](https://starbridge.ai/rfp/anthology-inc-of-ny-engage-platform-sole-source) · [E&I](https://www.eandi.org/contracts/anthology/)
- CampusGroups / Ready: [EDUCAUSE](https://www.educause.edu/about/corporate-participation/member-press-releases/ready-education-acquires-campusgroups) · [Mergr](https://mergr.com/level-equity-management-invests-in-ready-education) · [Software Advice](https://www.softwareadvice.com/event-management/campusgroups-profile/) · [Ready Education](https://www.readyeducation.com/campusgroups/)
- Presence / Involve: [Modern Campus](https://moderncampus.com/newsroom/modern-campus-acquires-presence.html) · [Capterra](https://www.capterra.com/p/255274/Presence/)
- Involvio: [Crunchbase](https://www.crunchbase.com/acquisition/cisco-acquires-involvio--afcf7fbe) · Suitable: [suitable.co](https://www.suitable.co/) · GivePulse: [pricing](https://learn.givepulse.com/pricing)
- Entrants: [Lounge PitchBook](https://pitchbook.com/profiles/company/509378-59) · [Lounge comparison](https://about.lounge.live/blog/top-student-engagement-platforms-how-they-compare) · [iCommunify](https://colleges.icommunify.com/blog/campusgroups-vs-anthology-engage-what-student-affairs-teams-should-compare) · [Rubric](https://hellorubric.com/) · [Flare](https://www.theflareapp.com/post/the-best-app-to-manage-a-college-club) · [DoorList](https://www.doorlist.app/blog/11-best-fraternity-management-software-solutions-for-2026) · [Dueflow](https://www.dueflow.co/)
- Consumer stack: [GroupMe 2025](https://groupme.com/blog/2025-year-in-review) · [GroupMe stats](https://expandedramblings.com/index.php/groupme-statistics-facts/) · [Huggins 2025](https://journals.sagepub.com/doi/10.1177/0092055X251344934) · [Discord college blog](https://discord.com/blog/ten-tips-to-help-your-college-club-bloom-on-discord) · [Slack pricing](https://slack.com/pricing) · [CNBC Partiful](https://www.cnbc.com/2025/04/19/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple.html) · [Luma vs Partiful](https://help.luma.com/p/luma-vs-partiful) · [Purdue P2P ban](https://www.purdue.edu/treasurer/finance/business-management/boso/manual/) · [Berkeley Law](https://www.law.berkeley.edu/business-services/paying-students/student-group-reimbursements)
- Startups: [Bumble/Geneva](https://ir.bumble.com/news/news-details/2024/Bumble-Inc.-Signs-Agreement-to-Acquire-Group-and-Community-App-Geneva/default.aspx) · [Geneva $17.5M](https://www.marketscreener.com/quote/stock/BUMBLE-INC-118794453/news/Bumble-Inc-completed-the-acquisition-of-Geneva-for-17-5-million-47431868/) · [Fizz TechCrunch](https://techcrunch.com/2025/09/03/college-social-app-fizz-expands-into-grocery-delivery) · [Fizz Dealroom](https://app.dealroom.co/news/feed/fizz-raises-undisclosed-funding-at-200m-valuation-cap-as-college-social-app-eyes-global-expansion) · [Heylo](https://www.crunchbase.com/organization/heylo-a6ce) · [Handshake Sacra](https://sacra.com/c/handshake/) · [RippleMatch/JobGet](https://www.jobget.com/press/releases/jobget-acquires-ripplematch-expanding-ai-driven-hiring-platform) · [Sidechat/YikYak](https://techcrunch.com/2023/03/16/anonymous-app-sidechat-picks-up-rival-yik-yak-and-users-arent-happy/)
- Alumni/community: [Hivebrite Series B](https://hivebrite.io/blog/series-b-funding/) · [Circle pricing](https://circle.so/pricing) · [Meetup pricing](https://help.meetup.com/hc/en-us/articles/28677808413197-Organizer-Subscription-prices-overview) · [Bevy pricing](https://softwarefinder.com/collaboration-productivity-software/bevy-software)
- Greek: [Dueflow vs OmegaFi](https://www.dueflow.co/vs/omegafi) · [vs Billhighway](https://www.dueflow.co/vs/billhighway) · [vs LegFi](https://www.dueflow.co/vs/legfi) · [Togetherwork](https://www.togetherwork.com/)
- Nonprofit tools: [Wild Apricot](https://www.wildapricot.com/pricing) · [Join It roundup](https://joinit.com/blog/best-student-organization-management-system) · [Glue Up](https://www.capterra.com/p/134209/Glue-Up/pricing/) · [ClubExpress/ITQlick](https://www.itqlick.com/compare/wild-apricot/clubexpress)
- K-12: [AfterSchool HQ](https://go.afterschoolhq.com/solutions/school-club-management-software/) · [School Signals](https://schoolsignals.net/solutions/afterschool-clubs-programs-communication/) · [Track It Forward](https://www.trackitforward.com/content/boost-your-high-school-service-club-program-management-free)
- Market pricing: [Vistingo](https://vistingo.com/student-engagement-platforms/) · [Gitnux](https://gitnux.org/best/student-organization-management-software/)
