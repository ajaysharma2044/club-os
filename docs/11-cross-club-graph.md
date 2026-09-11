# Club OS — The Cross-Club Graph

*Draft v0.1. Full research in `/research/24-cross-club-graph.md`. This document supersedes the loose "network" feature group in `03-data-architecture.md` §4 with a rigorous model.*

---

## 1. The position, stated precisely

A student belongs to three to six clubs. No individual club knows what its member does elsewhere. The university does not know. LinkedIn does not know. **We are the only system that observes the same person across every organization they belong to, and every organization across every person in it, at the same time.**

That is not just more data. It is a specific statistical structure, and the structure is the asset.

---

## 2. The single highest-value thing this position makes possible

**Separating the person from the situation.**

Every other party on campus observes a student in exactly one context and cannot tell whether what they see is a property of the student or a property of the setting. A club president looking at 40% attendance cannot distinguish "our members are flaky" from "we meet at 9pm on a Thursday" from "we simply ask more of people than most clubs do." That confound is the source of nearly every bad decision a student organization makes: the officer who concludes their members don't care, the student who concludes they are bad at commitment, the advisor who concludes a club is failing.

**We can decompose it, because we observe the same person in multiple clubs and multiple people in the same club simultaneously.** That is a fully crossed design, handed to us for free by the nature of how students join organizations.

The model that exploits this is a cross-classified multilevel model, mathematically identical to a Rasch model from psychometrics. It separates three things:

$$
\text{logit}(\pi_{ijt}) = \mu + \theta_i + \delta_j + \gamma_{ij} + \beta^\top x_{ijt}
$$

- **θᵢ**, a person's general follow-through, independent of which clubs they happen to be in
- **δⱼ**, a club's demandingness, independent of who happens to be in it
- **γᵢⱼ**, the fit between a specific person and a specific club, which is often the real story

**Everything valuable in this document is a corollary of that decomposition.** Fair benchmarking between clubs is δⱼ. Honest feedback to an officer that their attendance is fine and their time slot is the problem is δⱼ combined with revealed-preference modeling. Matching a student to a club where they will actually thrive is γᵢⱼ. Any legitimate reliability claim is θᵢ, properly shrunk. And the most humane product on this whole list, telling a student who feels like they are failing that they are actually in three unusually demanding organizations and doing fine, is only sayable if δⱼ can be measured at all.

**The commercially seductive reading of "we see across all their clubs" is a richer dossier on each student. That reading is wrong, legally exposed, ethically indefensible, and statistically weaker**, because a dossier is a pile of confounded observations. The correct reading is a natural experiment in which the situation varies while the person is held fixed.

---

## 3. Shrinkage is the ethical mechanism, not just the statistical one

For a person with few observations, their estimated follow-through score shrinks almost entirely to the population average. For a person with many, it barely shrinks at all.

**The model refuses to make confident claims about people we barely know.** That is the correct default behavior for a system that could harm someone if it is wrong, and it is the direct answer to the question a university will eventually ask: does this flag freshmen? No, structurally, because a freshman has almost no observation history and the model knows it.

---

## 4. Ranked signals

Ranked by uniqueness to our position, predictive value, and product leverage, divided by ethical risk.

| Signal | What it predicts | Powers | Risk |
|---|---|---|---|
| Club difficulty | Fair attendance expectations | Officer benchmarking, all fair comparisons | Low |
| Revealed preference from schedule conflicts | True club ranking, better than any survey | Scheduling advisor | Low |
| Structural diversity of a student's network | Recruitment yield, information spread | Seed selection for growth | Low |
| Portfolio concentration | Which membership a student is about to drop | Student-facing overcommitment warning only | Medium |
| Person-level follow-through | Task completion, officer success | Internal only, never exported | **High if exported** |
| Person-club fit | Where a specific person would thrive | Club recommendations | Low |
| Role trajectory | Next position, one to two terms out | Succession planning | Medium |
| Community brokerage | Information flow, idea quality | Growth loops, campus pulse | Low |
| Club-to-club member flow | Which clubs are rising or declining | Officer competitive intelligence | Medium |
| Multi-club engagement and retention | Persistence, correlational only | Aggregate reporting only | **High** |
| Isolation | Disengagement | Student-facing only, never to an administrator | **Highest** |

**Note the shape of this table.** The highest-value signals are the lowest-risk ones, because they are properties of organizations and situations rather than verdicts on people. That is a fortunate alignment, and the model should be built to lean into it deliberately rather than by accident.

---

## 5. The cautionary record, which is not analogy, it is the same product category

