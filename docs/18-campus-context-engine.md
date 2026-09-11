# Club OS — The Campus Context Engine

*The fourth intelligence layer. Builds on `17-two-layer-intelligence.md` (person and club as one model) and `14-quant-per-feature.md` (decision models). Partly built: `lib/cec/campus.ts` and `lib/cec/context.ts`.*

---

## 1. Why this is not optional

Every layer so far models the world from inside the club:

```
Outcome = f(Person, Team, Club)
```

But clubs respond to an environment they do not control, and leaving it out is not a missing nicety. **It is omitted-variable bias**, and it has a specific, damaging consequence: the model attributes an environmental effect to a person's execution.

```
Outcome = f(Person, Team, Club, CampusContext)
```

The true causal chain runs through the environment twice:

```
CampusEnvironment → Opportunity → Behaviour → Outcome
CampusEnvironment ──────────────────────────→ Outcome
```

Drop the environment and both paths collapse into the behaviour term. That is how a system ends up concluding that officers executed poorly when what actually changed was the campus.

---

## 2. The payoff, stated as one equation

```
BehaviouralAlpha = Actual − Expected(given context)
```

**The worked case.** An event draws 40 against a baseline expectation of 100.

Context-blind, that is a catastrophic failure. But that evening had 50 competing events. The context-conditional expectation was **47**, so 40 is roughly par and the officers did nothing wrong.

**The inverse matters just as much, and is easier to miss.** 200 people at an event during finals, when comparable events draw 80, is a genuinely remarkable result. A context-blind model scores it as merely good. Context makes it legible as exceptional.

This is implemented and tested: `behaviouralAlpha()` in `lib/cec/context.ts`, with both directions asserted in `tests/context.mjs`.

**Why this matters beyond accuracy.** The person layer is the one with real ethical exposure (`11-cross-club-graph.md`). Context-adjustment is the single most effective fairness mechanism available, because most apparent differences between people are differences in the situations they were in. Adjusting for context is the same move as the person-versus-situation separation, extended to the world outside the club.

---

## 3. Regimes: the cheapest large win

A campus has states, and a signal means different things in each:

```
R(t) ∈ {move_in, recruiting, normal_term, prelims, finals, break, graduation}
```

Every model becomes conditional:

```
P(Y | X, R(t))     rather than     P(Y | X)
```

**A 45% activity drop during finals does not mean what the same drop means in September.** Without regimes, a churn model reliably flags half the club as disengaging every December.

Regimes need nothing but a curated academic calendar — a few dated boundaries per campus per year. That is the highest ratio of accuracy gained to effort spent anywhere in the stack.

`detectRegime()` is built and tested against a realistic Cornell term, including the ordering subtleties: a break inside a prelim stretch reads as a break, and after term end reads as a break rather than as normal term.

**Turnout priors per regime are stated in one place and deliberately coarse**, because seven regime effects cannot be estimated from one partial term. They are priors to be replaced by estimates, and the code says so.

---

## 4. Everything becomes one canonical event

Do not store articles as blobs and hand them to a model. **Convert the outside world into the same event shape the product already uses**, so every source speaks one language.

```
CampusEvent { source, externalId, title, startsAt, endsAt, locationName, url, tags, cancelled }
```

Two decisions that already earned their place in the implementation:

**One row per instance, not per event.** A recurring seminar is one event with many instances. Collapsing them would undercount competing programming, which is the entire point of the feed.

**Overlap, not start time.** A talk running 6–9pm competes with a 7pm meeting even though it started first. Counting only starts inside a window misses exactly the events most likely to take your audience.

---

## 5. Sources, in order of preference

Ranked by durability, not by what is easiest to grab today.

| Priority | Kind | Notes |
|---|---|---|
| 1 | Official APIs, ICS, RSS | Cornell publishes its whole calendar through Localist with **no API key** — verified live |
| 2 | Public university pages | Stable, but parse defensively |
| 3 | Public organisation pages | Brittle; expect churn |
| 4 | Licensed sources | Only where the lift justifies the cost |
| 5 | Scraping | Only where permitted and stable |

