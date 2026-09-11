# 08 — Data Model, Profile Learning, and the Quant Engine

*Research track for the "college club operating system." Date: 2026-09-10.*

**Method note.** This report was assembled from primary sources (vendor docs, papers, engineering blogs) fetched directly; each claim carries its source inline. Where a canonical page could not be retrieved (e.g., the Irish DPC press release, Discord's Server Insights FAQ), the fact is stated from widely reported public record and flagged as such. Aim was 30+ distinct sources; 38 are cited.

---

## 1. Data modeling for a rich behavioral graph

### 1.1 The three layers you actually need

Every mature "learn everything" system separates three concerns that founders tend to collapse into one "database":

| Layer | Purpose | Shape | Mutability | Canonical examples |
|---|---|---|---|---|
| **Operational (system of record)** | Run the product: who is in which club, who is an officer, what events exist | Normalized relational tables (Postgres) | Mutable, transactional | Any CRM/LMS backend |
| **Event log (system of memory)** | Record everything that *happened*, forever | Append-only, wide, one row per fact | Immutable | Segment/Amplitude/Mixpanel tracks, Snowplow atomic events, Activity Schema |
| **Derived (system of insight)** | Profiles, features, scores, embeddings, graph projections | Materialized, versioned, recomputable | Rebuilt from layers 1+2 | Segment computed traits, Feast feature views, Palantir ontology objects |

The mistake to avoid is trying to make the operational schema also be the analytics schema. Kimball's Type 2 slowly-changing dimension pattern exists precisely because operational tables overwrite history: each change "adds a new row in the dimension with the updated attribute values," with a row-effective timestamp, expiration timestamp, and current-row flag ([Kimball Group](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-2/)). For a club OS, "who was treasurer of the Robotics Club on the day this $1,400 reimbursement was approved" is a question you must be able to answer two years later, so Position/Membership must be SCD-2 or bitemporal from day one.

### 1.2 Event logs: what the product-analytics vendors actually capture

Snowplow's canonical event is the most explicit public spec: ~131 atomic fields per event, including a UUID, event type, domain/session/network user IDs, several timestamps (device-created, collector-received, enriched), app/platform, device, geo, and marketing-attribution fields, plus "self-describing events" with vendor/name/format/version metadata and attachable "entities/contexts" that add columns per schema ([Snowplow canonical event](https://docs.snowplow.io/docs/fundamentals/canonical-event/)). The important design idea is the **entity attached to an event**: a `club_joined` event carries a `club` entity and a `person` entity and a `campus` entity, each with its own schema and version, rather than a bag of loosely typed properties.

Amplitude's tracking-plan guidance is pragmatic: name events `[Noun] + [Past-Tense Verb]` (`Event RSVPed`, not `RSVP Event`), enforce casing (it "captures `Song Played` and `song played` as two separate events"), distinguish event properties (per-instance) from user properties (persist until changed), and "plan and instrument your most important metrics, then iterate later" ([Amplitude Data Planning Playbook](https://amplitude.com/docs/data/data-planning-playbook)).

**The Activity Schema pattern** (Narrator) collapses the star schema into a single activity stream where "every row answers the same four questions: when, who, what happened, and what context came with it" — entity columns (`ts`, `customer`), an `activity` column, and `feature` columns. Benefits claimed: each activity defined once at source, predictable shape, relationships assembled at query time by customer and time rather than pre-joined, and fewer cascading changes ([activityschema.com](https://www.activityschema.com/)). For a small team this is the right analytics-layer shape: one `activity_stream` table keyed by `(actor_id, ts, activity)` is easier to reason about than 40 fact tables, and every quant model below can be expressed as a temporal join over it.

### 1.3 Relational vs graph vs ontology

- **Relational + graph extension.** Apache AGE is a PostgreSQL extension that adds nodes/edges, variable-length traversal, and an openCypher-like query language while retaining plain SQL ([Apache AGE](https://age.apache.org/)). This is the pragmatic v1 choice: one database, graph queries when you need them (co-membership, bridge students), SQL for everything else. A separate Neo4j/TigerGraph cluster is not justified until the campus graph is tens of millions of edges.
- **Ontology (Palantir Foundry).** Foundry's ontology is "an operational layer for the organization" that maps datasets into *object types* with *properties*, *link types* between them, plus kinetic elements — *action types* ("capture data from operators … or orchestrate decision-making processes") and *functions* (business logic), and *interfaces* for polymorphism ([Palantir Foundry Ontology docs](https://www.palantir.com/docs/foundry/ontology/overview)). The transferable idea is not the software but the discipline: every business noun (Person, Club, Event, Budget) is an object type with typed links, and every business verb (Approve reimbursement, Elect officer, Check in) is an *action* that both mutates state and emits an event. Model the club OS this way and the event log and the operational schema stay consistent by construction.

### 1.4 CDP concepts: identity resolution, traits, computed traits

Segment's "Unify" layer resolves identities across anonymous IDs, emails, device IDs, and custom identifiers into a single profile, and then supports nine **computed trait** types: event counter, aggregation (sum/avg/min/max of a property), most frequent, first, last, unique list, unique-list count, plus ML-based predictions and recommended items; traits are then sent downstream via Identify/Track calls and used to build audiences ([Segment computed traits](https://www.twilio.com/docs/segment/unify/traits/computed-traits)). Hightouch's "composable CDP" argument is that a packaged CDP bundles storage, identity resolution, audience building and syncing so "you are inevitably forced to pay for every feature set," creating "a second source of truth," while a warehouse-native CDP is just an activation layer over your own warehouse and SQL models ([Hightouch](https://hightouch.com/blog/composable-cdp)). Common Room shows the community-specific version: identity resolution across GitHub, Slack, CRM, website and product usage into "a single, continuously updated view" of each person, with dedupe/staleness handled by an agent ([Common Room](https://www.commonroom.io/product/)).

**Translation for clubs:** a computed-trait engine is exactly what "a profile that learns continuously" is. The trait catalogue *is* the profile. Do not buy Segment; build the nine trait types as dbt models over the activity stream.

### 1.5 Feature stores: profiles → features with point-in-time correctness

Feast defines *entities* (join keys such as `person_id`), *feature views* (time-series features per entity), and retrieves training data via **point-in-time joins** so it "is able to reproduce the state of features at a specific point in the past"; a TTL bounds how far back the join looks, and it is relative to each row's timestamp, not query time ([Feast point-in-time joins](https://docs.feast.dev/getting-started/concepts/point-in-time-joins)). This matters enormously for the quant engine: if you train "will this member churn next semester" using features that include *next semester's* attendance, you leak the label. A tiny team does not need Feast; it needs the *discipline* — every feature table has `(entity_id, feature_ts)` and training joins are `ASOF`.

### 1.6 Temporal modeling: bitemporal, SCD-2, as-of

Fowler's bitemporal history separates **actual time** (when the fact was true in the world) from **record time** (when the system learned it), so a query is `salaryAt(actualDate, recordDate)`; record history is append-only even when actual history is corrected retroactively ([Martin Fowler](https://martinfowler.com/articles/bitemporal-history.html)). Club life is full of late-arriving facts: attendance sheets entered a week later, an election result ratified retroactively, a reimbursement re-categorized. Postgres range types + exclusion constraints implement this cleanly:

```sql
CREATE TABLE position (
  position_id   uuid PRIMARY KEY,
  person_id     uuid NOT NULL REFERENCES person,
  club_id       uuid NOT NULL REFERENCES club,
  role          text NOT NULL,          -- 'president','treasurer',...
  valid         tstzrange NOT NULL,     -- actual time: held from/to
  recorded      tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),  -- record time
  source_event  uuid,                   -- election / appointment event
  EXCLUDE USING gist (club_id WITH =, role WITH =, valid WITH &&)
    WHERE (upper_inf(recorded))         -- one current holder per role per interval
);
-- as-of query: who was treasurer on 2025-11-03 as we know it now?
SELECT person_id FROM position
 WHERE club_id=$1 AND role='treasurer' AND valid @> '2025-11-03'::timestamptz AND upper_inf(recorded);
```

### 1.7 Recommended schema approach per entity

| Entity | Modeling pattern | Key relations / notes |
|---|---|---|
| **Person** | Slowly-changing core row + immutable `person_identity` (edu email, student ID hash, phone, OAuth subjects) | Identity graph table for merges; `campus_id`, `cohort_year`, `expected_grad_term` |
| **Club** | SCD-2 (name, category, status, parent org, advisor) | `club_taxonomy` (multi-label); `club_similarity` is derived |
| **Position** | Bitemporal (`valid`, `recorded`) as above | Emits `position_started/ended` events; is the source of "leadership" skill inference |
| **Membership** | Bitemporal with `tier` (prospect/member/active/officer/alumni) and `joined_via` | One row per continuous stint; re-joins create new rows |
| **Event** | Operational row + versioned `event_revision` (time/venue changes matter for forecasting) | `event_type`, `capacity`, `cost`, `sponsor_id`, `recurrence_id`, `competes_with` derived |
| **Attendance** | Append-only fact `(person_id, event_id, status, checkin_ts, method)` | Status ∈ {rsvp, waitlist, checked_in, no_show, walk_in}; never update, insert new status rows |
| **Post / Message** | Append-only content rows with `thread_id`, `reactions` as separate facts | Store embeddings separately; store *derived* topic labels, not raw text, in the profile |
| **Transaction** | Double-entry ledger: `journal_entry` + `journal_line(account, debit, credit)` | Immutable; corrections are reversing entries. Required for fraud detection (§3.7) |
| **Sponsorship** | Contract row + linked transactions + deliverables | `employer_id`, `amount`, `in_kind`, `term` |
| **Budget** | Versioned budget lines per fiscal term; actuals derived from ledger | `allocated`, `requested`, `spent` are views, not columns |
| **Form response** | Self-describing event (JSON Schema versioned) | Snowplow-style `schema_vendor/name/version` |
| **Election** | Election + candidacy + ballot (hashed voter) + result; result emits Position rows | Ballot secrecy: store `voter_hash` with salt, count separately |
| **Integration signal** | Raw `integration_signal(source, external_id, payload, observed_ts)` → normalized events | GCal event → Event; Instagram post → Post with `channel='instagram'` |
| **Employer** | Organization row + `employer_interest(skill_tags, target_clubs)` | Links to Sponsorship and Ad |
| **Ad** | Campaign + creative + `ad_impression/click` events | Attribution via activity stream |

All of these emit rows into one `activity_stream` (Activity Schema) and the operational tables are the thing the app reads.

---

## 2. User modeling: "learning everything about them," responsibly

### 2.1 Representations: embeddings and taxonomies

Industrial recommenders learn a **user tower** and an **item tower**. Google's YouTube retrieval model uses "two-tower neural networks where … item tower is used to encode a wide variety of item features," trained with in-batch softmax and a streaming correction for the sampling bias that "could severely restrict model performance, particularly in the case of power-law distribution" ([Google Research](https://research.google/pubs/sampling-bias-corrected-neural-modeling-for-large-corpus-item-recommendations/)). Pinterest's PinSage applies graph convolutions over "3 billion nodes representing pins and boards, and 18 billion edges," with random-walk-based neighborhoods and curriculum "harder examples" ([PinSage, arXiv 1806.01973](https://arxiv.org/abs/1806.01973)). A campus is a bipartite person–club–event graph at ~10⁴–10⁵ nodes, so PinSage-style GNNs are overkill, but the *shape* transfers: person embedding ≈ aggregation of the embeddings of clubs, events, and posts they touched, weighted by recency.

Taxonomies are the interpretable complement. LinkedIn's skills taxonomy has "more than 41,000 skills"; skills are extracted from profiles, job posts, courses, resumes and feed content via (i) trie-based exact matching, (ii) semantic matching that can infer "Mobile Development" from "experience with design of iOS application," (iii) graph expansion to parent/child/sibling skills, and (iv) a multitask scoring/normalization model that folds "data analytics" and "data analysis" together ([LinkedIn Engineering](https://www.linkedin.com/blog/engineering/skills-graph/extracting-skills-from-content)). Google's (now-deprecated) Topics API is the privacy-conscious end of the spectrum: ~350 coarse topics (vs ~1,500 in the IAB taxonomy), inferred *on device* from hostnames only, top-5 topics per weekly epoch, "a 5% chance that a per-user, per-site, per-epoch random topic is chosen," and three-week retention ([Topics explainer](https://github.com/patcg-individual-drafts/topics)). The design lesson: a coarse, capped, decaying, deliberately noisy interest vector is *more* defensible and nearly as useful as a raw browsing log.

### 2.2 Skills inference from club activity logs

The club OS has something LinkedIn lacks: ground-truth *behavior*, not self-report. Skills can be inferred as weighted evidence over the activity stream:

| Inferred skill | Positive evidence (events) | Weighting notes |
|---|---|---|
| Event planning | `event_created` (as organizer), `venue_booked`, `event_published`, attendance ≥ forecast, `checkin_rate` | Weight by attendance achieved / capacity and by repeat |
| Fundraising | `sponsorship_signed` (as contact), `fundraiser_created`, ledger inflows tagged donation/sponsor attributable to person | Weight by $ raised, decayed |
| Leadership | `position_started` (officer), `election_won`, `meeting_hosted`, `task_assigned` → `task_completed` by others | Weight by club size and tenure |
| Budgeting / finance | `reimbursement_approved`, `budget_submitted`, low variance between budget and actuals | Treasurer role is prior, not proof |
| Marketing / content | `post_published`, reach, `instagram_post_synced`, click-through to `event_rsvped` | Attribution via activity stream |
| Recruiting / community building | `member_invited` → `member_joined` conversion, retention of members they onboarded | Use uplift, not raw counts (§3.4) |
| Public speaking | `speaker_at_event`, `workshop_hosted` | Explicit tag required by organizer |

Implement as LinkedIn does: a rules/trie layer (role → prior skills), a model layer (features → calibrated probability), then graph expansion, with a human-verifiable "evidence" list on the profile. Never display an inferred skill without the events that produced it.

### 2.3 Behavioral segmentation and lifecycle states

Duolingo's growth model assigns each user daily to one of seven mutually exclusive states — new, current (active today and in the past week), reactivated (active today, inactive past week), resurrected (active after 30+ days), and three at-risk/dormant states at 7, 22, and 30+ days — and models transition rates; simulation showed "increasing the Current User Retention Rate (CURR) 2% month-over-month had the largest impact on DAU," and focusing on CURR produced roughly 4× DAU growth since 2019 ([Duolingo blog](https://blog.duolingo.com/growth-model-duolingo/)). Social Capital / Tribe Capital growth accounting is the ledger version: New + Retained + Resurrected + Expansion − Contraction − Churned, with Quick Ratio = gains / losses ("values below 1.0x indicate shrinking") ([Tribe Capital](https://tribecap.co/a-quantitative-approach-to-product-market-fit/)). For a club OS the natural unit is the *semester* and the states apply at two levels: person-in-platform and person-in-club.

### 2.4 Implicit vs explicit signals: what is worth collecting

| Signal | Explicit / implicit | Value | Privacy cost | Verdict |
|---|---|---|---|---|
| Club joins, officer roles, event check-ins | Explicit, high-intent | Very high | Low (it is the product) | Collect |
| RSVP → attend / no-show | Implicit | Very high (reliability, forecasting) | Low | Collect |
| Post/message *metadata* (who, when, thread, reactions) | Implicit | High (graph, cadence) | Medium | Collect |
| Message *content* | Implicit | Medium (topics) | High | Do not profile from DMs; club-channel topic labels only, with disclosure |
| Feed dwell/scroll, notification opens | Implicit | Medium | Low-medium | Collect, aggregate weekly |
| Interests declared at onboarding | Explicit | High for cold start | Low | Collect (and let user edit) |
| Major, year, dorm | Explicit | High (Facebook100 shows these drive campus network structure) | Medium; dorm is sensitive | Major/year yes; dorm only opt-in |
| GCal free/busy | Implicit | High for scheduling optimization | High | Opt-in, store free/busy bitmap only |
| Instagram follows/likes | Implicit | Low-medium | High | Sync *club* accounts only, never personal graphs |
| Location / Bluetooth proximity | Implicit | Medium | Very high | Do not collect |
| Financial transactions (dues, reimbursements) | Explicit | High (club health, fraud) | Medium | Collect at club level; person-level only for their own transactions |
| GPA / grades | Explicit | High for causal research | Very high; FERPA education record | Never ingest; partner with institutional research for aggregate studies |

### 2.5 Privacy and law: the constraints that shape "learn everything"

- **GDPR Article 22** gives individuals a right not to be subject to a decision "based solely on automated processing, including profiling, which produces legal effects … or similarly significantly affects" them, with exceptions for contract necessity, law, or explicit consent, and mandatory safeguards (human review, contest) — and bars such decisions on Article 9 special-category data absent specific bases ([Art. 22 GDPR](https://gdpr-info.eu/art-22-gdpr/)). Employer-facing scoring of students is squarely in this zone.
- **Meta's fines are the cautionary tale.** In January 2023 the Irish DPC fined Meta €390M (€210M Facebook, €180M Instagram) after the EDPB found that "contract" was not a valid legal basis for behavioural advertising; in May 2023 it added a €1.2B fine for EU–US transfers "without adequate privacy protections" ([Wikipedia GDPR fines table](https://en.wikipedia.org/wiki/GDPR_fines_and_notices); DPC press releases at [dataprotection.ie](https://www.dataprotection.ie/), Jan and May 2023 — the Jan release could not be fetched for this report and is stated from public record). The lesson: profiling for ads needs *consent*, not terms-of-service.
- **FERPA** protects "education records" — records "directly related to a student" and "maintained by an educational agency or institution," including attendance and grades — and allows disclosure of designated *directory information* (name, email, major, enrollment status) without consent, subject to opt-out ([studentprivacy.ed.gov](https://studentprivacy.ed.gov/ferpa)). A third-party club platform is not itself covered, but the moment a university adopts it as a "school official" or feeds it registrar data, FERPA attaches. Design so that FERPA-covered data never enters the profile store.
- **Differential privacy** provides a formal budget ε; NIST notes "smaller values of ε yield better privacy," that deployed systems sit around ε 2–20 (Apple 2–16 per user/day, Census 19.61, Google Mobility 2.64), and that none "has yet been the target of a successful privacy attack" ([NIST](https://www.nist.gov/blogs/cybersecurity-insights/differential-privacy-future-work-open-challenges)). Use DP for anything exported to universities, employers, or advertisers in aggregate (e.g., "how many CS juniors attended hackathons").
- **Employment fairness.** Under the Uniform Guidelines, a selection rate for any group "less than four-fifths (4/5) (or eighty percent) of the rate for the group with the highest rate will generally be regarded … as evidence of adverse impact" ([29 CFR 1607.4](https://www.law.cornell.edu/cfr/text/29/1607.4)). Any employer-facing score must be audited against this.

---

## 3. The quant engine

### 3.1 Club Health Index (composite)

Precedents: the Orbit Model defines **Love** ("alignment and activity toward the community's mission"), **Reach** ("sphere of influence … connectedness"), and **Gravity = Love × Reach**, with four orbit levels (Advocates, Contributors, Participants, Explorers) ([Orbit Model](https://orbit-model.joshed.io/); [GitHub](https://github.com/orbit-love/orbit-model)). CHAOSS's *bus factor* is "the smallest number of contributors responsible for 50% of total contributions" ([CHAOSS](https://chaoss.community/kb/metric-bus-factor/)). Slack found that "after 2,000 messages, 93% of those customers are still using Slack" — an activation threshold, not a vanity count ([First Round Review](https://review.firstround.com/from-0-to-1b-slacks-founder-shares-their-epic-launch-strategy/)). Discord's Server Insights (for servers ≥500 members) reports growth/activation, engagement (communicators, visitors), and retention cohorts — stated from the public [Server Insights FAQ](https://support.discord.com/hc/en-us/articles/360036661832), which could not be fetched here. Strava's Fitness/Fatigue/Form uses Banister's 1975 impulse-response model: fitness is a long-time-constant exponentially weighted load, fatigue a short one, and "Form is … the difference between your Fitness and Fatigue" ([Strava](https://support.strava.com/hc/en-us/articles/216918477-Fitness-Freshness)). That exact model is a beautiful fit for clubs: **club fitness** = 42-day EWMA of activity, **club fatigue** = 7-day EWMA, **form** = fitness − fatigue (a club that just ran a huge event is "fatigued"; one with steady cadence is "in form").

Proposed **Club Health Index (CHI)**, 0–100, computed weekly per club:

$$
\text{CHI} = 100 \cdot \sum_{k} w_k \cdot \sigma\!\left(\frac{x_k - \mu_k^{\text{peer}}}{s_k^{\text{peer}}}\right)
$$

where each component $x_k$ is z-scored against a *peer group* (same campus, same size band, same category) and squashed with a logistic $\sigma$ so a single outlier cannot dominate.

| k | Component | Definition | Weight |
|---|---|---|---|
| 1 | **Retention** | Fraction of last-semester active members active this semester (Duolingo CURR analogue) | 0.20 |
| 2 | **Attendance trend** | Slope of 8-week EWMA of (check-ins / RSVPs) and check-ins per event vs same term last year | 0.15 |
| 3 | **Officer engagement** | Officer weekly active rate; task completion; median response latency in club channels | 0.15 |
| 4 | **Bus factor** | CHAOSS-style: # people producing 50% of posts/events/tasks; higher is healthier | 0.10 |
| 5 | **Funding runway** | (cash + committed sponsorship) / trailing 3-month burn, capped at 12 months | 0.10 |
| 6 | **Content cadence** | Weeks with ≥1 post/event out of last 8; Strava-style "form" | 0.10 |
| 7 | **Network centrality** | Club's PageRank in the person–club bipartite projection, and share of members who are bridge students | 0.10 |
| 8 | **Pipeline** | New members in last 30 days / active members; prospect→member conversion | 0.10 |

Report both the number and a one-line *why* per component (the Orbit/CHAOSS lesson: interpretable, contestable).

### 3.2 Forecasting

- **Attendance.** Prophet is "an additive model where non-linear trends are fit with yearly, weekly, and daily seasonality, plus holiday effects," robust to missing data and outliers, and fits in seconds via Stan ([Prophet](https://facebook.github.io/prophet/)). For per-event forecasts, gradient boosting on features is better: day-of-week, hour, week-of-semester, days-to-finals, weather, food offered (binary), venue capacity, RSVP count at T−48h/T−24h, organizer's historical RSVP→check-in ratio, number of competing events in the same 2-hour window on campus, and the club's CHI. Target: `checkins`; also predict `checkins/rsvps` (show-up rate) which is far more stable than raw counts. Prophet with "semester" seasonality (regressors for finals week, spring break, welcome week) handles campus-level volume.
- **Churn / survival.** Survival analysis exists because "ignoring censored individuals leads to severe underestimation" of lifetimes; the survival function $S(t)=\Pr(T>t)$, hazard $h(t)$, and $S(t)=\exp(-H(t))$ are the core objects ([lifelines](https://lifelines.readthedocs.io/en/latest/Survival%20Analysis%20intro.html)). For memberships: Kaplan–Meier by cohort (joined fall vs spring; freshman vs junior), Cox PH with covariates (attended ≥2 events in first 30 days, has a friend in the club, is an officer), and a **discrete-time hazard model** at the *semester* grain, which is the natural clock. The **graduation cliff** is a deterministic hazard spike at `expected_grad_term`; model it as a known censoring event, not churn, so it does not pollute the model.
- **Semester seasonality.** Model term-relative time (`week_of_term` ∈ 1..16) rather than calendar week; campus-level Prophet with a per-campus academic calendar table.

### 3.3 Network science on the student–club graph

Traud, Mucha & Porter's Facebook100 study of 100 US universities found that gender, class year, major, high school and residence (dorm) structure friendship networks, with "common high school … more important … at large institutions" and major's importance varying by institution, using assortativity at the dyadic level and community detection at the macro level ([Traud, Mucha, Porter, arXiv 1102.2166](https://arxiv.org/abs/1102.2166)). Expect the same homophily axes to dominate club co-membership.

Methods that apply:

| Question | Method | Notes |
|---|---|---|
| Which clubs are "hubs"? | PageRank / eigenvector centrality on the club–club projection (edge weight = shared members) | Reweight by 1/club size to avoid size bias |
| Who are super-connectors? | Betweenness on the person–person projection (edge = co-membership or co-attendance) | Bridge students = high betweenness, low degree |
| Community structure | Leiden, not Louvain: Louvain "may yield arbitrarily badly connected communities" (≈25% badly connected, up to 16% disconnected), while Leiden guarantees connected communities and converges to locally optimal partitions ([Traag et al., arXiv 1810.08473](https://arxiv.org/abs/1810.08473)) | Run on bipartite modularity or on projections |
| Club similarity | Jaccard on member sets; truncated SVD / ALS on the person×club matrix; cosine on club embeddings | SVD factors ≈ latent "campus interest dimensions" |
| Hierarchy | Ravasz–Barabási: clustering coefficient scaling $C(k)\sim k^{-1}$ is the signature of hierarchical modularity ([Ravasz & Barabási](https://arxiv.org/abs/cond-mat/0206130)) | Expect umbrella orgs → clubs → committees |
| Recommendations | Personalized PageRank from the person node; two-tower fallback | Cold start uses declared interests + major/year |

### 3.4 Causal inference and uplift

The higher-ed literature supplies priors but not causal identification. Astin's involvement theory (originally 1984, reprinted in *J. College Student Development*, 1999; Routledge reprint DOI 10.4324/9781315051888-15) holds that learning and persistence scale with the physical and psychological energy students invest; Tinto's 1975 integration model ("Dropout from Higher Education," *Review of Educational Research*, DOI 10.3102/00346543045001089, ~3,800 citations per CrossRef) puts social integration alongside academic integration as the drivers of persistence. Webber, Krylow & Zhang (2013) found "higher levels of engagement in a variety of curricular and cocurricular activities significantly contribute to cumulative GPA" and satisfaction (*J. College Student Development*, DOI 10.1353/csd.2013.0090). AAC&U's high-impact practices list (learning communities, service learning, undergraduate research, etc.) is claimed to "provide significant educational benefits," especially for underserved students, but the page gives no effect sizes ([AAC&U](https://www.aacu.org/trending-topics/high-impact)). None of this is causal at the level of "joining club X."

What the platform can do that the literature cannot:

- **Propensity-score matching / IPW** on `joined_club` using pre-join features (year, major, prior activity, declared interests) to estimate the effect on next-semester platform retention, event attendance, and — with a university IR partner and DP aggregates — persistence.
- **Difference-in-differences** when a club launches, dies, or changes format, comparing its members' trajectories to matched non-members.
- **Uplift modeling** for nudges. CausalML's meta-learners — S (single model with treatment as feature), T (separate models), X (imputes individual effects, best when groups differ), R (orthogonalized loss) — plus uplift trees (KL/χ²/ΔΔP splits), evaluated by uplift/Qini curves ([CausalML](https://causalml.readthedocs.io/en/latest/methodology.html)). The question is never "who is likely to attend" but "whose attendance changes because we nudged" — persuadables only.

### 3.5 Funding allocation as portfolio and fair division

SGA budget allocation is a constrained allocation problem with fairness constraints, not a return-maximization problem. The cleanest mechanism is the **Method of Equal Shares**: divide the budget equally among voters, consider projects in order of support, fund a project when supporters' remaining shares cover its cost, split cost equally among supporters; it guarantees proportional representation so "all interest groups will be represented," and is deployed in Winterthur, Aarau, Assen, Świecie and Wieliczka ([equalshares.net](https://equalshares.net/)). Aziz & Shah's survey formalizes PB with welfare objectives, fairness axioms and incentive properties ([arXiv 2003.00606](https://arxiv.org/abs/2003.00606)). Layer on top:

- **Event ROI** metrics per event and per club: cost per attendee, cost per *new* member (attendee with no prior membership who joins within 30 days), cost per *retained* member (attendee active next semester), all attributed via the activity stream.
- **Marginal-return curves**: fit `new_members = a · (1 − e^{−b · spend})` per club/event type; allocate the marginal dollar where the derivative is highest, subject to Equal-Shares floors.
- **Markowitz-style diversification**: treat event types (social, speaker, workshop, service, competition) as assets with mean attendance-per-dollar and covariance across weeks; a portfolio of low-covariance formats stabilizes semester attendance the way uncorrelated assets stabilize returns. This is a heuristic, not a financial claim.
- **Bayesian A/B** for formats (Beta–Binomial on show-up rate; Normal on attendance) with Thompson sampling to pick next format — see §3.6.

### 3.6 Bandit-driven nudges

Duolingo's KDD 2020 paper (Yancey & Settles, "A Sleeping, Recovering Bandit Algorithm for Optimizing Recurring Notifications," DOI 10.1145/3394486.3403351) treats notification template choice as a bandit where arms "sleep" after use and "recover" over time, capturing novelty decay. Thompson sampling is the practical default because it "addresses a broad range of problems in a computationally efficient manner" while balancing exploration and exploitation ([Russo et al., arXiv 1707.02038](https://arxiv.org/abs/1707.02038)). Applications: (a) which club to recommend to a freshman with sparse history — contextual bandit with major/year/interests context; (b) which member to nudge to run for office — rank by uplift-model score, then bandit over message variants; (c) event reminder timing — sleeping/recovering arms so the same nudge is not repeated. Guardrail: cap nudges per person per week, and never bandit-optimize on employer-facing outcomes.

### 3.7 Anomaly detection: finances and dying clubs

- **Finance.** Double-entry ledger first; then (i) Benford's law, $P(d)=\log_{10}(1+1/d)$, on reimbursement amounts pooled across the campus — applicable because amounts span orders of magnitude and are products of quantity × price, and it "has been admitted as evidence in U.S. criminal cases," with the caveat that it fails on narrow-range or psychologically priced data ([Wikipedia](https://en.wikipedia.org/wiki/Benford%27s_law)); (ii) rule-based flags (payee = officer, round amounts, just-under-approval-threshold splitting, weekend approvals, same approver-and-payee); (iii) Isolation Forest on transaction feature vectors — it "performs well across diverse datasets without requiring distribution assumptions," while LOF suits locally varying density ([scikit-learn](https://scikit-learn.org/stable/modules/outlier_detection.html)). Route flags to the advisor, not to the club.
- **Dying clubs.** A drop in CHI form (fitness − fatigue turning negative for 4+ weeks), bus factor falling to 1, officer WAU → 0, no event scheduled in next 30 days, and a graduation cliff (≥50% of officers graduating) is a *succession risk* alert issued in March, not in September when it is too late.

### 3.8 Member lifetime value

$$
\text{LTV}_{\text{engagement}} = \sum_{s=0}^{S} \gamma^{s} \cdot \Pr(\text{active}_s) \cdot E[\text{engagement}_s], \qquad
\text{LTV}_{\$} = \sum_{s} \gamma^{s} \Pr(\text{active}_s)\left(\text{ARPU}^{\text{ads}}_s + \text{dues}_s + \text{sponsor}_s\right)
$$

with $\Pr(\text{active}_s)$ from the discrete-time survival model, $S$ capped at semesters to graduation, and a network term (value of members they recruit, from the uplift model). Engagement-unit LTV is what club officers see; $-LTV is internal.

### 3.9 Scoring students for employers

LinkedIn's approach is to expose *skills with evidence* and let recruiters filter; Handshake's is structured profile fields plus employer-side filters by school, major, year and interests. Neither publishes a single "involvement score," and the platform should not either. A defensible design:

1. **Evidence, not scores.** Show verified facts: "Treasurer, Robotics Club, Sep 2025–May 2026; managed $12,400 budget; organized 6 events averaging 48 attendees." Every line links to events.
2. **Student-controlled.** Opt-in per employer, per field; GDPR Art. 22-style human review and contest.
3. **Fairness audit.** Compute selection rates by protected class for any ranking or filter and apply the four-fifths rule ([29 CFR 1607.4](https://www.law.cornell.edu/cfr/text/29/1607.4)); involvement correlates with time and money (working students, commuters), so raw counts will show disparate impact.
4. **Goodhart resistance.** "When a measure becomes a target, it ceases to be a good measure" ([Goodhart's law](https://en.wikipedia.org/wiki/Goodhart%27s_law)); if a number is shown, base it on *outcomes others produced* (retention of members you recruited, attendance at events you ran) rather than on your own clicks, and cap the contribution of any one activity.

---

## 4. Analytics / BI stack for a small team

| Layer | v1 recommendation | Why |
|---|---|---|
| Operational DB | **Postgres 16 + Apache AGE** | One database; range types for bitemporal; AGE for Cypher-style graph queries ([AGE](https://age.apache.org/)) |
| Event capture | **PostHog** (cloud free tier: 1M events, 5K session replays, 1M feature-flag requests, 1.5K survey responses per month; "97% of companies use PostHog without paying") ([PostHog pricing](https://posthog.com/pricing)) | Product analytics + flags + replay + surveys in one SDK; self-hostable later. Amplitude's free plan is 2M events/month "forever" with 10K replays ([Amplitude pricing](https://amplitude.com/pricing)) — fine as a secondary, but PostHog's flags make it the primary |
| Activity stream / warehouse | **Postgres → nightly Parquet → DuckDB** in v1; **ClickHouse** in v2 | DuckDB is in-process, columnar-vectorized, reads Parquet and Postgres directly, zero-ops ([DuckDB](https://duckdb.org/why_duckdb)); ClickHouse is the column-oriented OLAP store for billions of rows with sub-second queries when you outgrow it ([ClickHouse](https://clickhouse.com/docs/intro)) |
| Transformation | **dbt Core** | SQL models, tests, docs, lineage; open-source CLI ([dbt](https://docs.getdbt.com/docs/introduction)). Computed traits and CHI live here |
| BI | **Metabase** OSS, self-hosted (JAR/Docker), connects to Postgres and ClickHouse ([Metabase](https://www.metabase.com/docs/latest/)) | Club-officer dashboards can be embedded |
| Activation | dbt models → app tables (reverse-ETL in-house); Hightouch/Census only if you need third-party destinations | Composable-CDP pattern ([Hightouch](https://hightouch.com/blog/composable-cdp)) |
| Features / ML | dbt feature tables with `(entity_id, feature_ts)`; scikit-learn, lifelines, CausalML, Prophet in a scheduled Python job | Feast only when online serving latency matters |

**Tracking plan rules** (Amplitude): `Object Verb-ed` naming, fixed casing, event properties vs user properties, start with the 30 events below and iterate ([Amplitude](https://amplitude.com/docs/data/data-planning-playbook)). Every event carries the Snowplow-style entity contexts `person`, `club`, `campus`, `event`, `session`.

---

## 5. Precedents for a "quant engine on a community"

| Precedent | What they operationalize | Transfer to clubs |
|---|---|---|
| Palantir Foundry ontology | Objects, links, actions, functions as the operational layer ([docs](https://www.palantir.com/docs/foundry/ontology/overview)) | Model verbs as actions that emit events |
| Duolingo growth model | Seven daily states; CURR as the lever; simulation before A/B ([blog](https://blog.duolingo.com/growth-model-duolingo/)) | Semester-grain states per person and per club-membership |
| Duolingo notification bandit | Sleeping/recovering arms for recurring nudges (KDD 2020) | Reminder and recruitment nudges |
| Facebook / Social Capital growth accounting | New/Retained/Resurrected/Churned, Quick Ratio ([Tribe Capital](https://tribecap.co/a-quantitative-approach-to-product-market-fit/)) | Campus-level and club-level accounting every term |
| Slack | 2,000 messages → 93% retained ([First Round](https://review.firstround.com/from-0-to-1b-slacks-founder-shares-their-epic-launch-strategy/)) | Find the club "magic number" (e.g., 3 events with ≥10 check-ins in first 6 weeks) |
| Strava | Banister impulse-response fitness/fatigue/form ([Strava](https://support.strava.com/hc/en-us/articles/216918477-Fitness-Freshness)) | Club form = long EWMA − short EWMA |
| Orbit / Common Room | Love × Reach = Gravity; orbit levels; cross-channel identity resolution ([Orbit](https://orbit-model.joshed.io/), [Common Room](https://www.commonroom.io/product/)) | Member orbit levels per club |
| CHAOSS | Bus factor, activity, retention metric models ([CHAOSS](https://chaoss.community/kb/metric-bus-factor/)) | Officer concentration risk |
| Discord Server Insights | Growth, activation, engagement, retention cohorts for large servers | Club-officer dashboard scope |
| Reddit Mod Insights | Views, members, posts, comments, contributors per community (public feature; page not fetched) | Same |
| Pinterest / YouTube | Graph and two-tower embeddings ([PinSage](https://arxiv.org/abs/1806.01973), [Google](https://research.google/pubs/sampling-bias-corrected-neural-modeling-for-large-corpus-item-recommendations/)) | Person/club embeddings for the feed |

---

## Recommended data + quant architecture

### A. Core schema (entities and key relations)

```
person ──< person_identity (edu_email, sid_hash, oauth_sub)
person ──< membership (club_id, tier, valid tstzrange, recorded tstzrange, joined_via)
person ──< position   (club_id, role, valid, recorded, source_event)
club   ──< club_revision (SCD-2: name, category[], status, advisor, parent_club)
club   ──< event ──< event_revision (starts_at, venue, capacity, cost, type, sponsor_id)
event  ──< attendance (person_id, status, ts, method)           -- append-only
club   ──< post ──< reaction ; club ──< channel ──< message      -- content, append-only
club   ──< journal_entry ──< journal_line (account, debit, credit, payee, approver)  -- double-entry
club   ──< budget (term, version) ──< budget_line (category, allocated)
club   ──< sponsorship (employer_id, amount, in_kind, term) ──< deliverable
club   ──< election ──< candidacy ; election ──< ballot (voter_hash) ; result → position
form   ──< form_response (schema_vendor/name/version, payload jsonb)
integration_signal (source, external_id, payload, observed_ts) → normalized event/post
employer ──< ad_campaign ──< ad_creative ──< ad_impression / ad_click
activity_stream (ts, actor_id, activity, entity_type, entity_id, features jsonb, campus_id)  -- Activity Schema
consent (person_id, purpose, granted_at, revoked_at, version)   -- first-class table
```

Rules: operational tables are mutable; Position/Membership are bitemporal; Attendance, Messages, Ledger, and `activity_stream` are append-only; every derived table has `(entity_id, feature_ts)`.

### B. Top 30 tracked events (`Object Verb-ed`)

| # | Event | Key properties |
|---|---|---|
| 1 | Account Created | campus, cohort_year, major, referral_source |
| 2 | Interests Declared | interest_ids[] |
| 3 | Consent Updated | purpose, granted |
| 4 | Club Viewed | club_id, source (feed/search/link) |
| 5 | Club Followed | club_id |
| 6 | Club Joined | club_id, joined_via, tier |
| 7 | Club Left | club_id, reason (optional) |
| 8 | Member Invited | club_id, invitee_id |
| 9 | Event Created | club_id, event_type, capacity, cost |
| 10 | Event Published | event_id, channels[] |
| 11 | Event Viewed | event_id, source |
| 12 | Event RSVPed | event_id, rsvp_status |
| 13 | Event Checked In | event_id, method (qr/nfc/manual), minutes_after_start |
| 14 | Event No-Showed | event_id (derived nightly) |
| 15 | Event Rated | event_id, rating |
| 16 | Post Published | club_id, channel, media_types[] |
| 17 | Post Reacted | post_id, reaction |
| 18 | Message Sent | channel_id, thread_id, is_reply (no content) |
| 19 | Task Assigned / Task Completed | club_id, assignee_id |
| 20 | Position Started / Position Ended | club_id, role, via (election/appointment) |
| 21 | Election Opened / Vote Cast / Election Closed | election_id (voter identity hashed) |
| 22 | Budget Submitted / Budget Approved | club_id, term, amount |
| 23 | Transaction Recorded | club_id, account, amount, payee_type, approver_id |
| 24 | Reimbursement Requested / Approved / Paid | amount, days_to_approve |
| 25 | Sponsorship Signed | employer_id, amount, in_kind |
| 26 | Form Submitted | form_id, schema_version |
| 27 | Integration Connected / Signal Received | source (gcal/instagram), object_type |
| 28 | Feed Item Impressed / Clicked | item_type, item_id, position, dwell_ms |
| 29 | Notification Sent / Opened | template_id, arm_id, channel |
| 30 | Employer Profile Viewed / Student Opted In to Employer | employer_id, fields_shared[] |

### C. Profile feature vector (per person, recomputed nightly, all `(person_id, feature_ts)`)

1. **Static/declared (≈20 dims):** campus, cohort_year, expected_grad_term, major (one-hot or embedding), declared interests (multi-hot over a ~300-node campus taxonomy).
2. **Lifecycle (≈10):** Duolingo-style state at platform and per-club level; semesters active; days since last check-in; Quick-Ratio contribution.
3. **Computed traits (≈60):** Segment's nine trait types over the top events — counts (30/90/365d), aggregations (avg dwell, avg minutes-late), first/last (first club, last event), most-frequent (event type, weekday), unique lists (clubs, event types, venues).
4. **Skills (≈40, calibrated probabilities with evidence pointers):** event planning, fundraising, leadership, finance, marketing, recruiting, speaking, technical tags inherited from club taxonomy.
5. **Network (≈10):** degree, PageRank, betweenness on the person projection, Leiden community id, bridge score, number of distinct communities touched.
6. **Interest embedding (64 dims):** recency-weighted mean of club/event/post embeddings the person engaged with, trained two-tower on `Event Checked In` as the positive.
7. **Survival/propensity (≈8):** P(active next semester), P(joins ≥1 new club in 30d), P(runs for office), uplift score for the current nudge.
8. **Privacy metadata:** consent purposes, minimization tier, DP export eligibility.

Only groups 1, 3 (subset), 4, and 5 are visible to the student; group 7 is internal and never exposed to employers.

### D. Club Health Index (final form)

$$
\text{CHI}_c = 100\sum_{k=1}^{8} w_k\,\sigma\!\left(z_{k,c}\right),\quad
z_{k,c} = \frac{x_{k,c}-\mu_{k,\text{peer}(c)}}{s_{k,\text{peer}(c)}},\quad
w = (0.20, 0.15, 0.15, 0.10, 0.10, 0.10, 0.10, 0.10)
$$

for retention, attendance trend, officer engagement, bus factor, funding runway, content cadence, network centrality, pipeline; plus **Form** $= \text{EWMA}_{42d}(\text{activity}) - \text{EWMA}_{7d}(\text{activity})$ as a leading indicator, and a **succession-risk flag** when ≥50% of officers are within one term of graduation and no successor has held any role.

### E. Quant roadmap

| Phase | Scope | Methods | Ships when |
|---|---|---|---|
| **v1 (0–6 mo)** | Instrument the 30 events; activity stream; computed traits; CHI v1; growth accounting; KM retention curves; rule-based finance flags; Jaccard club similarity; Equal-Shares budget tool for SGAs | dbt + DuckDB + Metabase; lifelines | 1 campus, ~50 clubs |
| **v2 (6–18 mo)** | Attendance GBM + Prophet; discrete-time hazard churn; Leiden communities, PageRank, bridge students; Thompson-sampling nudges; Isolation Forest on ledger; event ROI + marginal-return curves; person/club embeddings for the feed | ClickHouse; scheduled Python; PostHog flags for experiments | 5–10 campuses |
| **v3 (18+ mo)** | Uplift models for recruitment/office nudges; propensity-matched and DiD causal studies with university IR partners under DP; Markowitz-style event-mix planner; sleeping/recovering notification bandit; employer evidence profiles with four-fifths audits; cross-campus benchmarking | CausalML; DP release pipeline; fairness dashboard | Multi-campus, employer product live |

### F. Privacy and consent design ("learn everything" without being creepy or illegal)

1. **Purpose-bound consent tiers**, stored as a first-class `consent` table and enforced in dbt (a feature cannot be computed for a person lacking the purpose): *Tier 0 Run the club* (memberships, roles, attendance, ledger — contractual necessity); *Tier 1 Personalize my feed* (computed traits, embeddings — opt-out); *Tier 2 Calendar/social integrations* (free/busy only, club accounts only — opt-in); *Tier 3 Show my evidence to employers* (per employer, per field — opt-in, revocable); *Tier 4 Ads personalization* (explicit consent, separate from ToS — the Meta lesson).
2. **Minimization by construction.** No message content in profiles; interest vector capped at coarse taxonomy with decay and 5% random-topic noise (Topics API pattern); dorm and location never collected; grades never ingested.
3. **Right to see, contest, and delete.** Every inferred skill or score shows its evidence events; Article 22-style human review for any employer-facing or funding-affecting automated decision; deletion propagates through the activity stream via tombstones and re-materialization.
4. **Aggregate exports only under DP** (ε ≤ 5 per release, k ≥ 20 cell suppression as belt-and-braces) for universities, SGAs, employers, advertisers.
5. **Institutional boundary.** Keep FERPA education records out of the platform; if a university becomes the data controller for its instance, ship a separate tenant with school-official terms and no employer or ad surfaces.
6. **Fairness monitoring.** Four-fifths-rule dashboards on any ranking exposed to employers or funding bodies; disparate-impact tests by gender, race/ethnicity (where lawfully collected as self-reported and optional), first-generation status, and commuter/working-student proxies.
7. **Goodhart guardrails.** Displayed scores rely on outcomes produced by others (retention of people you recruited, attendance at events you ran), are capped per activity, and are audited quarterly for gaming.

---

### Source index

Activity Schema — https://www.activityschema.com/ · Palantir Foundry Ontology — https://www.palantir.com/docs/foundry/ontology/overview · Segment computed traits — https://www.twilio.com/docs/segment/unify/traits/computed-traits · Hightouch composable CDP — https://hightouch.com/blog/composable-cdp · Common Room — https://www.commonroom.io/product/ · Snowplow canonical event — https://docs.snowplow.io/docs/fundamentals/canonical-event/ · Amplitude tracking plan — https://amplitude.com/docs/data/data-planning-playbook · Amplitude pricing — https://amplitude.com/pricing · PostHog pricing — https://posthog.com/pricing · Feast PIT joins — https://docs.feast.dev/getting-started/concepts/point-in-time-joins · Fowler bitemporal — https://martinfowler.com/articles/bitemporal-history.html · Kimball SCD-2 — https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-2/ · Apache AGE — https://age.apache.org/ · DuckDB — https://duckdb.org/why_duckdb · ClickHouse — https://clickhouse.com/docs/intro · dbt — https://docs.getdbt.com/docs/introduction · Metabase — https://www.metabase.com/docs/latest/ · LinkedIn skills extraction — https://www.linkedin.com/blog/engineering/skills-graph/extracting-skills-from-content · PinSage — https://arxiv.org/abs/1806.01973 · Two-tower (Google) — https://research.google/pubs/sampling-bias-corrected-neural-modeling-for-large-corpus-item-recommendations/ · Topics API explainer — https://github.com/patcg-individual-drafts/topics · Duolingo growth model — https://blog.duolingo.com/growth-model-duolingo/ · Duolingo bandit (Yancey & Settles, KDD 2020) — https://doi.org/10.1145/3394486.3403351 · Thompson sampling tutorial — https://arxiv.org/abs/1707.02038 · Tribe Capital growth accounting — https://tribecap.co/a-quantitative-approach-to-product-market-fit/ · Slack 2,000 messages — https://review.firstround.com/from-0-to-1b-slacks-founder-shares-their-epic-launch-strategy/ · Strava Fitness & Freshness — https://support.strava.com/hc/en-us/articles/216918477-Fitness-Freshness · Orbit Model — https://orbit-model.joshed.io/ and https://github.com/orbit-love/orbit-model · CHAOSS bus factor — https://chaoss.community/kb/metric-bus-factor/ · Discord Server Insights FAQ — https://support.discord.com/hc/en-us/articles/360036661832 · Facebook100 (Traud, Mucha, Porter) — https://arxiv.org/abs/1102.2166 · Leiden — https://arxiv.org/abs/1810.08473 · Ravasz–Barabási — https://arxiv.org/abs/cond-mat/0206130 · Prophet — https://facebook.github.io/prophet/ · lifelines survival — https://lifelines.readthedocs.io/en/latest/Survival%20Analysis%20intro.html · CausalML — https://causalml.readthedocs.io/en/latest/methodology.html · scikit-learn outlier detection — https://scikit-learn.org/stable/modules/outlier_detection.html · Benford's law — https://en.wikipedia.org/wiki/Benford%27s_law · Method of Equal Shares — https://equalshares.net/ · Aziz & Shah PB survey — https://arxiv.org/abs/2003.00606 · Tinto 1975 — https://doi.org/10.3102/00346543045001089 · Webber et al. 2013 — https://doi.org/10.1353/csd.2013.0090 · Astin involvement theory (Routledge reprint) — https://doi.org/10.4324/9781315051888-15 · AAC&U HIPs — https://www.aacu.org/trending-topics/high-impact · GDPR Art. 22 — https://gdpr-info.eu/art-22-gdpr/ · GDPR fines table — https://en.wikipedia.org/wiki/GDPR_fines_and_notices · Irish DPC — https://www.dataprotection.ie/ · FERPA — https://studentprivacy.ed.gov/ferpa · NIST differential privacy — https://www.nist.gov/blogs/cybersecurity-insights/differential-privacy-future-work-open-challenges · Four-fifths rule — https://www.law.cornell.edu/cfr/text/29/1607.4 · Goodhart's law — https://en.wikipedia.org/wiki/Goodhart%27s_law