**SpotterEDU**, deployed at institutions including Syracuse, used Bluetooth beacons to take attendance from students' phones and assigned some students risk scores flagged to advisors. The reaction became the reference point for campus-surveillance backlash.

**Degree Analytics** did the same thing through campus WiFi association logs, inferring engagement and risk from data students never affirmatively provided for that purpose.

**Mount St. Mary's University**, 2016. The president promoted a freshman survey and reportedly sought to dismiss at-risk students early to protect the institution's retention statistics. **This is the single most important case here, because the failure was not technical.** The model may have worked fine. The institution's incentive was to remove the students it flagged, because retention rate is a numerator-and-denominator game. **Any risk score we hand an institution enters an incentive structure we do not control.**

**EAB Navigate**, reported by The Markup in 2021, used race as a predictor variable in student-success risk models at several major universities, in at least one case as a high-impact predictor, with critics warning it steered minority students away from demanding majors. The mechanism generalizes and would apply to us even without ever using race directly: **any feature correlated with race, class, or first-generation status becomes a proxy, and cross-club features are loaded with class.** Greek life, club sports with equipment costs, unpaid case-competition teams, clubs charging dues. A campus-involvement score is substantially a wealth-and-free-time score, and that has to be written into the model documentation, not discovered later.

---

## 6. What students actually say, from the literature

Consent and control are the dominant concern, not collection itself. Students are willing to share data for their own benefit but expect to see and manage what is held. Students are often unaware they are being tracked at all, and react badly on learning it after the fact rather than before.

**The rule this produces, testable in about thirty seconds against any proposed feature:** a student should never learn something about our model of them from someone else. If a signal cannot be shown to the student first, in plain language, with a working off switch, we do not compute it.

This is a stronger rule than notice-and-consent, and it should be the standing test in the engineering handbook rather than a paragraph in a privacy policy.

---

## 7. The do-not-compute list

Standing engineering rule, not a suggestion:

- No romantic or sexual inference, ever
- No mental-health or crisis scores
- No inferred religion, sexual orientation, immigration status, disability, or political affiliation, and **proxy clubs are blocked from the feature store, not just from display**
- No race as a feature, and an active audit process for proxies
- No individual risk scores exported to any administrator
- No portable reliability or leadership-potential score sold to employers
- No friendship-strength numbers shown to anyone
- No passive location or WiFi-derived attendance, ever
- No "who is avoiding whom"
- No cross-campus person linking without affirmative opt-in

Two meta-rules generate this list and should replace it in practice:

1. **The mirror test.** If a signal cannot be shown to the student it is about, in plain language, with a working off switch, it does not get computed.
2. **The incentive test.** Before exporting any person-level signal, ask what the recipient's incentives do to a student when the signal is wrong. Mount St. Mary's is the worked example of what happens when this question gets skipped.

---

## 8. Model roadmap

**v1, six months. No machine learning worth the name.** A bitemporal event store where every fact carries both when it happened and when we learned it. Backbone extraction on the co-attendance graph rather than a raw projection, which produces spurious density if done naively. Community detection on the resulting club-club graph. Descriptive portfolio math: concentration, effective number of clubs, turnover. The cross-classified model for club difficulty and person follow-through, fit with a standard mixed-model library. **Ship club difficulty to officers. Keep person follow-through internal.** Every model must beat a naive baseline, "attended 2 of the last 3," on a held-out future term, or it does not ship.

**v2, twelve to eighteen months.** The full Bayesian version with proper uncertainty intervals gating the interface. Revealed-preference modeling on the corpus of schedule conflicts. Role-trajectory modeling for succession. Randomized-encouragement experiments for the first genuinely causal result.

**v3, two years and beyond, only if v2 has validated.** A university-partnered study using selective-club admission cutoffs as a natural experiment, which is a real research opportunity sitting inside our data for free. And critically: **a multi-campus hierarchical model where the prior is over club types rather than over individual people.** That is the real cross-campus moat. Not a dossier that follows a person from campus to campus, but a prior over what a consulting club looks like statistically, which makes a brand-new campus useful on day one.

---

## 9. What this resolves in the rest of the spec

`03-data-architecture.md` specified a "network" feature group loosely, as centrality and community membership. This document replaces that with the actual model: **the cross-classified structure is the mathematical core, not one feature group among several.** The Club Health Index's officer-engagement and centrality components should be computed as outputs of this model, not as separate ad hoc calculations.

And it resolves a tension worth naming directly. Earlier documents said the record should "learn everything about" a person. This research is the correction: **the highest-value thing to learn is not about the person at all. It is about the fit between the person and the situation.** That reframing is what keeps the ambition and the ethics compatible.