**Every source carries provenance**: id, institution, type, URL, permission basis, crawl frequency, last success, reliability, parser version, terms status. Every extracted fact keeps a pointer back to it.

**The operational legal rule**, from `research/20`: *hiQ v. LinkedIn* won on the computer-fraud statute and **lost** on breach of contract. Terms of service bind us where the criminal statute does not. So: prefer published feeds, identify the client honestly, rate-limit conservatively, and never route around an access control.

The fetcher already enforces this posture — short timeout, page cap, identifying user agent, and a hard ceiling so a loop bug cannot hammer a university's calendar.

---

## 6. Deduplication is required, not a refinement

Cornell publishes the same event through its calendar, its engagement platform, and its news channel. Treated naively that is three competing events where there is one, which inflates every density measure and corrupts the attribution fix that justifies the whole layer.

Resolution is by `(normalised title, start time, venue)` with source precedence, and the merged record keeps all source pointers rather than discarding the losers.

---

## 7. The campus state vector

```
C(t) = [ regime, termProgress, daysToFinals, eventDensity, relativeDensity, … ]
```

extending later to recruiting intensity, topic momentum, funding availability and employer activity.

Every model then takes:

```
X = [PersonState, ClubState, TeamState, CampusState]
```

**`relativeDensity` matters more than raw density.** Twelve events on a Tuesday means nothing until you know this campus typically runs six. Absolute counts are not comparable across campuses; ratios are.

And when no typical density is known, the field is **null rather than an assumed 1.0** — the same discipline as the club index refusing to score without a peer group.

---

## 8. Opportunity discovery, and where to be careful

Continuously scanning announcements, grants, competitions, speakers and deadlines, then matching them to clubs, is plausibly the largest single product gain here. *"Five things happening at Cornell this month that matter to your club"* is immediately useful in a way no dashboard is.

**Topic matching is deliberately keyword-based and reports its matched terms.** An opaque relevance score is impossible for an officer to argue with, and topic models on small corpora fail by producing confident nonsense. `topicIntensity()` returns the matches and examples alongside the number, so a wrong match is visible and correctable rather than mysterious.

**Recency-weighted, so a stale summit counts for less than tomorrow's workshop.** Tested.

---

## 9. What this does commercially

**Sponsor timing.** `SponsorRecommendation = f(Club, Audience, CampusContext, Timing)` beats `f(Club)`. "Best activation window is the week of the 14th, because engineering clubs are active and the STEAM career fair is on the 17th" is a concrete, checkable claim.

**Demand prediction.** Fifteen clubs planning conferences and homecoming approaching predicts demand for catering, buses, printing and AV before any purchase happens.

**Expansion.** Each new campus gets a contextual model from public sources alone, before a single user signs up. Combined with the cross-campus priors in `17-two-layer-intelligence.md`, campus two starts genuinely informed rather than cold.

---

## 10. Honest limits

**The regime multipliers and the competition decay are stated priors, not fitted parameters.** The decay default is calibrated so the documented worked case comes out at 47; an earlier guess of double that scored a genuinely poor night as a triumph, which is precisely the failure mode of tuning a constant by feel. They get replaced by estimates once several terms exist, and not before.

**Topic intensity is a keyword count with a decay.** Calling it a trend detector would be overselling it.

**Everything here describes a campus, not a person.** The layer is publishable for the same reason the club layer is: it measures an environment. It must never become a channel for inferring things about individuals that `11-cross-club-graph.md` forbids inferring directly.

---

## 11. Status

| Piece | State |
|---|---|
| Localist and LiveWhale ingestion | **Built**, tested against a live Cornell payload |
| Competing events by overlap | **Built and tested** |
| Quietest-slot ranking | **Built and tested** |
| Regime detection | **Built and tested** |
| Campus state vector | **Built and tested** |
| Behavioural alpha | **Built and tested**, both directions |
| Topic intensity | **Built and tested** |
| Cross-source deduplication | Specified, not built |
| Source registry with provenance | Specified, not built |
| News and grant ingestion | Specified, not built |
| Campus knowledge graph | Specified, not built |

65 assertions across `tests/campus.mjs` and `tests/context.mjs`.
