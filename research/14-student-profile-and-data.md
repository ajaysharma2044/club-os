# Research Track 14: The Student Profile and the "Free Product, Rich Data" Exchange

*Prepared 2026-09-10 for the campus-club operating system project. Method note: this session's web-search quota was exhausted before this track began, so every citation below is a page fetched directly (primary documentation, regulator pages, standards bodies, and Wikipedia summaries used only for well-documented history). Where a claim rests on a secondary summary that could not be independently re-verified, it is flagged.*

---

## 0. The thesis in one paragraph

Every product that has collected an "insane amount of data" willingly did it by making each data point the *byproduct of something the user wanted anyway*: a job (LinkedIn), bragging rights (Strava, GitHub), self-knowledge (Wrapped, Letterboxd), a habit (Duolingo), or seeing friends (Facebook, BeReal, Snap Map). The failures (Edmodo, Venmo, Strava's heatmap, Instagram's public-by-default teen accounts, PowerSchool, Instructure) were cases where the data exhaust exceeded the user's mental model of the exchange, or where a company holding student data had no security discipline. The design rule for a campus product: **collect through loops students would run for free, verify through the institution, expose through the student, and monetize only derived signals.**

---

## 1. How products get users to volunteer structured data

### 1.1 Product-by-product mechanics

| Product | The loop that generates data | Data produced | Pattern to steal |
|---|---|---|---|
| **LinkedIn** | Profile Strength meter (later "All-Star") nudges field-by-field completion "for search visibility"; address-book import seeded the graph (and drew a $13M class-action settlement over reminder emails); endorsements (2012) let *others* add structured skills to *your* profile. [LinkedIn history](https://en.wikipedia.org/wiki/LinkedIn) | Employment history, education, skills, endorsements, connection graph; 1.3B registered members by March 2026 | Gamified completeness tied to a concrete outcome; peer-generated attributes; LinkedIn's own sales blog still leads with "nearly 3x more likely to receive connection requests if you have five or more skills listed." [LinkedIn Sales blog](https://www.linkedin.com/business/sales/blog/profile-best-practices/17-steps-to-a-better-linkedin-profile-in-2017) |
| **Facebook (campus era, 2004-06)** | .edu-gated identity; profile fields (relationship status, interests, courses); the Wall; photo tagging (2005) which notified the tagged person and pulled them back in. News Feed (2006) triggered a privacy backlash and a Zuckerberg apology plus new controls. [Facebook history](https://en.wikipedia.org/wiki/Facebook) | Social graph, course co-enrollment, photos, identity | Tagging as a two-sided data loop; the News Feed lesson that *aggregating existing data into a new surface* feels like a new disclosure |
| **Strava** | GPS activity upload → segments with KOM/QOM/CR leaderboards → kudos → clubs → aggregated heatmap. 50M+ users and 3B+ activities by 2020. The 2017-18 heatmap exposed military bases; Strava responded with privacy zones and simplified settings. [Strava](https://en.wikipedia.org/wiki/Strava) | Location traces, effort, social ties, time-of-day patterns | Logging as competition; "receipts" (a verified time on a segment); aggregate maps are a distinct disclosure requiring their own consent |
| **Duolingo** | Daily streak (fire icon), streak freezes, friend streaks (up to 5 friends), leagues of ~30 users across 10 tiers, badges, and a bandit algorithm choosing notification timing. 130M MAU in Q1 2025. [Duolingo](https://en.wikipedia.org/wiki/Duolingo) | Daily behavior, retention curves, social accountability pairs | Streaks and social streaks; ML-timed nudges; a caution that gamification can incentivize gaming the metric |
| **Spotify Wrapped** | Annual, story-formatted personal recap (since 2016) designed for Instagram sharing; 1.2M tweets in December 2019; marketers called it "a masterclass on fan advocacy." Critics call it free advertising that launders surveillance as delight. [Spotify Wrapped](https://en.wikipedia.org/wiki/Spotify_Wrapped) | No new data; it *returns* data as identity | Data-for-delight; the "receipt" is the share card |
| **Letterboxd / Goodreads** | Diary logging, ratings, lists, watchlists; "Four Favorites" on the profile became a celebrity-interview format; Year in Review. 30M+ members by July 2026; 898.5M films logged in 2025. [Letterboxd](https://en.wikipedia.org/wiki/Letterboxd). Goodreads: shelves (read / currently-reading / to-read), yearly Reading Challenge, Year in Books; 150M members by 2023; Amazon bought it for the data and closed the API in 2020. [Goodreads](https://en.wikipedia.org/wiki/Goodreads) | Taste graph, consumption timing, intent ("to-read") | Logging as identity; public "top 4" as a low-effort identity statement; a *goal* (Reading Challenge) that makes logging feel like progress |
| **BeReal** | Once-daily synchronized notification, 2-minute window, dual camera, must post to see friends; shows attempt count and location. 73.5M users in Aug 2022, ~23M by early 2024. [BeReal](https://en.wikipedia.org/wiki/BeReal) | Time-stamped, geo-tagged presence | Reciprocity gate ("post to see"); the cautionary tale that a single loop with no accumulating value decays |
| **Instagram** | Hashtags (2011), geotags, tagging; Teen Accounts (Sept 2024) made under-16s private by default with messaging and tagging limited to followed accounts. [Instagram](https://en.wikipedia.org/wiki/Instagram), [Teen Accounts](https://about.fb.com/news/2024/09/instagram-teen-accounts/) | Location, social graph, interest graph | Tagging by others; and the regulatory reality that teen defaults are now private, not public |
| **Snapchat Snap Map** | Location is *not* shared until the user opens the Map for the first time; then per-friend visibility controls. [Snap support](https://help.snapchat.com/hc/en-us/articles/7012343074580) | Live location, co-location | Opt-in at first use, per-audience control, ephemerality |
| **Venmo** | Public-by-default transaction feed (worldwide / friends / private); 2018 research on 200M+ public transactions; 2018 FTC settlement for misleading users about privacy control; the President's account was found in under 10 minutes in 2021. [Venmo](https://en.wikipedia.org/wiki/Venmo) | Social graph inferred from payments | The anti-pattern: social-by-default on sensitive data |
| **Google** | Free products; My Activity is the transparency counterweight (view, search, delete, auto-delete, extra verification on shared devices). [My Activity help](https://support.google.com/accounts/answer/7028918) | Everything | A "what we know about you" page is table stakes for a data-rich free product |
| **Handshake** | Free student account, university-paid subscription; recommendations "based on your profile, interests, and where you are in your career"; 18M students at 1,200 institutions and 550k employers by 2021. [Handshake](https://en.wikipedia.org/wiki/Handshake_(company)), [Handshake students page](https://joinhandshake.com/students/) | Major, GPA, skills, interests, job-search stage | Completion tied directly to matches; institution as distribution channel |
| **Notion / Canva** | Free Education Plus for .edu emails and free Plus workspaces for verified student orgs (up to 100 guests). [Notion for Education](https://www.notion.com/product/notion-for-education) | Org membership, documents, workflow lock-in | Free tier as *organizational* lock-in; verified student-org status is itself a data asset |
| **Fizz** | Anonymous campus feed, .edu verification, 750+ colleges. [Fizz](https://fizz.social/) | Campus sentiment, but anonymized at the user level | Proof that students will generate campus-pulse data if identity is protected |
| **Discord** | Collects "the servers or other communities you join," friends, engagement with bots/apps; explicit "We don't sell your personal information"; export within 30 days. [Discord privacy](https://discord.com/privacy) | Membership graph, activity status | Membership graph is the asset; a plain-language no-sale promise is compatible with a free product |
| **GitHub** | Contribution calendar as public resume; anonymized private-repo activity is opt-in; achievements can be hidden individually. [GitHub docs](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/showing-your-private-contributions-and-achievements-on-your-profile) | Verified work record | The "receipt" pattern: activity that is *automatically* logged by doing the work becomes a credential |
| **Credly** | 123M+ credentials, 650k+ shared monthly, 3,700+ issuers; "verified digital badges" earners push to professional networks. [Credly](https://info.credly.com/) | Verified achievements | Verification plus share button equals distribution |
| **Pokémon Go** | Location gameplay; 2016 Google-permissions scare; sponsored PokéStops (Starbucks, Sprint) sold "foot traffic on demand." [Pokémon Go](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Go) | Location, dwell | The monetizable output is *foot traffic*, not raw location |
| **Tinder** | Photos, bio, interest tags, prompts (2023), Tinder U (2018) for campus matching, biometric "Verified Human" badge (2026); a 2017 subject-access request returned ~800 pages of one user's data. [Tinder](https://en.wikipedia.org/wiki/Tinder_(app)) | Preferences, swipes, messages, location | Tags-and-prompts profile; the 800-page lesson: a data-rich product must be ready for its own subject-access request |

### 1.2 The design patterns, extracted

1. **Value-exchange per field.** LinkedIn never asks for a field without a reason ("people who add skills get 3x more requests"). Handshake ties every field to matches. Rule: each field on our profile has a one-line "why" and a visible payoff.
2. **Progressive profiling.** Facebook's 2004 profile was tiny; fields accreted over years. Ask for five things on day one and let the product ask for the rest when the answer would immediately change what the student sees.
3. **Gamified completeness with a threshold.** LinkedIn's meter works because "All-Star" is a discrete status, not a percentage. Use named levels ("Rookie → Involved → Verified → All-Campus").
4. **Tagging others (two-sided data).** Facebook photo tags, LinkedIn endorsements, and Strava kudos each let user A create data about user B and pull B back in. For clubs: "tag who was there," "endorse for a role," "co-organizer."
5. **Logging as identity.** Letterboxd's Four Favorites and Goodreads shelves show that a curated public list is the cheapest identity statement. "My 4 clubs," "events I'd never miss," "what I'm looking for."
6. **Receipts (verified activity records).** GitHub's calendar, Strava segments, and Credly badges are credible because the act of doing the thing creates the record. Check-in at an event, being on a roster, holding a role: all become verified receipts.
7. **Delightful data summaries.** Wrapped, Year in Sport, Year in Review, Year in Books: return the data as a story once a semester. This is the cheapest acquisition channel that exists.
8. **Streaks and social streaks.** Duolingo's friend streak is the version worth copying: "you and Maya have gone to 6 events together this semester."
9. **Reciprocity gates.** BeReal's "post to see" and Tinder's double opt-in. For us: "check in to see who else checked in."
10. **Opt-in at first use, per-audience control.** Snap Map's location is dark until the user opens the map; GitHub's private contributions are opt-in and anonymized. Any sensitive layer (location, schedule, dorm) should follow this.
11. **Public-by-default is a regulatory liability now.** Venmo (FTC 2018), Instagram children's accounts (€405M, [Irish DPC](https://www.dataprotection.ie/en/news-media/press-releases/data-protection-commission-announces-decision-instagram-inquiry)), and Facebook News Feed (2006) all show the cost. Default to campus-only visibility with an easy "make public."

---

## 2. What a student profile should contain

### 2.1 Comparison with existing schemas

| Dimension | LinkedIn | Handshake | Discord | Strava athlete | Co-curricular record (Suitable / CampusGroups) | Open Badges 3.0 / CLR 2.0 / W3C VC |
|---|---|---|---|---|---|---|
| Identity | Name, headline, photo, location, pronunciation | Name, school, major, grad year, GPA (optional) | Username, avatar, bio, pronouns | Name, photo, location, gear | Institutional ID, program | `Profile` (issuer or learner) with identifiers; `credentialSubject` |
| Affiliations | Experience, education, volunteering | Work experience, organizations | Servers joined (private) | Clubs | Organizations with dates and positions | `Achievement` with `achievementType` vocabulary (badge, certificate, membership, etc.) |
| Skills | Skills + endorsements | Skills | none | none | Competencies mapped by the institution | `Alignment` to external frameworks; `Result` for outcomes |
| Activity record | Posts, articles | Applications, event RSVPs | Activity status | Every activity, segments, kudos | Validated events, hours, roles | `Evidence` attached to each credential |
| Verification | Self-asserted; some school/employer verification | Institution-verified enrollment | none | GPS-verified | Staff-validated | Cryptographic proof (embedded or enveloping), selective disclosure |
| Visibility model | Public profile with per-section controls | Community / employers / private | Per-server profiles | Followers / everyone; privacy zones | Student-controlled export (PDF) | Holder presents; verifier checks |
| Portability | Export | Export | 30-day export | Bulk export | PDF transcript | Native: a VC in a wallet |

Sources: [Open Badges 3.0 spec](https://www.imsglobal.org/spec/ob/v3p0/) (an assertion "is also a Verifiable Credential"), [CLR standard](https://www.1edtech.org/standards/clr) (component credentials verifiable individually and as a bundle; compatible with W3C VC and the Credential Engine Registry), [W3C VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/) (issuer/holder/verifier, selective disclosure, data minimization), [Suitable](https://www.suitable.co/) ("a dynamic, real-time co-curricular record of the entire college experience"), [CampusGroups](https://www.readyeducation.com/campusgroups/) (co-curricular transcript "for employer and graduate school applications" plus a data export API).

### 2.2 What this tells us

- The incumbents (Suitable, CampusGroups, Anthology Engage) already sell a **co-curricular transcript to the university**. Our differentiation is that the record is *student-owned and portable*, follows OB 3.0/CLR so any employer or wallet can verify it, and is *fun to fill* because it is generated by the product's social loops rather than by a staff validation queue.
- The standards give us a free schema for the verified layer: every position, award, or attended event is an `AchievementCredential` with `Evidence` (the check-in record) and an `Alignment` (a skills framework). The club is the issuer; the university can co-sign.
- Handshake's profile is optimized for employers, LinkedIn's for search, Strava's for peers. A student profile has to serve three audiences at once, which is why **visibility must be per-audience, not per-profile**.

---

## 3. Data sources beyond self-report: consent, sensitivity, law

### 3.1 Source-by-source

| Source | Signal value | Consent model | Sensitivity | Key legal constraints |
|---|---|---|---|---|
| Behavioral logs (opens, scrolls, RSVPs, reactions) | Interest and intent; feeds the quant engine | Notice in privacy policy; "essential" for the service | Low individually, high in aggregate | CCPA "right to know" and deletion; Apple/Google labels must list it; if used for ads across contexts it becomes CCPA "sharing" |
| Attendance check-ins (QR, NFC, geofence) | The verified involvement record | Explicit action per event; the receipt is the reward | Medium (reveals patterns, e.g. religious or political groups) | Precise geolocation is CCPA *sensitive PI* (right to limit); Maryland Kids Code bans precise geolocation by default for under-18s |
| Messages and reactions | Sentiment, cohesion, leadership signals | Content is for members; metadata analysis needs disclosure | High | Instructure's 2026 breach exposed user messages (see Section 4); treat message bodies as never-analyzed-for-ads |
| Google Calendar / ICS class schedule | Availability, "find a time," co-enrollment | Explicit OAuth or file import; revocable | Medium-high (reveals course load, location patterns) | Class schedules are FERPA education records *when the school holds them*; a student importing their own ICS is outside FERPA but still CCPA personal information |
| Instagram / Discord / LinkedIn / GitHub links and imports | Graph, skills, work receipts | Per-integration opt-in | Medium | Platform ToS and API limits; LinkedIn import is essentially manual; GitHub OAuth is clean |
| Roster sync from the university (SIS, ID-card swipes) | Ground truth for verification | Requires a university DPA; the university consents on the student's behalf under FERPA's school-official exception | High | FERPA: vendor must be under the institution's "direct control," use data only for the disclosed purpose, no redisclosure ([studentprivacy.ed.gov](https://studentprivacy.ed.gov/frequently-asked-questions)); directory-information opt-outs must be honored |
| Dining / dorm / campus location (opt-in) | Where campus life happens | Opt-in, foreground only, time-boxed (Snap Map model) | Very high | Precise geolocation is sensitive PI under CPRA; Maryland Kids Code default-off for minors; ATT if any cross-app linking |
| Peer signals (tags, endorsements, co-attendance) | Trust-weighted graph | The tagger consents; the tagged must be able to remove/approve | Medium | Instagram Teen Accounts now limit tagging to followed accounts; mirror this default for under-18s |
| Campus pulse (event volume, trends, anonymous sentiment) | Aggregate demand and mood | Aggregate only; k-anonymity thresholds | Low if aggregated properly | Aggregated/de-identified data is largely outside CCPA if it meets the statutory de-identification standard |

### 3.2 The legal map (US-first, with GDPR for international campuses)

**FERPA.** Applies to institutions receiving federal funds; rights transfer to the student at 18 or on enrolling in postsecondary education. FERPA only covers records "maintained by the school"; data students create on external platforms generally falls outside it ([FERPA overview](https://en.wikipedia.org/wiki/Family_Educational_Rights_and_Privacy_Act)). The moment a university feeds us rosters, we are inside FERPA and must satisfy the school-official exception (institutional service, direct control, legitimate educational interest, purpose limitation, no redisclosure) ([ED FAQ](https://studentprivacy.ed.gov/frequently-asked-questions)). Combining directory information with other data to reveal non-directory facts is itself a violation. Design consequence: keep a hard boundary between the *student-sourced* profile (our data, student-consented) and the *institution-sourced* verification layer (their data, DPA-governed, used only to verify).

**CCPA/CPRA.** Rights to know, delete, correct, opt out of sale *and* "sharing" (cross-context behavioral advertising), and to limit use of sensitive PI (precise geolocation, and by category, religion, sexual orientation, union membership). Minors under 16 require opt-in for sale; 13-15 can consent themselves ([California AG](https://oag.ca.gov/privacy/ccpa)). The CPPA's September 2025 package adds **risk assessments, automated decision-making technology rules, and cybersecurity audits**, with the DROP deletion platform adopted November 2025 ([CPPA regulations](https://www.cppa.ca.gov/regulations/)). A recommendation engine that ranks students for employers is squarely ADMT territory; plan for a risk assessment and a "why am I seeing this" explanation.

**State student-privacy laws.** All 50 states plus DC have them; the core prohibitions are targeted advertising on the service, amassing a profile for non-educational purposes, and selling student data. Most are K-12 (SOPIPA-style); roughly 15-20 states have limited higher-ed provisions ([FPF state laws](https://fpf.org/student-privacy-state-laws/)). Even where a college product is technically out of scope, universities' procurement offices apply K-12 norms by reflex, and the FTC applied them to Edmodo. The Student Privacy Pledge (nearly 500 signatories) was retired in April 2025; FPF now points to the SDPC National Data Protection Agreement ([FPF](https://fpf.org/student-privacy-pledge/)), which is the template university counsel will expect.

**Youth-privacy laws that catch 17-year-old freshmen.** The Maryland Kids Code (HB 603) took effect October 1, 2024, defines children as under 18, requires DPIAs by April 1, 2026, mandates high-privacy defaults, bans dark patterns, and prohibits precise geolocation by default ([Maryland General Assembly](https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/hb0603?ys=2024RS)). California's SB 976 addictive-feeds provisions were largely upheld by the Ninth Circuit on September 9, 2025 (the like-count-hiding provision was blocked) ([NetChoice v. Bonta](https://en.wikipedia.org/wiki/NetChoice_v._Bonta)). COPPA 2.0 passed the Senate in July 2024 proposing coverage to 16 ([COPPA](https://en.wikipedia.org/wiki/Children%27s_Online_Privacy_Protection_Act)). Design consequence: a meaningful share of first-semester freshmen are 17. Age-gate at signup, and give under-18s the "high-privacy default" profile (campus-only visibility, no location, no ad personalization) automatically, with an upgrade at 18.

**GDPR (international campuses, EU exchange students).** Six lawful bases; consent must be specific, freely given, unbundled, and as easy to withdraw as to give; rights to access, portability, and erasure; digital-consent age 13-16 by member state; DPIAs for high-risk processing; fines to 4% of turnover ([GDPR](https://en.wikipedia.org/wiki/General_Data_Protection_Regulation)). Meta's "consent or pay" model drew a €200M DMA fine in April 2025 ([Meta Platforms](https://en.wikipedia.org/wiki/Meta_Platforms)). Legitimate interest can cover on-platform personalization; ads and integrations need consent.

**Platform rules.** Apple's ATT requires permission for any linking of app data with third-party data for advertising, forbids fingerprinting and hashed-email workarounds, forbids gating features on consent, and applies unconditionally to educational and under-age accounts; privacy labels must cover every SDK ([Apple](https://developer.apple.com/app-store/user-privacy-and-data-use/)). Opt-in ran at roughly 4% in 2021 ([ATT](https://en.wikipedia.org/wiki/App_Tracking_Transparency)), so cross-app tracking is a dead end; first-party contextual and cohort ads are the only viable model. Google Play's Data safety form requires declaring collection *and* sharing for 13 categories including precise location, app activity, and messages, with third-party SDKs counted ([Android developers](https://developer.android.com/guide/topics/data/collect-share)).

**FTC.** Edmodo (May 2023) is the template case: collecting data on ~36M minors, using it for advertising, and "outsourcing its COPPA compliance responsibilities to schools." The order banned using student data for ads, limited retention, and carried a $6M penalty ([Edmodo](https://en.wikipedia.org/wiki/Edmodo)). Chegg's 2018 breach exposed ~40M users and produced a 2023 order mandating a security program and limits on collection ([Chegg](https://en.wikipedia.org/wiki/Chegg)). The FTC's 2023 proposed Meta order would bar monetizing under-18 data entirely ([FTC](https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-proposes-blanket-prohibition-preventing-facebook-monetizing-youth-data)). The 2022 dark-patterns report ([FTC](https://www.ftc.gov/reports/bringing-dark-patterns-light)) is the reference for what consent UI *cannot* look like.

---

## 4. Trust architecture: data-rich but not creepy

### 4.1 What happened to companies that got it wrong

| Case | What went wrong | Consequence | Lesson for us |
|---|---|---|---|
| Edmodo (FTC 2023) | Ads on student data; pushed consent duty onto teachers | $6M order, ad ban, company already dead | Never let the club officer or the university be your consent proxy for anything beyond verification |
| Chegg (FTC 2022-23) | Four breaches, 40M users | Mandated security program | Edtech is now a security-regulated category |
| PowerSchool (Dec 2024) | Credential compromise; hacker claimed 62.4M students and 9.5M teachers; earlier intrusions in August and September went unnoticed; 2025 re-extortion of individual districts; a 19-year-old college student pleaded guilty and got four years; Texas sued ([BleepingComputer](https://www.bleepingcomputer.com/tag/powerschool/)) | Multi-state litigation, lasting reputational damage | A single privileged support account can leak everything; segment and monitor |
| Instructure / Canvas (Apr-May 2026) | ShinyHunters breach reportedly touching ~8,800 institutions and ~275M records including names, emails, student IDs, and *user messages*; seven federal suits within days ([Instructure](https://en.wikipedia.org/wiki/Instructure); secondary summary, verify before quoting figures) | Called the largest education breach on record | Messages are a liability; minimize retention and encrypt at rest with per-campus keys |
| Instagram (Irish DPC 2022) | Public-by-default accounts for children; business-account contact info exposed | €405M | Defaults are the product decision regulators judge |
| Meta youth harm (2023-26) | State AG suits over addictive design; DSA probes; 2026 jury verdict in New Mexico and a large multistate settlement reported ([Meta Platforms](https://en.wikipedia.org/wiki/Meta_Platforms); secondary summary) | Multi-billion exposure | Engagement mechanics aimed at minors are under active scrutiny; streaks for 17-year-olds need a light touch |
| Venmo (FTC 2018) | Public feed by default; misrepresented privacy controls | 10 years of audits | "Social" is not a reason to make sensitive activity public |
| Strava heatmap (2018) | Aggregate map leaked base locations | Privacy zones, redesigned settings | Aggregates need their own threat model |
| Facebook News Feed (2006) | New surface for existing data | Apology and new controls | Re-surfacing data is a new disclosure; announce and default carefully |

### 4.2 What students actually say

- Only 48% of consumers now say the benefits of online services outweigh their privacy concerns, down from 58% in 2024; worry about privacy and security jumped from 60% to 70% in one year; only about 1 in 10 are "very willing" to share sensitive data even for a better experience; just 20% say providers are "very clear" about what they collect ([Deloitte Connectivity and Mobile Trends](https://www.deloitte.com/us/en/insights/industry/telecommunications/connectivity-mobile-trends-survey.html)).
- 73% of Americans feel they have little or no control over what companies do with their data; 56% frequently click "agree" without reading; 49% of under-30s now use a password manager, up from 20% in 2019 ([Pew 2023](https://www.pewresearch.org/internet/2023/10/18/how-americans-view-data-privacy/)).
- 75% will not buy from organizations they do not trust with data; 53% are now aware of their privacy laws, and awareness correlates with confidence ([Cisco 2024 Consumer Privacy Survey](https://www.cisco.com/c/en/us/about/trust-center/consumer-privacy-survey.html)).
- 64% say transparent privacy information strengthens trust; 33% would lose trust if data were shared with another organization for marketing; over 80% of breach victims say they would stop doing business with the company ([IAPP Privacy and Consumer Trust](https://iapp.org/resources/article/privacy-and-consumer-trust-summary/)).
- Teens: roughly a third use at least one platform "almost constantly"; Snapchat 55%, Instagram and TikTok ~60% ([Pew Teens 2024](https://www.pewresearch.org/internet/2024/12/12/teens-social-media-and-technology-2024/)). Their default expectation of "who can see this" is now set by Snap Map (dark until opened) and Teen Accounts (private by default).

Read-through: students share a lot *with peers and for a purpose*, punish companies that share it *with marketers*, and reward clarity. Deloitte's "1 in 10" figure concerns financial, biometric, and communications data; club membership, interests, and attendance are not in that bucket, which is why this category is workable.

### 4.3 The trust stack we should ship

| Component | Precedent | Our implementation |
|---|---|---|
| "What we know about you" page | Google My Activity (view, filter, delete, auto-delete, extra verification on shared devices) | A single page listing every profile field, every inferred tag, every integration, every log category, with per-row delete and a "why do you have this" tooltip |
| "Why am I seeing this" | Facebook's post and ad explainers (source, interaction frequency, popularity, advertiser-uploaded lists) ([Meta](https://about.fb.com/news/2019/03/why-am-i-seeing-this/)) | Every recommendation and every sponsored card carries a one-tap explanation naming the signals used; this also satisfies CPPA ADMT expectations |
| Per-audience visibility | Handshake (community / employers / private), GitHub (anonymized private activity), Snap Map (per-friend) | Four audiences on every field: Only me / Friends / Campus / Public, plus a separate **Employer view** switch that is off by default |
| High-privacy defaults for minors | Instagram Teen Accounts, Maryland Kids Code | Under-18 accounts: campus-only, no location, no ad personalization, no public search; auto-upgrade prompt at 18 |
| Portability | Discord 30-day export; GDPR Art. 20; Data Transfer Initiative's open framework ([DTI](https://dtinit.org/)); OB 3.0 credentials in a wallet | One-click JSON + PDF export; verified credentials exportable as OB 3.0 VCs so students can leave with their record |
| Deletion | CCPA, CPPA DROP | Account deletion within 30 days, with the club's roster history retained only as a de-identified count |
| No sale of raw PII; derived-only for ads | Discord ("we don't sell"), DuckDuckGo (contextual ads on the query, not the profile) ([DuckDuckGo](https://duckduckgo.com/privacy)), Signal ([Signal](https://signal.org/legal/)) | Ads are contextual (the event page you are on) or cohort-level (campus x interest cluster with k >= 100); no advertiser ever receives a student identifier; no data-broker relationships (this also keeps us out of ATT) |
| Student Data Bill of Rights | Student Privacy Pledge commitments (no selling, no behavioral targeting, no non-educational profiles, retention limits); GDPR rights list | A ten-line document, versioned, with a changelog; violations are a contractual breach with the university |
| Privacy manifesto | Signal ("we cannot decrypt"), DuckDuckGo ("We don't track you"), Fizz's anonymity positioning | Ours: "You own the record. Clubs verify it. The campus sees what you choose. Employers see it only when you hand it to them. Advertisers never see you." |
| University-facing DPA | FERPA school-official terms, SDPC National Data Protection Agreement, HECVAT questionnaires in procurement | A standard DPA that scopes institution-sourced data to verification only, names the purpose, forbids redisclosure, and commits to breach notice within 72 hours |
| Security posture | PowerSchool and Instructure show the failure modes | SSO for staff, no shared support credentials, per-tenant encryption keys, message retention limits, annual third-party audit published in summary |

---

## 5. Profile as distribution

**Public profiles as SEO.** LinkedIn's profile-strength meter was explicitly pitched as "for search engine visibility" ([LinkedIn](https://en.wikipedia.org/wiki/LinkedIn)); a public profile is a landing page that Google indexes and that the person themselves links from everywhere. GitHub's contribution graph is the developer equivalent: a resume that updates itself. For us, the indexable object is the **club page plus the student's public involvement card**, and the long tail is "[Name] [University] [Club]" queries by recruiters and by other students.

**Shareable cards.** Wrapped (1.2M tweets in one December; app-ranking boosts), Strava's Year in Sport, Letterboxd's Year in Review, Goodreads' Year in Books: each is a story-format export that costs the company nothing and drives installs. Ours is **"My Semester on Campus"**: events attended, clubs, hours, people met, the one club you never missed, plus a **club-level Wrapped** for officers ("your club ran 14 events, 312 unique attendees, 41% freshmen"). Ship it in the first week of December and the last week of April.

**The involvement transcript.** Suitable and CampusGroups already sell a co-curricular transcript to the institution; Credly shows that verified credentials get shared 650k+ times a month when there is a button for it. Our version is a **link and a PDF** (`/u/name/transcript`) that a student puts on a resume and in a Handshake or LinkedIn profile, with each line item verifiable via OB 3.0. Because it is issued by the club and co-signed by the university, it has something LinkedIn's self-asserted "Vice President, Robotics Club" does not: a receipt.

**Alumni persistence.** LinkedIn compounds because profiles never expire. Prompt an email swap from .edu to personal in senior spring; the transcript stays verifiable and alumni become the mentor and employer supply for the "looking for" field.

---

## 6. Concrete recommendation

### 6.1 Profile schema

Visibility: **Me** (only me), **F** (friends), **C** (campus, signed-in .edu), **P** (public), **E** (employer view, separate opt-in switch). Verification: **S** self-asserted, **P** peer-confirmed, **V** verified by club officer or institution record, **X** cryptographically issued (OB 3.0 credential).

| Field | Source | Default visibility | Verification |
|---|---|---|---|
| Name, photo, pronouns | Self, .edu SSO | C | V (SSO) |
| School, class year | SSO / .edu domain | C | V |
| Major(s), minor | Self (SIS if DPA) | C | S (V with DPA) |
| Dorm or commuter status | Self | F | S |
| Age bracket (under/over 18) | Self at signup | Me | S (drives defaults) |
| Interest tags (up to 20) | Self, plus inferred (labelled) | C | S |
| "My 4" (favorite clubs) | Self | C | S |
| Club memberships with dates | Roster (club officer) | C | V |
| Positions held with dates | Officer confirmation | C, E | V, X |
| Events attended (count and list) | Check-in | Count: C; list: F | V |
| Hours and awards | Club / department issue | C, E | X |
| Skills (asserted and inferred) | Self; inferred from roles and endorsements | C | S / P |
| Endorsements | Peers | C | P |
| Projects and links (GitHub, portfolio, LinkedIn, Instagram) | Self / OAuth | C | S (V via OAuth) |
| Availability and schedule | ICS import, Google Calendar OAuth | Me (free/busy only to F when enabled) | V (source) |
| Friends and connection graph | Mutual follows | F | P |
| Co-attendance graph | Derived from check-ins | Me (used for recs) | V |
| "Looking for" (co-founder, teammate, mentor, job, roommate) | Self | C (E for job) | S |
| Badges | Issued by clubs, departments, us | C, P optional | X |
| Precise location | Foreground opt-in only, time-boxed | Off | n/a |
| Inferred tags and cohort labels | Our models | Me (shown on the "what we know" page) | n/a |

### 6.2 Onboarding flow

**Day 1 (under 90 seconds, five inputs):** .edu SSO (gives name, school, email); class year; major; pick 3+ interest tags from a campus-specific list; follow 3 clubs (pre-ranked by tags and by what similar-major students joined). Age bracket is asked inline. Immediately show a personalized "this week on campus" feed so the value is visible before any further ask.

**First week (progressive, each ask attached to a payoff):** add a photo when the student first tags a friend ("so they recognize you"); connect calendar when they hit their first time conflict ("we'll only read free/busy"); add "looking for" when they open a project or recruiting post; import ICS when a club asks "who can make Tuesday 6pm?"

**First month:** first check-in produces the first receipt and a prompt to view the transcript; first officer role produces a verified credential and the employer-view explainer; profile levels (Rookie / Involved / Verified / All-Campus) with the "why" per field, LinkedIn-style.

**Never on day 1:** dorm, location, employer view, any integration beyond SSO.

### 6.3 The top 10 data-generating loops

1. **Check-in receipts.** QR or NFC at every event; the student gets a verified line on their transcript and sees who else is there; the club gets attendance analytics. Generates attendance, co-attendance, time-of-day patterns.
2. **Tag who was there.** Photo and roster tagging after an event with a notification to the tagged person (Facebook 2005). Generates graph and photos, and re-activates dormant users.
3. **Officer roster and role confirmation.** Officers confirm members and roles each semester to unlock club tools (room booking, funding forms). Generates the verified involvement record.
4. **Endorse for a role.** Members endorse an officer's competencies at semester end (LinkedIn endorsements, scoped to people who actually shared a club). Generates skills data with a provenance filter.
5. **"My 4" and lists.** Four favorite clubs, "events I'd never miss," "clubs to try next semester." Generates taste and intent; cheap identity content that is shareable.
6. **Semester Wrapped.** Personal and club-level recaps in December and April. Generates shares and installs, and a re-permissioning moment to review "what we know about you."
7. **Social streaks.** "You and Maya: 6 events together." Attend-with streaks, club streaks. Generates strong-tie graph signals. Keep off for under-18 accounts by default.
8. **"Looking for" board.** Co-founder, teammate, mentor, roommate, job. Generates explicit intent data, the highest-value signal for the employer product.
9. **Availability polls.** "Who can make Tuesday?" answered from imported free/busy. Generates schedule data with a clear consent moment and immediate group utility.
10. **Campus pulse.** Anonymous, Fizz-style reactions ("how was it?") after each event, plus aggregated trends. Generates sentiment at campus scale without user-level exposure.

### 6.4 Consent and tiers model

| Tier | What it covers | Consent mechanism | Default |
|---|---|---|---|
| 0. Essential | Account, SSO, rosters you join, events you RSVP or check in to, security logs | Terms of service; not switchable | On |
| 1. Personalization | On-platform recommendations from your own activity, inferred tags | Notice plus a single switch; each rec has "why" | On (off for under-18 recommendations that use co-attendance) |
| 2. Peer sharing | Friends seeing your attendance list, availability, tags of you | Per-field visibility; tagged users can approve or remove | Friends only |
| 3. Integrations | Calendar, GitHub, Instagram, LinkedIn, ICS | Per-integration OAuth, revocable from the "what we know" page | Off |
| 4. Employer view | Transcript, positions, skills, "looking for: job" | Explicit switch plus per-employer sharing (VC presentation) | Off |
| 5. Location | Foreground, time-boxed sharing for "who's around" | Opt-in at first use (Snap Map), 3h / 24h / until off | Off; unavailable under 18 |
| 6. Aggregate and research | Cohort-level analytics, campus pulse, quant engine, contextual ads | Disclosed; de-identified with k-anonymity floor; opt-out honored via CCPA/GPC | On (aggregate only) |

Ad rules that follow from the above: contextual (this event, this club page) or cohort-level (campus x interest cluster, minimum 100 students); never a student identifier to an advertiser; no ads personalized to under-18s; no third-party SDKs that would trigger ATT; every sponsored card carries "why am I seeing this." Employer products run on **Tier 4 only** (student-initiated presentations) plus **Tier 6** aggregate talent-pool analytics (e.g., "how many verified robotics-club officers graduate from these 40 schools in 2027").

---

## Profile and data product implications

1. **The verified involvement record is the product; the social profile is the acquisition wrapper.** Suitable and CampusGroups sell the record to universities; nobody has made it student-owned, portable, and fun. That is the wedge, and OB 3.0 / CLR 2.0 give it a standard for free.
2. **Every field needs a payoff line, and the payoff must be immediate.** LinkedIn's "3x more connection requests with five skills" is the archetype. If we cannot write the payoff sentence for a field, we should not ask for it.
3. **Check-in is the single highest-value action in the product.** It creates the receipt, the co-attendance graph, the club's analytics, and the Wrapped content all at once. Make it two seconds and make it feel like a reward.
4. **Design tagging as the re-engagement engine.** Facebook's photo tags and Strava's kudos worked because they created data about a person *without that person doing anything*, then pulled them in. "Tag who was there" is our version.
5. **Campus-only is the default; public is a choice; employer is a separate switch.** Venmo, Instagram (€405M), and News Feed all paid for public-by-default. Under-18 accounts get the Teen Accounts / Maryland Kids Code treatment automatically.
6. **Location is opt-in at first use, foreground, and time-boxed, or not at all.** Snap Map is the model; Strava's heatmap is the warning; Maryland bans default precise geolocation for minors.
7. **Build the "what we know about you" page before the recommendation engine.** It is cheaper than a lawsuit, it is a CPPA risk-assessment artifact, and Deloitte's data says clarity is the scarcest trust asset (only 20% find providers "very clear").
8. **Every recommendation and every ad carries a "why."** It satisfies ADMT expectations, it is a proven Meta pattern, and it turns the quant engine from creepy to legible.
9. **Never let a club officer or a university be the consent proxy for anything beyond verification.** Edmodo's core sin was outsourcing consent to teachers. The student consents to the profile; the institution consents only to verifying it.
10. **Ads are contextual or cohort-level, never identity-level, and never to minors.** ATT killed cross-app tracking (about 4% opt-in), the FTC wants a ban on monetizing under-18 data, and state laws forbid targeted ads on student data. The DuckDuckGo model (ad on the context, not the person) is both compliant and adequately monetizable on campus.
11. **Employer products run on student-initiated presentations plus aggregates.** A recruiter should receive a Verifiable Credential the student chose to send, or a cohort statistic. Never a searchable database of student PII by default.
12. **Semester Wrapped is the growth channel.** Wrapped, Year in Sport, Year in Review, and Year in Books all prove that returning the data as a story is free acquisition. Two releases a year, personal and club-level.
13. **Keep the institution-sourced data and the student-sourced data in separate boxes.** FERPA governs one; CCPA governs the other; mixing them (directory data plus other data revealing non-directory facts) is itself a violation.
14. **Treat security as a product feature from month one.** PowerSchool (62M records, one compromised support account, undetected earlier intrusions) and Instructure (messages exposed) are the reference disasters. Per-tenant keys, minimal message retention, no shared credentials, published audit summary.
15. **Portability is a growth feature, not a compliance cost.** An OB 3.0 export the student can put on Handshake, LinkedIn, or in a wallet is the same artifact that makes the transcript credible, keeps alumni attached, and makes universities comfortable signing the DPA.
