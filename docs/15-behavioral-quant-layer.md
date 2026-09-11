# Club OS — The behavioral quant layer

*Synthesis of the "AI Student Training Model" conversation, checked against what is already in the codebase. Extends `14-quant-per-feature.md` (decision-level models) with the layer that turns operational activity into tested predictive signal.*

---

## 1. The thesis, in one line

**Stop treating behavioral data as descriptive metrics. Treat it as a quant research pipeline where every signal must prove predictive validity or get thrown away.**

The analogy that drives everything:

```
market data → signals → factors → models → positions → P&L

becomes

behavior → signals → behavioral factors → models → interventions → outcomes
```

And the division that keeps it honest:

> **Externally: evidence. Internally: full quant engine.**

An employer never sees "Ajay 93.7." They see verified facts with provenance. The sophistication is entirely internal, which is the same rule `06-design-system.md` applies to the interface and `04-employers.md` applies to the employer product, now extended to the behavioral model itself.

---

## 2. More of this is already built than you might expect

The CEC pilot already implements the bottom three layers properly. This is worth stating precisely, because it changes what to build next.

| Layer | Status | Where |
|---|---|---|
| **Canonical operational events** | **Built.** 15 action families: JOIN, INITIATE, COMMIT, EXECUTE, HANDOFF, COORDINATE, HELP, REQUEST_HELP, DECIDE, COMMUNICATE, REVIEW, REVISE, ESCALATE, COMPLETE, OUTCOME | `lib/cec/evidence.ts` |
| **Bitemporal stamping** | **Built.** Every event carries `occurred_at` and `observed_at` | `activity_events` |
| **Evidence quality** | **Built.** Every event carries `evidence_level`, `source`, `source_ref`, `visibility`, `policy` | `activity_events` |
| **Episodes** | **Built.** Goal, owner, status, linked objects, versioned | `episodes`, `episode_objects` |
| **Blockers and resolution** | **Built.** Reporter, category, resolver, resolution latency available | `work_blockers` |
| **Point-in-time snapshots** | **Built.** `as_of`, `computed_at`, `policy`, `evidence_hash`, frozen feature blob | `evidence_snapshots` |
| **Primitive signals** | **Barely started.** Exactly one: completion fraction | `personalFeatures()` |

And the existing code is admirably disciplined about its own limits. The current feature blob ships with this interpretation string attached:

> "Approved / accepted non-cancelled tasks. Open work remains unresolved; **this is not a reliability estimate.**"

That is the right instinct and it should survive everything below.

**So the gap is not the event model. The event model is good. The gap is that nothing yet turns those events into tested signal.**

---

## 3. The genuinely new idea: opportunity adjustment

Everything else in the conversation refines something already specified somewhere in this repo. This one does not, and it is the most important thing in it.

**You cannot conclude someone does not lead if they were never given a chance to lead.**

Today the system records what people *accepted* and *completed*. It has no record of what they were *offered*. That means every rate we could compute has the wrong denominator:

```
wrong:   OwnedEpisodes
right:   OwnershipAccepted / OwnershipOpportunitiesOffered
```

The failure mode is specific and severe. Without offer records, a model trained on this data concludes **presidents are excellent**, because presidents were handed every opportunity. It would rediscover the org chart and call it insight.

The decomposition to hold onto:

```
ObservedBehavior = Ability + Opportunity + MotivationState + Context + Noise
```

This is the same person-versus-situation separation `11-cross-club-graph.md` already argues for, extended one step: the situation includes **what you were asked to do.**

**Implementation consequence.** A new `opportunities` table is the highest-priority schema change in the whole plan. Every time work is offered — a task, an owner role, a panel seat, a speaker slot, a committee — record the offer, to whom, and the response: accepted, declined, ignored, or expired. Take rates become computable and fair. Without it, none of the behavioral signals below are trustworthy.

---

## 4. What to add, in order

### 4.1 Now: the infrastructure that makes signals testable

**Opportunity ledger.** As above. Offers, responses, timestamps.

**Outcome labels.** There is currently nothing recording what we are trying to predict. A signal without an outcome is just a number. Start with outcomes we can actually observe inside one club: episode completed on time, member still active next term, event hit its attendance forecast, officer transition completed, candidate reached interview.

**Signal registry.** Each signal gets a fact sheet: definition, hypothesis, owner, horizon, outcome tested, and — once there is data — information coefficient, decay, coverage, stability across contexts, and fairness checks. Signals live in a registry with a decay date, not in a notebook.

### 4.2 Next: primitive signals with honest denominators

Roughly a dozen, each derived from episodes and each opportunity-adjusted where an offer exists:

```
CommitmentFollowThrough = completed accepted / accepted
OwnershipTakeRate       = ownership accepted / ownership offered
InitiationRate          = self-initiated / episodes with initiation opportunity
BlockerResolution       = resolved owned blockers / owned blockers
EarlyBlockerRate        = blockers raised before deadline / blockers
ResolutionLatency       = median(resolved − reported)
FeedbackResponse        = P(revision | feedback received)
RepeatCollaboration     = repeat collaborators / distinct collaborators
HandoffCompletion       = accepted handoffs / handoffs created
ExternalConversion      = successful external contacts / qualified attempts
```

### 4.3 Then: the statistical treatment

**Peer normalization.** Raw rates are meaningless across contexts. A 90% completion rate means nothing without knowing the peer group's mean. Normalize against club type, role type, episode type, and experience level.

**Uncertainty on everything.** A Beta posterior, not a point estimate. Nine of ten and ninety of a hundred are the same rate and wildly different confidence, and the product must never display them identically.

