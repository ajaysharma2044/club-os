# Club OS — The quant engine, per feature

*How each tool in `13-problem-solution-map.md` gets a real measurement and decision layer underneath it. Builds on `04-quant-engine.md` (the substrate) and `11-cross-club-graph.md` (the person-versus-situation model). Everything here is tied to a decision someone at CEC actually had to make in the last six weeks.*

---

## 0. The principle that keeps this honest

**Heavy math goes where a real decision is made and the data can support it. Everywhere else, it is deliberately simple, and that restraint is what makes the hard parts credible.**

This matters because the temptation is to put a model behind every screen. The earlier research was emphatic on the danger: one campus, a few hundred events, and a few thousand people is a small dataset, and testing many weak signals against it produces confident nonsense. We are in AQR's world, not WorldQuant's — few signals, strong priors, careful inference.

So there are exactly five places where genuinely hard math earns its keep, because each one answers a question a human was visibly struggling to answer by hand:

| Where | The method | The question it answers |
|---|---|---|
| Interview scheduling | Network flow and constraint programming | "Can we even run 35 interviews this week, and if not, what do I change?" |
| Attendance forecasting | Hierarchical Bayesian, posterior predictive | "How many people will actually come?" |
| Food ordering | Newsvendor on that posterior | "How much do I order?" |
| Reliability estimation | Rasch model with shrinkage | "Does a no-show mean anything about this person?" |
| Succession risk | Graph and survival analysis | "What breaks when these seven people graduate?" |

Everything else is counting, done correctly, with the right denominators.

---

## 1. Interview scheduling — the one that is genuinely an optimization problem

This is the most mathematically satisfying piece in the product, and it is also the most urgent, which is rare.

### The decision

35 first-round interviews at panel size 1 or 2, plus 17 second rounds at panel size 4, across 7 officers with class schedules and self-declared weekly caps, inside one week. The recruitment lead was computing this by hand and getting as far as *"2 max per person"* before giving up and deciding to recruit more interviewers.

### The model

**Feasibility is a max-flow problem.** Build a network: a source feeds each candidate, candidates connect to the time slots they are available for, slots connect to interviewers free at that time, and each interviewer has an edge to the sink whose capacity is their declared weekly cap.

The maximum flow through that network **is** the number of interviews that can actually be scheduled. If it is below demand, the **min-cut identifies precisely which constraints are binding** — that is, exactly which interviewer caps to raise, or whether the bottleneck is availability rather than capacity.

That produces the sentence the recruitment lead wanted:

> "At current caps you can run 31 of 35 first rounds. The binding constraint is Tuesday and Thursday evening availability, not total capacity. Raising two caps by one does nothing. Adding one interviewer with Tuesday evening availability gets you to 36."

**Panel assembly is set packing, and needs a real solver.** Four simultaneous interviewers is not a calendar invite, it is finding disjoint feasible quadruples across a sparse availability matrix. At this scale — 7 to 15 interviewers, 17 panels — a constraint solver finds the exact optimum in under a second. Use CP-SAT. Do not hand-roll a greedy heuristic, because greedy fails badly on exactly the tight instances where you need the answer.

**Fairness is a constraint, not an afterthought.** Minimize the maximum load rather than the total, so the schedule does not quietly dump eleven interviews on whoever had the most open calendar. Add conflict-of-interest exclusions directly as forbidden edges: an officer who already coffee-chatted a candidate cannot be assigned to interview them.

### The tracking

Log every slot offered, accepted, declined, rescheduled, and no-showed, with timestamps. Within one cycle this produces the acceptance and reschedule rates that make the next cycle's capacity estimate accurate rather than assumed.

### What ships

Week one: the max-flow feasibility number and a greedy first-round schedule. Week two: CP-SAT panels and load balancing. Both are small; the model is the product.

---

## 2. Attendance forecasting — hierarchical, because the alternative overfits immediately

### The decision

How many people come, which drives the room, the food order, and whether an event is worth running at all. Officers currently guess: *"Don't think we would get more than 50-70."*

### The model

Attendance is a count bounded by RSVPs, so model the **conversion** rather than the raw number:

```
attended_e  ~  Binomial(rsvps_e, p_e)

logit(p_e) = α_club[e] + β_type[e] + γᵀx_e
```

with partial pooling on both the club and the event-type intercepts. The features `x_e` are the ones the field evidence proves matter, and they are all free:

- days to first final, and weeks into term
- competing campus events in a two-hour window
- whether food is provided, and whether food is *advertised*
- day of week and hour
- precipitation probability at event time
- lead time between announcement and event
- whether the location changed after announcement

**Why hierarchical is not optional here.** A new event type has no history. Partial pooling means it automatically inherits the club's average conversion, shrunk by how little we know, and the shrinkage factor falls out of the variance ratio rather than being a tuning knob. A club with two observed events barely moves off the prior. A club with forty speaks for itself. **The model refuses to be confident about things it has barely seen**, which is both correct statistics and the right product behavior.

The existing Python service already implements a Beta-binomial attendance baseline with tests that enforce point-in-time correctness. This extends that rather than replacing it.

### Why the full distribution matters, not the point estimate

Because the next section consumes it.

---

## 3. Food ordering — newsvendor, and the officers must set the ratio

### The decision

*"I ordered Dos which will be ready for pickup at 6:30"* — ordered by feel, for an event whose attendance nobody had estimated, in a club whose own written proposal identified people taking food and leaving as a core problem.

### The model

This is the classic single-period stochastic inventory problem and it has a closed-form answer. Let demand `D` be the posterior predictive from §2. Let `Cu` be the cost of running short and `Co` the cost of surplus. Order the smallest `q` such that:

```
P(D ≤ q)  ≥  Cu / (Cu + Co)
```

That ratio is the **critical fractile**, and the whole product decision lives in it. If running out is three times as bad as waste, you order at the 75th percentile of predicted demand, not the mean. Ordering at the mean — which is what "I'll order for about 50" does — is correct only when shortage and surplus cost exactly the same, which they never do.

**The officers must state the ratio; the system must not infer it.** This is a real constraint, not a disclaimer. The system cannot know whether a food shortage at a recruitment event is a minor annoyance or a reputational disaster during the one week that determines the incoming class. Ask once per event type, store it, and show it in the explanation.

**The output is a sentence, not a dashboard:**

> "Order for 47. Predicted attendance is 38, but you told us running out is three times worse than waste, so this is the 78th percentile. At 38 you would run short about one time in three."

---

## 4. Reliability — a Rasch model, and shrinkage is the ethics

### The decision

Officers explicitly asked whether ghosting should count against a candidate, and correctly distinguished non-response from no-show: *"if they dont respond to the email its so-so... if they fade the coffee chat then its bad."* There is nowhere to put that judgment, so it lives in one person's memory.

### The model

Treat showing up as an item response. A person has a latent follow-through `θ`, an occasion has a difficulty `δ`, and:

```
P(show | person i, occasion j)  =  logistic(θᵢ − δⱼ)
```

This is the cross-classified structure from `11-cross-club-graph.md`, and it does the one thing that matters: **it separates the person from the situation.** A no-show for a 9am chat during prelim week is weak evidence about a person. A no-show for a slot they picked themselves is stronger. The model knows the difference because it estimates occasion difficulty from everyone else's behavior on that occasion.

### The part that is a safeguard, not a limitation

For a candidate with one or two observations, the posterior for `θ` is **almost entirely the prior.** The estimate shrinks to the population mean and carries a wide interval. That is not a weakness to engineer around. It is the statistically correct answer and it is the ethical one, and they are the same answer.

So the product surface is not a score. It is:

> "Missed one scheduled chat. That is one observation. It is not enough to say anything about reliability."

**The do-not-compute rule applies in full.** No portable reliability score. No export to employers. No number shown to a reviewer next to a candidate's name during a decision. The model exists to stop officers over-reading a single data point, which is the opposite of how a naive version would be used.

---

## 5. Succession risk — the one that is about the actual thesis

### The decision

Nobody made this decision, which is the problem. The domain sits on a graduated president's personal account and surfaced only by accident in September.

### The model

Three computations, all cheap, all graph-shaped.

