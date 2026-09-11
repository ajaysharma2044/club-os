# Club OS — The Campus Quant Engine

*Draft v0.3.*

---

## 1. The thesis

A quant firm is not a hedge fund with good programmers. It is a **factory that converts raw observation into repeatable decisions**, with four properties almost no consumer software company has:

1. **Everything is timestamped twice**: when the event happened, and when we learned about it.
2. **A prediction is a first-class, versioned, evaluated object.** Signals are registered, scored, decayed, and retired like inventory.
3. **Research and production share a substrate.** What you backtest is as close as possible to what runs.
4. **The decision layer is separate from the prediction layer.** Predictions are opinions. The optimizer turns opinions into actions under constraints.

**The campus product fits this shape unusually well.** Club operations are a stream of discrete timestamped events against a small, stable entity graph. And the outcomes that matter — will this event be attended, will this signup convert, will this club die — are **forecastable quantities whose ground truth arrives on a short lag.**

That last property is what makes the loop possible at all. Most consumer products never close it. We can.

**One important calibration.** We are structurally in AQR's world, not WorldQuant's. Few signals, strong priors, careful inference. Not four million machine-generated alphas. Anyone who proposes automated signal search on our data volume is proposing Quantopian at a thousandth the scale with the same math.

Three ideas do most of the work. All three are stolen directly from Jane Street's published engineering.

---

## 2. Idea one: the sequencer and the ordered log

Jane Street's Brian Nigito describes exchange architecture as, at its heart, a single machine whose only job is **assigning a total order to incoming events and multicasting that ordering**. Everything downstream — matching, reporting, market data, compliance — is a deterministic state machine consuming that same ordered log.

We adopt this literally. The `activity_stream` table is the sequencer output. Every derived view in the product is a pure function of it.

The consequences are what make this worth doing:

| Operation | Implementation |
|---|---|
| Backtest a model | Replay the log with a virtual clock |
| Counterfactual A/B | Replay with a different decision function |
| Audit a club's finances | Replay |
| Reproduce a bug | Replay from the offending offset |
| Recompute a broken feature | Replay |

A design maxim from the same source, worth framing on a wall: *if any piece of the system is so complicated that you cannot rewrite it correctly in a weekend, it is wrong.* The exchange they describe was four or five applications averaging around 2,000 lines.

---

## 3. Idea two: point-in-time correctness

This is the discipline that separates a real system from a demo, and it is the thing almost every startup data team gets wrong.

Every fact carries **two** time axes.

- **Valid time** — when the fact was true in the world.
- **Knowledge time** — when our system learned it.

A point-in-time query asks for the value of feature *f* for entity *e* valid as of *t*, restricted to rows we knew at or before the decision time. **Omit the knowledge-time filter and you have built a time machine, and every backtest you run is fiction.**

Concretely, every feature row is:

```
(entity_id, feature_name, value, valid_from, valid_to, known_at, source_event_id)
```

Never `UPDATE`. Only insert new versions. This is a slowly-changing dimension plus a knowledge column. It costs roughly 3× storage on a dataset measured in gigabytes, which is the cheapest insurance we will ever buy.

The operational primitive is the **as-of join**: for each decision row, take the most recent prior feature row. Quant firms love kdb+ substantially because `aj` is a language primitive rather than a forty-line window function. In Feast the equivalent is `get_historical_features`, and the flag that actually enforces knowledge time is `filter_by_created_timestamp=True`. Turn it on. That flag is the entire difference between valid-time-only and true bitemporality.

---

## 4. Idea three: incremental computation

Jane Street's `Incremental` library models a computation as a DAG. Input nodes can be set; derived nodes map over them; an observer marks what you actually care about. On stabilize, **only the nodes downstream of changed inputs recompute**, and cutoff functions stop propagation when a recomputed value equals the old one. The same engine drives their trading computations and their browser UIs.

A club dashboard is a spreadsheet. Club health depends on attendance rate, which depends on check-ins. When one check-in arrives, three nodes should recompute, not the entire nightly batch.

