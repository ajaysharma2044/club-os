# Club OS — The two intelligence layers, and why they are one model

*How club-level and person-level intelligence differ, what they share, and the mathematical structure that unifies them. Builds on `11-cross-club-graph.md` (person vs situation), `14-quant-per-feature.md` (decision models) and `15-behavioral-quant-layer.md` (signal discipline).*

---

## 1. The central claim

**These are not two systems. They are the two variance components of one model, and treating them as separate is both more work and less accurate.**

`11-cross-club-graph.md` already established the decomposition. For any observed behaviour:

```
logit(P(behaviour)) = μ + θᵢ + δⱼ + γᵢⱼ + βᵀx
```

- **θᵢ** is the person effect — their general tendency, independent of where they happen to be.
- **δⱼ** is the situation effect — the club's demandingness, independent of who happens to be in it.
- **γᵢⱼ** is the fit between a specific person and a specific club.

So:

| Layer | Is literally | Estimated from |
|---|---|---|
| **Person intelligence** | the θ side | many people observed across several clubs |
| **Club intelligence** | the δ side | many clubs observed across many people |
| **Matching intelligence** | the γ term | both, simultaneously |

**You cannot estimate either side well without the other.** A club's demandingness is only identifiable because the same people appear elsewhere; a person's follow-through is only identifiable because the same clubs contain other people. Building them separately means each silently absorbs the other's variance, which is exactly the confound that makes a naive "involvement score" reward whoever joined the easiest club.

And γ is not a leftover. It is the most commercially interesting term in the model, because matching, recruitment fit, and retention all live there and none of them are computable from either layer alone.

---

## 2. What genuinely differs

Same math, very different properties, and the differences drive real design decisions.