**Bus factor per responsibility.** For each responsibility — domain, social accounts, the recruitment pipeline, the events tool — count how many current people have both access and demonstrated activity on it. A bus factor of one is the alarm. The domain's bus factor is currently **zero**, because its single owner has already left.

**Asset orphan risk.** For every asset in the register, compute months until its owner's expected graduation. Sort ascending. That list, rendered as a page, is the entire pitch for the transition flow.

**Officer succession hazard.** A discrete-time hazard model over positions: given the current officer's graduation date and whether anyone else has held or shadowed the role, what is the probability this responsibility transfers cleanly? The research already identified the flag: **half or more of officers within one term of graduation and no successor having held any role.**

### The tracking

This needs almost no new instrumentation. It reads the asset register, the position history with dates, and the activity log. It is the cheapest high-value model in the system, and it is the one that sells the product in March.

---

## 6. The shared substrate every one of these sits on

All five models are pure functions of one ordered event log. That is not an architectural preference, it is what makes them trustworthy.

**Two timestamps on every fact.** When it happened, and when we learned it. Drop the second and every backtest becomes fiction, because you are silently using information you did not have at decision time. The existing Python service already has tests enforcing this, including one that verifies a late-arriving label cannot leak backward into an earlier evaluation.

**A signal registry.** Every feature used by any model has a name, an owner, a source, a target it predicts, a measured predictive value, and a decay date. Signals live in a registry, not in a notebook. When one stops working, it gets retired on purpose.

**Every model beats a stated baseline or it does not ship.** The baselines are deliberately embarrassing: attendance is "last three events' average times a day-of-week factor," food is "order for the RSVP count," scheduling is "whatever a human assigned." A model that cannot beat those on a held-out future term is not ready, and saying so out loud is how we avoid shipping a plausible-looking model that is worse than a rule of thumb.

**Replay is the test harness.** Because everything is a function of the ordered log, backtesting is replaying the log with a virtual clock. The same mechanism gives audit, counterfactuals, and bug reproduction.

---

## 7. Instrumentation — what actually gets logged

The models above need roughly twenty event types, and every one of them is a by-product of someone using the product, never a separate reporting chore.

**Recruitment:** chat requested, assigned, scheduled, completed, no-showed, non-responded, note recorded, application submitted, slot offered, slot accepted, slot declined, interview completed, decision made.

**Events:** created, published, location changed, RSVP'd, reminder sent, checked in, no-showed, food ordered with quantity and stated critical fractile, actual consumption recorded.

**Continuity:** position started, position ended, asset registered, asset owner changed, access granted, access revoked, transition opened, transition item resolved.

Each carries the actor, the entity, and both timestamps. **The forecast is only as good as the check-in data**, which is the real reason check-in ranks so high in the build order despite being the least impressive feature on the list.

---

## 8. Build order for the math

| Phase | Ships | Method | Needs |
|---|---|---|---|
| **Now** | Interview feasibility and schedule | Max-flow, then CP-SAT | Availability and caps only |
| **Now** | Funnel counting with correct denominators | Arithmetic, done right | Chat state machine |
| **Semester** | Attendance forecast | Hierarchical Bayes, `brms` or `NumPyro` | 10+ events with real check-in |
| **Semester** | Food order recommendation | Newsvendor on the posterior | Attendance model plus a stated ratio |
| **Semester** | Succession and orphan risk | Graph plus hazard | Asset register, position dates |
| **Next term** | Reliability estimation | Rasch with shrinkage | 2+ terms of attendance |
| **Later** | Matchmaking | Bipartite matching on check-in profiles | Check-in profile capture at volume |

**The first two ship this week and need no historical data at all**, which is the point. Feasibility scheduling works on the constraints you declare today. Everything requiring inference waits for the check-in log to exist, and says so honestly rather than shipping a model trained on twelve events and pretending.

---

## 9. What the user sees

The interface shows one number. The engine computes ten thousand.

A member sees three things this week. An officer sees *"your Thursday event will draw about 22, down from 40, because of the exam block and the home game"* and can click once to see why. A recruitment lead sees *"you can run 31 of 35, here is the one change that fixes it."* A treasurer sees one balance.

**Nobody sees a terminal.** Every forecast sits behind a single control that is off by default, and no student ever sees a model output about themselves that they did not ask for.
