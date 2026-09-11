# 18 — The Quant Engine: How Elite Trading Firms Build Research Systems, and How to Port That to Campus

*Research date: 2026-09-10. Primary sources fetched directly: blog.janestreet.com, signalsandthreads.com full transcripts, code.kx.com, docs.arcticdb.io, docs.feast.dev, chronon.ai, docs.dagster.io, weather.gov API docs, developer.ticketmaster.com, mobilitydatabase.org, arxiv.org.*

*This runs long (~16k words) because it is built as a reference, not an essay. If you read only two things, read §1.6 (Jane Street's alt-data team and point-in-time correctness) and §9 (the build spec).*

---

## 0. The thesis, stated precisely

A quant firm is not "a hedge fund with good programmers." It is a **factory that converts raw observation into repeatable decisions**, with four properties that almost no consumer software company has:

1. **Everything is timestamped twice** — when the event happened, and when *we learned about it*. This is what makes it possible to ask "what would we have decided at 3pm last Tuesday?" and get an honest answer.
2. **A prediction is a first-class, versioned, evaluated object.** Signals are registered, scored, decayed, and retired like inventory.
3. **Research and production share a substrate.** The thing you backtest is as close as possible to the thing that runs.
4. **The decision layer is separate from the prediction layer.** Predictions are opinions; the optimizer turns opinions into actions under constraints and costs.

The campus-club product has an unusually good fit to this shape. Club operations are a stream of discrete, timestamped events (RSVP, check-in, message, payment, search) against a small, stable entity graph (student, club, event, campus). The outcomes you care about — will this event be attended, will this signup convert to a member, will this club die, is this student worth showing to an employer — are *forecastable quantities with ground truth that arrives on a short lag*. That last property is what makes an alpha loop possible at all. Most consumer products never close the loop; you can.

The rest of this document is: what the firms actually do (§1–§2), the canonical research workflow with formulas (§3), the engineering substrate (§4), alt data and exogenous-signal reasoning (§5–§6), the campus signal catalog (§7), the alpha analogy done honestly for small data (§8), and a concrete build spec (§9).

---

## 1. Jane Street: the most legible quant engineering culture on earth

Jane Street publishes more about its internals than any comparable firm, across the [Tech Blog](https://blog.janestreet.com/) and the [Signals and Threads](https://signalsandthreads.com/) podcast (29 episodes as of September 2026, full transcripts published). What follows is drawn from the transcripts, not from secondhand summaries.

### 1.1 Why a typed functional language

Jane Street standardized on OCaml firmwide — "systems automation to trading systems to research code" ([janestreet.com/technology](https://www.janestreet.com/technology/)) — and has released over a million lines of open source, funding the OCaml compiler, OPAM, and OCaml Labs at Cambridge. In June 2025 they released [OxCaml](https://blog.janestreet.com/introducing-oxcaml/), their own extended dialect adding modal types, unboxed types, and data-race-free parallelism.

The argument, compressed: in a domain where a bug costs money *immediately and irreversibly*, the cost function is asymmetric. You are not optimizing lines-of-code-per-hour; you are optimizing *probability that the deployed artifact does what you meant*. A strong static type system moves a large class of errors from runtime (expensive, in production, with money moving) to compile time (free). Pattern-match exhaustiveness checking means adding a new case to a variant forces every consumer to handle it. Modules and functors let you build abstractions that cannot be misused.

The transferable lesson is not "write OCaml." It is: **pick the strictest tool you can tolerate for the layer where errors are expensive, and be loose everywhere else.** Jane Street is loose in research — Python notebooks are used heavily — and strict in production. For a club platform: strict typing and exhaustive matching at the ledger, the signal registry, and the decision layer; loose in the exploration notebook.

### 1.2 Correctness culture: tested vs. battle-tested

Recent posts: ["Getting from tested to battle-tested"](https://blog.janestreet.com/getting-from-tested-to-battle-tested/) (Dec 2025), ["Formal methods and the future of programming"](https://blog.janestreet.com/formal-methods-at-jane-street-index/) (Yaron Minsky, June 2026). Episode 26, ["Why Testing is Hard and How to Fix it"](https://signalsandthreads.com/why-testing-is-hard-and-how-to-fix-it/) with Antithesis founder Will Wilson, covers the full ladder: example-based tests → property-based testing → fuzzing → deterministic hypervisor-level state-space exploration with replayable crash traces → type systems → formal methods.

The key idea worth stealing is **deterministic replay of the exact event sequence that produced a bug**. Antithesis's pitch is that you run your app inside a hypervisor that explores the state space deterministically, so when it finds a violated invariant, it hands you the exact schedule. You get this for free if your system is event-sourced with a virtual clock — which is also exactly what you need for backtesting.

### 1.3 Incremental computation: the single most transferable idea

Jane Street's [Incremental](https://github.com/janestreet/incremental) library builds "complex computations that can update efficiently in response to their inputs changing," based on Umut Acar's self-adjusting computation research. Yaron Minsky's talk ["Seven Implementations of Incremental"](https://blog.janestreet.com/seven-implementations-of-incremental/) tells the story of getting to a performant version.

The model: your computation is a DAG of nodes. `Var` nodes are inputs you can set. Derived nodes are `map`/`bind` over other nodes. An `Observer` marks what you actually care about. On `stabilize`, only nodes transitively downstream of changed inputs are recomputed, in topological order via a height-indexed priority queue, and **cutoff functions stop propagation when a recomputed value is equal to the old one**. Stated use cases from the README: "large spreadsheet-like computations," "GUI views that incorporate new information without complete recalculation," and "derived datasets (filtered, transformed, inverted) that remain synchronized with source data."

Their UI framework [Bonsai](https://github.com/janestreet/bonsai) (Episode 11, ["Building a UI Framework"](https://signalsandthreads.com/building-a-ui-framework/)) is built on Incremental — the same incrementality engine drives trading computations and browser UIs.

**Port this directly.** A club dashboard is a spreadsheet: club health index depends on attendance rate depends on check-ins. When one check-in arrives, you should recompute three nodes, not the whole nightly batch. §4 and §9 name the modern off-the-shelf equivalents (Materialize, differential dataflow, Postgres incremental views).

### 1.4 Market data capture and replay: the sequencer pattern

Episode 3, ["Multicast and the Markets"](https://signalsandthreads.com/multicast-and-the-markets/) with Brian Nigito (who built exchange infrastructure at Island/Instinet, which became NASDAQ's), is the clearest public explanation of exchange architecture. Minsky's summary of the core move:

> "...turning it into a fairly abstract CS problem of transaction processing... we're just going to have a system whose primary job is taking the events... and choosing an ordering and then distributing that ordering to all the different players on the system so that they can do the concrete computations."

One machine, one core, single-threaded, is the **sequencer**. It assigns a total order to incoming events and multicasts the ordered stream. Everything else — matching, clearing reports, public market data, regulatory reporting — is a *deterministic state machine consuming that same ordered log*. Nigito notes some exchanges literally separate the sequencer from the matcher. Recovery is by replaying from a snapshot plus the tail of the log rather than the whole day, because "if you know your domain really well, and you can compress that data down to some fixed amount of state, you can have an application that starts after 80% of the day is complete, and be immediately online."

Also from that episode, a design maxim worth framing: one of the Island builders held that **"if any piece of the system is so complicated that you can't rewrite it correctly and perfectly in a weekend, it's wrong."** Average application length there: ~2,000 lines; the whole exchange, four or five applications.

This is event sourcing with the consequences taken seriously. If your ordered event log is the source of truth and every derived view is a pure function of it, then: backtest = replay the log with a virtual clock; A/B counterfactual = replay with a different decision function; audit = replay; bug repro = replay from the offending offset.

### 1.5 The data warehouse: Superstore

Episode 28, ["Building a Data Warehouse from Scratch"](https://signalsandthreads.com/building-a-data-warehouse-from-scratch/) (June 2026), Jacob Baskin. Jane Street ran on Postgres — "the largest computer that Jane Street owned was running Trader DB" — with hundreds of users writing ad hoc SQL, a long-running-transaction killer, and a deadlock detector. The requirements for the replacement, verbatim in substance:

- Keep it the **Wild West** — traders must feel they can do anything. "We were putting in a ton of work on maintaining the database in such ways to give traders the illusion that they could do whatever they want."
- Exceed single-machine capacity.
- Compress well, read wide.
- **Performance isolation**: "It should be much harder for a single user to bork the whole system for everyone."

What they gave up, and this is the instructive part:

| Given up | Kept | Why |
|---|---|---|
| Cross-table transactions | Atomic, order-preserving writes **within a single table** | Most data is append-only; "either the trade happens or it doesn't and you have some source of truth for that" |
| Synchronous writes | Async commit — acknowledged, then made readable later | The gap is used to lay data out columnar-correctly and re-compress, so neither the writer nor the reader pays |
| SQL as the write interface | SQL as the first-class *read* interface | Reads are ad hoc and human; "most of the writes were happening in much better defined ways through actual software systems" |
| Direct Parquet access | Everything through the service | Access control, schema evolution, ability to reason about all reads and writes |

Underlying storage is Parquet; query engine for the alt-data warehouse is Trino; transformations use **dbt** — "so that you can rely on it. I have seen 300 line Postgres views and functions in my time at Jane Street and we don't want any of that."

Minsky's framing of why this matters: "the value here is database as ecosystem. The set of things that you can join together — every new thing that you add to that increases the value of the platform." That is the exact argument for a single campus data graph rather than per-feature silos.

They also explicitly rejected the governance approach that most companies reach for: "many companies... end up essentially getting rid of a lot of the flexibility and a lot of the usability of these systems in order to maintain the scale. They will have a schema council... You'll end up with databases where the only queries you're allowed to run are ones that have been code reviewed."

### 1.6 Alternative data at Jane Street

Episode 29, ["Wrestling the World into Rows"](https://signalsandthreads.com/wrestling-the-world-into-rows/) (September 2026), Eric Mannes, who leads the alt data team. This episode is the closest published thing to a blueprint for what a campus signal team should look like.

**Origin story.** There was no alt data team. Desks bought datasets ad hoc; "a dev or a trader or a trading desk operations engineer would bring in the data and put it somewhere, maybe in some corner of a large NFS tree... And the result would be, I don't know, 60% as good as it could be." The thesis was that centralizing would unlock trades:

> "there were effects that they were not able to find when the data was really difficult to work with that they were suddenly able to find when the data was easy to work with."

Jane Street hired its **first data engineer ever in 2023**; by September 2026 the number is "20 something." Minsky's word for the growth: *induced demand*.

**Team structure** — three distinct functions, which I'd copy verbatim:

| Function | Product | Hired from |
|---|---|---|
| **Data strategy** | Knowing what data exists and what the firm needs; matchmaking | Not engineers |
| **Data infrastructure** | Ingestion/transformation/monitoring tooling | Standard SWE pipeline |
| **Data engineering** | *A good dataset* | "The data person at their small or mid-sized startup"; science/social-science backgrounds |

Hiring bar for data engineers: "curiosity and a good investigative process... Are they careful and detail oriented and do they think about what they know, what assumptions they're making, how they would test those assumptions? Or do they write a bunch of code and say, 'Hopefully this works, but I'm not sure.'" The interview is a **data investigation**: unfamiliar dataset, build a model of how it works, do something with it. "Data pipelines are code... You want them to be clear, correct, maintainable."

**Point-in-time correctness, stated better than any textbook.** Vendors revise data — recompute columns, re-tag transactions to different merchants, fix errors. Mannes on why that is dangerous:

> "If you're trying to make that decision and you are looking at the data that is not actually what you would've received, but instead the corrected, more accurate version later, you're not actually studying what trades you would've done if you've been subscribing to the data set. **You're simulating what you would've done if you had a time machine.**"

And the fix:

> "What we love is when vendors say, this is exactly what I delivered at this moment in time and here's the corrected version that I delivered at this other point in time. And not everyone does that. And so **what we try to do is save all the data that we have access to along with the time we received it so that no matter what transformations we do later, we can always reconstruct what we would've known when.**"

Minsky adds the market-data analogy: exchange timestamps are treated with suspicion (clock skew), so Jane Street also records *its own* receive timestamp at the network boundary. **Two timestamps on everything, and you trust yours more than theirs.**

**Skepticism about the famous example.** Asked whether satellite parking-lot photos are actually good, Mannes: "I don't think so... It's noisy. Maybe you get not that many photos per store per day or week. Walmart has 20% of its shopping online... and it's also just really indirect. The thing you're getting at is how many people showed up, which is different from how much they're spending." The first-principles reframe — *who actually knows the answer?* — leads to credit-card panels, and then immediately to the panel-bias problem:

> "It's not a random sample... Maybe people drop in or drop out of the panel. And if there are more consumers in the sample, does that mean that people are spending more at Walmart or does it mean there are more consumers in the sample?"

This is *precisely* the trap a campus product will hit: if RSVPs rise, is interest rising or is your platform's adoption rising? Every first-party metric must be normalized by panel composition.

**Privacy line.** "One important difference between the trading use case and the ad use case is that we don't want to know who the individual consumers are. We want to know people are spending more at Lululemon... We don't want to know who the person is. While with advertising, I think it's the point." A campus product sits uncomfortably between these; §5 and §9 return to it.

**Build vs. buy.** They use dbt and Trino off the shelf; they built Superstore because they already run on-prem datacenters and "I don't want to imagine how much we would spend in credits or slots if all of the queries that we are running now were built in a cloud warehouse." The sharper point is behavioral: "If we were using one of these other products, we would spend a tremendous amount of time optimizing our spend and trying to shape our workloads to fit their cost model." **Cloud metering taxes exploration.** For a research org, a flat-cost compute pool that makes the marginal query free is worth real money — see §4.

### 1.7 ML in a low-data, high-noise regime

Episode 22, ["Finding Signal in the Noise"](https://signalsandthreads.com/finding-signal-in-the-noise/) (March 2025), In Young Cho, who leads ML in the research group. This is the most directly applicable episode for a startup with 300 events and one campus.

The research loop she describes is four steps: **data generation → prediction (predictors/responders) → modeling → productionization.** Notes:

- **Nomenclature**: Jane Street says *responders* for dependent variables and *predictors* for features. There is an internal mailing-list holy war about it.
- **Model complexity is a function of data size**: "for the toy case... with a handful of data points... you probably want to go as simple as possible" — linear regression. Complexity earns its way in.
- **The signal-to-noise framing**, borrowed from a colleague: financial ML is like text modeling "except that instead of having one unit of data, you have 100 units of data... However, you have one unit of useful data and 99 units of garbage and you do not know what the useful data is."
- **Anti-inductiveness**: markets actively destroy the regularities you find. Minsky: "you sort of go and take the things about the past and remove them from the future actively." *Campus life is only weakly anti-inductive — this is a real advantage over finance, and the reason a campus alpha should decay on a semester timescale, not a week.*
- **Two disciplines, pick one honestly.** Minsky's formulation: in low-data you are "disciplined in the model space... Occam's razor, you want to restrict the universe of hypotheses you're willing to contemplate." In high-data "you need to use discipline around data and evaluation." You cannot be undisciplined in both.
- **Cross-researcher leakage**: "if you have a lot of folks at Jane Street who are exploring similar ideas, you might inadvertently be leaking or not doing proper data science in a way that's kind of scary." This is the multiple-testing problem at organizational scale — and it is the argument for a *central experiment registry* (§3.9, §9).
- **Survivorship bias**, called out by name: "I'm just going to look at the stocks that exist today, nix out the ones that IPO'd between 15 years ago and now and just assume that's the universe... would be a pretty bad way to go about it." Campus analogue: analyzing only clubs that still exist this semester will make every retention model optimistic.
- **Reproducibility is the weak point, including for them.** On notebooks: "Things get evaluated in just whatever damn order you click the buttons, and that's really bad for reproducibility." And the research (not just production) argument: "if you don't have a good reproducibility story, it's often very hard to know if you made one small change or if you made six changes because other stuff changed elsewhere in the code base, somebody threw in some more columns and data sources mutated under your feet."
- **Short iteration time is a first-order research input.** Minsky: "You really need a short time to joy... In research, most of the ideas are bad."

### 1.8 No silos, and what that actually means

Mannes on how the alt data team came to exist at all:

> "At Jane Street, you can do whatever you want, as long as it's the right thing to do. Your job is not to maintain this one system or to trade this one product. Your job is to help Jane Street maximize its P&L over the long term."

Cho on role boundaries: "we don't distinguish between these roles in the hard and fast way, and we do have a number of individuals that straddle these roles and help bridge the gap... and make sure that things don't get into the territorial or tribal kind of state."

The structural insight is that the researcher/engineer split creates a *translation loss* exactly at the point where domain understanding matters most. Jane Street's answer is people who straddle. A three-person startup gets this for free and should be careful not to lose it at twenty.

### 1.9 Low-latency and hardware

For completeness: Jane Street does serious FPGA work ([Hardcaml](https://github.com/janestreet/hardcaml), an OCaml hardware DSL; the [Advent of FPGA](https://blog.janestreet.com/advent-of-fpga-challenge-2025/) and [ASIC competitions](https://blog.janestreet.com/protocol-emulator-asic-competition/)), runs its own datacenters, and sweats "a range of 10 nanos" on some paths. **None of this transfers.** A club platform's latency budget is human-scale. The transferable part of the low-latency culture is *determinism* — predictable service times, small critical paths, no surprise big-O changes — not speed.

---

## 2. Everyone else: what the other firms publish

### 2.1 Hudson River Trading — the richest public corpus after Jane Street

[HRT Beat](https://www.hudsonrivertrading.com/hrtbeat/) is unusually concrete.

**Blobby**, their [from-scratch distributed filesystem](https://www.hudsonrivertrading.com/hrtbeat/distributed-filesystem-for-scalable-research/), stores *hundreds of petabytes* of research data. The reusable decision: **metadata in FoundationDB** (transactional, small, strictly serializable) separated from **data in 8MB append-only chunks** (huge, either N-way replicated or erasure-coded 6+3) on chunk servers. They run **Prober**, a dedicated synthetic-canary subsystem that measures tail latency continuously. Stated design principle: *"deliberately about introducing complexity only when required."* Researcher-facing goal: "nearly unlimited bytes" and never think about quotas — i.e. *remove the metering that makes researchers flinch*, the same point Jane Street made about cloud pricing.

**Research philosophy** is stated bluntly in ["In Trading, Machine Learning Benchmarks Don't Track What You Care About"](https://www.hudsonrivertrading.com/hrtbeat/in-trading-machine-learning-benchmarks-dont-track-what-you-care-about/): *"an incremental 0.1% improvement in the accuracy of a neural network's ability to distinguish dog breeds might not translate to predicting the price of a stock,"* and academic RL results *"are not robust to changes in hyperparameters, random seeds, or even different implementations."* Their paper filter is three words: **simplicity, reproducibility, generality**. In ["Applying AI to Trading"](https://www.hudsonrivertrading.com/hrtbeat/applying-artificial-intelligence-to-trading/) they decompose into three separately-owned systems — **prediction**, **optimization**, **execution** — with execution *"in many ways the hardest."* That is exactly the layering recommended in §9.

From ["How HRT Thinks About Data"](https://www.hudsonrivertrading.com/hrtbeat/how-hrt-thinks-about-data/): a good transformation can *"so fundamentally change a dataset that in effect you've made a new dataset"* — their example being the *proportion of sub-penny trades* as a proxy for retail interest. **Derived features are datasets and deserve the same versioning.**

### 2.2 WorldQuant — industrialized weak alphas

The mega-alpha thesis, in Kakushadze's words ([arXiv:1601.00991](https://arxiv.org/abs/1601.00991)): automation *"yields an ever increasing number of alphas, whose count can be in hundreds of thousands and even millions... This proliferation of alphas – albeit mostly faint and ephemeral – allows combining them in a sophisticated fashion to arrive at a unified 'mega-alpha'. It is then this 'mega-alpha' that is actually traded – as opposed to trading individual alphas – with a bonus of automatic internal crossing of trades."*

Reported stats (proprietary WorldQuant data, 4 Jan 2010 – 31 Dec 2013, 1,006 daily obs, ~2,000 most liquid US stocks, dollar-neutral, **excluding all trading costs**): holding periods 0.6–6.4 days; mean pairwise correlation 15.9%; return scales with volatility as \(R \sim \sigma^{0.761 \pm 0.046}\) (t = 16.65, adj. R² = 0.734); **no significant turnover dependence** (coefficient −0.023, t = −0.57); **80 of the 101 were in production** at writing. Only 4 of 101 are delay-0.

Two structural tells worth internalizing. First, formulas contain fractional lookbacks — `decay_linear(correlation(IndNeutralize(vwap, IndClass.sector), volume, 3.92795), 7.892...)` — which is **the fingerprint of automated search**, not human design. Second, Kakushadze names the binding statistical constraint outright: *"the usual 'too many variables, too few observations' dilemma. Thus, the alpha sample covariance matrix is badly singular."* Shrinkage is not optional.

Context: WorldQuant (founded 2007 by Igor Tulchinsky out of Millennium) had **4 million alphas** in its "Alpha Factory" by 2017 per Bloomberg, sourced partly through a distributed network of paid part-time consultants submitting via WebSim, now [BRAIN](https://www.worldquantbrain.com/).

### 2.3 Two Sigma — "data as code"

["Treating Data as Code at Two Sigma"](https://www.twosigma.com/articles/treating-data-as-code-at-two-sigma/) (Nov 2025): apply *"version control, automated testing, reproducibility, and CI/CD"* to datasets. Named stack: Terraform for pipeline infra, **dbt** for versioned/tested SQL, BigQuery, DAG lineage, and **coverage metrics on data-quality checks in CI**. Forward direction: formal **data contracts** between teams.

["Platform Thinking"](https://www.twosigma.com/articles/platform-thinking-three-views-from-two-sigma-leaders/) (Oct 2025) has two ideas worth lifting: they moved from *"shipping only production-ready datasets to offering both raw and curated data"* — researchers get something usable immediately while the platform team deepens history in parallel; and **"ice cube" patterns**, *"well-defined, reusable data contracts that meet 90% of use cases"* — deliberately not 100%.

Open source: **[Flint](https://github.com/twosigma/flint)**, time-series for Spark, whose core op is `leftJoin` — an as-of join taking *"the most recent row from the right at or before the same time."* Again: **as-of join is the fundamental primitive of financial data engineering**, and generic dataframe engines get it wrong or slow. **[Cook](https://github.com/twosigma/Cook)** (archived 2023) was their preemptive fair-share batch scheduler, claiming *"90%+ utilization for massive workloads"* — preemption is how research clusters beat the ~40% utilization of queue-per-team designs.

Their [Venn](https://www.venn.twosigma.com/) product fits a **Gaussian Mixture Model** over 17 factors back to the early 1970s and recovers four regimes — *Crisis, Steady State, Inflation, Walking on Ice*. A good template for **unsupervised clustering as a communication tool**, not as a predictor. (Campus analogue: cluster campus-weeks into "syllabus week / steady state / midterms / finals / dead week" and label them in the UI.)

### 2.4 Optiver — the latency-vs-iteration tradeoff, stated best

["Designing for Latency and Research Iteration"](https://www.optiver.com/insights/technology-blog/designing-for-latency-and-iteration/) is the single best architecture post in this survey. *"Latency and fast iteration of trading ideas pull on each other."* Three generations: (1) visual dataflow graphs — fast to express ideas, but *"graphs grow into forests"* and latency lost; (2) a **compiled DSL** — *"unlocked machine learning in research and production"* but *"the compiler became part of the bottleneck"* and created a strategy/runtime organizational split; (3) native code end-to-end, collapsing the layers.

Two meta-lessons stated explicitly: complexity must be **consciously allocated** rather than pushed off the fast path; and **simulation must be faithful to what production can actually express**, otherwise research output doesn't deploy. On GPUs, NVIDIA's Ioana Boier: *"It's not the FLOPS. It's the researcher time."*

### 2.5 Man Group — ArcticDB

Covered in §4.1. The architectural point worth repeating: **persistent (immutable) data structures mean that once a version is written "it can never be corrupted by subsequent updates."** That single property is what makes point-in-time backtests honest, and it is available to you for free, today, via `pip install arcticdb`. Man claims 600+ technologists/quants and **200+ new datasets added in 2025**.

### 2.6 AQR vs. WorldQuant: the two legitimate epistemologies

AQR's canonical papers — [Value and Momentum Everywhere](https://www.aqr.com/Insights/Research) (Asness/Moskowitz/Pedersen, *JF* 2013), Quality Minus Junk, Betting Against Beta — share a methodology: **z-score many noisy proxies, average them, rank, neutralize by sector, and demand an economic story.** Their anti-data-mining discipline is not a statistical correction but *breadth of independent out-of-sample evidence*: 212 years of US equity data, 40 countries, a dozen asset classes, plus deliberate use of Kenneth French's public dataset — *data you did not construct and cannot tune.*

> **AQR accepts ~5 factors with 200 years of evidence each. WorldQuant accepts 4 million alphas with 4 years of evidence each and relies on aggregation.** Both are coherent. The engineering that supports them is completely different, and you must pick one.

For a campus product with one campus and a few hundred events, **you are structurally in AQR's world, not WorldQuant's** — few signals, strong priors, economic stories, cross-sectional replication (across clubs, then across campuses) as the out-of-sample test. §8 makes this concrete.

### 2.7 Quantopian's archive — steal the decomposition

| Repo | Role |
|---|---|
| [zipline](https://github.com/quantopian/zipline) | Event-driven backtester; Pipeline API for cross-sectional computation over a universe |
| **[alphalens](https://github.com/quantopian/alphalens)** | Evaluate a **signal** before it is a strategy: quantile returns, IC, turnover, sector-grouped analysis |
| [pyfolio](https://github.com/quantopian/pyfolio) | Evaluate a **portfolio** after the fact: performance/risk tear sheets |
| [empyrical](https://github.com/quantopian/empyrical) | Shared metric primitives, so research and production report the *same number* |
| [trading_calendars](https://github.com/quantopian/trading_calendars) | Session calendars — the unglamorous dependency everything breaks without |

**Alphalens sits between factor and backtest.** Most of a signal's fate is decidable from IC and quantile spread without running a portfolio simulation — a cheap filter before an expensive one. Build the campus equivalent (`clublens`) before you build the simulator.

Quantopian's failure is instructive: 210,000+ members by 2018, $48.8M raised, up to $250M committed by Point72 — then capital returned in Feb 2020 and the community shut in Nov 2020. Giving 200,000 people the same data, universe, and tools **maximized correlation among submissions** while the problem of picking which of 200,000 backtests generalizes *is* the multiple-testing problem of §3.9. [LEAN](https://github.com/QuantConnect/Lean) survived by enforcing **backtest/live parity**: the same algorithm binary runs against a historical feed or a live brokerage with no code change; only the data feed and transaction handler swap.

### 2.8 Renaissance — published lore only

Medallion averaged ~71.8% annually before fees 1994–mid-2014 and returned +98.2% net in 2008. From Zuckerman's reporting and Berlekamp/Patterson interviews, four consistent themes: **one model, not many** (all research flows into a single book, forbidding desks from separately optimizing and collectively over-concentrating); **signal combination over explanation**; **obsessive data cleaning** — their moat began as a *data-engineering* moat, hand-reconstructing decades of history nobody sold; and **scientific hiring over domain hiring**, with near-total internal transparency and near-total external secrecy.

### 2.9 What is not public

Citadel/Citadel Securities, IMC, and DRW publish essentially no written architecture — their public technical presence is recruiting content and conference talks (CppCon, QuantMinds). Treat any "Citadel architecture" claim as secondhand.

---

## 3. The canonical quant research workflow, precisely

This is the pipeline every firm in §1–§2 runs some version of. I give the finance version and the campus translation side by side.

```
capture → normalize → point-in-time store → feature/signal construction
   → signal evaluation → combination → portfolio construction → execution
   → attribution & monitoring → decay detection → retirement
```

### 3.1 Capture and normalization

Capture raw, normalize downstream, never the reverse. Store the vendor payload byte-for-byte with a receive timestamp; parse into typed rows in a separate, re-runnable step. When your parser is wrong (it will be), you re-derive rather than re-acquire. This is why Jane Street "save[s] all the data that we have access to along with the time we received it."

Normalization is where the domain lives: entity resolution ("what even is a company?" — dual-listed structures, share classes, ISIN vs SEDOL vs ticker), unit and calendar alignment, and revision handling. Campus analogue: what even is a *club*? An org that renamed, split, merged, has a national chapter, a Discord that outlives its OrgSync entry, and three overlapping rosters.

### 3.2 Point-in-time correctness

The single most important discipline, and the one that separates real systems from demos.

**Bitemporality.** Every fact carries two time axes:
- **Valid time** \(t_v\): when the fact was true in the world.
- **Transaction / knowledge time** \(t_k\): when the system learned it.

A point-in-time query is: *give me the value of feature \(f\) for entity \(e\) valid as of \(t_v\), restricted to rows with \(t_k \le \tau\)*, where \(\tau\) is the decision time. If you omit the \(t_k\) filter, you have built a time machine, and your backtest is fiction.

**As-of join.** The operational primitive. In kdb+ ([`aj`](https://code.kx.com/q/ref/aj/)), `aj[`sym`time; trade; quote]` matches on `sym` exactly and takes, for each trade, the **most recent prior** quote row:

```q
trade:([]time:10:01:01 10:01:03 10:01:04; sym:`msft`ibm`ge; qty:100 200 150)
quote:([]time:10:01:00 10:01:00 10:01:00 10:01:02; sym:`ibm`msft`msft`ibm; px:100 99 101 98)
aj[`sym`time; trade; quote]
/ msft@10:01:01 → px 101 ; ibm@10:01:03 → px 98 ; ge → null
```

`aj` returns the left table's time; `aj0` returns the right table's actual time (useful for measuring staleness); `ajf` forward-fills nulls from the left. Quant firms love kdb+ substantially *because* this primitive is in the language rather than a 40-line window function.

In [Feast](https://docs.feast.dev/getting-started/concepts/point-in-time-joins), the same idea is `get_historical_features(entity_df, features)`: the entity dataframe supplies `(entity_id, event_timestamp, label)`, and Feast scans backward up to a TTL — "TTL is not relative to the current point in time" but to each row's own timestamp. Crucially, Feast also offers `filter_by_created_timestamp=True`, which enforces the *knowledge-time* filter, "ensuring each entity dataframe row only sees feature values whose created timestamp is at or before its own timestamp." That flag is the difference between valid-time-only and true bitemporality. Turn it on.

[Chronon](https://chronon.ai/) (Airbnb; in production at Stripe, Netflix, OpenAI, Uber) makes the same guarantee structural: one declarative `GroupBy`/`Join` definition compiles to both the Spark backfill and the Flink streaming job, so training and serving cannot drift. Sub-10ms p99 serving.

**Practical rule for the campus product:** every feature row is `(entity_id, feature_name, value, valid_from, valid_to, known_at, source_event_id)`. Never `UPDATE`; only insert new versions. This is SCD-2 plus a knowledge column, and it costs you maybe 3× storage on a dataset that is measured in gigabytes. Cheap insurance.

### 3.3 Signal construction ("alphas")

An **alpha** is a function from the point-in-time information set to a cross-sectional score:

$$ a_{i,t} = f(\mathcal{I}_t)_i $$

usually normalized (z-scored or rank-transformed) cross-sectionally so it is dollar-neutral and scale-free. The canonical public corpus is Kakushadze's [*101 Formulaic Alphas*](https://arxiv.org/abs/1601.00991) (arXiv:1601.00991, Wilmott 2016), which publishes "explicit formulas — that are also computer code — for 101 real-life quantitative trading alphas." Its reported statistics are the important part:

- **Average holding period ≈ 0.6–6.4 days.** These are fast, weak signals.
- **Average pairwise correlation 15.9%.** Low. That is the whole design goal: many weakly-correlated weak signals.
- "The returns are strongly correlated with volatility, but have no significant dependence on turnover."

The alphas are built from a small combinator vocabulary — cross-sectional `rank`, time-series `delta`, `delay`, `correlation`, `covariance`, `ts_min/max/argmax`, `decay_linear`, `scale`, `signedpower`, and industry/sector neutralization. **The vocabulary is the product.** A campus signal DSL should be equally small: `rank_within_campus`, `zscore_within_club_type`, `ts_delta(k)`, `ewma(halflife)`, `days_until(calendar_event)`, `neutralize(club_size, club_category)`.

### 3.4 Signal evaluation

For a single signal \(a\) against a forward outcome \(y\):

**Information Coefficient.** The cross-sectional correlation between signal and subsequent outcome, usually Spearman (rank IC) for robustness:

$$ \text{IC}_t = \rho\big(a_{\cdot,t},\; y_{\cdot,t+h}\big), \qquad \overline{\text{IC}} = \frac{1}{T}\sum_t \text{IC}_t $$

**IC t-statistic.** With \(T\) periods, \(t = \overline{\text{IC}} \big/ \big(\sigma_{\text{IC}}/\sqrt{T}\big)\). Below \(|t| \approx 3\) in a multiple-testing environment, assume nothing.

**IC decay.** Plot \(\overline{\text{IC}}(h)\) against horizon \(h\). The shape tells you the holding period and whether you are capturing a fast reaction or a slow drift.

**Information Ratio / Fundamental Law.** Grinold's approximation:

$$ \text{IR} \approx \text{IC} \cdot \sqrt{\text{breadth}} $$

Breadth = number of *independent* bets per year. This is the single most important formula for the campus case, because it says a tiny IC is fine if breadth is large. A signal with IC 0.05 applied to 200 independent event decisions per year gives IR ≈ 0.7. Applied to 4 decisions a year, it is worthless. **Design the product so that decisions are numerous and independent.**

**Turnover and capacity.** Turnover \(= \frac{1}{2}\sum_i |w_{i,t} - w_{i,t-1}|\). Net of costs, a signal's value is \(\text{gross} - c \cdot \text{turnover}\). Campus analogue: a recommendation that changes every hour burns user attention; attention is your transaction cost, and it is not small.

**Orthogonalization.** Regress the new signal on the known ones and keep the residual:

$$ a^{\perp} = a - X(X^\top X)^{-1}X^\top a $$

Only the residual is new information. Every campus signal must be orthogonalized against the obvious baselines: club size, day of week, historical attendance rate, semester week.

**For binary outcomes** (RSVP→attend, signup→member), IC is replaced by AUC / average precision, and for interventions by **uplift**:

$$ \tau(x) = \mathbb{E}[Y \mid X{=}x, W{=}1] - \mathbb{E}[Y \mid X{=}x, W{=}0] $$

Uplift, not response, is the right target for anything the product *does* (a reminder, a nudge, a recommendation). Ranking by predicted attendance sends reminders to people who would have come anyway.

### 3.5 Combination

You will have many weak, correlated signals. The combination step is where most of the Sharpe comes from and where most of the overfitting happens.

- **Linear with shrinkage.** Ridge: \(\hat\beta = (X^\top X + \lambda I)^{-1}X^\top y\). With \(n \sim\) hundreds, \(\lambda\) should be chosen by nested CV and will be large.
- **Bayesian shrinkage toward equal weights.** The James–Stein intuition: when estimating many means from noisy data, shrink toward the grand mean. In practice, **equal-weighting z-scored signals is a shockingly strong baseline** and frequently beats estimated weights out of sample at small \(n\).
- **Hierarchical / partial pooling.** The right answer for campus data. See §8.
- **Hierarchical Risk Parity** (López de Prado, 2016): cluster the signal correlation matrix, recursively bisect, allocate inverse-variance within clusters. Avoids inverting an ill-conditioned covariance matrix — which, with 60 signals and 300 observations, is the situation you are in.
- **Ensembling.** Bagged trees / gradient boosting over signals, but only once \(n\) is in the thousands.

### 3.6 Portfolio construction

Mean-variance with costs and constraints:

$$ \max_w \; \mu^\top w - \tfrac{\gamma}{2} w^\top \Sigma w - c(w, w_0) \quad \text{s.t.} \quad Aw \le b $$

The campus translation is real, not cute. Substitute:

| Finance | Campus |
|---|---|
| \(\mu\) expected returns | predicted uplift per (person, action) |
| \(\Sigma\) risk model | correlation of actions — five reminders about five events to one student are not independent |
| \(c(w,w_0)\) transaction costs | notification fatigue, unsubscribe hazard |
| constraints | frequency caps, fairness across clubs, budget, quiet hours, consent |
| leverage limit | total attention budget per student per week |

This framing is what makes the "operating system" claim non-trivial: the platform is allocating a scarce resource (student attention, club budget, ad inventory) under uncertainty and constraints. That is a portfolio problem.

### 3.7 Execution

In trading, execution is slicing a parent order to minimize market impact. On campus, execution is *delivery*: which channel (push, email, Discord, in-person), what time, what copy. The transferable idea is **implementation shortfall** — measure the gap between the decision-time expected outcome and the realized outcome, and attribute it to delivery.

### 3.8 Attribution and monitoring

Post-trade attribution decomposes realized P&L into: signal contribution, risk-model error, cost, and execution slippage. Campus: decompose realized attendance error into predicted-interest error, calendar-conflict shock (a signal you didn't have), weather shock, and delivery failure. Run this every week. It tells you which *new signal to go buy*.

### 3.9 Backtest pitfalls, stated with numbers

**Multiple testing and the Deflated Sharpe Ratio.** Bailey & López de Prado, ["The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality"](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551), *Journal of Portfolio Management* 40(5), 2014. Their Probabilistic Sharpe Ratio accounts for skew, kurtosis and sample length:

$$ \widehat{\text{PSR}}(\text{SR}^*) = \Phi\!\left[\frac{(\widehat{\text{SR}} - \text{SR}^*)\sqrt{n-1}}{\sqrt{1 - \gamma_3\widehat{\text{SR}} + \frac{\gamma_4-1}{4}\widehat{\text{SR}}^2}}\right] $$

The Deflated Sharpe Ratio sets the benchmark \(\text{SR}^*\) to the **expected maximum Sharpe across \(N\) trials under the null**, which for independent trials is approximately

$$ \mathbb{E}[\max_N \text{SR}] \approx \sigma_{\text{SR}}\left[(1-\gamma)\Phi^{-1}\!\left(1-\tfrac{1}{N}\right) + \gamma\,\Phi^{-1}\!\left(1-\tfrac{1}{Ne}\right)\right] $$

with \(\gamma \approx 0.5772\) (Euler–Mascheroni). The consequence: **the number of configurations you tried is an input to whether your result is real.** If you don't log \(N\), you cannot compute it, which is why the experiment registry is infrastructure and not hygiene.

**Minimum backtest length.** Bailey, Borwein, López de Prado & Zhu, ["Pseudo-Mathematics and Financial Charlatanism"](https://www.ams.org/notices/201405/rnoti-p458.pdf), *Notices of the AMS* 61(5), 2014. Their headline result: with roughly 5 years of data, trying more than ~45 independent strategy configurations makes an in-sample Sharpe of 1.0 *expected by pure chance* even when true Sharpe is zero. Scale that down to a campus: with two semesters of data and ~40 clubs, you can exhaust your statistical budget in an afternoon of feature engineering.

**Purged / combinatorial purged cross-validation.** From López de Prado's *Advances in Financial Machine Learning* (2018). Plain k-fold leaks when labels span time: a training observation whose label window overlaps a test observation carries information about it. **Purging** removes overlapping training observations; **embargo** additionally drops a buffer after each test fold to kill serial-correlation leakage. **CPCV** generates many train/test path combinations to get a distribution of out-of-sample performance rather than one number. Campus analogue: an event's "did it succeed" label depends on RSVPs collected over the preceding 10 days, so purge ±10 days around every test event, and embargo the rest of that week.

**Walk-forward.** Train on \([0,T]\), test on \((T, T+\Delta]\), roll. Honest but data-hungry. For a semester-seasonal product, the correct outer split is **by semester**, and the correct generalization test is **by campus** (leave-one-campus-out), because the thing you're actually claiming is that the model transfers.

**Survivorship bias.** Include dead clubs. Include students who churned. The universe as of time \(t\) must be reconstructed from the point-in-time store, not from `WHERE active = true`.

**Reproducibility.** Every result should be a function of (code commit, data snapshot id, config hash, seed). Content-addressed data versioning (lakeFS, Nessie, or just immutable partition ids) plus MLflow/W&B run logging gets you there. Cho's warning about notebooks applies directly: run the notebook top-to-bottom in CI or don't believe it.

---

## 4. The engineering substrate

### 4.1 Storage

| System | Core idea | Why quants use it | Honest cost / tradeoff |
|---|---|---|---|
| **[kdb+/q](https://code.kx.com/q/)** | Column store, unified in-memory (RDB) + on-disk (HDB), vector language, `aj`/`wj` as primitives; tickerplant→RDB→HDB tick architecture | As-of and window joins are *language features*; single-process, single-threaded determinism; decades of trust | Expensive commercial license; q is write-only for most people; free personal edition exists. **Not for you.** |
| **[ArcticDB](https://docs.arcticdb.io/)** (Man Group, open source) | "Serverless DataFrame database engine" on S3/Azure blob; libraries contain "symbols" (tables); every write creates a version; `as_of` accepts a version number *or a datetime* — it is bitemporal by construction | Man Group's own production store; no server to run; `pip install arcticdb`; claims 100M rows/s single consumer, 1B rows/s concurrent; schemaless DataFrames, atomic append/update, lazy C++-side filtering | Python-centric; not a SQL engine. **Strong candidate for the campus research store.** |
| **DuckDB** | In-process OLAP, "the SQLite of analytics"; reads Parquet/Arrow directly | Zero-ops, absurdly fast on single-node GB-scale, perfect for backtests | Single-node; concurrency story is limited. MotherDuck adds a hosted layer. |
| **ClickHouse** | Distributed column store, extremely fast scans and aggregations | Event-analytics workloads at scale | Operationally heavier; eventual-consistency mutations. |
| **Parquet + Arrow** | Columnar file format + columnar in-memory format with zero-copy interchange | The lingua franca. Superstore stores Parquet underneath. | Not a database — you need a catalog. |
| **Iceberg / Delta Lake** | Open table formats over Parquet with snapshots, schema evolution, and **time travel** | Time travel gives you knowledge-time for free at the table level | Adds a metadata layer to operate. |
| **TimescaleDB** | Postgres extension: hypertables (auto-partitioned by time), continuous aggregates (incrementally maintained materialized views) | You keep Postgres and its ecosystem | Bounded by Postgres single-node economics. |
| **QuestDB / InfluxDB 3.0** | Purpose-built TSDBs; InfluxDB 3 was rebuilt on Arrow + DataFusion + Parquet | Fast ingest, SQL-ish, `ASOF JOIN` in QuestDB | Narrower ecosystem. |
| **Polars / DataFusion** | Arrow-native dataframe / query engines in Rust | Fast, lazy, `join_asof` in Polars | Library, not storage. |

### 4.2 Streaming and incremental computation

The Jane Street lesson (§1.3, §1.4) has two off-the-shelf embodiments.

**Event log as source of truth.** Kafka or [Redpanda](https://redpanda.com/) (C++, Kafka-API-compatible, no ZooKeeper). Or — and this is the right answer at seed stage — a Postgres table `events(seq bigserial, occurred_at, received_at, type, payload jsonb)` plus logical replication / [Debezium](https://debezium.io/) CDC when you outgrow it. The key is that `seq` is your **sequencer**: a total order you can replay from.

**Incremental view maintenance.** [Materialize](https://materialize.com/) is the commercial descendant of Frank McSherry's [Timely and Differential Dataflow](https://github.com/TimelyDataflow) — you write SQL, it maintains the result incrementally as inputs change, with the same "recompute only what changed" semantics as Jane Street's Incremental. [RisingWave](https://risingwave.com/) and [Arroyo](https://www.arroyo.dev/) occupy similar ground; Flink is the heavyweight (event time, watermarks, exactly-once) with the highest operational cost.

Jay Kreps's ["Questioning the Lambda Architecture"](https://www.oreilly.com/radar/questioning-the-lambda-architecture/) is still the right framing: don't maintain two code paths (batch + streaming) for the same logic. Kappa — one log, one processing definition, reprocess by replaying — is what Chronon and Materialize each implement in their own way.

### 4.3 Feature stores

The concept that matters is **point-in-time correct retrieval** (§3.2), not the product category.

- **[Feast](https://feast.dev/)** — open source, thin, BYO offline store (Parquet/BigQuery/Snowflake) and online store (Redis/DynamoDB). Its `filter_by_created_timestamp` is the bitemporal switch.
- **[Chronon](https://chronon.ai/)** — Airbnb, Apache 2.0. One Python definition → Spark backfill + Flink streaming + sub-10ms serving. Best-in-class at eliminating training/serving skew. Heavy (Spark + Flink).
- **Tecton** — managed, expensive, enterprise.
- **Hopsworks, Feathr** — alternatives with smaller communities.

**At seed stage you do not need a feature store.** You need a *feature table with the right schema* and one well-tested `as_of_join()` function. Write that function, property-test it (generate random event streams, assert no future leakage), and you have captured 90% of the value.

### 4.4 Orchestration

**[Dagster](https://docs.dagster.io/)** is the best fit for a research org because its unit of work is a **software-defined asset** — "an object in persistent storage, such as a table, file, or persisted machine learning model" — rather than a task. Assets know their dependencies, so you get lineage, partitions, and *selective backfills* for free. Airflow's ops "remain dependency-unaware until placed within a graph structure"; that difference matters enormously when you need to re-materialize one partition of one feature across two semesters.

Alternatives: **Prefect** (lighter), **Temporal** (durable execution — better for long-running business workflows than for data pipelines), **Airflow 3** (ubiquitous, task-centric), **dbt** for SQL transformations with tests — which is what Jane Street's alt data team actually uses, specifically to avoid "300 line Postgres views."

### 4.5 Experiment tracking and reproducibility

**MLflow** (open source, self-hostable, ~free) or **Weights & Biases** (better UX, paid above a small free tier). Log for every run: git SHA, data snapshot id, config hash, RNG seed, metrics, and — critically for §3.9 — **an incrementing trial counter scoped to the hypothesis family**, so you can compute the deflation. **DVC** or **lakeFS**/**Nessie** for content-addressed data versioning. **Metaflow** or **Hamilton** if you want the DAG in Python rather than YAML.

### 4.6 Simulation and replay

The pattern, distilled from §1.4:

1. Append-only event log with `(seq, occurred_at, received_at)`.
2. All derived state is a **pure fold** over the log. No hidden mutation, no `now()` calls — the clock is injected.
3. A `Simulator` that replays the log into the same fold with a **virtual clock**, seeded RNG, and a pluggable decision function.
4. Snapshots at semester boundaries so you can start a replay mid-stream (the "start after 80% of the day is complete" trick).
5. Counterfactual mode: replay, but substitute policy \(\pi'\) for \(\pi\) at each decision point and evaluate with off-policy estimators (IPS / doubly-robust), since you cannot re-run the world.

Published prior art: LMAX Disruptor + event sourcing (single-writer, replayable ring buffer), and [ABIDES](https://github.com/jpmorganchase/abides-jpmc-public), the JPMorgan/Georgia Tech agent-based market simulator, which is the best open example of a full replay-and-agents harness.

### 4.7 Recommended stack for a startup that wants quant-grade internals

**Option A — Postgres-centric (recommended for v1).**

| Layer | Choice | ~Monthly |
|---|---|---|
| Event log + OLTP | Postgres (Neon/Supabase/RDS), `events` table as sequencer, bitemporal `features` table | $50–300 |
| Time partitioning + rollups | TimescaleDB extension: hypertables + continuous aggregates | included |
| Analytics / backtest | DuckDB reading Parquet exports of the log, run locally or in CI | ~$0 |
| Research store | ArcticDB on S3 (versioned, `as_of` datetime reads) | $10–50 (S3) |
| Transformations | dbt Core + dbt snapshots for SCD-2 | $0 |
| Orchestration | Dagster OSS on one small box, or Dagster+ starter | $0–100 |
| Experiments | MLflow self-hosted | $20 |
| Ingestion of external signals | Python jobs in Dagster; raw payloads to S3 with receive timestamps | $10 |
| **Total** | | **≈ $150–500** |

**Option B — Lakehouse (v2/v3, once you have >10 campuses).**

Parquet on S3 under **Iceberg** (time travel = knowledge time), **DuckDB/ClickHouse** or Trino for queries, **Redpanda** for the event bus, **Materialize** or RisingWave for incremental views feeding the live dashboard, **Chronon** or hand-rolled Feast for features, Dagster + dbt unchanged. Realistically $800–2,000/month.

**The Jane Street cost warning applies.** Mannes: "If we were using one of these other products, we would spend a tremendous amount of time optimizing our spend and trying to shape our workloads to fit their cost model." Per-query-metered warehouses (BigQuery, Snowflake) tax exploration. A fixed-cost box you can hammer is worth more to a research culture than an elastic one you flinch at. Buy one big machine before you buy warehouse credits.

---

## 5. Alternative data: the bridge to the campus use case

This is the closest industry analogue to what a campus product would be doing — buying or scraping exogenous data to predict a local outcome — so the industry's economics, workflow, and legal scar tissue are directly instructive.

### 5.1 What the academic evidence actually shows

The category's anchor study is **Katona, Painter, Patatoukas & Zeng, "On the Capital Market Consequences of *Big* Data: Evidence from Outer Space," *JFQA* 60(2), March 2025** ([doi:10.1017/S0022109023001448](https://doi.org/10.1017/S0022109023001448), open access). *(Note: this is frequently miscited under its SSRN-era title "…Alternative Data.")* It uses RS Metrics parking-lot data — **4.7 million daily observations across 67,078 store locations for 44 US retailers, 2011:Q1–2017:Q4** — and finds a **buy-minus-sell spread of 4.60%–4.76%** around earnings. The important structure is the asymmetry: the **sell leg is −2.82% to −3.10%, roughly twice the +1.63% to +1.78% buy leg**. *Falling traffic predicts weakness far more sharply than rising traffic predicts strength.*

That asymmetry recurs in almost every attendance-like signal, and it is worth designing around: **a club whose RSVP velocity collapses is a much stronger signal than a club whose RSVP velocity spikes.** Build the at-risk detector before the growth detector.

The paper's conclusion is also the honest counterweight to alt-data marketing: effective spreads and price impact *rose* after coverage began, with **no detectable improvement in price-discovery speed**. Unequal access "can increase information asymmetry among market participants without immediately enhancing price discovery." Alt data redistributed information; it did not create it.

The best-credentialed negative result is **Dessaint, Foucault & Frésard, "Does Alternative Data Improve Financial Forecasting? The Horizon Effect," *Journal of Finance* 79 (2024)** ([doi:10.1111/jofi.13323](https://doi.org/10.1111/jofi.13323)): short-horizon alt data pulls analyst attention away from long-horizon analysis, so **short-term accuracy improves while long-term accuracy deteriorates.** A direct contradiction of "more data is monotonically better." The campus version of this risk is real — optimizing next Tuesday's attendance at the expense of the club's two-year survival is exactly the same failure.

### 5.2 Industry structure and the vendor funnel

The market is intermediated by catalogs and scouts. **[Neudata](https://www.neudata.co/)** (London, founded 2016) is the reference: **7,000+ datasets, 4,200+ providers, 10,400+ analyst-written dataset reports, 1,000+ unique buyers**, claiming to touch 60–70% of global alt-data spend while taking **$0 commission**. **Eagle Alpha** lists 2,500+ data products; **BattleFin** runs Discovery Days; **Datarade** (2,600+ providers) works on commission; **AWS Data Exchange** carries 3,500+ datasets; **Crux** handles pipelines for 20,000+ data products with Goldman and Two Sigma as named clients.

The funnel: **scouting → shortlist (the dataset reports exist to kill datasets before a trial is spent) → NDA + sample → backtest → legal diligence → contract → onboarding → production.** This is exactly the two-sided speed-dating market Eric Mannes described in §1.6.

**Evaluation is the bottleneck, not sourcing.** [Exabel's 2026 Alternative Data Market report](https://www.exabel.com/blog/2026-alternative-data-market-report-out-now/) (100 PMs/analysts, ~$2tn AUM) finds **43% name "data evaluation" as the single hardest stage**, **71%** cite combining multiple sources as the top frustration, and **94%** already use ML in alt-data research. **82% of hedge funds use alternative data** ([Lowenstein Sandler survey](https://www.lowenstein.com/news-insights/publications/articles/alternative-data-better-investment-strategies-but-not-without-concerns)).

**The recurring technical kill reasons** — memorize these, because they are the same ones that will kill your campus signals:

| Failure | What it looks like |
|---|---|
| **Insufficient history** | <3–5 years, so a signal can't span a regime change and can't be cross-validated |
| **Restated, not point-in-time** | The dataset silently rewrites history. *The most common single kill.* |
| **Backfilled "simulated" history** | A panel assembled in 2024 presenting reconstructed 2018 data — the backfill was fitted knowing outcomes |
| **Survivorship bias** | Only surviving entities in the sample |
| **Panel drift** | The dominant problem in card and location data: SDK partners churn, issuer mix shifts, so a measured change is *panel composition change* |

Capacity decay shows up in the revenue line: Neudata reports the **average dataset now sells to ~20 investment clients, down from ~25 in 2024**, while **42% of new datasets claim global applicability, up from 29%**. Supply grows faster than per-dataset demand; vendors broaden coverage to defend price.

### 5.3 Economics

**A warning about the numbers everyone quotes.** The canonical AlternativeData.org spend series ($232M in 2016 → ~$1.71B in 2020) is now **unsourceable** — the domain is dead and no live secondary citation survives. Do not use it.

The defensible series is Neudata's, built bottom-up from observed dataset revenue: **$2.5bn in 2024 (+33% YoY), $2.8bn in 2025 (+17%)** on the conservative methodology ([Feb 2026](https://www.neudata.co/blog/state-of-the-alternative-data-market-2026)). Syndicated market-research figures ($14bn → $854bn by 2035 at 50% CAGR, per Precedence) are marketing artifacts roughly 300× verifiable buy-side spend — do not mix the two.

Pricing: **over 50% of datasets are priced below £25,000/year**, well below folk wisdom of a $40–70K median; average dataset revenue is **~$1.1M/year** with elite datasets over $20M — a mean ~30× the median. Per-fund budgets (Exabel 2026): **52% spend $500K–$1M annually, 32% $1M–$2.5M** — over 80% between $500K and $2.5M. **100% of respondents now have a dedicated alternative data lead**, up from 84% in 2025.

**The implication for a campus startup is encouraging.** Your exogenous signals (§7) are almost entirely *free* — NWS, GTFS, registrar calendars, course catalogs, athletics schedules, Ticketmaster's free tier. You get the structural advantage of alt data without the $500K–$2.5M budget, because nobody has bothered to package campus data as a product yet. **That is the arbitrage.**

### 5.4 Legal and compliance — and the campus translation

**MNPI.** *In re App Annie Inc. and Bertrand Schmitt*, Exchange Act Release No. 92975, **Sept 14, 2021** ([order PDF](https://www.sec.gov/litigation/admin/2021/34-92975.pdf)) — the first SEC enforcement action against an alt-data provider. App Annie gave "Connect" away free to app publishers in exchange for **app store login credentials**, promised estimates derived from "aggregated pools of information," and then from late 2014 to mid-2018 used **non-aggregated, non-anonymized customer data to manually alter model estimates** so they landed closer to actuals. Over 100 trading firms subscribed. Penalties: **$10,000,000** and **$300,000 plus a three-year officer-and-director bar** for the CEO.

**The transferable rule is stark: what you promise your data contributors about aggregation is a legal commitment, not marketing copy.** A campus product that tells students "we only use aggregate data" and then uses individual check-in data to price ads has made the App Annie mistake at a smaller scale.

**Scraping.** *Van Buren v. United States*, 593 U.S. 374 (2021) adopted a "gates-up-or-down" reading of CFAA "exceeds authorized access." *hiQ v. LinkedIn* went 9th Cir. 2019 → SCOTUS GVR → 9th Cir. reaffirmed (31 F.4th 1180, Apr 2022), holding that public pages erect "no gates to lift or lower in the first place" — **but hiQ then lost on breach of LinkedIn's User Agreement in Nov 2022 and settled.** Subsequent cases sharpen it: *Meta v. Bright Data* (N.D. Cal., Jan 2024) — Meta **lost** its contract claim, with the court holding the ToS survival clause creates no perpetual post-termination anti-scraping obligation; *X Corp. v. Bright Data* (May 2024, Judge Alsup) — scraping-and-selling claims **preempted by the Copyright Act**; *Ryanair v. Booking.com* — the first CFAA scraping jury verdict ($5,000, July 2024) was **wiped out on JMOL in Jan 2025** because CFAA "loss" means *technological* harm.

> **Net: logged-off scraping of genuinely public data is materially defensible. Credentialed or clickwrapped collection is not.** For §7 this is a bright line — registrar calendars, public course catalogs, athletics schedules, and NWS are fine; anything behind a student login, and anything from Instagram/TikTok, is not.

**Location and consent.** The FTC's 2024 campaign is the most consequential development for panel vendors: **X-Mode Social/Outlogic (Jan 9, 2024)** — first-ever ban on selling sensitive location data, with mandatory **upstream supplier-assessment programs**; **InMarket Media (Jan 18, 2024)**; **Gravy Analytics/Venntel and Mobilewalla (Dec 3, 2024)** — the Mobilewalla order advanced a first-of-its-kind theory that collecting data from real-time bidding exchanges *for purposes other than the auction* is itself unfair; **FTC v. Kochava** survived motions to dismiss twice. Separately, **California's DELETE Act (SB 362)**: the DROP platform went live for consumers **Jan 1, 2026**, with brokers required to process deletion requests from **Aug 1, 2026**, checking at least every 45 days, at **$200 per violation per day**. This converts historically static panels into **depleting assets** — directly undermining the multi-year history funds demand.

**The campus-specific overlay: FERPA.** This is the one legal fact that changes the product's shape. FERPA (20 U.S.C. §1232g; 34 CFR Part 99) applies to institutions receiving Department of Education funds, and rights transfer to the student at 18 or on entering a postsecondary institution. A consumer app that students sign up for *directly*, with data they supply themselves, is generally **not** a FERPA-covered education record — it is governed by ordinary consumer privacy law. But **the moment a university contracts with you and hands you roster, enrollment, or registrar data, FERPA attaches**, and you are operating under the "school official" exception, which requires institutional control over your use of the data and a legitimate educational interest. Those are two materially different companies with two different data architectures.

**Design consequence, and this resolves Mannes's distinction from §1.6.** Jane Street's alt-data team explicitly does not want to know who the individual is — "we want to know people are spending more at Lululemon... While with advertising, I think it's the point." A campus product sits between. The defensible position: **use individual-level data for the student's own benefit (their recommendations, their reminders), and only aggregate data for anything sold to a third party** (club analytics, employer signals, local-business ad targeting). Enforce that at the schema level — separate the `individual` and `aggregate` feature namespaces, and make the ad/employer-facing services structurally unable to read the former. That is a five-line access-control decision in v1 and an unwinnable migration in v3.

---

## 6. Nowcasting and exogenous-signal reasoning

The founder's example — *inbound flight bookings to Minneapolis in winter predict restaurant demand, so target ads to arriving travelers* — is a **nowcasting** claim. There is a real literature here, and it is worth knowing both what it supports and where it breaks, because the campus version of the claim has the same structure.

### 6.1 The two canonical nowcasts, and their honest accuracy

**[Atlanta Fed GDPNow](https://www.atlantafed.org/cqer/research/gdpnow)** is a **bridge-equation** system, not a black box: it aggregates model forecasts of **13 GDP subcomponents**, mapping each public Census/BLS release to the matching NIPA line. A dynamic factor model is used *only* to fill monthly source data not yet released. No judgmental adjustment; the code is frozen for the quarter. Published accuracy of final nowcasts: **MAE 0.77pp, RMSE 1.17pp** (2011:Q3–2025:Q2). Their own FAQ is admirably blunt: *"these accuracy metrics do not give compelling evidence that the model is more accurate than professional forecasters."* Fourteen years of a famous, well-resourced nowcast, and it ties humans.

**[NY Fed Staff Nowcast](https://www.newyorkfed.org/research/staff_reports/sr830)** (Bok, Caratelli, Giannone, Sbordone, Tambalotti, Staff Report 830) is a true **dynamic factor model in state space**: \(y_t = Z_t\alpha_t + \varepsilon_t\), \(\alpha_{t+1} = T_t\alpha_t + R_t\eta_t\). The **ragged edge** — series published at different lags, so the bottom-right of the data matrix is missing — is handled natively by the Kalman filter treating unreleased values as unobserved states. Its best feature is the **news decomposition**: each week's revision is a weighted average of the "news" in that week's releases, where news = actual minus the model's prior expectation. That is exactly the attribution mechanism §3.8 asks for, and it's what lets you say "attendance forecast moved because the weather forecast moved."

Their Table 2.1 is the sobering one: predictability dies at roughly **two quarters**, and the BEA's *own advance estimate* has RMSE 1.61 against later revisions. **There is an irreducible measurement floor.** The campus analogue: you cannot forecast attendance more precisely than your check-in process measures it. Fix measurement before fixing models.

**Mixed-frequency methods.** Three families: bridge equations (aggregate up, regress), state-space DFM + Kalman (ragged edge by construction), and **MIDAS** — regress low-frequency \(y\) on high-frequency \(x\) with a parsimonious lag polynomial \(B(L^{1/m};\theta) = \sum_k b(k;\theta)L^{k/m}\) where \(b(k;\theta)\) is a Beta or exponential-Almon weight function with 2–3 parameters instead of \(K\) free coefficients. MIDAS is the right tool when your signal is daily and your outcome is weekly or per-event.

### 6.2 Google Trends: the honest version, and the cautionary tale

**Choi & Varian, ["Predicting the Present with Google Trends"](https://static.googleusercontent.com/media/www.google.com/en//googleblogs/pdfs/google_predicting_the_present.pdf)**, is disciplined in a way most "alt data" pitches are not. The baseline is deliberately trivial (`log y_t ~ log y_{t-1} + log y_{t-12}`), and the reported gains are modest: Ford sales MAE 9.49% → 9.22%; new one-family house sales 6.91% → 6.08%; headline 18% for Motor Vehicles & Parts. Their framing: *"We are not claiming that Google Trends data help predict the future. Rather... predicting the present."* Notably, **their Chapter 2.4 is a tourism example** — nowcasting Hong Kong visitor arrivals from a GT vacation-destination index plus FX rates. The founder's hypothesis has a direct ancestor in the canonical paper.

**Google Flu Trends** is the failure every exogenous-signal product must study. Lazer, Kennedy, King & Vespignani, ["The Parable of Google Flu"](https://gking.harvard.edu/files/gking/files/0314policyforumff.pdf), *Science* 343:1203 (2014): GFT predicted **more than double** the CDC's ILI rate in Feb 2013 and **missed high in 100 of 108 weeks** from August 2011. The methodology fit **50 million search terms to 1,152 data points** — it was "part flu detector, part winter detector." **Even 3-week-old CDC data forecast current flu better than GFT.** And the killer: **algorithm dynamics.** Google reported 86 search changes in June–July 2012 alone, including suggested-search and symptom-diagnosis features that mechanically inflated flu queries.

> **The transferable rule: your external feed is an instrument owned by someone else who will change it for reasons unrelated to you.** Build the recalibration loop on day one, and always carry the lagged-ground-truth baseline in the ensemble. GFT *combined with* lagged CDC data and dynamically recalibrated substantially outperformed either alone.

For the campus product this is not hypothetical: the registrar will change its catalog software, the rec center will swap occupancy vendors, the athletics site will redesign. Every scraped signal needs a `coverage` and `staleness` monitor (§8.6) and an automatic fallback to the pure-endogenous model.

### 6.3 What actually wins in demand forecasting

The **M5 competition** ([Makridakis, Spiliotis & Assimakopoulos, *IJF* 38(4) 2022](https://doi.org/10.1016/j.ijforecast.2021.11.013)) ran 42,840 hierarchical Walmart series scored by WRMSSE. The Kaggle lineage that predicted its outcome is documented in [Bojer & Meldgaard (2021)](https://arxiv.org/pdf/2009.07701): **global ensemble models beat local single models**, and gradient boosting dominates. The most instructive case is **Rossmann Store Sales (2015)** — 1,115 stores, horizon 1–48 days, with promotions, holidays, **weather, and Google Trends supplied**. The winner used XGBoost with heavy feature construction plus **a ridge-regression trend adjustment to compensate for GBDT's inability to extrapolate trend** — the single most practical trick in the literature. It beat a median-by-store/weekday/promo benchmark by 31%. Favorita's winner **discarded old data**, fitting on only 1–5 months despite years being available.

Model families worth knowing: **SARIMAX** (one series, clean regressors, interpretable); **[Prophet](https://peerj.com/preprints/3190/)** — `y(t) = g(t) + s(t) + h(t) + ε`, whose real contribution is *ergonomics and holiday handling*, not accuracy; **[DeepAR](https://arxiv.org/abs/1704.04110)** — global autoregressive RNN emitting a likelihood, not a point; **[Temporal Fusion Transformer](https://arxiv.org/abs/1912.09363)** — the best-designed architecture for this exact problem because it explicitly separates **static covariates**, **known-future inputs** (calendar, schedules), and **historically-observed exogenous series**, and outputs quantiles directly; **[N-BEATS](https://arxiv.org/abs/1905.10437)** (excluded here — it is univariate and takes no exogenous regressors); **[MinT reconciliation](https://robjhyndman.com/papers/mint.pdf)** for coherent hierarchies (`event → club → category → campus`, exactly your hierarchy); and **pinball loss** whenever over- and under-forecasting cost differently, which for food orders and room bookings is always.

### 6.4 Industry practice: three posts worth reading in full

**[DoorDash, "Managing Supply and Demand Balance Through Machine Learning"](https://doordash.engineering/2021/06/29/managing-supply-and-demand-balance-through-machine-learning/)** is the most candid. Five things to steal:

1. **Metric design**: they forecast *Dasher hours needed vs. supplied*, not orders, because hours normalize away regional variation.
2. **LightGBM-as-regression**, chosen for four pragmatic reasons including **extrapolation to cities with no history** (via population, traffic, merchant count, climate features) and **approximate counterfactuals by perturbing inputs at inference**. This is your cold-start-new-campus answer in a different vocabulary.
3. **The confounding warning**: raw data showed high incentives associated with *fewer* Dasher hours, because bad weather causes both. Their prescription — constrain relationships with domain knowledge or regularize toward experimental results — is exactly what §8.5's priors do.
4. **The forecast unit must match the decision unit.** Aggregating three sub-regions cuts CV from 25% to 14.4% (variances add, not standard deviations), which *looks* like a 40% accuracy win but produces bad local allocations.
5. **Feed a distribution, not a point estimate, into the optimizer.** Their example city had only a **34% chance** of undersupply; the mean both missed it and over-allocated to noisy small regions.

And the table every startup should print: complex feature pipelines rate *Great* at 1 month, *Average* at 2, **Terrible** at 3+, while simple pipelines stay *Average* throughout. **Feature drift eats sophisticated pipelines alive.**

**[Uber, "Engineering Extreme Event Forecasting with RNNs"](https://www.uber.com/blog/neural-networks/)** is the event-driven analogue: one LSTM trained across many cities at once, precisely because extreme events are sparse per city (you only get a handful of New Year's Eves). A vanilla LSTM did *not* beat baseline; they needed an automatic feature-extraction module first. Exogenous inputs: weather forecasts, local holidays and events. Result: **14.09% SMAPE improvement over the base LSTM, >25% over the classical model.** *Train across campuses for the same reason: you only get one Homecoming per year per campus.*

**[Lyft, "Causal Forecasting"](https://eng.lyft.com/causal-forecasting-at-lyft-part-1-14cca6ff3d6d)** models business metrics and policy variables as a **DAG** and fits structural relationships. Their motivating failure is identical to DoorDash's: a correlational model on driver incentives learns a negative slope, implying you could raise driver hours by *cutting* incentives. Their fix — import an experimentally estimated cost curve and constrain the model to match it — is the template for the campus version: your reminder-effect curve must come from randomized exploration (§9.1's 10% budget), not from observational fits.

### 6.5 Causal attribution

**[Google CausalImpact](https://projecteuclid.org/journalArticle/Download?urlId=10.1214%2F14-AOAS788)** (Brodersen et al., *AoAS* 9(1):247, 2015) is a Bayesian structural time-series model with a local linear trend, seasonality, and — the actual innovation — **a regression on contemporaneous controls with a spike-and-slab prior**, so it performs Bayesian model averaging over which controls to use. It produces a *posterior distribution over the counterfactual*. Load-bearing assumption: controls are unaffected by the treatment. Neighbors: synthetic control (Abadie), DiD, **Granger causality** (a statement about incremental predictive content, *not* causation — do not blur this in a pitch deck), transfer entropy, Hawkes processes \(\lambda(t) = \mu + \sum_{t_i<t}\alpha e^{-\beta(t-t_i)}\) for self-exciting event clustering, and spatial lag models \(y = \rho W y + X\beta + \varepsilon\) for venue spillover.

### 6.6 Does the flight-bookings hypothesis hold up?

**Verdict: the shape is supported; the specific link is unproven; the value is narrower than the pitch implies but the *lead time* argument is genuinely strong.**

What exists: a mature ~15-year **tourism demand nowcasting** literature. [Bangwayo-Skeete & Skeete, *Tourism Management* 46:454 (2015)](https://doi.org/10.1016/j.tourman.2014.07.014) applies MIDAS to weekly Google Trends → monthly arrivals and beats AR benchmarks (337 citations). [Volchek et al., *Tourism Economics* (2018)](http://eprints.bournemouth.ac.uk/33177/1/Volchek%20Song%20Liu%20Law%20Buhalis%20Musuem%20forecast_final.pdf) does it at **attraction level** — the closest published analogue to venue-level forecasting. And the mechanism is already productized: **ForwardKeys** (flight-booking-based destination demand) was acquired by Amadeus and sits alongside **Demand360** (forward-looking hotel occupancy from actual reservations). Hotel RM's **pickup model** — forecasting final demand from a partial forward book — is the structural ancestor of the whole idea ([Weatherford & Kimes, *IJF* 19(3) 2003](https://ecommons.cornell.edu/bitstreams/37ff4516-a033-4b3a-8750-d5d5c174f4a2/download), on Choice and Marriott data).

The gaps, stated plainly:

1. **The second link is the weak one.** Bookings → arrivals is near-mechanical. **Arrivals → covers at a specific restaurant** has no published study I could find. That is an inferential leap, not a documented relationship.
2. **Base rates kill it in most markets.** Visitors are a small minority of covers in a typical US metro, so a perfect arrivals forecast barely moves the demand forecast. It is meaningful only where tourist share is high (Las Vegas, Orlando, Honolulu, New Orleans) or near airports/convention centers/hotel clusters. This is a segmentation constraint that must be in the pitch, because the first sophisticated question will be *"what fraction of covers are visitors?"*
3. **Lead time is the real, defensible edge.** OpenTable tells you about tonight. Flight bookings are made weeks to months ahead, which is where staffing and purchasing decisions actually live. **Lead with horizon, not accuracy.**
4. **The baseline must be strong.** Per Choi & Varian, GDPNow, and Lazer, exogenous-signal gains are typically **3–18%** against a *serious* baseline. Beating a weak baseline proves nothing — that is precisely what GFT looked like in production.

**Related caution on foot-traffic panels.** Placer.ai's public case studies are marketing, not evidence — no published validation, no disclosed panel composition. The independent work, ["Understanding the bias of mobile location data across spatial scales and over time," *PLOS ONE* 2024](https://doi.org/10.1371/journal.pone.0294430), documents that representativeness varies by spatial scale **and drifts over time** — the same instrument-instability problem that killed GFT.

**And on the Walmart Pop-Tarts story:** the primary source is Constance Hays, ["What Wal-Mart Knows About Customers' Habits," NYT, Nov 14 2004](https://web.archive.org/web/2019id_/https://www.nytimes.com/2004/11/14/business/yourmoney/what-walmart-knows-about-customers-habits.html) — a single CIO quote ("seven times their normal sales rate") with no baseline definition, no sample, no controls, never replicated. **Evidence grade: anecdote.** Twenty-two years of business-school decks have laundered it into "research." Cite it as a narrative, never as a result. The same discipline applies to every case study a data vendor will show you.

**Finally, an important piece of evidence discipline for the campus case.** The academic consensus on stadium economic impact is resoundingly negative — [Siegfried & Zimbalist, *JEP* 14(3):95 (2000)](https://scholarworks.smith.edu/cgi/viewcontent.cgi?article=1051&context=eco_facpubs) and Coates & Humphreys find essentially zero *net metro-level* gain, because substitution dominates. But "no net metro GDP gain" is fully compatible with "the block around the arena does 3× covers on game night." The stadium literature refutes *public-subsidy* arguments about aggregate growth; it says nothing against localized, short-window, venue-level demand shifts. Keep the two claims separate — and note that signal **E10** in §7 (home game days) is exactly this localized effect, which is why it works for club attendance even though the macro literature is negative.

---

## 7. The campus signal universe

This is the part that does not exist anywhere else, so I have made it concrete. Signals split into **exogenous** (the world, outside your control and outside the club's) and **endogenous** (first-party, generated by the platform). The exogenous ones are your "alt data"; the endogenous ones are your "market data."

Access/latency notes are from direct checks where marked.

### 7.1 Exogenous: calendar and institutional

| # | Signal | Source & access | Cost | Latency | Predicts |
|---|---|---|---|---|---|
| E1 | Academic calendar (term start/end, add/drop, reading days, finals) | Registrar page scrape; often an .ics | Free | Annual, static | Baseline attendance seasonality; the single strongest regressor |
| E2 | Exam density (midterm/final windows per college) | Registrar exam schedule | Free | Per-term | Sharp attendance suppression; dues-payment delay |
| E3 | Breaks & move-in/move-out dates | Registrar / housing | Free | Per-term | Event viability; travel-driven absence |
| E4 | Class meeting patterns (MWF 10am blocks) | Public course catalog / schedule of classes | Free (scrape) | Per-term | Optimal meeting time; conflict scoring |
| E5 | Course enrollment & seat counts by department | Public catalog with live seat availability at many schools | Free (scrape) | Daily during registration | **Major/interest population estimate** — the denominator for club TAM |
| E6 | New-course / new-program launches | Catalog diff | Free | Per-term | Emerging interest areas → new club formation |
| E7 | Career fair / info-session calendar | Career center site, Handshake | Free–$ | Weekly | Professional club attendance spikes; ad demand from employers |
| E8 | Recruiting season timing (banking/consulting/tech deadlines) | Public firm timelines, Wall Street Oasis calendars | Free | Annual | Pre-professional club surge & collapse windows |
| E9 | Greek recruitment calendar | IFC/Panhellenic site | Free | Per-term | Freshman attention competition, Sept/Jan |
| E10 | Athletics schedule (home/away, sport, kickoff time) | Athletics site, ESPN/NCAA endpoints | Free | Season-ahead | Home football Saturday destroys 2–8pm attendance; boosts pre-game demand |
| E11 | Campus-wide event calendar | Localist/25Live feeds, often public .ics/JSON | Free | Daily | Direct conflict detection |
| E12 | Holidays & religious observances | `holidays` py package + Hebcal/Aladhan APIs | Free | Static | Attendance, food planning, scheduling fairness |
| E13 | Election dates & registration deadlines | State SoS, Vote.org | Free | Static | Political/advocacy club surges |
| E14 | University closure / emergency alerts | RSS/alerts feed | Free | Minutes | Cancellation automation |

### 7.2 Exogenous: environment, mobility, and local economy

| # | Signal | Source & access | Cost | Latency | Predicts |
|---|---|---|---|---|---|
| E15 | Weather forecast (hourly, by campus lat/lon) | **[NWS API](https://api.weather.gov)** — *verified: no API key, User-Agent header required, GeoJSON, `/points`, `/gridpoints/.../forecast/hourly`, `/alerts/active`; "free to use for any purpose"* | **Free** | Hourly, 7-day | Outdoor-event attendance; walk-in rate |
| E16 | Weather history (for backtests) | NWS observations; Open-Meteo ERA5 archive | Free | Daily | Training data for E15 |
| E17 | Severe weather alerts | NWS `/alerts/active?area={state}` (CAP) | Free | Minutes | Cancellation, safety comms |
| E18 | Daylight / sunset time | `astral` computed | Free | Static | Evening event attendance (dark = −) |
| E19 | Campus transit (GTFS + GTFS-RT) | **[Mobility Database](https://mobilitydatabase.org/)** — *verified: 6,000+ GTFS/GTFS-RT feeds, 99+ countries, free API*; many campus shuttles publish | Free | Static + 30s realtime | **Commuter feasibility scoring** — the single best fix for the "meetings start after my bus stops running" complaint |
| E20 | Transit service changes/outages | GTFS-RT alerts | Free | Minutes | Attendance shock |
| E21 | Parking occupancy | Some campuses publish live counts | Free (scrape) | 5 min | Commuter presence proxy |
| E22 | Gym/rec-center live occupancy | Connect2Concepts-style live count widgets, published by many campus rec departments | Free (scrape) | 10–30 min | **Campus presence index** — best available proxy for "how many people are physically on campus right now" |
| E23 | Library occupancy / study-room bookings | Some schools publish (LibCal APIs) | Free–$ | 15 min | Exam-period intensity; competing demand |
| E24 | Dining hall hours & menus | Dining site / Nutrislice-style JSON | Free (scrape) | Daily | Meeting time choice; free-food-event competition |
| E25 | Local ticketed events (concerts, comedy, pro sports) | **[Ticketmaster Discovery API](https://developer.ticketmaster.com/)** — *verified: events/venues/attractions, lat/long + radius, geoHash, DMA; 5,000 calls/day, 5 req/s* | Free tier | Daily | Off-campus attention competition; ad demand |
| E26 | Flight capacity / seats to the metro | BTS T-100 segment data (monthly, ~3–6 mo lag); OAG/Cirium for forward schedules (paid) | Free / $$ | Monthly | Break-period travel volume; visiting-family weekends |
| E27 | Airfare & O-D ticket sample | BTS DB1B (quarterly 10% ticket sample, ~2 quarter lag) | Free | Quarterly | Which students go home for breaks; regional origin mix |
| E28 | Live flight activity near campus metro | OpenSky Network (free, rate-limited) | Free | Minutes | Real-time travel-surge proxy |
| E29 | Local business promos / student discounts | Scrape + manual | Free | Weekly | Sponsorship inventory; ad demand |
| E30 | Regional CPI / local unemployment | BLS API | Free | Monthly | Dues affordability; sponsorship budgets |
| E31 | Institutional facts (enrollment, demographics, majors conferred) | **College Scorecard API** via api.data.gov; IPEDS | Free (key) | Annual | Cross-campus priors for hierarchical models (§8) |

### 7.3 Exogenous: attention and social

| # | Signal | Source & access | Cost | Latency | Predicts |
|---|---|---|---|---|---|
| E32 | Google Trends for campus/club terms | Official **Google Trends API (alpha, announced July 2025)**; `pytrends` unofficial | Free (access-gated) | Daily | Topic interest trend; new club viability |
| E33 | Campus subreddit activity/volume | Reddit API (free tier is rate-limited via OAuth; commercial use requires an agreement — check current terms) | Free–$$ | Minutes | Campus mood; event buzz; complaint surfacing |
| E34 | Wikipedia pageviews for campus/club topics | Wikimedia REST API | Free | Daily | Topic interest (clean, no ToS friction) |
| E35 | GitHub / Devpost / Kaggle activity by campus | Public APIs | Free | Daily | Technical club interest depth |
| E36 | App store / platform trend terms | Sensor Tower-class (paid); free proxies via Trends | $$ | Weekly | Emerging interest categories |
| E37 | Public Instagram/TikTok hashtag volume | Scraping — **high ToS and legal risk; do not build on it** | — | — | (Listed to be explicitly rejected) |

### 7.4 Endogenous: first-party (your market data)

These are higher-quality than anything above, because you control the timestamps.

| # | Signal | What it is | Predicts |
|---|---|---|---|
| P1 | RSVP count & arrival curve | RSVPs vs days-to-event, shaped as a curve | Final attendance (the single best predictor) |
| P2 | RSVP velocity (d²/dt²) | Acceleration in the last 48h | Late surge / collapse |
| P3 | Check-in rate (attend / RSVP) | Per club, per event type, per weekday | Calibration of P1; club credibility |
| P4 | Historical show-rate by student | Personal reliability score | Who to remind; who to overbook |
| P5 | Event page views / RSVP conversion | Funnel step | Copy and poster quality |
| P6 | Search queries on the platform | Raw intent text | Unmet demand → which clubs to recruit |
| P7 | Calendar density per student | Count of committed hours that week | Conflict probability, churn hazard |
| P8 | Message volume & response latency in club channels | Per club per week | **Club health leading indicator** (silence precedes death) |
| P9 | Officer-account activity concentration | Gini of actions across officers | Officer burnout / single-point-of-failure risk |
| P10 | Officer transition events | Election, handoff, graduation | The #1 club death hazard |
| P11 | Roster growth/decay rate | Net member delta per week | Health index input |
| P12 | Dues payment lag distribution | Days from invoice to payment | Cash risk; financial-stress proxy |
| P13 | Budget request/approval cycle position | Where in the SGA cycle a club sits | Funding shortfall prediction |
| P14 | Email/push open & click rates by segment | Delivery quality | Channel selection in the decision layer |
| P15 | Unsubscribe / mute hazard | Per-student fatigue | **The transaction cost** in §3.6 |
| P16 | Time-to-first-action for new signups | Onboarding friction | 30-day retention |
| P17 | Cross-club co-membership graph | Bipartite student–club graph | Recommendation; contagion of attendance |
| P18 | Social tie strength (co-attendance counts) | Weighted student–student graph | "Friend is going" is the strongest attendance driver |
| P19 | Room/venue booked & capacity | Venue metadata | Capacity/overflow risk (cf. the HackRU over-registration failure) |
| P20 | Free-food flag on event | Binary | Large, measurable attendance lift |
| P21 | Event lead time (announce → occur) | Days | Attendance; optimal announce timing |
| P22 | Poster/asset presence and format | Has image, has time in image | Conversion |
| P23 | Day-of-week × hour slot | Categorical | Baseline |
| P24 | Club age & founding cohort | Years since founding | Survival hazard |
| P25 | Advisor engagement | Advisor logins/approvals | Compliance risk, funding friction |
| P26 | Sponsor pipeline stage counts | CRM state | Revenue forecast for the club |
| P27 | Waiver/form completion rate | Compliance funnel | Event go/no-go |
| P28 | Recurring vs one-off event flag | Categorical | Habit formation |
| P29 | Cross-campus analogue performance | Same club type at peer campuses | The prior in §8 |
| P30 | Student major × club category affinity | From E5 + roster | Targeting; new-member yield |

**Derived / interaction signals** worth registering explicitly (these are the campus equivalents of Kakushadze's operators):
`rsvp_count × zscore(weather_badness)`, `conflict_with_home_game`, `days_to_nearest_exam`, `transit_last_bus_minus_event_end`, `commuter_share_of_roster × event_hour`, `friend_attendance_share`, `officer_activity_ewma(halflife=14d)`, `neutralize(rsvp_rate, club_size, club_category)`, `campus_presence_index` (E22 + E21 + E19 composite), `attention_saturation` (P7 + P14 + P15).

That is 60+ named signals, ~31 exogenous and ~30 endogenous, plus 10 derived.

### 7.5 What each class actually buys you

- **Calendar/athletics/weather (E1–E18, E25)** are *free, high-latency-tolerant, and explain a large share of variance*. Build these first. They are the "risk model" — the known factors every signal must be orthogonalized against.
- **Transit and occupancy (E19–E24)** are the differentiated ones. Nobody else in the club-software market has them, they are free, and they map directly onto documented user pain (commuters, meeting times).
- **Course catalog (E5)** is the sleeper. Live seat counts by department, diffed weekly, give you a real-time map of what the campus is interested in — the denominator no competitor has.
- **First-party (P1–P30)** dominates everything once you have density. Exogenous signals matter most *at cold start* and for *cross-campus transfer*.

---

## 8. The alpha analogy, done rigorously for small data

### 8.1 What "signal" means in this product

**A signal is a point-in-time-computable feature that measurably improves a decision the platform actually makes.** Three clauses, all load-bearing:

- *Point-in-time computable* — it can be produced from data whose `known_at ≤ decision_time`. If it can't, it is a dashboard metric, not a signal.
- *Measurably improves* — it has a registered evaluation against a registered target with a registered baseline.
- *A decision the platform makes* — reminder timing, event-time recommendation, club-to-student matching, at-risk-club alerting, ad pricing, budget allocation. A signal with no decision attached is not a signal.

### 8.2 The decision–target matrix

| Decision | Target \(y\) | Metric | Baseline to beat |
|---|---|---|---|
| Predict attendance for staffing/food/room | headcount | MAE, pinball loss at q10/q50/q90 | RSVP × historical show-rate |
| Who to remind, when | attended \| reminded | **uplift** (AUUC/Qini) | remind everyone |
| Which clubs to show a student | joined within 30d | AUC, NDCG@10 | popularity ranking |
| Which event time to suggest | attendance rate | MAE | last semester's slot |
| Flag an at-risk club | dissolved / inactive next term | AUC-PR, calibration | roster size threshold |
| Price ad inventory to a local business | conversion per impression | AUC + revenue lift | flat CPM |
| Allocate SGA budget | events delivered per dollar | portfolio efficiency | proportional-to-request |

### 8.3 Evaluating one signal

Use the §3.4 machinery, campus-flavored:

- **Rank IC against attendance**: for each event-week, Spearman correlation between the signal across events and realized attendance rate. Report \(\overline{\text{IC}}\), \(\sigma_{\text{IC}}\), and \(t = \overline{\text{IC}}\sqrt{T}/\sigma_{\text{IC}}\).
- **IC decay by lead time**: compute IC at 14, 7, 3, 1 days before the event. A signal useful only at T−1 can't drive a T−7 decision.
- **AUC for binary conversions**, plus a **calibration plot** — calibration matters more than discrimination when the output feeds an optimizer.
- **Uplift for interventions**: \(\tau(x) = \mathbb{E}[Y|X{=}x,W{=}1] - \mathbb{E}[Y|X{=}x,W{=}0]\), estimated with a T-learner or causal forest, evaluated by Qini curve.
- **Orthogonalized IC**: IC of the residual after regressing on the baseline factor set (club size, weekday, semester week, club category, historical show-rate). **Report both raw and orthogonalized. Only the orthogonalized number earns a signal a slot.**
- **Breadth**: how many independent decisions per year does this signal touch? Apply \(\text{IR} \approx \text{IC}\sqrt{\text{breadth}}\) before getting excited.

### 8.4 Combining hundreds of weak signals on tiny data

Ordered from what to do first:

1. **Equal-weight z-scored signals within a theme.** Themes: *calendar/conflict*, *weather/environment*, *social/network*, *club-health*, *individual-history*. Within-theme equal weighting, then a small number of theme weights estimated with heavy shrinkage. This is AQR's QMJ construction applied to campus, and at \(n \sim 300\) it will beat almost anything you fit.
2. **Ridge with strong \(\lambda\)** at the theme level, chosen by purged CV (§3.9).
3. **Hierarchical Risk Parity** on the signal correlation matrix once you have >30 signals — avoids inverting a near-singular matrix, the exact pathology Kakushadze names.
4. **Gradient boosting** only once \(n > 5{,}000\) labeled events, and even then constrained (max_depth ≤ 3, monotonic constraints on obvious features like RSVP count).

### 8.5 Bayesian hierarchical models: the right tool for one campus

This is the single most important technical recommendation in this document.

You have hundreds of events, dozens of clubs, one to a few campuses. Fitting per-club models overfits; fitting one pooled model ignores real heterogeneity. **Partial pooling** — Gelman & Hill, *Data Analysis Using Regression and Multilevel/Hierarchical Models* (2007), and Gelman et al., *Bayesian Data Analysis* (3rd ed.) — is the exact solution, and the [Eight Schools](https://www.tensorflow.org/probability/examples/Eight_Schools) example is literally the same problem shape.

A workable attendance model:

$$
\begin{aligned}
y_{e} &\sim \text{NegBinomial}(\mu_e, \phi) \\
\log \mu_e &= \alpha_{c[e]} + \beta_{c[e]}\cdot \text{rsvp}_e + \gamma^\top x_e + \delta_{w[e]} \\
\alpha_c &\sim \mathcal{N}(\mu_\alpha^{(k[c])},\, \sigma_\alpha^2) \\
\mu_\alpha^{(k)} &\sim \mathcal{N}(\mu_\alpha^{\text{campus}},\, \sigma_k^2) \\
\mu_\alpha^{\text{campus}} &\sim \mathcal{N}(\mu_0, \sigma_0^2)
\end{aligned}
$$

Three levels: event → club → club *category* \(k\) (a-cappella, pre-med, cultural, club sport) → campus. Negative binomial because attendance is an overdispersed count. \(\delta_w\) is a semester-week effect shared across all clubs.

Why this is right, concretely:

- **A brand-new club with zero history gets the category prior**, automatically. \(\alpha_c\) shrinks all the way to \(\mu_\alpha^{(k)}\). No cold-start hack needed — the model *is* the cold-start solution.
- **Shrinkage is adaptive**: a club with 40 observed events barely shrinks; a club with 2 shrinks hard. The shrinkage factor is \(\frac{\sigma_\alpha^2}{\sigma_\alpha^2 + \sigma^2/n_c}\) — it falls out of the math rather than being a tuning knob.
- **Cross-campus transfer is the same mechanism one level up.** Campus #2 launches with campus #1's posteriors as its prior. This is the compounding asset: every campus makes the next campus's cold start better. *That is the real moat, and it is a statistical one.*
- **Uncertainty is first-class.** You get a posterior predictive interval on attendance, which is what the decision layer needs (order food for the q75, book a room for the q90).

Implementation: [PyMC](https://www.pymc.io/), [NumPyro](https://num.pyro.ai/), or [Stan](https://mc-stan.org/) via cmdstanpy; `brms`-style formulas if you prefer R. At this data scale, MCMC runs in seconds to minutes on a laptop. Use non-centered parameterization for the group effects, check \(\hat{R}\) and divergences, and run posterior predictive checks by club category.

**Avoid overfitting with tiny data** — the checklist:
- Prefer varying intercepts before varying slopes; add a varying slope only when the data demand it (compare via LOO-PSIS, not in-sample fit).
- Use weakly informative priors (`Normal(0, 1)` on standardized coefficients), never flat ones.
- Cap the number of fixed-effect features at roughly \(\sqrt{n_{\text{events}}}\).
- **Log every hypothesis tested**, so the §3.9 deflation is computable. Cho's warning about researchers at the same firm inadvertently leaking through each other applies to a three-person team even more sharply.
- Leave-one-club-out and leave-one-campus-out CV, not random k-fold.

### 8.6 Continuous learning, decay, and retirement

Every signal in the registry carries a **live scorecard**, recomputed weekly on a rolling 8-week window:

| Field | Meaning |
|---|---|
| `ic_8w`, `ic_lifetime` | Rolling and lifetime orthogonalized IC |
| `ic_tstat`, `n_trials` | Significance, and the trial count for deflation |
| `coverage` | Fraction of decisions where the signal was non-null |
| `staleness_p95` | p95 age of the underlying data at decision time |
| `decay_flag` | `ic_8w < 0.5 × ic_lifetime` for 3 consecutive weeks |
| `status` | `candidate → shadow → live → decayed → retired` |

Promotion rules: a signal enters `shadow` when orthogonalized IC t-stat > 2 on held-out data; it goes `live` only after a **shadow period of one full month** where its predictions are logged but not acted on, and it beats the incumbent combination out of sample. Retirement is automatic on `decay_flag`; retired signals stay in the registry with their history, because knowing that a signal *died* is itself information (a broken upstream feed, a changed campus policy).

Campus signals should decay far more slowly than market alphas — campus life is only weakly anti-inductive. Expect semester-scale decay driven by real regime changes (a new registrar system, a new athletic conference, a dining-hall renovation, graduation of a cohort), not by adversaries trading against you. **Set alerts at the semester boundary, not the week.**

---

## 9. The Campus Quant Engine, specified

### 9.1 Architecture

Five layers. Each has a single responsibility and a typed boundary. The UI stays dead simple because **all of this is invisible** — it surfaces as three numbers and one suggestion.

```
 ┌──────────────────────────────────────────────────────────────────┐
 │ L0  CAPTURE — the sequencer                                      │
 │     events(seq, occurred_at, received_at, actor, verb, object,   │
 │            payload jsonb, source, ingest_run_id)                 │
 │     • append-only, never updated, never deleted                  │
 │     • external feeds land as raw blobs in S3 + a row here        │
 │     • TWO timestamps on everything; we trust received_at         │
 └──────────────────────────────────────────────────────────────────┘
                              │  pure fold
 ┌──────────────────────────────────────────────────────────────────┐
 │ L1  STATE + FEATURE STORE (bitemporal)                           │
 │     entities: student, club, event, campus, org_unit, venue      │
 │     features(entity_type, entity_id, feature_name, value,        │
 │              valid_from, valid_to, known_at, source_seq)         │
 │     • one function: as_of_join(entities, features, decision_ts)  │
 │       filtering BOTH valid_time AND known_at                     │
 │     • property-tested: no synthetic event stream may leak future │
 └──────────────────────────────────────────────────────────────────┘
                              │
 ┌──────────────────────────────────────────────────────────────────┐
 │ L2  SIGNAL REGISTRY                                              │
 │     signal(id, name, owner, expression, inputs[], target,        │
 │            horizon, theme, status, scorecard, created_at)        │
 │     • signals are DECLARED in a tiny DSL, not hand-coded         │
 │     • DSL ops: rank_within(campus|category), zscore, ts_delta(k),│
 │       ewma(hl), days_until(cal_event), conflict_with(feed),      │
 │       neutralize(factors[]), lag(k), share_of(group)             │
 │     • every signal compiles to (a) a backfill query and          │
 │       (b) an online expression — Chronon's guarantee, hand-rolled│
 └──────────────────────────────────────────────────────────────────┘
                              │
 ┌──────────────────────────────────────────────────────────────────┐
 │ L3  MODEL ZOO + EVALUATION HARNESS                               │
 │     models: hierarchical-NB attendance, uplift T-learner for     │
 │       reminders, club-survival hazard, student→club ranker,      │
 │       ad-conversion model                                        │
 │     harness ("clublens"): quantile-spread plot, IC/IC-decay,     │
 │       AUC + calibration, Qini, orthogonalized IC, breadth, DSR   │
 │     • purged + embargoed CV; leave-one-club-out;                 │
 │       leave-one-campus-out as the generalization test            │
 │     • every run logged: git SHA, snapshot id, config hash, seed, │
 │       TRIAL COUNTER                                              │
 └──────────────────────────────────────────────────────────────────┘
                              │
 ┌──────────────────────────────────────────────────────────────────┐
 │ L4  DECISION LAYER (the optimizer)                               │
 │     max Σ uplift(s,a) - λ·fatigue(s) - cost(a)                   │
 │     s.t. per-student frequency caps, quiet hours, consent,       │
 │          per-club fairness floor, channel capacity, budget       │
 │     • outputs ACTIONS, logs (decision_id, policy_version,        │
 │       propensity) so off-policy evaluation is possible later     │
 │     • 10% of decisions are randomized → an exploration budget    │
 └──────────────────────────────────────────────────────────────────┘
                              │
                   SIMPLE UI: 3 numbers + 1 suggestion
```

**Two properties make the whole thing work.** (1) *Everything downstream of L0 is a pure function of the event log*, so the **Simulator** — replay L0 with a virtual clock, seeded RNG, and a swappable policy at L4 — gives you backtesting, counterfactuals, audit, and bug repro from one mechanism. This is the sequencer pattern (§1.4) and LEAN's backtest/live parity in one. (2) *L1 filters on `known_at`*, so you cannot accidentally build a time machine.

**Logging propensities at L4 is non-negotiable.** Without the probability with which each action was taken, you cannot do off-policy evaluation later, and you will be stuck running slow A/B tests forever.

### 9.2 The signal registry, in practice

A signal is a row, not a file:

```yaml
id: sig_conflict_home_game
name: conflict_with_home_athletic_event
theme: calendar_conflict
expression: |
  max_over(athletics_schedule,
           overlap_hours(event.start, event.end, game.start, game.end + 3h))
inputs: [E10_athletics_schedule, event.start, event.end]
target: attendance_rate
horizon: [T-14d, T-1d]
neutralize: [club_size, weekday, semester_week, club_category]
status: live
scorecard: {ic_8w: 0.112, ic_lifetime: 0.134, ic_tstat: 3.4,
            coverage: 0.94, staleness_p95: 4h, decay_flag: false, n_trials: 7}
```

`n_trials: 7` is there so the Deflated Sharpe calculation of §3.9 is computable. If you don't record it, you can't honestly claim the signal is real.

### 9.3 Starter signal catalog

§7 is the catalog: **31 exogenous (E1–E37, minus the rejected ones), 30 endogenous (P1–P30), and 10 named derived signals** — 60+ total, each with source, cost, access method, latency, and predicted target. Build order:

- **Tier 1 (week 1–4, free, high explanatory power):** E1, E2, E3, E10, E11, E12, E15, E16, E18, E23 + P1, P2, P3, P5, P11, P19, P20, P21, P23.
- **Tier 2 (month 2–3, the differentiators):** E4, E5, E9, E19, E22, E25 + P4, P7, P8, P9, P10, P14, P15, P17, P18.
- **Tier 3 (month 4+, cross-campus and monetization):** E7, E8, E26, E27, E29, E30, E31, E32, E34 + P12, P13, P26, P29, P30.

### 9.4 Evaluation protocol

1. **Register the hypothesis before you look.** Signal name, target, horizon, expected sign, baseline. Increment the trial counter for its theme.
2. **Splits.** Outer: leave-one-campus-out (or, with one campus, leave-one-semester-out). Inner: purged + embargoed time-series CV, purge window = the label's information window (±10 days for events).
3. **Baselines, always three:** (a) the incumbent production model, (b) a naïve rule (RSVP × historical show-rate), (c) the club's own last-5-event mean.
4. **Report:** orthogonalized rank IC + t-stat, IC decay curve, AUC + calibration for binary targets, Qini for interventions, breadth, and **DSR-deflated significance given the trial count**.
5. **Shadow for one month.** Predictions logged, not acted on. Compare live.
6. **Promote only if** it beats the incumbent *combination* out of sample, not just its own baseline.
7. **Weekly scorecard refresh**; auto-retire on `decay_flag`.
8. **Quarterly attribution review**: decompose realized error into signal error, missing-signal shock, and delivery failure. Missing-signal shocks are your buy list.

### 9.5 Roadmap

**v1 — "Honest plumbing" (months 0–3).** Goal: never have to rebuild the foundation.
- Postgres event log with `seq`, `occurred_at`, `received_at`. Nothing is ever updated.
- Bitemporal `features` table + one property-tested `as_of_join()`.
- Dagster + dbt; raw external payloads to S3 with receive timestamps.
- Tier-1 signals ingested (NWS, academic calendar, athletics, campus event feed).
- One model: hierarchical negative-binomial attendance forecast with partial pooling across clubs. Ship it as **one number in the UI**: "Expect 24 (14–38)."
- `clublens` v0: IC, quantile spread, calibration plot.
- MLflow, trial counter, purged CV.
- *Exit criterion:* you can answer "what would we have predicted on March 3rd?" and the answer is provably honest.

**v2 — "The loop closes" (months 3–9).**
- Tier-2 signals, including transit (E19) and campus presence (E22) — the differentiators.
- Signal registry with the DSL and scorecards; shadow-mode promotion pipeline.
- Uplift model for reminders; L4 decision layer with frequency caps, fatigue cost, and **propensity logging**; 10% exploration budget.
- Simulator: replay the log with a swappable policy; off-policy evaluation (IPS + doubly-robust).
- Incremental view maintenance (Timescale continuous aggregates, or Materialize) so the dashboard is live rather than nightly.
- Club-survival hazard model → the at-risk alert, which is the feature advisors and student-affairs staff will actually pay for.
- *Exit criterion:* a signal can go from idea to live in under a week, with an auditable record of why.

**v3 — "Multi-campus compounding" (months 9–24).**
- Second and third levels of the hierarchy: campus-level and category-level priors. **Campus #2 launches warm.** Measure and publish the cold-start improvement — that number is the moat.
- Lakehouse migration (Iceberg on S3, DuckDB/ClickHouse) if data volume demands it; ArcticDB for versioned research frames.
- Ad/sponsorship pricing model on top of the conversion model; budget-allocation optimizer for SGA as a constrained portfolio problem.
- Alt-data sourcing function — a *person* whose job is "what data exists that we don't have?", per Jane Street's data-strategy role (§1.6).
- Automated signal search over the DSL — carefully, with the trial counter wired into the deflation, because this is exactly where Quantopian's failure mode lives.
- *Exit criterion:* attendance-forecast MAE on a brand-new campus in its first month is better than a mature competitor's on a campus they've had for a year.

### 9.6 Five things not to do

1. **Don't `UPDATE` anything that a model reads.** It converts your backtest into a time machine. This is the mistake that is unrecoverable a year later.
2. **Don't build a feature store.** Build one correct `as_of_join()` and property-test it.
3. **Don't use gradient boosting on 300 events.** Use partial pooling. Cho: "you probably want to go as simple as possible."
4. **Don't run automated signal search before the trial counter exists.** That is Quantopian, at 1/1000th the scale, with the same math.
5. **Don't let the panel-composition problem go unmodeled.** If RSVPs rise, is interest rising or is adoption rising? Every first-party metric must be normalized by the active roster it was measured over. Mannes: *"if there are more consumers in the sample, does that mean that people are spending more at Walmart or does it mean there are more consumers in the sample?"*

### 9.7 The one-sentence version

Build an append-only event log with two timestamps, one honest as-of join, a registry of declared signals with live scorecards, a hierarchical Bayesian model that borrows strength across clubs and campuses, and a constrained optimizer that spends student attention like capital — then hide all of it behind three numbers and a suggestion.

---

## Source index

**Jane Street:** [blog.janestreet.com](https://blog.janestreet.com/) · [signalsandthreads.com](https://signalsandthreads.com/) — Ep. 3 [Multicast and the Markets](https://signalsandthreads.com/multicast-and-the-markets/), Ep. 11 [Building a UI Framework](https://signalsandthreads.com/building-a-ui-framework/), Ep. 22 [Finding Signal in the Noise](https://signalsandthreads.com/finding-signal-in-the-noise/), Ep. 26 [Why Testing is Hard](https://signalsandthreads.com/why-testing-is-hard-and-how-to-fix-it/), Ep. 28 [Building a Data Warehouse from Scratch](https://signalsandthreads.com/building-a-data-warehouse-from-scratch/), Ep. 29 [Wrestling the World into Rows](https://signalsandthreads.com/wrestling-the-world-into-rows/) · [Incremental](https://github.com/janestreet/incremental) · [Bonsai](https://github.com/janestreet/bonsai) · [OxCaml](https://blog.janestreet.com/introducing-oxcaml/) · [janestreet.com/technology](https://www.janestreet.com/technology/)

**Other firms:** [HRT Beat](https://www.hudsonrivertrading.com/hrtbeat/) · [Optiver tech blog](https://www.optiver.com/insights/technology-blog/designing-for-latency-and-iteration/) · [Two Sigma engineering](https://www.twosigma.com/topic/engineering/) · [Flint](https://github.com/twosigma/flint) · [ArcticDB](https://github.com/man-group/ArcticDB) · [AQR Research](https://www.aqr.com/Insights/Research) · [Quantopian GitHub](https://github.com/quantopian) · [LEAN](https://github.com/QuantConnect/Lean) · [Firedancer](https://github.com/firedancer-io/firedancer)

**Methodology:** [Kakushadze, 101 Formulaic Alphas](https://arxiv.org/abs/1601.00991) · [Bailey & López de Prado, Deflated Sharpe Ratio](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551) · [Bailey et al., Pseudo-Mathematics and Financial Charlatanism](https://www.ams.org/notices/201405/rnoti-p458.pdf) · López de Prado, *Advances in Financial Machine Learning* (2018) · Gelman & Hill, *Data Analysis Using Regression and Multilevel/Hierarchical Models* (2007) · Grinold & Kahn, *Active Portfolio Management*

**Substrate:** [kdb+ aj](https://code.kx.com/q/ref/aj/) · [ArcticDB docs](https://docs.arcticdb.io/) · [Feast point-in-time joins](https://docs.feast.dev/getting-started/concepts/point-in-time-joins) · [Chronon](https://chronon.ai/) · [Dagster assets](https://docs.dagster.io/guides/build/assets) · [Materialize](https://materialize.com/) · [Timely/Differential Dataflow](https://github.com/TimelyDataflow) · [ABIDES](https://github.com/jpmorganchase/abides-jpmc-public)

**Campus data sources:** [NWS API](https://www.weather.gov/documentation/services-web-api) · [Mobility Database (GTFS)](https://mobilitydatabase.org/) · [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) · College Scorecard via api.data.gov · BTS TranStats (T-100, DB1B) · Google Trends API (alpha, July 2025)

**Alt data & nowcasting:** [Katona, Painter, Patatoukas & Zeng, *JFQA* 60(2) 2025](https://doi.org/10.1017/S0022109023001448) · [Dessaint, Foucault & Frésard, *JF* 79 (2024)](https://doi.org/10.1111/jofi.13323) · [Neudata market sizing](https://www.neudata.co/blog/state-of-the-alternative-data-market-2026) · [Exabel 2026 report](https://www.exabel.com/blog/2026-alternative-data-market-report-out-now/) · [SEC, In re App Annie](https://www.sec.gov/litigation/admin/2021/34-92975.pdf) · [FTC v. X-Mode/Outlogic](https://www.ftc.gov/news-events/news/press-releases/2024/01/ftc-order-prohibits-data-broker-x-mode-social-outlogic-selling-sensitive-location-data) · [EFF on hiQ v. LinkedIn](https://www.eff.org/deeplinks/2022/04/scraping-public-websites-still-isnt-crime-court-appeals-declares) · [CPPA Data Broker Registry / DELETE Act](https://cppa.ca.gov/data_broker_registry/) · [GDPNow](https://www.atlantafed.org/cqer/research/gdpnow) · [NY Fed SR830](https://www.newyorkfed.org/research/staff_reports/sr830) · [Choi & Varian](https://static.googleusercontent.com/media/www.google.com/en//googleblogs/pdfs/google_predicting_the_present.pdf) · [Lazer et al., *Science* 343 (2014)](https://gking.harvard.edu/files/gking/files/0314policyforumff.pdf) · [DoorDash supply/demand ML](https://doordash.engineering/2021/06/29/managing-supply-and-demand-balance-through-machine-learning/) · [Uber extreme-event RNNs](https://www.uber.com/blog/neural-networks/) · [Lyft causal forecasting](https://eng.lyft.com/causal-forecasting-at-lyft-part-1-14cca6ff3d6d) · [Temporal Fusion Transformer](https://arxiv.org/abs/1912.09363) · [MinT reconciliation](https://robjhyndman.com/papers/mint.pdf) · [CausalImpact](https://projecteuclid.org/journalArticle/Download?urlId=10.1214%2F14-AOAS788) · [Bangwayo-Skeete & Skeete, *Tourism Management* 46 (2015)](https://doi.org/10.1016/j.tourman.2014.07.014) · [PLOS ONE, mobile location bias (2024)](https://doi.org/10.1371/journal.pone.0294430) · FERPA, 20 U.S.C. §1232g / 34 CFR Part 99