Off-the-shelf equivalents: Materialize or RisingWave for streaming incremental views, differential dataflow underneath them, or Postgres incremental materialized views at small scale. We start with the last and graduate.

---

## 5. The research workflow

The canonical quant loop, with campus nouns substituted.

| Stage | Trading | Campus |
|---|---|---|
| Capture | Market data, normalized and timestamped at receipt | Activity stream plus external signal ingestion, raw payloads archived with receive timestamps |
| Signal construction | "Alphas" — weak predictive features | Features that predict attendance, join, churn, payment, click |
| Evaluation | Information coefficient, IC decay, t-stat, turnover, capacity | Correlation with realized attendance, AUC on RSVP-to-attend, uplift on nudges |
| Combination | Regularized linear blend, Bayesian shrinkage, ensembling | Same, plus **hierarchical partial pooling**, which is the right answer for our sample sizes |
| Construction | Portfolio optimization under constraints and costs | Feed slate construction, notification budget, ad load caps, SGA allocation |
| Attribution | Post-trade analysis | Did the predicted attendance happen? Did the nudge work? |
| Decay | Retire signals that stop working | Same, monitored automatically |

### On overfitting, which is our real enemy

One campus with 500 clubs and a few thousand events per semester is a **small** dataset. Testing hundreds of weak signals against it will produce impressive nonsense.

**Partial pooling is the answer, and it is also the cold-start solution and the moat.** This is the single most important technical recommendation in the entire project.

A workable attendance model has four levels: event, club, club category, campus. Attendance is a negative binomial count, because it is overdispersed. Each club's intercept is drawn from its category's distribution, each category's from the campus distribution.

Four things fall out of that structure for free:

- **A brand-new club with zero history automatically gets the category prior.** The intercept shrinks all the way to the category mean. There is no cold-start hack, because **the model is the cold-start solution.**
- **Shrinkage is adaptive and not a tuning knob.** A club with 40 observed events barely shrinks. A club with 2 shrinks hard. The factor falls out of the variance ratio.
- **Cross-campus transfer is the same mechanism one level up.** Campus two launches with campus one's posteriors as its prior. **Every campus makes the next campus's cold start better. That is the real moat, and it is a statistical one rather than a network one.**
- **Uncertainty is first-class.** You get a posterior predictive interval, which is what the decision layer actually needs. Order food for the 75th percentile, book a room for the 90th.

At this data scale it runs in seconds to minutes on a laptop.

**The overfitting checklist, non-negotiable:**

1. Varying intercepts before varying slopes. Add a slope only when the data demand it, compared out-of-sample.
2. Weakly informative priors, never flat ones.
3. Cap fixed-effect features at roughly the square root of the event count.
4. **Log every hypothesis tested**, so the multiple-testing correction is computable. Researchers at the same firm leak through each other, and that applies more sharply to a three-person team, not less.
5. Leave-one-club-out and leave-one-campus-out cross-validation. Never random k-fold on temporal data.

---

## 6. The signal philosophy

WorldQuant's framework is thousands of individually weak alphas combined, not one clever model. That is the right posture for us, because no single campus signal is strong.

A signal, in our product, is **a feature that predicts a decision-relevant outcome**. It has a name, an owner, a source, a target, a measured predictive value, and a decay date. It lives in a registry, not in someone's notebook.

Signals come in two families.

**Endogenous** — what happens on our platform. RSVPs, check-ins, message volume, read rates, search queries, profile edits, payment events, form submissions, notification opens, dwell, no-shows. These are free, low-latency, and ours alone.

**Exogenous** — everything else about the campus and the world around it. The academic calendar, weather, home game schedules, campus transit feeds, library and gym occupancy, course seat counts, flight arrivals around breaks, student housing lease-up cycles, recruiting season timing, local event calendars.

The exogenous side is where the non-obvious value is, and it is the part that looks like alternative data in a fund. The pattern is always the same: **an unrelated public dataset predicts local demand, and that prediction is worth money to someone.** Inbound winter flights to a city predict restaurant demand, which justifies targeting food ads at arriving travelers. On a campus: an exam calendar plus a home game plus rain predicts that Thursday's meeting will be empty, which is worth telling the president three days early, and which also tells us not to sell that slot to an advertiser at a premium.