| | Club layer | Person layer |
|---|---|---|
| Units per campus | ~500 orgs | ~15,000 people |
| Observations per unit | many (all member activity) | few (one person's own actions) |
| Dominant statistical problem | few units, rich data → **model selection** | many units, thin data → **shrinkage** |
| Cold start prior | club type, then campus | cohort and club, then campus |
| Time shape | persists across generations, turns over annually | a single 4-year arc with a defined end |
| Failure mode | a dying club looks fine until it is gone | over-reading one no-show |
| Publishable to | officers, advisors, nationals | **only the person it is about** |
| Exportable as a number | yes | **never** |
| Legal exposure | low | high — employment, fairness, privacy |

**The last three rows are the real differentiator, and they are not a matter of degree.**

A club health index can be shown to an officer, sold to a national organisation, and printed in a report. It describes an organisation, and organisations are legitimately measured.

A person-level composite cannot do any of those things. `11-cross-club-graph.md` §7 already forbids a portable reliability score, an export to employers, and a number beside a candidate's name. That prohibition is not a constraint bolted onto the person layer — **it is the main design difference between the two layers**, and the architecture should make it structurally impossible to violate rather than merely discouraged.

**Concretely:** the club layer returns composites. The person layer returns evidence with uncertainty, and the only composite it ever computes stays internal.

---

## 3. What they share

One substrate, and this is where the leverage is.

**One event log.** Both layers are pure functions of the same bitemporal activity stream. Neither has its own pipeline.

**One signal registry.** A club-level signal and a person-level signal are tested identically: declared hypothesis, declared outcome, walk-forward information coefficient, and a verdict that is allowed to be "insufficient data." The registry does not care which layer a signal describes.

**One opportunity ledger.** Take rates need a fair denominator at both levels. A club that was never offered funding did not decline it, exactly as a person who was never offered ownership did not turn it down.

**One shrinkage discipline.** Both layers pull thin estimates toward a peer prior, and the pull falls out of the variance ratio rather than a tuning knob.

**One honesty rule.** Every model beats a deliberately embarrassing baseline out of sample or it does not ship.

---

## 4. The club intelligence layer, specified

The eight components of the Club Health Index in `03-data-architecture.md`, each **z-scored against a peer group** of same campus, same category, same size band — so a 15-person poetry club is never compared against a 300-person business fraternity.

| Component | Weight | What it measures |
|---|---|---|
| Retention | 0.20 | members still active term over term |
| Attendance trend | 0.15 | direction, not level |
| Officer engagement | 0.15 | how much of the work the e-board actually does |
| Bus factor | 0.10 | how many people a responsibility depends on |
| Funding runway | 0.10 | months of committed spend covered |
| Content cadence | 0.10 | rhythm of events and announcements |
| Network centrality | 0.10 | position in the campus co-membership graph |
| Pipeline | 0.10 | incoming members relative to outgoing |

Plus two things that matter more than the index itself:

**Form**, borrowed from Strava's fitness-and-freshness idea: a short-window exponential average minus a long-window one. It is a *leading* indicator, so a club coasting on past momentum shows up before its attendance does.

**Succession risk**, which is the single most predictive warning available: half or more of officers within one term of graduating and no successor having held any role. That is the mechanism by which clubs actually die, and the asset register now makes it computable.

**The honest caveat:** with one club and a partial term, the club index has a sample size of one and every z-score is undefined. The layer must report "no peer group yet" rather than a number. It becomes real at roughly 20 clubs on a campus, and the code should say so rather than rendering a confident gauge.

---

## 5. The person intelligence layer, specified

Already built, in `lib/cec/signals.ts`: 13 signals, each with a stated hypothesis and a declared outcome, Beta posteriors with empirical-Bayes peer priors, and a registry that refuses to speak on thin data.

What the two-layer view adds:

**Club-adjusted signals.** Every person-level rate should be reported net of the club's difficulty. "80% follow-through" means something different in a club where the median is 95% than in one where it is 50%. Once δ is estimated, every θ becomes interpretable, and the most humane output in the whole system becomes sayable: *you are in three unusually demanding organisations and you are doing fine.*

**Opportunity as a person-level context.** The ledger already separates what someone chose from what was chosen for them. That is the person-layer analogue of peer normalisation.

**The internal-only composite.** A person-level latent state may be estimated for internal ranking of *our own* actions — who to nudge, what to recommend — but it is never surfaced, never exported, and never shown beside a name. It exists to decide what the product does, not to describe a person to anyone.

---

## 6. Where the real intelligence is: the interaction

The two layers are each useful. **The γ term is where the differentiated product lives**, and it is only computable because we hold both.

| Question | Term | Why neither layer alone answers it |
|---|---|---|
| Which club will this freshman thrive in? | γ | Needs the person's tendency *and* each club's demands |
| Is this member disengaging, or is this club just hard right now? | θ vs δ | Confounded without both |
| Which five people make a good project team? | γ plus collaboration graph | Individual quality does not predict team output |
| Is this candidate's record impressive? | θ adjusted by δ | A title in an easy club is not a title in a hard one |
| Which club should a sponsor back? | δ plus forecast | Needs measured attendance, not claimed |

The commercially seductive reading of "we see across all their clubs" is a richer file on each student. That reading is wrong, and `11-cross-club-graph.md` explains why it is also **statistically weaker**: a dossier is a pile of confounded observations, while a fully crossed design is a natural experiment in which the situation varies while the person is held fixed.

---

## 7. Build order

| Phase | What | Gate |
|---|---|---|
| Now | Club health with peer normalisation, reporting "no peer group yet" honestly | Works at 1 club by refusing to score |
| Now | Succession risk from the asset register and position dates | Already computable |
| Next | Club-adjusted person signals (report θ net of δ) | Needs ~10 clubs for δ to be identified |
| Next | Form and momentum on both layers | Needs 2+ terms |
| Later | Fit (γ) for club recommendation and team formation | Needs both layers estimated |
| Later | Cross-campus priors: campus two launches with campus one's posteriors | **The statistical moat** |

**The thing that makes this compound:** a hierarchical model pooling across person, club, club type and campus means every new campus starts with a real prior over what a consulting club looks like. That is why the moat is statistical rather than a network effect, and it is why both layers have to be one model — a separate club system and a separate person system would each have to solve cold start alone, and neither could.

---

## 8. What does not change

The do-not-compute list from `11-cross-club-graph.md` applies in full to the person layer and is unaffected by any of this. No portable reliability score. No export to employers. No number beside a name. Proxies for protected characteristics blocked at the feature store, not the display layer.

The mirror test still governs: **if a signal cannot be shown to the person it is about, in plain language, with a working off switch, it does not get computed.**

The club layer has no equivalent restriction, because it describes an organisation rather than a person. **That asymmetry is the architecture**, and it should be enforced by where code lives and what each layer is allowed to return, not by a policy document.
