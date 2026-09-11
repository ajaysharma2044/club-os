# Pain Points by Club Type: Segment-by-Segment Analysis for a College Club Operating System

**Date:** 2026-09-10
**Method note:** This session's WebSearch budget was exhausted before research began, so every finding below comes from direct fetches of primary sources (vendor sites, national-organization pages, campus student-government portals, organizer handbooks, Wikipedia summaries of organizations) — roughly 45 distinct URLs. Where a claim rests on general domain knowledge rather than a fetched source, it is explicitly flagged as *(unverified this session)*. Reddit and several campus rec/Greek-life pages were unreachable (blocked, 403, DNS), so first-person officer complaints are under-represented relative to institutional sources.

---

## Cross-segment summary table

| # | Segment | Core money flow | Annual peak | Incumbent tools | Pain intensity | Economic activity per org |
|---|---------|----------------|-------------|-----------------|----------------|---------------------------|
| 1 | Pre-professional business | Member dues, employer sponsorships, case-comp fees | Fall + spring rush | Business Edge portal (AKPsi), Google Forms, Slack, Excel | Medium-high | $5k-$50k; SMIFs manage $100k-$23M+ |
| 2 | STEM / engineering teams / hackathons | Corporate sponsorship, university seed, comp fees | Comp season (spring/summer); hackathon weekend | Spreadsheets, Notion, Discord, Airtable, HubSpot trials | Very high | $20k-$300k+ (FSAE/rocketry); $50k-$300k (hackathons) |
| 3 | Cultural / identity / international | SGA allocation, ticket sales, food sales, family donations | One giant spring show | Google Sheets, Eventbrite, Venmo, GroupMe | High (spiky) | $5k-$60k around one event |
| 4 | Greek life | Dues ($500-$3k+/sem), housing, philanthropy events | Fall/spring recruitment; HQ reporting deadlines | OmegaFi, re:Members (Billhighway), ChapterBuilder, GreekTrack, GINsystem | Medium (heavily tooled) | $50k-$1M+/chapter/yr |
| 5 | Club sports | Dues, rec-dept allocation, league fees, fundraising | Season-specific; travel weekends | DSE Rec (rec dept side), Google Forms, Venmo, GroupMe | High | $5k-$100k+ |
| 6 | Arts / performance | Ticket sales, album/merch, gigs, SGA funding | Audition week; show weeks; ICCA (Jan-Apr) | Google Drive, Eventbrite, Square, Venmo | Medium | $2k-$40k |
| 7 | Service / religious / advocacy | SGA allocation, national dues, donations | Semester-long; election cycles for advocacy | GivePulse/Galaxy Digital (institution side), Kiwanis Engage, Google Forms | Medium | $1k-$20k |
| 8 | Student government | Mandatory activity fee | Budget cycle (spring), contingency rounds | Engage/CampusGroups/Presence + Google Sheets + custom portals | Very high (as a customer, not a club) | $500k-$10M+ budgets |
| 9 | Student media | Ad sales, institutional subsidy, student fee | Continuous; print cuts | Custom rate cards, Google Sheets, sometimes Salesforce/HubSpot | High (existential) | $50k-$1M+ |
| 10 | Pre-med / pre-law / pre-health | Small dues, national dues, conference travel | Application cycles (spring/summer) | Google Sheets hour logs, GroupMe, Kaplan partnerships | Low-medium | $1k-$10k |
| 11 | Graduate / MBA clubs | Club fees, conference tickets, treks, corporate sponsors | Fall club fair; conference season (Oct-Mar); treks (winter/spring break) | CampusGroups, Eventbrite, Slack, HubSpot | Medium (well-run, well-funded) | $20k-$500k+/club; conferences $100k+ |
| 12 | Honor societies / national chapters | One-time or annual national dues; induction fees | Spring induction | National portals, Google Forms | Low (as clubs) | $50-$535 per member to nationals |

---

## 1. Pre-professional business clubs