### An honest assessment of the flights-to-pizza hypothesis

The research took this seriously rather than flattering it, and the verdict is worth stating plainly.

**The shape is supported. The specific link is unproven. The lead-time argument is the strong one.**

What genuinely exists is roughly fifteen years of tourism-demand nowcasting literature, including work at the individual-attraction level, and the mechanism is already productized: flight-booking-based destination demand was acquired by Amadeus and sits alongside forward-looking hotel occupancy products. Hotel revenue management's pickup model, forecasting final demand from a partial forward book, is the structural ancestor of the whole idea.

Four gaps, stated plainly:

1. **The second link is the weak one.** Bookings to arrivals is near-mechanical. **Arrivals to covers at a specific restaurant has no published study.** That is an inferential leap, not a documented relationship.
2. **Base rates kill it in most markets.** Visitors are a small minority of covers in a typical US metro, so a perfect arrivals forecast barely moves the demand forecast. It matters in high-tourist markets and near airports and convention centers. The first sophisticated question anyone asks will be what fraction of covers are visitors.
3. **Lead time is the real, defensible edge.** Reservation platforms tell you about tonight. Flight bookings are made weeks to months ahead, which is where staffing and purchasing decisions actually live. **Lead with horizon, not accuracy.**
4. **The baseline must be strong.** Exogenous-signal gains against a serious baseline typically run 3 to 18%. Beating a weak baseline proves nothing, which is exactly what Google Flu Trends looked like right before it failed.

**Evidence discipline that follows from this.** The Walmart Pop-Tarts story traces to a single 2004 newspaper quote with no baseline, no sample, no controls, and no replication. It is an anecdote that twenty-two years of business-school decks laundered into a result. Foot-traffic vendor case studies are marketing, not evidence, and the independent literature shows mobile-location panel representativeness drifts over time, which is the same instrument-instability problem that killed Flu Trends.

**One nuance that protects our campus version.** The academic consensus on stadium economic impact is resoundingly negative at the metro level, because substitution dominates. But "no net metro gain" is entirely compatible with "the block around the arena does three times the covers on game night." The stadium literature refutes public-subsidy arguments about aggregate growth. It says nothing against localized, short-window, venue-level demand shifts. **Home-game effects on club attendance are exactly that localized effect, which is why the signal works even though the macro literature is negative.**

---

## 6b. The day-one signal stack

Twenty sources, all free, roughly four to six engineer-weeks to get flowing. Every endpoint below marked live was actually called and returned data during research.

| Signal | Source | Status |
|---|---|---|
| Institution universe, size, demographics | College Scorecard API | live |
| Enrollment and completions **by major** | IPEDS complete data files | documented |
| **Academic calendars** (terms, finals, breaks, move-in) | Curated per school, plus ICS | 2 weeks of curation |
| **Competing events on campus** | Localist API, no key required | live |
| Campus events, non-Localist schools | LiveWhale JSON | live |
| **Course sections, seats, meeting times** | umd.io, UIUC Course Explorer, Purdue OData, Stanford ExploreCourses | all four live |
| Weather forecast | NWS/NOAA | live |
| Historical weather for training | Open-Meteo archive | live |
| Darkness and daylight saving | Computed locally | no network |
| **Athletics schedules** | Sidearm/PrestoSports ICS feeds | known |
| Concerts and large local events | Ticketmaster Discovery, 5,000 calls/day free | documented |
| **Dining hours and menus** | Nutrislice | live |
| Gym occupancy | Connect2Concepts / Waitz widgets | endpoint unverified |
| Campus transit | GTFS and GTFS-Realtime via Mobility Database | live |
| **Student newspaper coverage** | RSS, roughly 200 papers | known |
| News mentions per school | GDELT 2.0 | live |
| Per-school attention | Wikipedia Pageviews | live |

**Above all of it: our own check-in log.** Ship check-ins before anything else in that table. Without the label, none of the rest is supervised learning, it is just data.

### Year one paid budget: about $20,000