**Hierarchical shrinkage.** Person ⊂ Club ⊂ Archetype ⊂ Campus. A freshman with three events borrows strength from peers and shows a wide interval. This is the same partial-pooling argument as `14-quant-per-feature.md`, and it solves cold start structurally rather than with a hack.

**Signal neutralization.** Residualize out seniority, role, club size, and opportunity exposure, so "leadership behavior" does not simply rediscover "seniors get asked more."

**Recency decay with different half-lives.** Interest decays in weeks. Execution evidence in months. A verified outcome barely decays at all. Learn the rates from predictive performance rather than asserting them.

### 4.4 Later, and only with enough data

Trajectory features (momentum as short-minus-long exponential averages, volatility, drawdown and recovery). Regime tagging, because a 50% activity drop during finals means something completely different from the same drop during recruitment week. Graph factors on weighted collaboration edges. Sequence mining. Causal testing through randomized onboarding. Contextual bandits for interventions.

---

## 5. The risk in this plan, stated plainly

**The factor zoo is the wrong thing to build next, and it is the most seductive part of the conversation.**

Automatically discovering and testing thousands of candidate signals requires data we do not remotely have. CEC has one club, a partial semester, and on the order of tens of episodes. Testing two hundred signals against that will produce beautiful, confident, completely false results — which is exactly what `04-quant-engine.md` warned about when it concluded we are in AQR's world, not WorldQuant's, and that automated signal search before a trial counter exists is Quantopian at a thousandth the scale.

**The discipline that resolves this:** the infrastructure for signal testing gets built now, and it gets built to be honest about having almost no data. The registry should be perfectly happy to report *"this signal has 14 observations and an information coefficient indistinguishable from zero"*, because that is the true answer for most of year one, and a system that can say so is worth far more than one that always finds something.

Two rules to hold:

1. **Every signal must beat a deliberately embarrassing baseline out of sample**, on a future time window, or it does not ship.
2. **Leave-one-club-out from the moment there are two clubs.** A signal that works only because CEC happens to operate a certain way is an artifact, not an insight, and there is no way to know which until a second club exists.

---

## 6. Why this is the commercial argument, not just an engineering one

The conversation's strongest point is that this changes what is being sold.

**Without a behavioral layer:** "here are Cornell students." That is a database, and it competes with LinkedIn on LinkedIn's terms. It is worth a small pilot.

**With verified work and outcomes:** "here are opt-in candidates with repeated evidence of the specific behaviors associated with success in this role, with artifacts and provenance." That is not substitutable.

**The asymmetry that matters most is false positives.** A résumé says *President, Entrepreneurship Club*. The record might show two projects started and zero completed, with three accepted commitments missed. Meanwhile a member with no title owned four projects, shipped three, worked with the same team for two years, and produced artifacts with external users. **A résumé-ranked system puts the first person on top. Ours surfaces the second.** That directly attacks the title-inflation problem `04-employers.md` identified as the thing recruiters describe back to you unprompted.

**Supporting evidence worth keeping.** Published validity figures put biodata around .35, structured interviews around .51, and work samples around .54. That does not mean this system inherits .54, but it is why observed job-relevant behavior can carry materially more signal than self-report. And the employer demand is aimed squarely at things this layer can evidence: teamwork, problem solving, communication, work ethic, initiative, and leadership potential all sit near the top of what employers say they screen for.

**The metric to sell on, eventually.** Not model accuracy, which no employer buys. Qualified outcome rate at K:

```
QOR@20 = candidates reaching a qualified employer outcome / 20 candidates shown
Lift    = QOR(Club OS) / QOR(baseline) − 1
```

The sentence that justifies a five-figure contract is *"candidates sourced through this pipeline reached interview 43% more often than your normal campus sourcing, controlling for school, major, year and role."* Everything in this document exists to eventually be able to say that honestly, or to discover that we cannot.

**A realistic first target:** 20 to 30 percent relative lift in qualified-candidate precision over résumé-only matching, on Cornell data. That is a credible bar. Anything above 50 percent, out of sample and across multiple clubs, would be genuinely valuable.

---

## 7. What does not change

Everything in the do-not-compute list from `11-cross-club-graph.md` survives this document intact.

No portable reliability score. No number exported to an employer. No score shown to a reviewer beside a candidate's name during a decision. No inference about protected characteristics, and proxies blocked at the feature store rather than the display layer.

The mirror test still governs every signal: **if it cannot be shown to the student it is about, in plain language, with a working off switch, it does not get computed.**

And the reason that rule survives is not only ethical. An opportunity-adjusted, peer-normalized, uncertainty-carrying estimate is simply a better estimate than a raw score, and the same discipline that makes it defensible makes it accurate.

---

## 8. Implementation order

| # | What | Why now |
|---|---|---|
| 1 | **Opportunity ledger** | Every rate has the wrong denominator without it, and the model will otherwise conclude presidents are excellent |
| 2 | **Outcome labels** | A signal with nothing to predict is decoration |
| 3 | **Signal registry** with honest empty results | Build the thing that can say "no signal here" before building signals |
| 4 | ~12 primitive signals, opportunity-adjusted | The actual library |
| 5 | Peer normalization + Beta uncertainty | Makes cross-context comparison and cold start honest |
| 6 | Hierarchical shrinkage | Solves freshman cold start structurally |
| 7 | Neutralization | Stops the model rediscovering the org chart |
| 8 | Trajectory and regime | Needs multiple terms |
| 9 | Causal tests | Needs enough members to randomize |
| 10 | Factor discovery | **Needs many clubs. Not before.** |

Items 1 through 3 are infrastructure and can be built immediately against the existing episode model. Items 4 through 7 are the behavioral layer proper. Items 8 through 10 wait for data that does not exist yet, and saying so is the difference between a quant engine and a dashboard that flatters us.