### How they run today
Business fraternities are the most institutionalized version of this segment. Alpha Kappa Psi reports **263 active chapters and 14,447 active members** (278,000+ lifetime) with a nine-person alumni board, regional volunteer directors, 12 "Program Managers of Chapter Achievement," and chapter advisors ([AKPsi on Wikipedia](https://en.wikipedia.org/wiki/Alpha_Kappa_Psi)). Chapters run on a national portal — the **Business Edge Portal (formerly MyAKPsi)**, described as providing "resources, applications or chapter operations" ([akpsi.org](https://akpsi.org/)). Delta Sigma Pi reports **224 active collegiate chapters, 12,000+ active members, 300,000+ lifetime initiates**, governed by a biennial Grand Chapter Congress ([DSP on Wikipedia](https://en.wikipedia.org/wiki/Delta_Sigma_Pi)).

Consulting clubs operate as project shops. 180 Degrees Consulting, the largest student consultancy, runs **210 branches across 40 countries** and has completed **7,800 consulting projects** for nonprofits and social enterprises ([180dc.org](https://180dc.org/)). Each branch recruits consultants by application/interview, staffs 4-6 person teams on semester-long engagements, and delivers final decks to clients.

Student-managed investment funds (SMIFs) sit at the high-value end. Penn State's **Nittany Lion Fund manages over $23 million** for accredited investors with ~50 undergraduate portfolio managers across all 11 S&P sectors, publishes **monthly and annual reports**, runs stock-pitch competitions, and draws from a **400-student feeder org** (Penn State Investment Association) ([nittanylionfund.com](https://www.nittanylionfund.com/)). Most SMIFs are far smaller ($100k-$2M; *unverified this session*) but replicate the same analyst -> associate -> sector-head ladder.

**Annual calendar:** September rush/info sessions -> October applications and interviews -> pledge/education period (6-10 weeks) -> initiation -> spring rush repeat -> case competitions (Oct-Mar) -> corporate sponsor "employer nights" -> officer elections (April) -> summer transition.

**Money flows:** Chapter dues (typically $100-$300/semester for business frats, *unverified this session*) plus national initiation fees; employer sponsorships for speaker series and recruiting nights; case-competition entry fees and travel; alumni donations.

### Sharpest pain points
1. **Selective recruitment runs on Google Forms + spreadsheets.** Application review, interview scheduling, scoring rubrics, and bid decisions for 100-400 applicants per cycle are handled ad hoc; there is no purpose-built "rush CRM" outside Greek life (ChapterBuilder exists for social Greeks but is not adopted by professional frats — [phiredup.com/chapterbuilder](https://www.phiredup.com/chapterbuilder)).
2. **National portal is compliance-oriented, not operations-oriented.** Business Edge/portal tools focus on rosters and reporting to HQ ([akpsi.org](https://akpsi.org/)), not on the chapter's own workflow.
3. **Employer relationship memory is lost each year.** Corporate sponsor contacts live in a graduating VP of Corporate Relations' inbox. Consulting clubs and SMIFs face the same alumni-network decay.
4. **SMIF reporting burden.** The Nittany Lion Fund publishes monthly and annual reports and manages accredited-investor money ([nittanylionfund.com](https://www.nittanylionfund.com/)); smaller funds replicate this with Excel and Bloomberg exports, with no audit trail across officer transitions.
5. **Case-competition logistics** (team formation, travel reimbursement, sponsor judges) duplicate work every year.
6. **Chapter-level finances split between the chapter bank account, national billing, and Venmo.** Dues reconciliation is manual.

### Unique features needed
- Application/interview pipeline with rubric scoring, interviewer assignment, and bid-vote tally.
- Sponsor CRM with company -> contact -> commitment -> deliverable tracking that survives officer turnover.
- Portfolio/pitch tracking for SMIFs (pitch archive, vote records, position log) exportable to a monthly report.
- Alumni directory with employer/role and "willing to help with" flags.

### Economic activity
Per-chapter budgets typically $5k-$50k (*unverified this session*). SMIF AUM ranges from six figures to the Nittany Lion Fund's $23M+ ([nittanylionfund.com](https://www.nittanylionfund.com/)). National-level flows: AKPsi's foundation distributes "more than 30 grants and scholarships annually" ([Wikipedia](https://en.wikipedia.org/wiki/Alpha_Kappa_Psi)).

---

## 2. STEM, engineering competition teams, and hackathons

### How they run today
**Competition teams (FSAE/Baja/rocketry/solar):** Formula SAE teams spend "8-12 months designing, building, and preparing their vehicles" ([fsaeonline.com](https://fsaeonline.com/)). Scoring rewards business skills as well as engineering: **Cost & Manufacturing Analysis (100 pts) and Presentation (75 pts)** sit alongside the Design event (150 pts) and 675 dynamic points ([Formula SAE on Wikipedia](https://en.wikipedia.org/wiki/Formula_SAE)). In 2019, 120 teams registered for the Michigan event with ~2,567 students. Teams are 2-30 students who "handle fundraising" independently, and "most successful teams are based on curricular programs and have university-sponsored budgets" (same source). MIT Motorsports lists a sponsor wall spanning Toyota Racing Development, GM, Ford, Brembo, Ansys, Altium, Formlabs, Magna, and MIT departments ([fsae.mit.edu](https://fsae.mit.edu/)); Michigan's MRacing publishes **Platinum/Gold/Silver/Bronze** tiers and a downloadable sponsorship brochure, describing itself as a 501(c)(3) ([mracing.engin.umich.edu/sponsors](https://mracing.engin.umich.edu/sponsors/)).

Rocketry: the Spaceport America Cup/IREC accepts **150+ collegiate teams**, drew **~2,000 students from 22 countries** in 2025 ([esrarocket.org](https://www.esrarocket.org/); [soundingrocket.org](https://www.soundingrocket.org/)), and charges **$400 entry + $700 rocket fee + $100 per participant** with a $1,000 late fee — a 30-person team pays $4,100 before travel or hardware ([IREC fees](https://www.esrarocket.org/irec-fees)).

**Hackathons:** TreeHacks 2026 hosted **1,000+ hackers from 30 universities and 12 countries** over 36 hours with a **$150,000+ prize pool**, keynotes from Sam Altman and Garry Tan, and covered "meals, travel, and lodging" ([treehacks.com](https://www.treehacks.com/)). HackMIT scaled from 150 attendees (Feb 2013) to 1,000+ within a year, with early sponsors Sequoia, Google, Uber and $14k in prizes in 2013; the team open-sources its own tooling (HELPq, Gavel) "used by dozens of events" ([HackMIT on Wikipedia](https://en.wikipedia.org/wiki/HackMIT)). MLH lists dozens of member events per season across North America, Europe and Asia ([mlh.com/seasons/2026/events](https://www.mlh.com/seasons/2026/events)).

The MLH Organizer Guide is the de facto handbook. Budget guidance: **food $8-10/person/meal**, snacks ~$10/person, t-shirts $5-8/person, buses ~$3,500 each, and "a buffer of $1,000 to $3,000" because organizers "will always need this extra money"; meal claim rates fall from ~90% (day-1 lunch) to ~30% (breakfast) ([MLH budgeting](https://guide.mlh.com/general-information/hackathon-budgeting.md)). Sponsorship: three tiers, top tier "should not exceed 25% of your total budget," prospectus of 2-3 pages, and — tellingly — **don't send attachments in first-touch emails because corporate IT flags them as phishing** ([MLH prospectus](https://guide.mlh.com/general-information/getting-sponsorship/sponsorship-prospectus.md)). Recommended org chart: Lead, Logistics, Finance, Marketing, Operations, with "one person responsible" per team; the guide "notably lacks guidance on team transitions, leadership handoffs, or maintaining continuity" ([MLH leadership team](https://guide.mlh.com/general-information/build-your-leadership-team.md)).

**Professional-society chapters (ACM/IEEE/SWE/NSBE/SHPE):** run on national reporting cadences. IEEE Student Branches must submit an **Annual Plan by 15 March via vTools** to unlock the Student Branch Rebate and SPAx event funding ([students.ieee.org](https://students.ieee.org/)). NSBE/SHPE chapters revolve around national/regional conventions with large travel budgets (*conference fees unverified this session; NSBE and SHPE pages were unreachable*).

### Sharpest pain points
1. **Sponsorship pipeline is the whole game and it lives in spreadsheets.** MLH's own guide devotes ten pages to sponsorship but names no CRM; teams cold-email hundreds of companies and track replies in Sheets ([MLH fundraising intro](https://guide.mlh.com/general-information/getting-sponsorship/introduction-to-fundraising.md)).
2. **Deliverable tracking for sponsors** (logo on car, booth, API prize, resume book) is manual and frequently missed, endangering renewals.
3. **Handoff amnesia.** The MLH guide itself has no succession chapter ([source](https://guide.mlh.com/general-information/build-your-leadership-team.md)); FSAE teams re-learn purchasing, machine-shop access and travel rules every year.
4. **Purchasing and reimbursement through university systems** (PO cards, tax-exempt forms, vendor onboarding) is slow; teams float thousands on personal cards (*unverified this session, widely reported*).
5. **Budget forecasting under uncertain attendance** — MLH explicitly warns of 30-90% meal claim variance ([MLH budgeting](https://guide.mlh.com/general-information/hackathon-budgeting.md)).
6. **Compliance stacks:** SAE cost reports, IREC safety docs and fee deadlines with $1,000 late penalties ([IREC fees](https://www.esrarocket.org/irec-fees)), IEEE annual plans ([students.ieee.org](https://students.ieee.org/)).
7. **Sub-team coordination** (aero, powertrain, electrical; or logistics/finance/marketing for hackathons) uses Discord/Notion with no shared budget or task ledger.

### Unique features needed
- Sponsor CRM with tier templates, deliverable checklists, logo-asset storage, and renewal reminders.
- Budget vs. actual by sub-team with reimbursement request workflow and receipt capture.
- Deadline/compliance calendar seeded from competition rule sets.
- Inventory/asset register (tools, parts, sponsor-donated hardware).
- Hackathon-specific: applicant CRM, check-in, judging (Gavel-style), sponsor booth scheduling.

### Economic activity
FSAE/rocketry team budgets of $30k-$300k are commonly cited (*unverified this session*); competition fees alone are $4k+ for a rocketry team ([IREC fees](https://www.esrarocket.org/irec-fees)). Top hackathons: $150k+ in prizes at TreeHacks plus food/travel/lodging for 1,000+ ([treehacks.com](https://www.treehacks.com/)) implies $300k+ total budgets. Per-hacker food alone is ~$40-60 for a weekend per MLH math.

---

## 3. Cultural, identity, and international student organizations

### How they run today
These orgs are defined by one giant annual production — a "culture night," gala, night market, or festival — plus weekly community programming. Stanford's Taiwanese Cultural Society "held their annual Night Market... with student performances, food and activity booths," and Blackfest 2026 brought artists J.I.D. and Samara Cyn to campus with vendor partnerships ([Stanford Daily search](https://www.stanforddaily.com/?s=cultural+show)). Filipino orgs' Pilipino Cultural Nights (PCNs) are multi-hour theatrical productions with dance suites, skits and live music, rehearsed for months (*Wikipedia and org pages were unreachable this session; description is domain knowledge*).

Umbrella councils (e.g., a Multicultural Council or Asian Pacific Coalition) sit between the SGA and dozens of member orgs, redistributing block funding. At UC Berkeley, the ASUC serves **1,247 registered organizations** through CalLink sponsorship, grants, contingency funding, and a space-reservation fund ([asuc.org](https://www.asuc.org/)), and cultural orgs are among the heaviest users of contingency rounds.

**Money flows:** SGA allocation (often the single largest source), ticket sales ($10-$25, *unverified*), food/merch sales, community/diaspora donations and family sponsorships, occasional corporate/consulate sponsorship. Funds bounce between the university-held agency account, a private bank account, and Venmo.

**Calendar:** Fall recruitment and welcome events -> winter rehearsals (dance practices 2-4 nights/week) -> spring show -> post-show banquet -> elections/transition.

### Sharpest pain points
1. **One event = the whole budget and the whole risk.** Venue deposits, catering minimums, costumes and A/V must be committed months before ticket revenue arrives; SGA funds typically reimburse after the fact (see MIT GSC rules: "Only original itemized receipts will be reimbursed," and venue rental is "very rarely approved" — [gsc.mit.edu funding guidelines](https://gsc.mit.edu/about/funds/funding-guidelines/)).
2. **Ticketing and door management** across Eventbrite/Venmo/cash with no reconciliation to the budget.
3. **Rehearsal attendance and choreography-suite rosters** tracked in group chats; no-shows discovered the week of the show.
4. **Umbrella-council reporting**: member orgs must submit budgets, attendance and receipts to a council that itself reports to SGA — three layers of Google Forms.
5. **Institutional knowledge loss**: vendor contacts, run-of-show docs, and lighting cues are rebuilt yearly.
6. **Viewpoint-neutrality and "open to all" constraints** on funded events (GSC: events "must be open and welcoming to all... graduate students," equal pricing for members and non-members — [gsc.mit.edu](https://gsc.mit.edu/about/funds/funding-guidelines/)) collide with member-only banquets.

### Unique features needed
- Event production hub: run-of-show, committee task boards, vendor list, deposit/payment schedule, and ticket sales dashboard in one place.
- Rehearsal attendance with cast/suite rosters.
- Multi-tier budgeting (SGA line -> council -> org -> event) with receipt capture that matches SGA reimbursement formats.
- Sponsorship packet builder for community businesses and consulates.

### Economic activity
Per-org: $5k-$60k concentrated around one show (*range unverified this session*). At scale, Berkeley's 1,247 RSOs draw on an ASUC budget published as a Google Sheet ([asuc.org](https://www.asuc.org/)) — a signal that even large SGAs run allocation in spreadsheets.

---

## 4. Greek life (social and multicultural fraternities/sororities)

### How they run today
Scale: "roughly 750,000 undergraduate students belong to 12,000 fraternity and sorority chapters on 800 campuses" in the US and Canada; housing costs "directly influence annual membership dues," and 36% of working-class students who work part-time were also in Greek life ([Fraternities and sororities on Wikipedia](https://en.wikipedia.org/wiki/Fraternities_and_sororities)). The University of Alabama alone reports **"13,000 Students Strong," 40% of main-campus undergraduates** ([ofsl.sl.ua.edu](https://ofsl.sl.ua.edu/)).

This is the most heavily tooled segment:
- **OmegaFi**: billing & payments, member engagement, recruitment, finance, and a member platform on Salesforce/Dynamics; claims to "increase dues payments by 20%," offers FDIC-backed accounts, automated bill pay, and **Form 990 filing and reinstatement** services ([omegafi.com](https://www.omegafi.com/); [solutions](https://www.omegafi.com/solutions/)).
- **re:Members (formerly Billhighway)**: CRM, two payment products for chapters and HQ, and housing/fundraising modules; Phi Mu cites "almost decade-long" use ([remembers.com](https://www.remembers.com/)).
- **ChapterBuilder (Phired Up)**: recruitment CRM with **Free (10 users) / $600/yr Plus / $850/yr Pro** tiers, in-app texting, and "over 4,000 fraternities and sororities" using it ([phiredup.com/chapterbuilder](https://www.phiredup.com/chapterbuilder)).
- **GreekTrack**: membership, finances, philanthropy, events, HQ analytics ([greektrack.com](https://www.greektrack.com/)). GINsystem was unreachable.

Councils pay the NIC on a chapter-count sliding scale: **$290.50 (1-3 chapters) up to $3,748 (26+ chapters)** annually, with insurance billed separately and a 10% discount for paying by September 30 ([nicfraternity.org IFC dues](https://nicfraternity.org/ifc-dues-campus-support/)).

**Money flows:** dues of $500-$3,000+/semester (*range commonly reported; not verified on a campus page this session — Alabama, UGA, Penn State, Michigan, Indiana and TAMU cost pages were unreachable or unpublished*), new-member fees, housing/meal plans, national per-capita fees and insurance, philanthropy event revenue, alumni house corporation.

**Calendar:** formal recruitment (fall for Panhellenic/IFC; deferred spring on some campuses), new-member education, initiation, philanthropy week, formal/date parties, HQ reporting deadlines, officer elections (Nov/Dec), summer leadership conferences.

### Sharpest pain points
1. **Delinquent dues and collections** — the reason OmegaFi markets "+20% dues collection" ([omegafi.com](https://www.omegafi.com/)).
2. **Tool sprawl and cost stacking**: a chapter can pay OmegaFi + ChapterBuilder ($600-$850) + GINsystem + a design tool, each with per-member fees passed to students.
3. **HQ compliance load**: rosters, risk-management forms, 990s, insurance by Sept 30 "to avoid coverage gaps" ([nicfraternity.org](https://nicfraternity.org/ifc-dues-campus-support/)).
4. **Risk management and event registration** with the university (guest lists, sober monitors) is separate from chapter tools.
5. **Recruitment data hygiene** — ChapterBuilder's pitch is literally replacing "spreadsheets" and inconsistent follow-up ([phiredup.com](https://www.phiredup.com/chapterbuilder)).
6. **Multicultural Greek chapters** (NPHC/MGC/NALFO) are small (5-25 members), often can't justify OmegaFi pricing, and run on Venmo and GroupMe (*unverified this session*).
7. **Affordability pressure** on members working part-time ([Wikipedia](https://en.wikipedia.org/wiki/Fraternities_and_sororities)) drives payment plans and hardship exceptions that treasurers manage by hand.

### Unique features needed
- Dues billing with payment plans, late fees, and HQ remittance splits.
- Points/attendance system (chapter, philanthropy, study hours).
- Event risk registration templates matching campus FSL forms.
- Recruitment pipeline with PNM profiles, bid matching, and council-run recruitment integration.

### Economic activity
Per chapter, dues alone often exceed $100k/yr (100 members x $1,000/sem x 2; *derived, unverified*). Vendor economics: ChapterBuilder's $600-$850/yr across 4,000+ chapters ([phiredup.com](https://www.phiredup.com/chapterbuilder)) implies a multi-million-dollar recruitment-software niche alone; NIC council dues top out at $3,748/yr ([nicfraternity.org](https://nicfraternity.org/ifc-dues-campus-support/)).

**Beachhead verdict:** poor fit for a free generalist product — heavily tooled, HQ-mandated systems, high switching friction. Multicultural Greek councils are the only soft entry.

---

## 5. Club sports and recreation

### How they run today
Club sports are governed by the campus recreation department, not the SGA. On the institution side, **DSE Rec's Club Sports module** covers "roster & eligibility management, compliance & safety requirements, travel & event logistics, budget management, compliance point tracking, fundraising oversight," with clients including Carnegie Mellon, Drexel, Florida State, Michigan State, Ohio University, Rutgers and Washington State ([dserec.com](https://www.dserec.com/)). NIRSA runs championship series (soccer, flag football, basketball, tennis, pickleball) and an officials-development program ([nirsa.net](https://nirsa.net/nirsa/)). Several campus sport-club handbook pages (UT Austin, Purdue, Wisconsin, Florida, UNC, Illinois, Minnesota, TAMU) were unreachable this session; the "compliance points" language in DSE Rec mirrors the ubiquitous tier/points systems rec departments use to rank clubs for funding (*unverified this session*).

**Money flows:** member dues ($50-$500/semester, *unverified*), rec-department allocation tied to tier/points, league and tournament fees, coach stipends, travel (vans, hotels), fundraising (alumni games, apparel), equipment.

**Calendar:** roster/waiver deadlines at semester start -> practice/league season -> travel weekends -> regionals/nationals -> officer transition -> summer budget request.

### Sharpest pain points
1. **Waivers, eligibility and travel forms** live in the rec department's system (DSE Rec or paper) while the club's own operations live in GroupMe/Venmo — the officer is the integration layer.
2. **Dues collection** with no institutional billing: Venmo, cash, and chasing.
3. **Travel logistics**: driver certifications, van reservations, hotel blocks, per-diem rules, post-trip reports.
4. **Compliance points** drive next year's allocation, so attendance at meetings, community service, and paperwork must be tracked meticulously ([dserec.com](https://www.dserec.com/)).
5. **Coach/alumni relationships** and fundraising history lost at transition.
6. **Injury/incident reporting** and insurance requirements from leagues.

### Unique features needed
- Roster with eligibility/waiver status synced to (or exportable for) rec-department systems.
- Dues + payment plans + travel-cost splitting.
- Trip planner with driver/vehicle/hotel/receipt bundle for post-trip reimbursement.
- Compliance-points tracker mirrored to rec-department rubric.

### Economic activity
Per club $5k-$100k+ (hockey, rugby, equestrian, sailing at the top; *unverified*). Institution-side spend: DSE Rec is a 14-module enterprise suite sold by demo ([dserec.com](https://www.dserec.com/)), meaning the university already pays for the compliance side — the club-side is the gap.

---

## 6. Arts and performance

### How they run today
Collegiate a cappella is the best-documented sub-segment. Groups are "typically composed of, operated by, and directed by students," "generally self-sustaining," perform with 8-16 members (rosters up to 30), and "record albums... typically at intervals of two or three years" ([Collegiate a cappella on Wikipedia](https://en.wikipedia.org/wiki/Collegiate_a_cappella)). The ICCA runs **9 regions x 4-5 quarterfinals**, 10-minute sets, 3-5 trained judges scoring vocal (75 pts max) and visual performance, with finals in New York ([ICCA on Wikipedia](https://en.wikipedia.org/wiki/International_Championship_of_Collegiate_A_Cappella)). Varsity Vocals reports **480+ ICCA and 255+ ICHSA groups annually across 85+ locations**, applications due **October 1**, tickets on sale **December 1** ([varsityvocals.com](https://www.varsityvocals.com/); [apply](https://varsityvocals.com/apply)).

Theater, dance teams, improv, and orchestras follow a similar audition -> rehearsal -> ticketed-show loop, with additional rights/royalty licensing for theater (*unverified*).

**Money flows:** ticket sales, paid gigs (weddings, corporate), album sales/streaming, merch, SGA funding for competition travel, alumni donations.

**Calendar:** September auditions -> fall showcase -> ICCA quarterfinals (Jan-Feb) -> semis (Mar) -> spring concert -> recording sessions/tour (spring break/summer).

### Sharpest pain points
1. **Audition management** (sign-ups, callbacks, scoring, notifications) via Google Forms/Sheets each fall.
2. **Ticketing** for 200-800 seat shows via Eventbrite/Square with fees eating margin; door cash unreconciled.
3. **Rehearsal scheduling** across 10-30 conflicting class schedules (When2Meet + group chat).
4. **Gig booking and invoicing** — external clients, deposits, contracts — handled by a student "business manager" with no invoicing tool.
5. **Recording/merch project accounting** spans multiple years and multiple officer cohorts.
6. **Music/arrangement libraries and licensing** stored in personal Drive accounts.

### Unique features needed
- Audition pipeline with callback scheduling and scoring.
- Ticketing with low fees and door-sales reconciliation.
- Gig CRM with quotes/invoices/deposits.
- Multi-year project budgets (album, tour).
- Shared asset library (arrangements, sheet music, recordings) owned by the org, not a person.

### Economic activity
$2k-$40k per group per year (*unverified*); ICCA's 700+ competing groups and 85+ paid-ticket events signal a national touring economy ([varsityvocals.com](https://www.varsityvocals.com/)).

---

## 7. Service, religious, and advocacy/political organizations

### How they run today
Service orgs report to nationals. Alpha Phi Omega maintains a chapter officer resource center, a volunteer-opportunity portal, National Service Week, Spring Youth Service Day, APO LEADS training and a Chapter Presidents Academy ([apo.org](https://apo.org/)). Circle K International routes chapter reporting and dues through **Kiwanis Engage** ([circlek.org](https://www.circlek.org/)). On the institution side, volunteer hours are tracked in **GivePulse** (site returned 403 this session) or **Galaxy Digital's Get Connected Campus** ("Service Learning Management," "Track Volunteer Hours," digital check-in, impact reporting — [galaxydigital.com](https://www.galaxydigital.com/)).

Advocacy/political orgs live under constitutional constraints. FIRE's guide explains that under *Rosenberger* (1995) and *Southworth* (2000), mandatory fees must be allocated with **viewpoint neutrality**; student governments must use "clear, objective, nonideological funding standards," provide "written explanations for funding denials," offer "fair appeals processes," and avoid "unbridled discretion" and referendum-based funding ([fire.org guide](https://www.fire.org/research-learn/fires-guide-student-fees-funding-and-legal-equality-campus)). Student-election campaign finance is a real regime: ASUC Bylaw Series 4200 requires candidates, parties and proposition proponents to "report all campaign expenditures made, reserves received, and campaign contributions received" across three reporting periods, enforced by an Elections Prosecutor ([asuc.org/elections](https://www.asuc.org/elections)).

**Money flows:** SGA allocations, national dues (APO pledge/active fees; CKI dues), member fundraising, church/denominational support for religious orgs, external advocacy-org grants.

### Sharpest pain points
1. **Double entry of volunteer hours** — into the university's GivePulse/Galaxy system for transcripts and into the national's portal (Kiwanis Engage, APO forms) for chapter standing.
2. **Chapter reporting deadlines to nationals** (monthly reports, annual charter renewal) fall on a single secretary.
3. **Viewpoint-neutrality documentation**: advocacy groups need paper trails to appeal denials ([fire.org](https://www.fire.org/research-learn/fires-guide-student-fees-funding-and-legal-equality-campus)); they rarely have them.
4. **Event registration friction with administration** (security fees, speaker policies, protest rules) is opaque and undocumented year to year.
5. **Campaign finance reporting** for student-election slates is spreadsheet-based and error-prone ([asuc.org/elections](https://www.asuc.org/elections)).
6. **Religious orgs** often have parachurch staff (e.g., campus ministries) with their own CRMs, leaving the student club in a data no-man's-land (*unverified*).

### Unique features needed
- Hours log with export to GivePulse/Galaxy formats and national report templates.
- National-reporting calendar with auto-filled monthly reports.
- Funding-request archive with decision letters and appeal timeline.
- Simple campaign-finance ledger for slates.

### Economic activity
Small per org ($1k-$20k) but numerous; national dues flow ($50-$100/member/yr typical, *unverified*) and institution-side spend on GivePulse/Galaxy Digital contracts.

---

## 8. Student government (SGA) as an organization

### How they run today
SGAs are the most consequential "club" because they distribute the activity fee. UC Berkeley's ASUC serves **45,307 students and 1,247 registered organizations** via an Annual Budget & Space Allocation (ABSA) process, a Finance Committee, and separate flows for sponsorship, grants, contingency funding, finance-rule waivers, and space-reservation funds — all submitted through **CalLink** (an Engage instance) — and publishes the budget as a **Google Sheet** ([asuc.org](https://www.asuc.org/)). MIT's ASA runs group recognition ("deadline March 20, 2026"), spring re-registration, constitution templates, and its own **"Engage" database**, while funding is split among ASA, UA Finboard, and the GSC funding board ([asa.mit.edu](https://asa.mit.edu/)). The MIT GSC funding board illustrates typical rules: funding "never guaranteed until the Funding Board meets and votes," unused funds forfeited, "only original itemized receipts," no sales tax, "participants must attend events to get reimbursed," no alcohol, venue rentals "very rarely approved," and low priority for groups with large balances ([gsc.mit.edu](https://gsc.mit.edu/about/funds/funding-guidelines/)).

Platforms: **Anthology Engage** (CalLink, MIT's "Engage"; product page unreachable), **CampusGroups** (Ready Education; clubs, events, budget tracking, payment processing, co-curricular transcripts; clients cited include Johns Hopkins and Portland CC — [readyeducation.com/campusgroups](https://www.readyeducation.com/campusgroups/)), and **Presence/Modern Campus** (unreachable).

### Sharpest pain points
1. **Volume**: 1,000+ orgs x multiple funding rounds = thousands of requests reviewed by a volunteer committee in weeks.
2. **Reimbursement-first funding** forces clubs to front money; receipts rejected on technicalities ([gsc.mit.edu](https://gsc.mit.edu/about/funds/funding-guidelines/)).
3. **Engage forms are rigid**; committees export to Google Sheets to actually score and deliberate ([asuc.org](https://www.asuc.org/) publishes budgets in Sheets).
4. **Viewpoint-neutrality liability** — every denial needs a written, criteria-based rationale ([fire.org](https://www.fire.org/research-learn/fires-guide-student-fees-funding-and-legal-equality-campus)).
5. **Club roster/recognition churn**: re-registration each spring, orphaned orgs, constitution compliance ([asa.mit.edu](https://asa.mit.edu/)).
6. **Election administration and campaign-finance enforcement** ([asuc.org/elections](https://www.asuc.org/elections)).
7. **Zero visibility into how allocated money is actually spent** until receipts arrive.

### Unique features needed
- Funding-request intake with rubric scoring, committee voting, decision letters, and appeals.
- Club-side ledger that mirrors SGA allocations so both sides see the same balance.
- Recognition/re-registration workflow with constitution versioning.
- Election module with campaign-finance reporting.

### Economic activity
SGA budgets run from ~$500k at small colleges to $10M+ at large publics (*unverified*); Berkeley's ABSA covers 1,247 orgs ([asuc.org](https://www.asuc.org/)).

**Strategic note:** SGA is not the beachhead *club*, but it is the channel — a free club-side OS that produces SGA-compatible budget requests and receipts is the wedge into the whole campus.

---

## 9. Student media

### How they run today
Most student publications "are funded through their educational institution" with revenue from "sales and advertisements"; Canadian papers are often independent, "funded by student fees won by referendums, as well as advertising" ([Student newspaper on Wikipedia](https://en.wikipedia.org/wiki/Student_newspaper)). The Cornell Daily Sun sells "print, web and social media advertising," cites **~2,500 print readers across 80+ locations and 200,000+ unique monthly web visitors**, publishes a 2026-27 media kit via Google Drive, and routes sales through student "business associates" reachable at a phone number and email ([cornellsun.com/advertise](https://cornellsun.com/advertise/)). The Indiana Daily Student's advertise link resolves to a PDF media kit ([idsnews.com/advertise](https://www.idsnews.com/advertise)); Michigan Daily and Daily Texan pages were rate-limited/403. The College Media Association's public site emphasizes adviser training and monthly "confabs" rather than business tooling ([collegemedia.org](https://www.collegemedia.org/)).

**Money flows:** local-business and campus-department ad sales (print inserts, web banners, newsletter sponsorships, social posts), institutional subsidy or student-fee line, alumni donations/nonprofit foundations, occasional grants.

### Sharpest pain points
1. **Ad sales CRM is a Google Sheet + PDF rate card** ([cornellsun.com/advertise](https://cornellsun.com/advertise/)); student reps turn over every year and local-business relationships restart.
2. **Invoicing and collections** from small businesses; no AR aging.
3. **Print revenue collapse** and shift to digital/newsletter products with no analytics-to-sales loop.
4. **Institutional dependence** creates editorial-independence tension ([Wikipedia](https://en.wikipedia.org/wiki/Student_newspaper)).
5. **Editorial workflow tools** (WordPress/SNworks/Slack/Trello) are disconnected from the business side.
6. **Yearbooks/radio** have long production cycles and vendor contracts (printers, licensing) that outlast officer terms.

### Unique features needed
- Advertiser CRM with rate-card quoting, insertion orders, invoicing, and AR.
- Handoff-proof account history per local business.
- Revenue dashboard by product (print/digital/newsletter/events).

### Economic activity
Large dailies bring in six to seven figures in ads and subsidy (*unverified*); Cornell Sun's 200k monthly uniques ([cornellsun.com](https://cornellsun.com/advertise/)) indicate real digital inventory.

---

## 10. Pre-med / pre-law / pre-health organizations

### How they run today
National affiliates set the pattern. AMSA premedical membership costs **$35/yr or $75 for four years** and bundles test-prep discounts and a Kaplan welcome gift ([amsa.org join](https://www.amsa.org/member-center/renew-or-join/)). Alpha Epsilon Delta (pre-health honor society) has **270 chartered chapters**, requires a **3.3 GPA** and three semesters of pre-health coursework, and notes "a certain number of volunteer hours may be required" ([AED on Wikipedia](https://en.wikipedia.org/wiki/Alpha_Epsilon_Delta)); its national site now resolves to a parked domain, a sign of thin national infrastructure. Chapters run speaker nights, shadowing sign-ups, MCAT study groups, volunteer trips, and conference travel (AMSA convention Dec 10-12 — [amsa.org](https://www.amsa.org/)).

**Money flows:** small chapter dues ($20-$60/yr, *unverified*), national dues, test-prep sponsorships (Kaplan/Princeton Review), conference registration and travel.

### Sharpest pain points
1. **Hour logging for applications**: students must document clinical, shadowing, research, and service hours for AMCAS; clubs keep Google Sheets that are neither verified nor exportable.
2. **Shadowing/volunteer slot allocation** with hospitals is scarce and managed by one officer's relationships.
3. **"Resume padding" critique**: admissions advisors and student press commonly deride passive membership; clubs need to evidence real engagement (attendance, hours, leadership) rather than membership cards (*characterization from domain knowledge; supporting article pages were unreachable this session*).
4. **National chapter requirements** (GPA verification, induction, service hours for AED) are administratively heavy for the value delivered ([Wikipedia](https://en.wikipedia.org/wiki/Alpha_Epsilon_Delta)).
5. **Study-group scheduling** for MCAT/LSAT cohorts.

### Unique features needed
- Verified hours log (supervisor sign-off) exportable to AMCAS/LSAC-style summaries.
- Opportunity board for shadowing/volunteering with fair allocation.
- Engagement scoring so members can prove active participation.

### Economic activity
Low per org ($1k-$10k); national dues and test-prep sponsorships are the real dollars ([amsa.org](https://www.amsa.org/member-center/renew-or-join/)).

---

## 11. Graduate student orgs and professional-school (MBA) clubs

### How they run today
This is the "high end." Wharton lists **150+ student-led clubs** governed by the Wharton Graduate Association, "incorporated in 1994 as a non-profit," which "governs all MBA student clubs and conferences"; student-run conferences include the Wharton India Economic Forum, a **300+ attendee** Health Care Business Conference, the "world's largest LATAM conference," and PE/VC and Retail conferences; treks run to Africa and India ([mba.wharton.upenn.edu/extracurricular-activities](https://mba.wharton.upenn.edu/extracurricular-activities/)). HBS has **"more than 95 clubs and over 200 leadership positions in the Student Association,"** a login-gated Student Club Handbook, and student-organized club conferences ([hbs.edu clubs](https://www.hbs.edu/mba/student-life/activities-government-and-clubs/Pages/default.aspx); [club list](https://www.hbs.edu/mba/student-life/activities-government-and-clubs/Pages/student-clubs.aspx)). Booth, Kellogg and GSB pages were unreachable this session. Graduate councils like MIT's GSC run structured funding boards for events, capital and conference travel ([gsc.mit.edu](https://gsc.mit.edu/about/funds/funding-guidelines/)).

MBA clubs charge membership fees (commonly $50-$150 per club, *unverified*), sell conference tickets ($50-$300), run treks with per-participant fees, and land corporate sponsors at five figures. Many business schools deploy **CampusGroups** for club management, event ticketing and budget tracking ([readyeducation.com/campusgroups](https://www.readyeducation.com/campusgroups/)).

### Sharpest pain points
1. **Conference-scale operations** (300-1,000 attendees, speakers, sponsors, ticketing) run by students with one-year terms.
2. **Corporate sponsor CRM across clubs**: the Finance Club and the PE/VC Conference both hit Blackstone; the WGA has to deconflict.
3. **Trek logistics**: deposits, visas, vendor payments across borders, participant refunds.
4. **Nonprofit compliance** (WGA is a 501(c)(3)-style nonprofit — [Wharton](https://mba.wharton.upenn.edu/extracurricular-activities/)): 990s, sales tax on tickets, bank access transitions.
5. **CampusGroups is institution-centric**; treasurers still export to Excel for real budgeting (*unverified*).
6. **Alumni network activation** for treks/speakers is relationship-dependent.

### Unique features needed
- Conference module (speakers, sponsors, tickets, budget) reusable year over year.
- Cross-club sponsor deconfliction at the student-association level.
- Trek/travel manager with deposits and refunds.
- Nonprofit finance (990-ready ledgers).

### Economic activity
Highest per club: $20k-$500k+, conferences at $100k+ (*derived from attendance figures; unverified*). Small-count segment (top ~50 business schools), but proves what clubs can become.

---

## 12. Honor societies and national chapters

### How they run today
Nationals monetize induction. Phi Kappa Phi charges **$77 (1 yr), $110 (2 yr), $145 (3 yr), $435 (senior life), $535 (life)** plus an $8 mandatory shipping fee, with some chapters adding fees ([phikappaphi.org/join](https://www.phikappaphi.org/join)). NSCS charges a **one-time $97 (Classic) or $169 (Premium)** lifetime fee, recruits via registrar data ("We work closely with your university's Office of the Registrar"), and reports ~90,000 current members and nearly 300 chapters ([nscs.org/membership](https://www.nscs.org/membership/); [NSCS on Wikipedia](https://en.wikipedia.org/wiki/National_Society_of_Collegiate_Scholars)); a campus paper called it a "scam" for "charging a membership fee for opportunities that are available for free" (Wikipedia). Phi Beta Kappa has 293 chapters with a $50-$95 initiation fee (2005 figure; "sometimes covered by the inductee's university") and typical 3.9 GPA thresholds ([PBK on Wikipedia](https://en.wikipedia.org/wiki/Phi_Beta_Kappa)). Golden Key targets the top 15% at 400+ universities via invitation codes ([goldenkey.org](https://goldenkey.org/membership/)). The ACHS certification body sets credibility standards: 3.3-3.5 GPA floors, elected leadership, financial disclosure, 501(c)(3) status, "formal chartering of each campus chapter," and red flags like "online-only applications without campus chapters" ([achshonor.org](https://www.achshonor.org/judging-credibility)).

### Sharpest pain points
1. **Chapter-level activity is thin**: one induction ceremony, a few service events; officer roles are ceremonial, so engagement is low.
2. **Induction logistics** (invite lists from registrar, RSVPs, regalia orders, venue) are managed by a faculty advisor with a spreadsheet.
3. **Legitimacy skepticism** hurts recruitment ([Wikipedia](https://en.wikipedia.org/wiki/National_Society_of_Collegiate_Scholars); [achshonor.org](https://www.achshonor.org/judging-credibility)).
4. **Dues split** between national and chapter is opaque to members.

### Unique features needed
- Induction event manager (invite list import, RSVP, regalia, program).
- Simple member directory and service-event tracking.
Not a beachhead: low pain, low frequency, nationals control the money.

---

## Beachhead recommendation

### Scoring (1 = weak, 5 = strong)

| Segment | Pain intensity | Willingness to switch | Economic activity | Network effects w/ other clubs | Ease of reach | Total |
|---------|---------------|-----------------------|-------------------|-------------------------------|---------------|-------|
| 2. STEM teams & hackathons | 5 | 5 | 4 | 4 | 5 | **23** |
| 3. Cultural / identity | 4 | 4 | 3 | 5 | 4 | **20** |
| 1. Pre-professional business | 4 | 4 | 3 | 4 | 4 | **19** |
| 5. Club sports | 4 | 3 | 3 | 3 | 3 | 16 |
| 11. MBA / grad clubs | 3 | 2 | 5 | 3 | 2 | 15 |
| 9. Student media | 4 | 3 | 4 | 1 | 3 | 15 |
| 6. Arts / performance | 3 | 4 | 2 | 3 | 3 | 15 |
| 7. Service / advocacy | 3 | 3 | 1 | 4 | 3 | 14 |
| 8. SGA | 5 | 2 | 5 | 5 | 2 | (channel, not beachhead) |
| 4. Greek life | 3 | 1 | 5 | 2 | 3 | 14 |
| 10. Pre-health | 2 | 4 | 1 | 2 | 4 | 13 |
| 12. Honor societies | 1 | 3 | 2 | 1 | 3 | 10 |

### Recommendation: start with STEM competition teams and hackathon organizers, with cultural orgs as the fast follow

**Why STEM/hackathons first**
- **Pain is acute and money-shaped.** Sponsorship is existential, deliverables are contractual, competition fees carry $1,000 late penalties ([IREC fees](https://www.esrarocket.org/irec-fees)), and the community's own handbook admits it has no answer for leadership handoff ([MLH guide](https://guide.mlh.com/general-information/build-your-leadership-team.md)).
- **Nobody owns the tool slot.** Unlike Greek life (OmegaFi, re:Members, ChapterBuilder at 4,000+ chapters — [phiredup.com](https://www.phiredup.com/chapterbuilder)) or club sports (DSE Rec on the rec-department side — [dserec.com](https://www.dserec.com/)), no vendor targets engineering teams or hackathon organizers; they run Sheets, Notion and Discord.
- **They are early adopters and builders.** HackMIT open-sourced its own event tooling ([Wikipedia](https://en.wikipedia.org/wiki/HackMIT)); these users will adopt, extend and evangelize a free OS, and they are reachable through MLH's season calendar ([mlh.com](https://www.mlh.com/seasons/2026/events)), SAE/ESRA team lists, and IEEE/ACM chapter directories.
- **Sponsor CRM generalizes.** The same sponsor-pipeline, deliverable-tracking and budget-vs-actual modules serve business clubs, MBA conferences, cultural galas and student media ad sales — the beachhead feature set is the platform's core.
- **Budgets are large enough to matter, small enough to be student-controlled.** A $150k+ prize pool at TreeHacks ([treehacks.com](https://www.treehacks.com/)) and six-figure FSAE programs mean real dollars flow through student hands, without the HQ mandates that lock Greek chapters into incumbents.

**Why cultural orgs second**
They are the largest population on most campuses (a large share of Berkeley's 1,247 RSOs — [asuc.org](https://www.asuc.org/)), they have one spiky, high-stress event where a production hub + ticketing + SGA-formatted budget would be adopted in a single cycle, and umbrella councils create built-in multi-org network effects. Their pain is comparable to STEM but their economic activity and sponsor sophistication are lower, so they benefit from modules built for the beachhead.

**Why not the obvious alternatives**
- **Greek life**: highest dollars but lowest willingness to switch; HQ-mandated billing and 990 services ([omegafi.com](https://www.omegafi.com/solutions/)) are not something a free tool displaces. Enter later via multicultural Greek councils.
- **MBA clubs**: richest per-club, but only ~50 schools, already on CampusGroups, and student associations buy institutionally — a later upmarket move once the conference module exists.
- **SGA**: the most painful workflows (1,000+ funding requests, viewpoint-neutrality documentation — [fire.org](https://www.fire.org/research-learn/fires-guide-student-fees-funding-and-legal-equality-campus)) but they are a *distribution channel*: win 30 clubs on a campus with an OS that emits SGA-compatible budget requests and receipts, then offer the SGA the committee-side view.

**Sequenced wedge:** (1) Sponsor CRM + budget/reimbursement ledger + handoff vault for STEM teams and hackathons -> (2) event production + ticketing for cultural and arts orgs -> (3) rush/application pipeline for business clubs -> (4) SGA committee console fed by the club-side ledgers -> (5) conference/trek module for MBA associations.

---

## Source list (fetched this session)

- OmegaFi: https://www.omegafi.com/ ; https://www.omegafi.com/solutions/
- re:Members (Billhighway): https://www.remembers.com/
- ChapterBuilder pricing: https://www.phiredup.com/chapterbuilder
- GreekTrack: https://www.greektrack.com/
- NIC IFC dues: https://nicfraternity.org/ifc-dues-campus-support/
- Fraternities and sororities (Wikipedia): https://en.wikipedia.org/wiki/Fraternities_and_sororities
- University of Alabama OFSL: https://ofsl.sl.ua.edu/
- MLH Organizer Guide: https://guide.mlh.com/general-information/hackathon-budgeting.md ; https://guide.mlh.com/general-information/getting-sponsorship/sponsorship-prospectus.md ; https://guide.mlh.com/general-information/getting-sponsorship/introduction-to-fundraising.md ; https://guide.mlh.com/general-information/build-your-leadership-team.md
- MLH 2026 events: https://www.mlh.com/seasons/2026/events
- TreeHacks: https://www.treehacks.com/
- HackMIT (Wikipedia): https://en.wikipedia.org/wiki/HackMIT
- Formula SAE: https://fsaeonline.com/ ; https://en.wikipedia.org/wiki/Formula_SAE
- MIT Motorsports: https://fsae.mit.edu/
- Michigan MRacing sponsors: https://mracing.engin.umich.edu/sponsors/
- ESRA / IREC: https://www.esrarocket.org/ ; https://www.esrarocket.org/irec-fees ; https://www.soundingrocket.org/
- IEEE Students: https://students.ieee.org/
- ASUC: https://www.asuc.org/ ; https://www.asuc.org/elections
- MIT ASA: https://asa.mit.edu/
- MIT GSC funding guidelines: https://gsc.mit.edu/about/funds/funding-guidelines/
- FIRE guide to student fees: https://www.fire.org/research-learn/fires-guide-student-fees-funding-and-legal-equality-campus
- DSE Rec: https://www.dserec.com/
- CampusGroups: https://www.readyeducation.com/campusgroups/
- NIRSA: https://nirsa.net/nirsa/
- Varsity Vocals: https://www.varsityvocals.com/ ; https://varsityvocals.com/apply
- ICCA (Wikipedia): https://en.wikipedia.org/wiki/International_Championship_of_Collegiate_A_Cappella
- Collegiate a cappella (Wikipedia): https://en.wikipedia.org/wiki/Collegiate_a_cappella
- Cornell Daily Sun advertising: https://cornellsun.com/advertise/
- Indiana Daily Student media kit: https://www.idsnews.com/advertise
- Student newspaper (Wikipedia): https://en.wikipedia.org/wiki/Student_newspaper
- College Media Association: https://www.collegemedia.org/
- AMSA dues: https://www.amsa.org/member-center/renew-or-join/ ; https://www.amsa.org/
- Alpha Epsilon Delta (Wikipedia): https://en.wikipedia.org/wiki/Alpha_Epsilon_Delta
- HBS clubs: https://www.hbs.edu/mba/student-life/activities-government-and-clubs/Pages/default.aspx ; https://www.hbs.edu/mba/student-life/activities-government-and-clubs/Pages/student-clubs.aspx
- Wharton MBA extracurriculars: https://mba.wharton.upenn.edu/extracurricular-activities/
- Phi Kappa Phi: https://www.phikappaphi.org/join
- NSCS: https://www.nscs.org/membership/ ; https://en.wikipedia.org/wiki/National_Society_of_Collegiate_Scholars
- Phi Beta Kappa (Wikipedia): https://en.wikipedia.org/wiki/Phi_Beta_Kappa
- ACHS credibility standards: https://www.achshonor.org/judging-credibility
- Golden Key: https://goldenkey.org/membership/
- Alpha Kappa Psi: https://akpsi.org/ ; https://en.wikipedia.org/wiki/Alpha_Kappa_Psi
- Delta Sigma Pi (Wikipedia): https://en.wikipedia.org/wiki/Delta_Sigma_Pi
- 180 Degrees Consulting: https://180dc.org/
- Nittany Lion Fund: https://www.nittanylionfund.com/
- Galaxy Digital: https://www.galaxydigital.com/
- Alpha Phi Omega: https://apo.org/
- Circle K International: https://www.circlek.org/
- Stanford Daily cultural-show coverage: https://www.stanforddaily.com/?s=cultural+show