Deliberately small, because the free layer plus first-party data is most of the value. Buy Google Places for sponsor prospecting near campus, a one-month Open-Meteo Professional pull for the historical backfill, BigQuery compute for GDELT at scale, and the warehouse itself. That last one is the actual cost center. Data plumbing, not data.

**Two compliance notes that matter on day one.** Open-Meteo's free tier is explicitly non-commercial, so production forecasts run on NWS and we buy one month of the paid archive for training. And the widely repeated reading of *hiQ v. LinkedIn* is wrong: hiQ won on the Computer Fraud and Abuse Act and **lost** on breach of contract. That distinction governs our entire scraping posture. Terms of service bind us even where the criminal statute does not.

**Explicitly not buying in year one:** Placer.ai, CoStar, RealPage, Lightcast, Revelio, Sportradar, Cirium, NewsAPI, Sensor Tower, the X API. Each is enterprise-priced, duplicative of something free, or solves a problem we do not have yet.

---

## 6c. Three worked signal chains

### Chain 1 — "Move your general body meeting"

This is your Minneapolis example with campus nouns. Inbound flights predict restaurant demand, which justifies a targeted pizza ad. Here: calendar plus competition plus weather predicts attendance, which justifies a scheduling recommendation and prices an ad slot.

**Inputs, all free.** Academic calendar for weeks-into-term and days-to-finals. An aggregate class-meeting heatmap from the course APIs, giving the share of students in class by day and hour. Localist for competing events within two hours, weighted by venue capacity. Athletics feeds for home games and kickoff time. NWS for precipitation probability at the event hour. Locally computed sunset. Dining hall hours. Plus our own trailing RSVP-to-check-in ratio and last three events.

**Model.** Gradient-boosted regressor on check-ins, validated blocked by campus. Baseline to beat is the club's trailing average times a day-of-week factor.

**The product moment.** An officer picks a Wednesday in November and we say:

> That date is three days before finals, there are 22 other events on campus that night, and rain is forecast. We predict 18 attendees, down from your usual 34. The Thursday two weeks earlier looks much better: 6 competing events, clear weather, before the pre-finals drop. Predicted 41.

That single interaction is the whole company, and every input is free.

**And it prices inventory.** A sponsor buying presence at a predicted-41 event should pay more than at a predicted-18 event. Pricing on *predicted* rather than historical attendance is something no campus marketing incumbent can do.

### Chain 2 — Move-in and lease-up predicts apartment ad demand

Student housing pre-leasing runs a punishing annual cycle. Properties start pre-leasing for next fall in **September**, and a property behind pace by spring is in real trouble.

So the demand curve for housing advertising peaks not at move-in but from **late September through February**, and hardest in markets where pre-lease pace is lagging. Yardi and RealPage publish market-level pre-lease pace in a free monthly PDF.

**The play.** Sell a housing-season package to properties near campuses where our user base skews sophomore and junior, the cohort deciding where to live next year, and where the market's pre-lease pace trails prior year. Both halves are free to determine.

**Zero-cost pilot.** Cross-reference our sophomore and junior counts per campus against the current free report, rank markets by lag, cold-email the ten worst-performing properties near our top five campuses. If it converts, automate it.

### Chain 3 — Recruiting calendar predicts both club advice and employer ad demand

Consulting applications close in late September. Case-interview-prep demand spikes in August and early September, three to five weeks earlier.

Our first-party search and page-view data detects that spike in real time. The curated recruiting calendar lets us anticipate it before it happens.

**Two products from one chain.**

Free club advice that drives retention: *case-prep searches on your campus are up 3x week over week and consulting deadlines are in 24 days. Clubs that ran a case workshop in this window last year saw 2.4x normal attendance. Here is the template.*

Paid employer inventory: employers and prep companies pay a premium for the three-week pre-deadline window, targeted at campuses with a high count of relevant majors and measurably rising category interest. We can prove both the audience size and the momentum, which a campus flyer company cannot.

This is the highest-margin of the three. The exogenous inputs are free and curated once a year, the first-party inputs we already generate, and the buyer has the largest budget of anyone who wants this audience.

---

## 6d. The sequencing insight

Compressed to one recommendation: **ship check-ins, curate 200 academic calendars, wire up Localist.** One first-party source, one human-curated source, one free API. Those three produce more predictive power than every paid foot-traffic and local-commerce vendor combined.

The flights-to-pizza instinct is right, and the campus version of "inbound flights" is not flights. It is the academic calendar, the competing-events feed, and the class-schedule heatmap. Three free, high-frequency, universally available signals that essentially nobody in campus software is using.

---

## 7. What the engine actually decides

The engine is not a dashboard. It exists to make specific decisions, and each decision is the thing to evaluate it on.

| Decision | Model | Evaluated on |
|---|---|---|
| What appears in a student's feed | Multi-task ranker plus value model | Attendance and return, not clicks |
| Which notification to send, to whom, when | Contextual bandit with uplift gating | Incremental attendance, not open rate |
| Which club to recommend to a freshman | Two-tower retrieval plus graph features | Joins that survive a semester |
| Predicted attendance for an event | Gradient boosting with exogenous regressors | Absolute error against check-ins |
| Club health and succession risk | Peer-normalized composite index | Whether flagged clubs actually die |
| Financial anomaly | Benford plus isolation forest | Precision at the top of the queue, reviewed by humans |
| SGA allocation | Method of Equal Shares | Fairness properties, published |
| Ad price and slot | Auction with smoothed CTR and pacing | Revenue subject to a hard ad-load cap |

Every one of these is replayable, because every one is a pure function of the ordered log.

---

## 8. Stack

Start Postgres-centric. Buy one big machine before buying warehouse credits.

| Layer | v1 choice | ~Monthly |
|---|---|---|
| Event log and OLTP | Postgres, `events` table as sequencer, bitemporal `features` table | $50–300 |
| Time partitioning and rollups | TimescaleDB hypertables and continuous aggregates | included |
| Analytics and backtest | DuckDB over Parquet exports, run locally or in CI | ~$0 |
| Research store | ArcticDB on S3, versioned with `as_of` reads | $10–50 |
| Transformations | dbt Core plus snapshots for slowly-changing dimensions | $0 |
| Orchestration | Dagster | $0–100 |
| Experiment tracking | MLflow self-hosted | $20 |
| External signal ingestion | Python jobs in Dagster, raw payloads to S3 with receive timestamps | $10 |

Roughly $150 to $500 a month for genuinely quant-grade internals.

A warning that applies directly: per-query-metered warehouses tax exploration. A fixed-cost box you can hammer is worth more to a research culture than an elastic one you flinch at every time you run a query.

Graduate to a lakehouse at ten-plus campuses: Parquet on S3 under Iceberg for time travel, ClickHouse or Trino for queries, Redpanda for the bus, Materialize for incremental views, Dagster and dbt unchanged. Around $800 to $2,000 a month.

---

## 8b. Five things not to do

1. **Never update anything a model reads.** It converts the backtest into a time machine, and it is unrecoverable a year later.
2. **Do not build a feature store.** Build one correct as-of join and property-test it.
3. **Do not use gradient boosting on 300 events.** Use partial pooling. Go as simple as the data allows.
4. **Do not run automated signal search before the trial counter exists.**
5. **Do not let the panel-composition problem go unmodeled.** If RSVPs rise, is interest rising or is adoption rising? **Every first-party metric must be normalized by the active roster it was measured over.** This is the exact question a Jane Street data lead asks of every consumer panel: if there are more consumers in the sample, are people spending more, or are there just more consumers in the sample?

---

## 9. The rule that keeps this honest

**The interface shows one number. The engine computes ten thousand.**

A freshman opening the app sees "3 things this week." A president sees "your Thursday event will draw about 22, down from 40, because of the exam block and the home game." Neither sees a Bloomberg terminal. The sophistication is entirely in what gets computed, never in what gets displayed.

### The whole thing in one sentence

Build an append-only event log with two timestamps, one honest as-of join, a registry of declared signals with live scorecards, a hierarchical Bayesian model that borrows strength across clubs and campuses, and a constrained optimizer that spends student attention like capital. Then hide all of it behind three numbers and a suggestion.
