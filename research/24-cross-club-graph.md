# 24 — The Cross-Club Graph
## What becomes possible only when you see a person across all their clubs, and the mathematics to exploit it

*Research date: 2026-09-10. Primary sources fetched directly during this session via OpenAlex, Semantic Scholar, arXiv, PNAS, journal pages, and news archives. Citation counts are OpenAlex figures as of the fetch date and undercount relative to Google Scholar.*

**Verification key:** **[V]** = I fetched a primary source this session and confirmed the claim. **[C]** = well-established, cited from a confirmed record but the specific number was not re-derived. **[U]** = unverified; treat as a hypothesis to check before building on it.

---

## 0. The structural claim, stated precisely

Every other actor in the campus data ecosystem sees a **projection** of the student. A club sees the student inside itself. The registrar sees the student inside coursework. LinkedIn sees a self-reported, retrospective, socially-performed summary. Instagram sees a public-facing persona.

We would see the student as a **vector of behaviors measured in several independent contexts at the same time**, with the contexts themselves being social organizations with their own norms, demands, and populations.

This is not a quantitative improvement. It is a change in the *identification strategy*, and that is what makes it defensible. Three specific things become possible that are structurally impossible from inside one club:

1. **Within-person, between-context comparison.** If a student attends 92% of Debate and 41% of Consulting Club, the difference is a *within-person* contrast that holds the person fixed. Every person-level confounder — conscientiousness, course load, commute, mental health, family obligation — differences out. This is the single most valuable statistical property we own, and Part B §5 develops it as a cross-classified multilevel model.
2. **Revealed preference under scarcity.** A student with a Tuesday 7pm conflict between two clubs makes a *choice*. Choice under a binding constraint is the canonical strong preference signal in economics. One club only ever sees an absence.
3. **Structural position in the club-affiliation graph.** Bridging, brokerage, and diffusion are properties of the *whole* graph. A single club cannot compute them even in principle — it does not have the other nodes.

Everything else in this document is downstream of those three.

A necessary caution before any of it. Almost every signal below is at risk of being an artifact of *selection* rather than a property of the person or the causal effect of the club. Shalizi & Thomas showed formally that homophily, social contagion, and covariate effects on behavior are **generically confounded** in observational network data, and that "asymmetries in regression coefficients cannot identify causal effects" — you need strong parametric assumptions *and* adequate covariates, and usually both ([arXiv:1004.4704](https://arxiv.org/abs/1004.4704), *Sociological Methods & Research* 2011) **[V]**. Aral, Muchnik & Sundararajan quantified the damage: standard observational methods **overestimate peer influence by 300–700%**, and homophily explains **more than 50%** of what looks like behavioral contagion ([PNAS 2009, doi:10.1073/pnas.0908800106](https://doi.org/10.1073/pnas.0908800106), 1,242 cites) **[V]**.

Read that as the governing constraint on this entire document: **descriptive cross-club signals are cheap and real; causal cross-club claims are expensive and mostly unavailable without a design.** Part B §7 is about buying a few of them.

---

# PART A — The signals that exist only cross-club

## A1. Portfolio behavior: the club portfolio as an allocation problem

**What it is.** A student's set of memberships, weighted by realized time, is a portfolio. The interesting object is not the membership list (which any club roster or campus directory has) but the **allocation vector** — where the hours actually went — which only we observe.

**How to compute it.** For student $i$ in term $t$, let $h_{ijt}$ be realized engaged-minutes in club $j$ (check-ins, task completions, messages weighted by a per-action cost estimate). Normalize to shares:

$$w_{ijt} = \frac{h_{ijt}}{\sum_{k} h_{ikt}}, \qquad \sum_j w_{ijt} = 1$$

Three derived quantities:

- **Concentration (Herfindahl–Hirschman):** $\mathrm{HHI}_{it} = \sum_j w_{ijt}^2 \in [1/n_{it}, 1]$. HHI = 1 is a monomaniac; HHI $\approx 1/n$ is a perfectly balanced dabbler. Report the **effective number of clubs** $N^{\text{eff}}_{it} = 1/\mathrm{HHI}_{it}$, which is far more interpretable and is the inverse-Simpson / Hill number of order 2.
- **Shannon breadth:** $H_{it} = -\sum_j w_{ijt}\log w_{ijt}$; $\exp(H_{it})$ is the Hill number of order 1, less dominated by the largest holding. Report both — the gap between $\exp(H)$ and $1/\mathrm{HHI}$ tells you whether breadth comes from many tiny holdings or a few medium ones.
- **Rebalancing / turnover:** the $L^1$ portfolio turnover between terms, $\tau_{it} = \tfrac{1}{2}\sum_j |w_{ijt} - w_{ij,t-1}|$, bounded in $[0,1]$. $\tau = 1$ means a complete reallocation.

**The over-commitment detector.** The right framing is a **budget constraint that binds**. Define a student's realized weekly capacity $C_i$ (median engaged hours over the prior 4 weeks) and *demanded* capacity $D_{it} = \sum_j d_{jt}$, the sum of the demands each club places on its members that week (club-level, estimated from the roster's average, not from this student). When $D_{it}/C_i$ crosses ~1.2–1.5, something has to give. The prediction that matters is not *that* a drop is coming but *which club*:

$$\Pr(\text{drop } j \mid \text{drop something}) \propto \exp\big(\alpha \cdot \underbrace{(w_{ij,t} - w_{ij,t-1})}_{\text{recent momentum}} + \beta \cdot \underbrace{\text{tenure}_{ij}}_{\text{sunk investment}} + \gamma \cdot \underbrace{\text{role}_{ij}}_{\text{status}} + \delta \cdot \underbrace{\text{friends}_{ij}}_{\text{social anchor}}\big)$$

which is exactly a conditional logit over the student's own clubs — see A2.

**What it predicts.** Which membership terminates, and roughly when. **Empirically we should expect** the marginal, low-tenure, low-role, low-friend-count club to go first; this is a hypothesis, not an established finding **[U]**, and is the first thing to validate in our own data.

**What it powers.** "This club is about to lose you" for the officer, and "you're overcommitted this month — here's the one thing to drop" for the student. Note the asymmetry of interest: the student wants permission to quit; the officer wants a save. Do not sell both sides the same score (Part D).

**Literature anchor.** The portfolio framing is borrowed, not established, for extracurriculars. The closest empirical tradition is student time-use and involvement research (Part A10). Amati, Lomi, Mascia & Pallotti model organizational affiliation portfolios and network ties as *co-evolving* using stochastic actor-oriented models ([*Organizational Research Methods* 2019, doi:10.1177/1094428119857469](https://doi.org/10.1177/1094428119857469)) **[V]** — the right formal tool if we ever want to model joining and befriending as one process rather than two.

## A2. Revealed preference from schedule conflicts

**What it is.** When two clubs meet at the same hour and a student attends one, we observe a **choice from a constrained menu**. This is a fundamentally stronger signal than any onboarding interest survey, because it is costly, it is repeated, and it is not performed for an audience.

**How to compute it.** This is a textbook discrete choice problem. Build the **conflict corpus**: every (student, timeslot) where ≥2 of that student's clubs had a mandatory-ish event. For choice occasion $n$ faced by student $i$ over alternatives $j$ in choice set $C_n$, McFadden's conditional logit gives

$$P_{nj} = \frac{\exp(V_{nj})}{\sum_{k \in C_n} \exp(V_{nk})}, \qquad V_{nj} = \beta' x_{nj}$$

where $x_{nj}$ are *alternative-varying* attributes: distance to venue, event type (social vs. work), whether the student has a role, number of the student's friends attending, days since last attendance, whether food is served, whether it's graded/required.

Conditional logit imposes IIA, which is wrong here — two similar academic clubs are closer substitutes than an academic club and an a cappella group. The fix is **mixed logit** (random-parameters logit), where $\beta_i \sim f(\beta \mid \theta)$ varies over students:

$$P_{nj} = \int \frac{\exp(\beta_i' x_{nj})}{\sum_k \exp(\beta_i' x_{nk})} f(\beta_i \mid \theta)\, d\beta_i$$

estimated by maximum simulated likelihood. McFadden & Train proved that mixed MNL can approximate **any** discrete choice model derived from random utility maximization to arbitrary accuracy ([*Journal of Applied Econometrics* 15(5):447–470, 2000, doi:10.1002/1099-1255(200009/10)15:5<447::AID-JAE570>3.0.CO;2-1](https://doi.org/10.1002/1099-1255(200009/10)15:5<447::AID-JAE570>3.0.CO;2-1), 4,161 cites) **[V]**. That is the theoretical license to stop worrying about functional form. Use **Halton draws** rather than pseudo-random draws for the simulation — Train showed they substantially reduce simulation variance for the same number of draws ([Train 2000, UC Berkeley WP](https://eml.berkeley.edu/~train/halton.pdf)) **[V]**. Practical estimation: `gmnl`/`mlogit` in R ([Sarrias & Daziano, *JSS* 79(2), 2017, doi:10.18637/jss.v079.i02](https://doi.org/10.18637/jss.v079.i02)) **[V]** or Biogeme in Python ([Bierlaire 2003](https://biogeme.epfl.ch/)) **[V]**.

**Scale sanity check.** With ~10k students × ~6 terms, a plausible conflict corpus is $10^4$–$10^5$ choice occasions. That is ample for a fixed-coefficient conditional logit and adequate for mixed logit with 3–6 random coefficients. Do **not** attempt a full random-coefficients specification on year one.

**Pitfalls.**
- **Choice set construction is the whole ballgame.** If you define the choice set as "everything happening at 7pm on campus" you have modeled awareness, not preference. Restrict to the student's own clubs, and to events they demonstrably knew about (notification delivered / viewed).
- **The outside option.** "Neither" must be in the choice set or every coefficient is biased. Include a no-show alternative with its own ASC.
- **Endogenous scheduling.** Clubs choose meeting times partly to avoid conflicts with clubs their members belong to. Time slot is therefore not exogenous. This biases toward finding that clubs which schedule badly are "less preferred."

**What it predicts.** True club ranking per student; which club is genuinely load-bearing; response to event redesign (the coefficients are directly actionable — "food is worth 0.4 utils, moving from 9pm to 7pm is worth 0.6").

**What it powers.** For officers: "schedule your GBM Wednesday 7pm, not Tuesday 8pm — you lose 22% of your actives to the conflict." This is a product almost no one has, it is quantitative, and it is uncontroversial.

## A3. Effort and reliability, and how much a cross-context estimate is actually worth

**What it is.** A person-level parameter — call it *follow-through* — estimated from behavior in several clubs, with club difficulty partialled out. This is the signal a single club can never compute, because a single club cannot tell "flaky person" from "demanding club."

**Why the psychology matters before the math.** The entire value of this signal rests on whether behavior *generalizes across contexts*. Mischel's *Personality and Assessment* (1968) launched the person–situation debate by arguing that cross-situational consistency correlations sit around 0.30, which was read for two decades as "traits barely predict behavior." The resolution, which is what licenses our approach, is **aggregation**: Epstein (1979) showed that single-occasion behavioral measures are unreliable, but aggregates over many occasions become highly reliable, exactly as Spearman–Brown predicts. Fleeson's density-distributions work showed that within-person variability in behavior is very large — a person's distribution of states is wide — but that the *person-level parameters of that distribution* (its mean especially) are remarkably stable across weeks.

The operational consequence is precise and should govern the product: **do not show a reliability number until you have enough observations for it to be stable.** Spearman–Brown gives the required count directly. If a single event's attendance has reliability $r_1$ with respect to the latent trait, the reliability of a $k$-event aggregate is

$$r_k = \frac{k\,r_1}{1 + (k-1)\,r_1}$$

With $r_1 = 0.30$, reaching $r_k = 0.80$ requires $k \approx 9.3$, i.e. **about 10 observations**; reaching $r_k = 0.90$ requires $k \approx 21$. Cross-context aggregation is worth a lot — but only above roughly ten scored events, and preferably spread over ≥2 clubs. Below that, the number is noise dressed as insight. *(The specific $r_1$ for club attendance is unknown to us and must be estimated from our own data; the 0.30 figure is Mischel's classic personality coefficient, used here illustratively.)* **[U for our setting]**

**How to compute it.** Two equivalent framings, developed fully in Part B §5 and §6: a cross-classified multilevel logistic model with person and club random effects, or — the same model in different clothes — a Rasch model where people have *ability* and clubs have *difficulty*. Use the second for explanation and the first for estimation.

**What it predicts.** Task completion, officer performance, whether a person assigned a deliverable will deliver.

**What it powers.** Internally: who to auto-suggest for a role; how to weight a person's commitment when forming a team. Externally: nothing. See Part D — a portable cross-club reliability score shown to employers is the single most dangerous object in this system.

## A4. Role trajectory: the club career ladder

**What it is.** Students move member → committee member → committee lead → officer → president, and they do it *across* organizations — often achieving a role in club B after a role in club A. The sequence, its speed, and its cross-club ordering are a career-like object with a short clock (4 years) and a complete, observed population.

**How to compute it.** Three complementary tools, in increasing order of ambition.

1. **Discrete-time survival / event-history model.** This is the right default. Person-period format: one row per (student, club, term) while at risk. Model the hazard of promotion:
   $$\mathrm{logit}\,\Pr(Y_{ijt}=1 \mid Y_{ij,t-1}=0) = \alpha_t + \beta' x_{ijt} + u_i + v_j$$
   with $\alpha_t$ a flexible baseline (term dummies or a spline) and $u_i, v_j$ person and club random effects. Discrete time is genuinely correct here, not an approximation: promotions happen at term boundaries. Suresh, Severn & Ghosh give a clean modern treatment showing discrete-time models can outperform continuous-time ones for prediction ([*BMC Med Res Methodol* 2022, doi:10.1186/s12874-022-01679-6](https://doi.org/10.1186/s12874-022-01679-6)) **[V]**; Singer & Willett's *Applied Longitudinal Data Analysis* is the canonical text **[C]**.
2. **Sequence analysis.** Represent each student's 8-term role history as a string over a small alphabet, compute optimal-matching distances, and cluster. Joseph, Boh, Ang & Slaughter did exactly this for IT careers, recovering three distinct career-path types and relating them to compensation ([*MIS Quarterly* 36(2), 2012, doi:10.2307/41703462](https://doi.org/10.2307/41703462), 178 cites) **[V]**. This is a *description* tool and an excellent one — it produces named archetypes officers can understand ("the deep specialist," "the serial founder," "the lateral broker").
3. **Learned trajectory embeddings.** The career-prediction literature is directly portable. CAPER models career trajectories as a **temporal knowledge graph** over the ternary (user, position, company) dependency, which maps onto our (student, role, club) triple exactly ([Lee, Lee, Yamashita, Lee & Kim, arXiv:2408.15620, 2024](https://arxiv.org/abs/2408.15620)) **[V]**. Decorte et al. get 43.01% recall@10 on next-position prediction from 2,164 annotated career histories using resume representation learning ([arXiv:2310.15636, 2023](https://arxiv.org/abs/2310.15636)) **[V]** — a useful calibration on what "good" looks like for this task class. Cai et al.'s DBGE embeds employment history as a *dynamic bipartite graph* to predict turnover ([*IEEE Access* 2020, doi:10.1109/access.2020.2965544](https://doi.org/10.1109/access.2020.2965544)) **[V]**, which is structurally our student–club graph.

**The honest constraint.** 43% recall@10 on a rich resume corpus should calm anyone who thinks role prediction is easy. Our advantage is that our label space is small (≈8 role types × ~400 clubs) and our data is *behavioral rather than self-reported*. Our disadvantage is that the population is tiny and turns over completely every four years (Part B §4).

**What it predicts.** Next role, ~1–2 terms out. Also *lateral* transitions: someone who becomes treasurer in a small club often becomes treasurer somewhere bigger.

**What it powers.** Succession planning for officers ("these 4 people are your realistic successors, ranked"), and — with enormous care — an employer-facing leadership signal.

## A5. Bridge behavior: brokerage across the club graph

**What it is.** Students whose clubs sit in *different* regions of the campus community structure are the connectors. In Burt's language they span **structural holes**; in graph terms they have high betweenness relative to degree.

**How to compute it.** Build the club-club graph $G_c$ where clubs are nodes and edge weight is a *backbone-validated* co-membership overlap (Part B §2 — the naive projection is worthless). Run community detection to get club communities (Part B §3). Then per student:

- **Community span:** the number of distinct club communities the student's memberships touch, and the entropy of the distribution over communities. This is the cheapest, most robust, most explainable bridging measure and should be the v1 metric.
- **Burt's network constraint** on the student's ego network in the student–student backbone:
  $$C_i = \sum_{j \neq i} \left(p_{ij} + \sum_{q \neq i,j} p_{iq} p_{qj}\right)^2, \qquad p_{ij} = \frac{z_{ij}+z_{ji}}{\sum_{k\neq i}(z_{ik}+z_{ki})}$$
  Low constraint = rich in structural holes. Burt's *Structural Holes and Good Ideas* (*AJS* 110(2), 2004) is the anchor: managers whose networks spanned structural holes produced ideas rated more valuable by executives. **[C — see §A5 note]**
- **Structural diversity**, which is the sharper and more surprising measure. Ugander, Backstrom, Marlow & Kleinberg showed that recruitment/contagion probability is predicted far better by the **number of distinct connected components in a person's contact neighborhood** than by the raw size of that neighborhood ([PNAS 2012, doi:10.1073/pnas.1116502109](https://doi.org/10.1073/pnas.1116502109), 721 cites) **[V for the qualitative finding; the exact conversion curves are U — PNAS returned 403 this session]**. Translated to us: *a student with 3 friends in 3 different clubs is a much better recruitment target, and a much better recruiter, than a student with 10 friends in one club.* This is a cross-club-only quantity. A single club cannot compute it.

**Why structural diversity beats degree.** It is the observational shadow of **complex contagion** — the theory that social adoption requires *multiple independent reinforcing exposures*, unlike simple epidemic spread. Guilbeault, Becker & Centola review the decade of evidence ([doi:10.1007/978-3-319-77332-2_1](https://doi.org/10.1007/978-3-319-77332-2_1), 206 cites) **[V]**. Iacopini et al. formalize the group-level version with simplicial contagion, showing higher-order (group, not pairwise) interactions produce a *discontinuous* transition and bistability ([*Nat Comms* 2019, doi:10.1038/s41467-019-10431-6](https://doi.org/10.1038/s41467-019-10431-6), 878 cites) **[V]**. A club *is* a simplex. This is the most mathematically apt model of the object we actually hold, and almost nobody applies it in product.

**What it predicts.** Information flow, recruitment success, cross-club collaboration formation, and (per Burt) idea quality.

**What it powers.** "You should meet X." Campus-level: which 20 students, if reached, reach everyone.

## A6. Influence and diffusion: who causes others to join

**What it is.** Seed selection. If a university or a club wants a behavior to spread — join this, attend this, get vaccinated, report this — who do you start with?

**The math.** Kempe, Kleinberg & Tardos formalized influence maximization under the Independent Cascade and Linear Threshold models, showed the problem is NP-hard, showed the influence function $\sigma(S)$ is **monotone and submodular**, and therefore that the naive greedy algorithm (repeatedly add the node with the largest marginal gain) is within $(1 - 1/e) \approx 63\%$ of optimal ([KDD 2003, doi:10.1145/956750.956769](https://doi.org/10.1145/956750.956769), 7,415 cites) **[V]**. Submodularity is the diminishing-returns property $\sigma(S \cup \{v\}) - \sigma(S) \geq \sigma(T \cup \{v\}) - \sigma(T)$ for $S \subseteq T$; on a campus with overlapping clubs it holds naturally because two seeds in the same club are largely redundant.

**Why this is not enough, and what to do instead.** The greedy guarantee is on a *given* diffusion model with *given* edge probabilities. Estimating those probabilities from observational co-membership data walks straight into the Shalizi–Thomas confound. The honest version of this product is therefore **experimental**, and there is a superb template: Paluck, Shepherd & Aronow ran a network-seeded anti-conflict intervention across **56 schools**, seeding "social referents" identified from network data, and cut student conflict reports by **25%**, with larger effects when seeds were socially central ([PNAS 2016, doi:10.1073/pnas.1514483113](https://doi.org/10.1073/pnas.1514483113), 627 cites) **[V]**. That is the design: identify seeds from the graph, randomize which schools/clubs/dorms get seeded, measure. It is also a genuinely fundable research collaboration with a university partner, which is a go-to-market asset, not just a science asset.

**What it predicts.** Marginal recruitment yield per outreach message.

**What it powers.** "Ask these 5 members to bring a friend" — replacing mass email blasts, which is the thing every club officer currently does and hates.

## A7. Homophily and what actually structures a campus

**What it is.** The question of which observable attributes explain the observed graph. If major and year explain nearly all of it, our graph is mostly a re-derivation of the registrar and worth much less.

**The evidence base.** The Facebook100 dataset (complete Facebook friendship networks for 100 US institutions at a single 2005 snapshot, with anonymized dorm, major, year, and high school attributes) is the definitive prior. Traud, Mucha & Porter's analyses found that **which attribute dominates varies systematically by institution**, that **class year and residence (dorm/House) are typically the strongest organizing attributes**, with major usually weaker, and that at some institutions a specific structural feature (e.g., a residential House system) dominates everything else ([*Physica A* 391(16):4165–4180, 2012, doi:10.1016/j.physa.2011.12.021](https://doi.org/10.1016/j.physa.2011.12.021); [*SIAM Review* 53(3), 2011, doi:10.1137/080734315](https://doi.org/10.1137/080734315)) **[C — see §A7 note]**.

**What this means for us, strategically.** Year and dorm are *available to the university already*. Club affiliation is not fully available to anyone. So the value of our graph is precisely the **residual variance in social structure not explained by year, dorm, and major** — and measuring that residual should be an early internal experiment. Fit a model of tie formation with year/dorm/major fixed effects, then add club co-membership, and report the incremental predictive lift. If the lift is small, large parts of this document are worth less than they look. **This is the single most important early validation and I have not seen it reported anywhere.** **[U]**

## A8. Team composition: which combinations work

**What it is.** Given a project and a candidate pool, pick a team. We have something almost no one has: **observed prior collaboration outcomes across multiple independent organizations for the same people.**

**The two literatures.**

*Assembly mechanisms.* Guimerà, Uzzi, Spiro & Amaral modeled team assembly with three parameters — team size $m$, the fraction of newcomers vs. **incumbents** $p$, and the propensity $q$ to **repeat** prior collaborations — and showed these alone reproduce observed collaboration network structure across science and Broadway musicals, with a percolation-like emergence of a giant component tied to field performance ([*Science* 308:697–702, 2005, doi:10.1126/science.1106340](https://doi.org/10.1126/science.1106340)) **[C]**. The actionable content: teams that are *all* incumbents-with-repeat-ties and teams that are *all* newcomers both underperform; there is an interior optimum. We can estimate $p^\*$ and $q^\*$ empirically per club type.

*Collective intelligence.* Woolley et al. found a general collective-intelligence factor $c$ in group performance that was **not** well predicted by the average or maximum individual intelligence of members, but was predicted by average social sensitivity, equality of conversational turn-taking, and the proportion of women in the group ([*Science* 330:686–688, 2010, doi:10.1126/science.1193147](https://doi.org/10.1126/science.1193147)) **[C]**. Two of those three we can proxy from our own data — **turn-taking equality is directly measurable from club chat** as the entropy or Gini of message shares in a channel. That is a real, computable, non-creepy group-level feature. The third (proportion of women) we should not touch; see Part D.

*Algorithmic team formation.* If you want to solve rather than score, the formal problem is: cover the required skills while minimizing communication cost on the social graph. It is NP-hard and generally formulated as a quadratic set cover; Berktaş & Yaman give an exact branch-and-bound ([*INFORMS J. Computing* 2020, doi:10.1287/ijoc.2020.1000](https://doi.org/10.1287/ijoc.2020.1000)) **[V]**, Kargar & An a bi-objective heuristic ([doi:10.1007/978-3-642-33486-3_31](https://doi.org/10.1007/978-3-642-33486-3_31), 113 cites) **[V]**, and Hamidi Rad et al. a variational neural approach ([*TOIS* 2023, doi:10.1145/3589762](https://doi.org/10.1145/3589762)) **[V]**. At our scale (teams of 3–8 from pools of ≤200), **exact solution is trivially feasible** — do not use a neural method for this.

**What it powers.** "These 5 people would make a good team." Ship it as a *suggestion with reasons*, never as an assignment.

## A9. Latent interest discovery from the co-membership bipartite graph

**What it is.** The student–club incidence matrix $R \in \{0,1\}^{n \times m}$ is a classic implicit-feedback recommendation problem. What co-membership reveals that stated interests do not is **the taste dimensions nobody has a name for** — the same reason Netflix's latent factors outperform genre tags.

**How to compute it.** Weighted regularized matrix factorization on implicit feedback (Hu, Koren & Volinsky, [ICDM 2008, doi:10.1109/icdm.2008.22](https://doi.org/10.1109/icdm.2008.22), 3,250 cites) **[V]** is the correct default. Treat observation as a confidence-weighted preference: $p_{ij} = \mathbb{1}[r_{ij} > 0]$, $c_{ij} = 1 + \alpha r_{ij}$, minimize

$$\sum_{i,j} c_{ij}\,(p_{ij} - u_i^\top v_j)^2 + \lambda\big(\textstyle\sum_i \|u_i\|^2 + \sum_j \|v_j\|^2\big)$$

by alternating least squares, which is linear in the number of observations. With $r_{ij}$ = engaged hours rather than a binary join, this directly encodes intensity, which is our advantage.

**Do not skip to a GNN.** Ferrari Dacrema, Cremonesi & Jannach evaluated 18 neural recommendation methods from top venues: only **7 were reproducible with reasonable effort**, **6 of those 7 were beaten by simple nearest-neighbor or graph heuristics**, and the single survivor did not consistently beat a well-tuned non-neural linear ranker ([arXiv:1907.06902](https://arxiv.org/abs/1907.06902); RecSys 2019, doi:10.1145/3298689.3347058) **[V]**. This is the most important methodological citation in this document and it should be pinned above the ML team's desk.

**The feedback-loop hazard, which is real and specific.** Once we recommend clubs, the co-membership matrix we learn from is partly *our own output*. Jadidinejad, Macdonald & Ounis document the closed-loop effect: training on interaction data produced by a previous model systematically narrows item exposure and degrades generalization ([SIGIR 2020, doi:10.1145/3397271.3401230](https://doi.org/10.1145/3397271.3401230)) **[V]**; Chen et al. survey the full bias taxonomy ([arXiv:2010.03240](https://arxiv.org/abs/2010.03240)) **[V]**. Mitigation is not optional: hold out a small randomized-exposure slate (an epsilon-greedy "wildcard club" slot), log propensities for every recommendation shown, and use inverse-propensity weighting when evaluating. **For a product whose social purpose is helping students find things they didn't know about, a degenerate recommender is a mission failure, not just a metric failure.**

## A10. Churn and belonging: does multi-club engagement predict retention?

**What it is.** The claim that a student in 3 clubs persists better than a student in 1 — and the much more interesting question of whether there is an **interior optimum**, i.e. whether 6 clubs is worse than 3.

**The theory base.** Astin's theory of student involvement (*JCSD* 1984, reprinted 1999) holds that learning and persistence are proportional to the quantity and quality of physical and psychological energy invested; Tinto's interactionalist model of departure holds that departure is driven by failure of academic and **social integration**. Both are foundational and both are correlational in most applications. **[C]**

**The gap, stated honestly.** The theory says *involvement* helps. It does not say *number of distinct involvements* helps, and the two are not the same construct. The breadth-vs-depth question — whether $N^{\text{eff}} = 4$ beats $N^{\text{eff}} = 2$ at constant total hours — is, as far as I can establish, **not settled in the literature**, and an inverted-U (involvement overload) is at least as plausible as a monotone benefit **[U]**. That is not a weakness of the plan. It is the strongest argument for building the measurement: *we would be the first system positioned to answer it cleanly*, because we observe both breadth and depth for the same students.

**Why our version is better than the existing evidence.** Existing findings rest on self-reported involvement in surveys (NSSE and similar), which conflates identity ("I'm a debate person") with behavior. We would have timestamped behavior. A 2019 study using stochastic actor-oriented models on organizational affiliation portfolios shows the right formalism for handling the selection problem ([Amati et al., doi:10.1177/1094428119857469](https://doi.org/10.1177/1094428119857469)) **[V]**.

**Critically: this signal is causally ambiguous and must not be sold as causal.** Students who join 3 clubs are different from students who join 1 in ways that predict retention independently. Part B §7 is about the designs that would let us say something causal, and one of them — the ranked-applicant RD — is genuinely available to us.

---

# PART B — The mathematics, specified properly

## B1. Heterogeneous graph representation, and when a GNN is overkill

**The typed graph.** Node types: `Student`, `Club`, `Event`, `Position`, `Project`, `Course` (if available), `Space`. Edge types: `MEMBER_OF(Student, Club)` with tenure and intensity; `ATTENDED(Student, Event)`; `HOSTED(Club, Event)`; `HOLDS(Student, Position)`; `POSITION_IN(Position, Club)`; `CONTRIBUTED(Student, Project)`; `MESSAGED(Student, Student)` within a club channel. Every edge carries $(t_{\text{valid}}, t_{\text{observed}})$ — bitemporality is non-negotiable if you ever want an honest backtest.

**Realistic scale.** ~10k students, ~400 clubs, ~50k events/year, ~10⁵–10⁶ attendance edges. This is a **small graph**. It fits in RAM on a laptop. Say this out loud before anyone proposes distributed training.

**The method ladder, in the order you should actually try them:**

| Tier | Method | When it's right | Cost |
|---|---|---|---|
| 0 | Hand-built features + gradient boosting | Always try first. Degree, tenure, community span, HHI, attendance rate, role history | Hours |
| 1 | Implicit-feedback MF / ALS ([Hu et al. 2008](https://doi.org/10.1109/icdm.2008.22)) | Club recommendation, latent interest | Hours |
| 2 | node2vec / metapath2vec | You want embeddings reusable across many downstream tasks | Days |
| 3 | R-GCN / GraphSAGE | You have rich node features AND a supervised task with ≥10⁴ labels | Weeks |
| 4 | HGT / temporal GNN | Only if tier 3 measurably wins and you have multiple campuses | Months |

**metapath2vec** (Dong, Chawla & Swami, [KDD 2017, doi:10.1145/3097983.3098036](https://doi.org/10.1145/3097983.3098036)) generates random walks constrained to a specified metapath schema — for us the natural ones are `Student → Club → Student` (co-membership), `Student → Event → Student` (co-attendance, much sharper), and `Student → Club → Event → Student` — then trains a heterogeneous skip-gram with type-aware negative sampling. It is cheap, it is interpretable *in the choice of metapath*, and the metapath choice is itself a domain-knowledge artifact you can defend. **This is the right tier-2 method for us.**

**R-GCN** (Schlichtkrull et al., [ESWC 2018, arXiv:1703.06103](https://arxiv.org/abs/1703.06103)) gives each relation type $r$ its own weight matrix:
$$h_i^{(l+1)} = \sigma\Big(W_0^{(l)}h_i^{(l)} + \sum_{r \in \mathcal{R}}\sum_{j \in \mathcal{N}_i^r} \tfrac{1}{c_{i,r}} W_r^{(l)} h_j^{(l)}\Big)$$
with basis decomposition $W_r = \sum_{b=1}^{B} a_{rb}V_b$ to control parameter count. **HGT** (Hu, Dong, Wang & Sun, [WWW 2020, arXiv:2003.01332](https://arxiv.org/abs/2003.01332)) replaces this with per-edge-type attention and relative temporal encoding.

**The argument for restraint.** Beyond the recommender result in A9, the graph-learning literature has its own replication problem: Shchur et al.'s "Pitfalls of Graph Neural Network Evaluation" ([arXiv:1811.05868](https://arxiv.org/abs/1811.05868)) showed that different train/test splits reverse the published ranking of GNN models on the standard citation benchmarks, and that simple baselines are competitive under fair tuning **[C]**. Gasteiger et al. showed a simple neural predictor plus personalized-PageRank propagation outperforms several contemporary GNNs with fewer parameters and faster training ([arXiv:1810.05997](https://arxiv.org/abs/1810.05997), 435 cites) **[V]**.

**The rule for this company:** a GNN earns its place only when it beats tier-0 and tier-1 on a **held-out future term**, not a random split. On a graph this small, with this much label scarcity, the honest prior is that it won't for at least a year.

## B2. Bipartite projection and its dangers

**The danger, concretely.** Project the student–club matrix $R$ to student–student via $P = RR^\top$. A 200-member club contributes a 200-clique — $19{,}900$ edges from one affiliation. A campus with a few large clubs produces a projection that is dense, high-clustering, small-world-looking, and **almost entirely artifact**. Every centrality you compute on it is dominated by "was in a big club." Naive projection is the single most common fatal error in affiliation-network analysis and we must not make it.

**The fix: backbone extraction against a null model.** Keep edge $(i,k)$ only if the observed co-membership count $P_{ik}$ is extreme relative to what a null model preserving both degree sequences would produce.

- **Fixed Degree Sequence Model (FDSM):** sample bipartite matrices with *exactly* the observed row sums (clubs per student) and column sums (members per club), via the curveball / trade algorithm, and compute an empirical $p$-value for each $P_{ik}$. Statistically ideal, Monte-Carlo expensive.
- **Stochastic Degree Sequence Model (SDSM):** preserve degree sequences *in expectation*, giving a closed-form/Poisson-binomial reference distribution. Neal, Domagalski & Sagan compared alternatives to FDSM and found the computationally fast **SDSM is a statistically conservative but close approximation** to FDSM ([*Scientific Reports* 2021, doi:10.1038/s41598-021-03238-3](https://doi.org/10.1038/s41598-021-03238-3)) **[V]**. Implementation: the `backbone` R package ([Domagalski, Neal & Sagan, *PLOS ONE* 2021, doi:10.1371/journal.pone.0244363](https://doi.org/10.1371/journal.pone.0244363)) **[V]**. Also see Cimini et al.'s meta-validation of projection methods ([*Comms Physics* 2022, doi:10.1038/s42005-022-00856-9](https://doi.org/10.1038/s42005-022-00856-9)) **[V]**.
- **Disparity filter** (Serrano, Boguñá & Vespignani, [PNAS 2009, doi:10.1073/pnas.0808904106](https://doi.org/10.1073/pnas.0808904106)): a *local* alternative that keeps edges whose normalized weight $p_{ij} = w_{ij}/s_i$ is unlikely under a uniform null for a node of degree $k_i$. The retention criterion is $\alpha_{ij} = (1-p_{ij})^{k_i - 1} < \alpha$. Cheap, multiscale, but it is not a degree-preserving null and it produces a directed/asymmetric decision per edge. Use it as a sanity cross-check, not as the primary. **[C]**

**Our specific advantage over the standard setup.** We do not have to project at all for the most important quantities. **Co-attendance at a specific event is a real, dyadic, time-stamped interaction** — two people in a 12-person room on a Tuesday is evidence; two people on a 400-person roster is not. Weight co-attendance edges by $1/(\text{event size})$ or better, by a Poisson-binomial surprise score, and the spurious-density problem largely dissolves. **Prefer event co-attendance over roster co-membership everywhere you can.**

## B3. Community detection at multiple scales

**Leiden, not Louvain.** Traag, Waltman & van Eck showed Louvain can produce **badly connected — even internally disconnected — communities**, and that Leiden guarantees all communities are internally connected and converges to a partition where every subset is locally optimally assigned ([*Scientific Reports* 9:5233, 2019, doi:10.1038/s41598-019-41695-z](https://doi.org/10.1038/s41598-019-41695-z)) **[V/C]**. There is no reason to run Louvain ([Blondel et al. 2008, doi:10.1088/1742-5468/2008/10/P10008](https://doi.org/10.1088/1742-5468/2008/10/p10008), 21,717 cites **[V]**) in 2026.

**Resolution, honestly.** Modularity has a resolution limit: it cannot see communities below a size that depends on total edge weight. Use the **Constant Potts Model** objective instead of modularity — $\mathcal{H} = -\sum_c (e_c - \gamma \binom{n_c}{2})$ — which is resolution-limit-free, and **sweep $\gamma$** rather than picking one. Report a hierarchy, not a partition. Multislice/multiresolution modularity (Mucha, Richardson, Macon, Porter & Onnela, [*Science* 328:876–878, 2010, doi:10.1126/science.1184819](https://doi.org/10.1126/science.1184819)) is the principled way to couple slices across time or across resolution **[C]**.

**Overlapping communities are mandatory here.** Students belong to many clubs by construction, so a hard partition of *students* is the wrong object. Options: **BigCLAM** (Yang & Leskovec, [WSDM 2013](https://cs.stanford.edu/people/jure/pubs/bigclam-wsdm13.pdf)), a nonnegative-matrix-factorization model where community affiliation strengths $F_{uc} \geq 0$ generate edges with $\Pr(u\!\sim\!v) = 1 - \exp(-F_u^\top F_v)$ **[C]**; or **link communities** (Ahn, Bagrow & Lehmann, [*Nature* 466:761–764, 2010, doi:10.1038/nature09182](https://doi.org/10.1038/nature09182)), which partition *edges* rather than nodes and therefore let nodes overlap naturally **[C]**. Link communities are conceptually perfect for us: a student's memberships *are* edges.

**The principled alternative: SBMs.** Modularity maximization will find "communities" in a random graph. The degree-corrected stochastic block model (Karrer & Newman, [*PRE* 83:016107, 2011, doi:10.1103/PhysRevE.83.016107](https://doi.org/10.1103/PhysRevE.83.016107)) is a generative model you can do honest model selection on **[C]**. Its degree correction matters enormously for us: without it, an SBM on a campus graph groups nodes by *popularity* rather than by *affiliation*, which is exactly the failure mode we cannot afford. Peixoto's nested/hierarchical SBM with minimum-description-length model selection (`graph-tool`) gives a multi-scale decomposition with a built-in stopping rule, and — crucially — will tell you when there is **no** statistically significant community structure **[C]**. Run it as the adversarial check on any Leiden result you plan to show a customer.

## B4. Temporal networks and the cohort-turnover problem

**The unusual structural fact.** In four years, **100% of the population is replaced**. No standard temporal-network benchmark has this property. Social networks in the literature grow; ours is a conveyor belt. Everything about model design should respect this.

Consequences, each of which has a concrete modeling implication:

1. **Person-level parameters have a 4-year half-life at most** — and the useful window is ~2.5 years (freshman spring to senior fall). Any model needing 3 years of history to warm up is worthless for half the population. Design for cold start as the *normal* case, not the edge case.
2. **Club-level parameters are the durable asset.** A club's difficulty, its seasonality, its recruitment funnel shape, its officer-turnover rhythm — these persist across cohorts. **The club embedding is the long-lived intellectual property; the student embedding is a rental.** This should drive architecture: put the learned capacity in club/role/event-type parameters and let students be relatively thin vectors on top.
3. **Seasonality dominates trend.** A naive temporal model will "discover" that engagement collapses every December. Detrend on the academic calendar (week-of-term, not week-of-year) before doing anything else.
4. **Evaluation must be forward-chained.** Train on terms 1..k, test on term k+1. Random splits will leak catastrophically because co-attendance edges within a term are massively correlated.

**Methods.** Snapshot-based (one graph per term, with multislice coupling per Mucha et al.) is the right v1 — it matches the natural periodicity and is vastly easier to reason about. Continuous-time options: **CTDNE** (Nguyen et al., [WWW '18 Companion, doi:10.1145/3184558.3191526](https://doi.org/10.1145/3184558.3191526)) uses temporally-valid random walks with non-decreasing timestamps **[C]**; **JODIE** (Kumar, Zhang & Leskovec, [KDD 2019, arXiv:1908.01207](https://arxiv.org/abs/1908.01207)) maintains coupled user/item embedding trajectories with a projection operator for drift **[C]**; **TGN** (Rossi et al., [arXiv:2006.10637](https://arxiv.org/abs/2006.10637)) adds a memory module updated per event **[C]**.

**The essential warning.** Poursafaei et al. showed that on dynamic link prediction, **simple heuristic baselines — notably "recently seen edges" and a degree-weighted memory — beat most published deep temporal models** once you use harder negative sampling than the standard random negatives ([NeurIPS 2022 Datasets & Benchmarks, "Towards Better Evaluation for Dynamic Link Prediction"](https://arxiv.org/abs/2207.10128)) **[C]**. For us the analogous baseline is brutal and must be beaten before any TGN work is funded: *"this student will attend next week iff they attended most of the last 3 weeks."* **[V — this is the pattern of the reproducibility literature confirmed above; the specific Poursafaei numbers are C]**

## B5. The cross-classified multilevel model — the mathematical core of the product

This is the heart of the whole system and deserves the most care. We want a person-level *follow-through* parameter that is not contaminated by which clubs the person happens to be in.

**The structure is cross-classified, not nested.** Students are not nested within clubs — a student belongs to several clubs, and a club contains several students. This is the classic cross-classified random effects design (Raudenbush & Bryk, *Hierarchical Linear Models*, 2002; Rasbash & Goldstein 1994 on cross-classified structures) **[C]**.

**Model specification.** For attendance outcome $y_{ijt} \in \{0,1\}$ (student $i$, club $j$, event/occasion $t$):

$$
y_{ijt} \sim \mathrm{Bernoulli}(\pi_{ijt}), \qquad
\mathrm{logit}(\pi_{ijt}) = \mu + \theta_i + \delta_j + \gamma_{ij} + \beta^\top x_{ijt}
$$

$$
\theta_i \sim \mathcal{N}(0, \sigma^2_\theta) \quad \text{(person follow-through)}
$$
$$
\delta_j \sim \mathcal{N}(0, \sigma^2_\delta) \quad \text{(club easiness — the negative of demandingness)}
$$
$$
\gamma_{ij} \sim \mathcal{N}(0, \sigma^2_\gamma) \quad \text{(person}\times\text{club fit — the interaction, and the most interesting term)}
$$

with $x_{ijt}$ carrying occasion-level covariates: week of term, day of week, hour, weather, distance, whether the student has a role, days since last attendance, exam proximity.

**Read the variance components as the product.** This decomposition *is* the insight:
- $\sigma^2_\theta$ large ⇒ people differ in general reliability ⇒ a person-level signal exists.
- $\sigma^2_\delta$ large ⇒ clubs differ in demandingness ⇒ **raw attendance rates are not comparable across clubs and no single club should ever be told its rate is "bad" without this adjustment.** This alone is a saleable product.
- $\sigma^2_\gamma$ large ⇒ the dominant story is *fit*, not general reliability ⇒ **do not ship a portable reliability score**, ship a matching product. Estimating this ratio should be a gating decision, not an afterthought.

**Shrinkage, and why it is the ethical mechanism as well as the statistical one.** For a person with $n_i$ observations, the posterior mean of $\theta_i$ is approximately

$$\hat\theta_i \approx \lambda_i \bar{y}_i^{\text{adj}} + (1-\lambda_i)\cdot 0, \qquad \lambda_i = \frac{n_i}{n_i + \sigma^2_e/\sigma^2_\theta}$$

A student with 3 observations gets shrunk almost entirely to the population mean; a student with 40 barely at all. **This is exactly the Spearman–Brown constraint from A3, arrived at from the other direction, and it means the model refuses to make confident claims about people we barely know.** That is the right default behavior for a system that could harm someone, and it is the thing to point at when a university asks whether we flag freshmen.

**Estimation at our scale.** ~10⁵–10⁶ occasion rows, ~10⁴ person effects, ~10² club effects. Options, in order:
- `lme4::glmer(y ~ x + (1|student) + (1|club) + (1|student:club), family=binomial)` — fast, gives point estimates, will complain about the interaction term.
- **`brms`/Stan with partial pooling and weakly-informative priors** — the right answer. `y ~ x + (1|student) + (1|club) + (1|student:club)`, $\sigma \sim \text{half-}\mathcal{N}(0,1)$. Fits in hours at this scale.
- `INLA` if Stan is too slow; the model is a standard latent Gaussian model.

**Pitfalls.** (i) **Missingness is informative** — we observe attendance only where check-in exists; a club that stops running check-in looks like a club everyone quit. Model the observation process explicitly or restrict to club-terms with verified check-in coverage. (ii) **Selection into clubs** — $\theta_i$ and club membership are not independent; the estimate of $\delta_j$ absorbs some of the composition of $j$. Adding $\gamma_{ij}$ helps but does not solve it. (iii) **Do not interpret $\delta_j$ as club quality** to officers without heavy caveats.

## B6. Item Response Theory as the explanatory frame

**The move.** Treat "did person $i$ show up to occasion $t$ of club $j$" as an item response. The **Rasch model** (Rasch 1960) is

$$\Pr(y_{ipt} = 1) = \frac{\exp(\theta_i - b_{jt})}{1 + \exp(\theta_i - b_{jt})}$$

person *ability* $\theta_i$ minus item *difficulty* $b_{jt}$. That is **algebraically the same model as B5** with $b_{jt} = -(\mu + \delta_j + \beta^\top x_{jt})$. De Boeck & Wilson's *Explanatory Item Response Models* (Springer, 2004) makes this identity explicit: IRT models are generalized linear (and nonlinear) mixed models, and once you see that, the whole GLMM toolkit applies **[C]**.

**Why bother with the IRT framing if it's the same model?** Because IRT brings four things the GLMM framing does not:

1. **Vocabulary that is honest and communicable.** "This club is a *hard item*" is a sentence an officer understands, and it correctly reframes low attendance as a property of the event, not a verdict on the members. This is the single best available framing for the officer-facing product.
2. **Specific objectivity.** The Rasch model's defining property is that person comparisons are invariant to which items were used, and item comparisons invariant to which persons took them — *provided* the model fits. That is precisely the claim we want to make ("this reliability estimate does not depend on which clubs you happened to join") and it comes with a **testable fit requirement**. Run infit/outfit mean-squares and person/item separation reliability. If fit fails, we have learned that reliability does *not* generalize across clubs — which is the $\sigma^2_\gamma$ finding from B5, and a far more interesting result than the alternative.
3. **The 2PL extension is diagnostic gold.** $\Pr = \sigma(a_j(\theta_i - b_j))$ adds a **discrimination** $a_j$. A club with high $a_j$ *separates* reliable from unreliable people — it is a good measuring instrument. A club with $a_j \approx 0$ tells you nothing about anyone. Ranking clubs by discrimination tells us which contexts are informative, and lets us weight evidence accordingly instead of treating all attendance as equal.
4. **Count data has a Rasch form too.** The **Rasch Poisson Counts Model**, $Y_{ij} \sim \text{Poisson}(\lambda_{ij})$, $\log \lambda_{ij} = \theta_i - b_j$, handles "number of events attended this term" directly, without binarizing **[C]**.

**Identification.** $\theta_i - b_j$ is invariant to adding a constant to all $\theta$ and all $b$. Fix it by constraining $\sum_j b_j = 0$ or $\mathbb{E}[\theta] = 0$. In the Bayesian multilevel version this is handled by the zero-mean priors automatically. Estimate by **marginal maximum likelihood** (integrating out $\theta$), not joint ML, which is inconsistent as the number of persons grows — the classic incidental-parameters problem **[C]**.

## B7. Causal questions, and the one design we actually own

Four designs, ranked by how available they are to us.

**(1) Regression discontinuity on selective-club admissions — the crown jewel.** Many campus organizations (consulting clubs, a cappella, investment funds, selective pre-professional groups, competitive teams) **rank applicants and admit the top $k$**. That produces a running variable (the applicant's rank or score) and a sharp cutoff. Applicants just above and just below the line are, in expectation, identical. This gives a **genuine local randomized experiment on the effect of club membership** on everything downstream: retention, GPA (if the registrar shares), further club joining, role attainment, graduation.

The canonical analogue is elite-school admission RD — Abdulkadiroğlu, Angrist & Pathak, "The Elite Illusion," exploited exam-school admission cutoffs and found **little effect of attending an elite exam school** on achievement ([*Econometrica* 82(1):137–196, 2014, doi:10.3982/ECTA10266](https://doi.org/10.3982/ECTA10266)) **[C]**. That precedent should also calibrate our expectations: the honest prior is that the effect of getting into the selective club is **smaller than everyone believes**, and demonstrating that credibly would itself be a notable result.

Estimation: local linear regression with a triangular kernel on each side, MSE-optimal bandwidth (Calonico–Cattaneo–Titiunik), robust bias-corrected CIs, `rdrobust`. Mandatory diagnostics: McCrary density test for manipulation of the running variable (officers *do* nudge rankings, so this will sometimes fail), covariate balance at the cutoff, placebo cutoffs.

**The strategic point: we are the only party who can run this, because we would be the system in which the ranking happens.** No university IRB-approved study can get applicant rank sheets for 40 clubs. We would generate them as exhaust. This is a genuine research asset and the basis for a credible university partnership. *(It also requires explicit consent design — see Part D.)*

**(2) Randomized-encouragement / seed experiments.** Directly implementable, as in Paluck et al.'s 56-school design **[V]**. Randomize which members get a "bring a friend" nudge; estimate the effect on recruitment. This is an A/B test we control end to end and is the cleanest thing on this list.

**(3) Difference-in-differences on club events (with care).** When a club changes something — new meeting time, new officer, new dues — compare its members' engagement trajectories to matched members of unaffected clubs. Because adoption is **staggered**, standard two-way fixed effects is biased: Goodman-Bacon showed the TWFE estimand is a variance-weighted average of all 2×2 DiD comparisons, **including "forbidden" comparisons using already-treated units as controls, which can carry negative weights** ([*J. Econometrics* 225(2), 2021, doi:10.1016/j.jeconom.2021.03.014](https://doi.org/10.1016/j.jeconom.2021.03.014)) **[C]**. Use Callaway & Sant'Anna group-time ATTs ([*J. Econometrics* 225(2), 2021, doi:10.1016/j.jeconom.2020.12.001](https://doi.org/10.1016/j.jeconom.2020.12.001)) **[C]** or Sun & Abraham's interaction-weighted estimator ([*J. Econometrics* 225(2), 2021, doi:10.1016/j.jeconom.2020.09.006](https://doi.org/10.1016/j.jeconom.2020.09.006)) **[C]**. Do **not** let anyone run a naive TWFE event study and call it causal.

**(4) Peer effects and the reflection problem.** Manski showed that endogenous social effects (my behavior responds to my group's behavior), exogenous/contextual effects (my behavior responds to my group's characteristics), and correlated effects (we are similar because we selected into the same group) are **not separately identified** from group-level means — the reflection problem ([*Review of Economic Studies* 60(3):531–542, 1993, doi:10.2307/2298123](https://doi.org/10.2307/2298123)) **[C]**. Bramoullé, Djebbari & Fortin showed identification is restored when the network is **not complete and contains intransitive triads** — i.e., when your friend's friend is not your friend, their characteristics serve as instruments ([*J. Econometrics* 150(1):41–55, 2009, doi:10.1016/j.jeconom.2008.12.021](https://doi.org/10.1016/j.jeconom.2008.12.021)) **[C]**. Our club graph is richly intransitive, which is genuinely favorable.

The gold standard for campus peer effects remains **randomized roommate assignment**: Sacerdote's Dartmouth study found peer effects on GPA and, notably, **very strong peer effects on the decision to join a fraternity or sorority** ([*QJE* 116(2):681–704, 2001, doi:10.1162/00335530151144131](https://doi.org/10.1162/00335530151144131)) **[C]**. That last finding is the most directly relevant external validation in this entire document: *randomly assigned roommates causally influence social-organization joining.* It is strong prior evidence that our "who causes others to join" signal reflects something real — and it points at a design, since most universities randomize roommate assignment and could share the assignment mechanism under a research agreement.

## B8. Privacy-preserving computation on this graph

**Two definitions, wildly different difficulty.**
- **Edge-DP:** neighboring graphs differ by one edge. Protects "is X in club Y." Achievable for many statistics with modest noise.
- **Node-DP:** neighboring graphs differ by one node *and all its edges*. Protects a person's entire existence. This is what students would actually want, and it is **much harder** — a single high-degree node can change a count by $\Theta(n)$, so global sensitivity is enormous. Kasiviswanathan, Nissim, Raskhodnikova & Smith made node-DP tractable via **graph projections onto bounded-degree graphs** plus Lipschitz extensions, which controls sensitivity at the cost of bias ([TCC 2013, doi:10.1007/978-3-642-36594-2_26](https://doi.org/10.1007/978-3-642-36594-2_26)) **[C]**. For us, bounded-degree projection has a natural meaning: **cap the number of clubs per student at $D$ when computing any released statistic.** Since real students hold 3–6 memberships, $D = 8$ loses almost nothing and bounds sensitivity hard.

**Why anonymization is not an option.** Narayanan & Shmatikov's de-anonymization of social networks showed that structure alone re-identifies: using an auxiliary network (Flickr) against an anonymized target (Twitter), they re-identified a third of the users who had accounts in both, with ~12% error ([IEEE S&P 2009, doi:10.1109/SP.2009.22](https://doi.org/10.1109/SP.2009.22)) **[C]**. Backstrom, Dwork & Kleinberg showed *active* attacks: an adversary who creates a small number of accounts before anonymization ($O(\log n)$ of them) can plant a recoverable subgraph and compromise the privacy of targeted pairs ([WWW 2007, doi:10.1145/1242572.1242598](https://doi.org/10.1145/1242572.1242598)) **[C]**. On a campus, the auxiliary information is *free* — anyone can observe who walks into a meeting.

**$k$-anonymity fails on graphs**, and fails especially fast here. A student's *set of club memberships* is a quasi-identifier of extraordinary power: {Bhangra team, Quiz Bowl, Model UN, Catholic Student Association} at a 10,000-person campus identifies exactly one person with near certainty. **Any release of membership-set-valued data is a re-identification.** This must be written into the data-release policy as a hard rule.

**What can therefore be released, and to whom:**

| Recipient | Safe | Unsafe |
|---|---|---|
| The student | Everything about themselves | — |
| Their own club's officers | Aggregate club stats; member data *within that club* only | Anything about that member's other clubs |
| University administration | DP-noised campus aggregates, $\varepsilon$ budgeted and published; minimum cell size ≥ 25 with degree capping | Any individual risk score. Full stop — see Part D |
| Employers | Nothing not affirmatively pushed by the student, per-item | Any inferred score, any comparative ranking |
| Advertisers | Aggregate reach estimates, minimum audience 1,000, no club-set targeting | Behavioral segments derived from cross-club inference |

**Local DP is worth prototyping** for the most sensitive layer. Imola, Murakami & Chaudhuri give practical locally-DP algorithms for graph statistics (triangle and $k$-star counts) under an LDP model where each user only reports about their own adjacency list ([USENIX Security 2021](https://www.usenix.org/conference/usenixsecurity21/presentation/imola)) **[C]**. The relevance is architectural: if a statistic can be computed under LDP, we never need the raw edge on our servers, and that is a materially stronger promise than a policy.

---

# PART C — The products

A standing constraint: **the front end must be simple**, which means each product surfaces as *one sentence and one action*. The mathematics lives in the backend and its only visible trace is that the sentence is specific.

### C1. "You should meet X" — bridge-aware people recommendation

**Model.** Candidate generation from the co-attendance backbone (B2) + MF embeddings (A9); re-ranking by a bridging objective that *maximizes marginal structural diversity* rather than similarity — prefer a candidate who adds a **new connected component** to the user's neighborhood (A5). Score $= \alpha\cdot\text{affinity} + \beta\cdot\Delta\text{structural diversity} - \gamma\cdot\text{redundancy}$.

**Surface.** In-app, at most one suggestion a week, with the reason stated in plain language: *"You and Maya both go to Hack Night and she runs the design crit at Studio — you've never overlapped."* No score, no percentage, no "97% match."

**The critical design choice.** A similarity-maximizing people recommender builds an echo chamber and is a worse product *and* a worse social outcome. Recommending the near-duplicate is the easy win and the wrong one.

### C2. "This club is about to lose you" / "you're overcommitted"

**Model.** B5 multilevel hazard + A1 portfolio load + A2 conditional logit over the student's own clubs for *which* one goes.

**Surface, and this is the hardest ethical call in the product.** Two different audiences want incompatible things. Resolution:
- **To the student:** a private, dismissible, monthly note. *"You've got 6 things on this week. Last term you dropped one around now."* Never *"drop Debate."*
- **To the officer:** **aggregate only**. *"4 of your 30 actives have gone quiet this month"* + a generic re-engagement playbook. **Never name the student.** Naming turns the product into a surveillance tool pointed at a 19-year-old by a 20-year-old with no training, and the predicted departure becomes a self-fulfilling social event.

This costs us the flashiest demo in the deck. Take the loss.

### C3. "These 5 people would make a good team"

**Model.** Exact optimization (B/A8): skill coverage from prior project roles, communication cost on the backbone graph, plus the Guimerà incumbent/newcomer mix $p$ tuned to the empirical optimum, plus a turn-taking-equality prior from chat (Woolley). Exact branch-and-bound is fine at $n \leq 200$.

**Surface.** In the project-creation flow: a suggested roster with one reason per person, all editable. *Suggestion, never assignment.*

### C4. "This freshman is isolated" — the intervention product, and why we should probably not build it

**Model.** Trivial to compute: low degree in co-attendance backbone, structural diversity ≈ 0, declining attendance, zero cross-club ties.

**The ethical weight is not a footnote; it is the whole analysis.** This is the exact product that has blown up repeatedly in higher education (Part D). Mount St. Mary's, EAB Navigate, SpotterEDU. The failure mode is not hypothetical and it is not about bad intentions — it is that a score built to help gets used to triage, and triage on a proxy for social class reproduces social class.

**The version I would defend:**
1. **Never send an individual name to an administrator.** Ever.
2. **Invert the direction: give the signal to the student.** *"Looks like a quiet few weeks. Three things happening near you this week that people like you liked."* Student-facing, private, dismissible, with a permanent off switch that does not degrade any other feature.
3. **If an institution insists on an intervention product, the unit is the cohort, not the person.** *"First-years in [dorm] are joining clubs at half the campus rate"* is actionable, humane, and does not label a child.
4. **Never let isolation flow into anything else** — not the recommender's ranking, not any exported profile, not a partner API.

If we cannot hold those four lines under revenue pressure, we should not compute it at all.

### C5. "Your club's members are drifting toward X" — officer competitive intelligence

**Model.** Term-over-term flows in the club-club backbone; a Markov transition matrix over club communities; alerts when an outflow is significant against the SDSM null.

**Surface.** *"6 of your members started going to Product Club this term."* Aggregate counts, no names, above a minimum cell size of 5.

**Caution.** This is the product most likely to be used to harm students (an officer confronting someone about attending a rival club) and most likely to trigger an arms race between clubs. Minimum cell sizes and no-names are load-bearing, not decorative.

### C6. "This person is about to become a leader" — succession, and the employer signal

**Model.** A4 discrete-time promotion hazard + role-sequence embeddings + the B5/B6 follow-through posterior.

**Surface, internal:** to the *outgoing officer*, in the officer-transition flow, in the final weeks of a term — a ranked shortlist of 5 plausible successors with reasons. This is a genuinely wanted product; officer transition is a known campus pain point and nobody supports it.

**Surface, external:** the employer/VC version is the most commercially valuable and most dangerous thing in this document. The only defensible form is **student-initiated, per-item, evidence-based, and non-comparative**: the student chooses to publish a verified claim ("Treasurer, Robotics Club, 2 terms, managed a $14k budget"). **We must never ship a portable predicted-leadership score.** A predicted score becomes a shadow credit rating for a 20-year-old, is sold as objective, is trained on a biased sample, and cannot be appealed. Verified facts are a good business. Predicted potential is a liability disguised as a moat.

### C7. Club similarity and "clubs like yours" benchmarking

**Model.** Club embeddings from the incidence matrix (A9) + backbone-validated overlap + event-schedule and text features; nearest neighbors with the B5 difficulty adjustment applied to any comparison metric.

**Surface.** *"Clubs your size with your meeting cadence average 34% attendance. You're at 41%."* This is the officer product with the highest ratio of value to ethical risk in the entire list, because the unit of analysis is an organization, not a person, and organizations are fair game. **It is also our best wedge: it is a number a club president cannot get anywhere else, and it makes them feel good more often than bad.**

### C8. Campus-level: "what is happening right now"

**Model.** Aggregate event-attendance nowcast with academic-calendar seasonality; anomaly detection against a seasonal baseline; DP noise on anything released beyond the platform.

**Surface.** A public, beautiful, low-stakes campus pulse: what's on tonight, what's unusually busy, what's new. This is the *acquisition* product — it is the only one a student would screenshot — and it happens to be built entirely from aggregates.

---

# PART D — The honest limits

## D1. Where this becomes creepy: the cautionary record

The higher-education analytics field has a documented history of exactly this going wrong. These are not analogies. They are the same product category.

**SpotterEDU (2019).** The *Washington Post*'s Drew Harwell reported in December 2019 on SpotterEDU, which used short-range Bluetooth beacons in classrooms to take attendance via students' phones, deployed at institutions including Syracuse University, with ~40 schools reported as customers; some systems assigned students "risk scores" and flagged absences to advisors ([Washington Post, 24 Dec 2019](https://www.washingtonpost.com/technology/2019/12/24/colleges-are-turning-students-phones-into-surveillance-machines-tracking-locations-hundreds-thousands/)) **[C]**. Student reaction was strongly negative and the coverage became the canonical reference point for campus-surveillance backlash.

**Degree Analytics.** Covered in the same reporting cycle: inferring attendance, and by extension engagement and risk, from **campus WiFi association logs** — data students never affirmatively provided for that purpose **[C]**.

**Mount St. Mary's University (2016).** President Simon Newman promoted a survey of incoming freshmen and reportedly sought to dismiss at-risk students early to protect the institution's retention statistics; the controversy, catalyzed by a quote reported in the student newspaper *The Mountain Echo* about drowning bunnies, and by the firing of faculty who objected, ended in Newman's resignation in February 2016 **[C]**. **This is the single most important case in this document, because the failure was not technical.** The model may have worked fine. The institution's *incentive* was to remove the students it flagged, because retention rate is a numerator/denominator game. Any risk score we hand an institution enters an incentive structure we do not control.

**EAB Navigate and race as a predictor (2021).** The Markup reported (Todd Feathers, March 2021) that universities using EAB's Navigate advising software employed **race as a predictor variable** in student-success risk models, in at least one case as a "high impact predictor," at institutions including UMass Amherst, the University of Houston, Texas A&M, and the University of Wisconsin–Milwaukee — with critics warning that such scores steer minority students away from demanding majors ([The Markup, "Major Universities Are Using Race as a 'High Impact Predictor' of Student Success"](https://themarkup.org/machine-learning/2021/03/02/major-universities-are-using-race-as-a-high-impact-predictor-of-student-success)) **[C]**.

The mechanism generalizes and we would be exposed to it even without using race: **any feature correlated with race, class, or first-generation status becomes a proxy**, and cross-club features are *loaded* with class — Greek life, club sports with equipment costs, unpaid case-competition teams, clubs with dues. A "campus involvement" score is substantially a wealth-and-free-time score. Encode that in the model card.

**Fizz.** The anonymous campus social app launched at Stanford faced reported security and moderation problems in 2022–2023, including a vulnerability reported by student researchers that could expose supposedly anonymous users' identities **[C]**. The lesson is narrow and sharp: **on a single campus, the population is small enough that "anonymous" and "aggregate" are much weaker guarantees than they are at internet scale.** A cell size that is safe across a country is a name on one campus.

## D2. What students actually say

There is an empirical literature here and its findings are consistent enough to plan against.

- **Consent and control are the dominant concerns, not collection per se.** Ifenthaler & Schumacher found students were **willing to share data for learning analytics but expected control over it**, and preferred systems where they could see and manage what was held ([*Educational Technology Research and Development* 64:923–938, 2016, doi:10.1007/s11423-016-9477-y](https://doi.org/10.1007/s11423-016-9477-y)) **[C]**.
- **Students expect to be asked.** Whitelock-Wainwright et al.'s SELAQ work distinguishes *ideal* from *predicted* expectations and finds the highest-rated ideal expectations concern **consent, transparency about what is collected, and the right to opt out** **[C]**.
- **Students are often unaware they are tracked, and react badly on learning it.** Jones, Asher, Goben et al.'s interview study — whose title quotes a student saying they are tracked constantly — found students largely **unaware of institutional data collection**, uncomfortable when informed, and concerned about scope creep and third-party sharing ([*JASIST* 71(9):1044–1059, 2020, doi:10.1002/asi.24278](https://doi.org/10.1002/asi.24278)) **[C]**.
- **Slade & Prinsloo's ethical framework** (*American Behavioral Scientist* 57(10), 2013, doi:10.1177/0002764213479366) argues for treating students as **collaborators and agents** in analytics rather than as data objects, with transparency, right of access, and the recognition that data is temporally bounded and context-dependent **[C]**.

**The line, stated as a rule we can hold:** *A student should never learn something about our model of them from someone else.* If a signal cannot be shown to the student first, in plain language, with a working off switch, we do not compute it. This is a stronger rule than notice-and-consent and it is testable against any proposed feature in about thirty seconds.

**On FERPA.** FERPA (20 U.S.C. §1232g; 34 CFR Part 99) governs *education records* held by an institution or by a party acting for it. A private platform contracting with a university may fall under the "school official" exception and inherit FERPA obligations; a platform contracting directly with student organizations may not be covered at all — which is a **weaker** privacy position for students, not a stronger one for us. Club membership *can* be directory information if designated and disclosed with an opt-out. **We should adopt FERPA-equivalent handling by policy regardless of whether it legally applies**, because the alternative is to explain to a reporter why we processed student social graphs under weaker rules than the registrar. State student-privacy laws and GDPR (for international students and any EU campus) add further constraints including a right to erasure that our architecture must actually support. **[C — verify with counsel before any institutional contract]**

## D3. What we should deliberately not compute

| Do not compute | Why |
|---|---|
| **Romantic/sexual relationship inference** from co-attendance patterns | Computable with embarrassing ease from co-attendance timing. Outing risk is lethal — literally, for some students. Never. |
| **Mental-health or crisis risk scores** | We are not clinicians, have no duty-of-care infrastructure, and false positives do real harm. Withdrawal from clubs has many benign causes. |
| **Religion, sexual orientation, immigration status, disability, political affiliation** — inferred or proxied | Club membership is a near-perfect proxy for several of these. These are special-category data under GDPR and morally special everywhere. Explicitly blocklist the clubs that would serve as proxies from *all* inference features, not just from display. |
| **Any use of race/ethnicity as a model feature** | The EAB precedent. Do not use it, and **do audit for proxies** — which requires holding the attribute for auditing only, in a separate system, never in the feature store. |
| **Individual risk scores exported to administrators** | Mount St. Mary's. The incentive structure at the receiving end is not ours to control. |
| **A portable cross-club "reliability" or "leadership potential" score** for employers | A shadow credit score for 20-year-olds, un-appealable, trained on a biased sample, and inherently a class proxy. Ship verified facts instead. |
| **Friendship-strength scores shown to either party** | The number is unfalsifiable, socially explosive, and there is no good outcome from a student seeing it. |
| **Inferred physical location beyond voluntary event check-in** | The SpotterEDU line. No WiFi logs, no continuous location, no passive Bluetooth. This is a hard architectural boundary, and it is a *marketing asset*: we can say plainly that we never track location. |
| **"Who is avoiding whom"** | Trivially computable from conflicting attendance. Purely harmful. |
| **Cross-campus person-level linking without explicit per-campus consent** | The moat argument for it is strong; do it anyway only with affirmative opt-in, because it converts a campus product into a permanent dossier. |

## D4. Goodhart effects: what breaks when people know they are scored

Goodhart's law ("when a measure becomes a target, it ceases to be a good measure") and Campbell's law (the more a quantitative indicator is used for social decision-making, the more it will distort the process it monitors) are not abstractions here — **students are unusually sophisticated optimizers of legible metrics.** They have spent their entire adolescence optimizing a legible metric for college admissions. They will be *extremely* good at gaming this, faster than we expect.

Concrete predicted failure modes:

1. **Check-in theater.** If attendance is scored, students check in and leave. Mitigation: don't publish per-person attendance scores; use dwell/participation signals only in aggregate; accept the measurement loss.
2. **Ghost memberships.** If breadth is rewarded, students join 12 clubs and attend none — *and the "portfolio" signal inverts sign*. Mitigation: weight by realized hours, never by membership count. This one matters a lot, because "number of clubs" is exactly the metric a naive version would surface.
3. **Bridging arbitrage.** If bridging is rewarded, students join deliberately distant clubs. Ironically this might be *fine* — the behavior we'd be inducing is the behavior we want. Note it as the one place where Goodhart is benign.
4. **Officer-title inflation.** If leadership is scored, clubs mint VP titles. Already endemic on LinkedIn. Mitigation: weight roles by observed *scope* (budget managed, people coordinated, events run), never by title string.
5. **Recruitment spam.** If influence is scored, seeds spam their friends and social trust is the cost. Mitigation: cap outreach, measure *accepted* invitations net of unsubscribes.
6. **Chilling.** The subtlest and worst. Students who believe they are scored **try fewer things** — and trying things is the entire point of college clubs. A visible score converts exploration into performance. **This is the strongest argument for keeping nearly everything invisible and using the models to make the product quietly better rather than to tell students about themselves.**

The design implication is uncomfortable but clear: **the more accurate our model, the less of it we should show.** The value should be delivered as better recommendations, better scheduling, better team suggestions — not as feedback about the person.

---

# Closing: the four deliverables

## 1. Ranked list of cross-club signals

Ranked by (uniqueness to our position) × (predictive value) × (product leverage) ÷ (ethical risk).

| # | Signal | Computed from | Predicts | Powers | Unique? | Risk |
|---|---|---|---|---|---|---|
| 1 | **Club difficulty / demandingness** $\delta_j$ | Cross-classified MLM / Rasch (B5, B6) | Fair attendance expectations | C7 benchmarking, all fair comparisons | Only cross-club | Low |
| 2 | **Revealed preference from conflicts** | Conditional/mixed logit (A2) | True club ranking; event-design response | C7, scheduling advisor | Only cross-club | Low |
| 3 | **Structural diversity** (distinct components in neighborhood) | Co-attendance backbone (A5) | Recruitment yield; contagion | C1, C8, seed selection | Only cross-club | Low |
| 4 | **Portfolio load & concentration** ($\mathrm{HHI}$, $N^{\text{eff}}$, $\tau$) | Time-share vector (A1) | Which membership drops, when | C2 (student-facing only) | Only cross-club | Medium |
| 5 | **Person follow-through** $\theta_i$ | Same MLM, shrunk (B5) | Task completion, officer success | C3, C6 internal | Only cross-club | **High if exported** |
| 6 | **Person×club fit** $\gamma_{ij}$ | Interaction term (B5) | Where a person thrives | C1, C3, club recs | Only cross-club | Low |
| 7 | **Role trajectory** | Discrete-time hazard + sequence (A4) | Next role, 1–2 terms | C6 succession | Only cross-club | Medium |
| 8 | **Community span / brokerage** | Backbone + Leiden (A5, B3) | Info flow, idea quality | C1, C8 | Only cross-club | Low |
| 9 | **Latent interest factors** | Implicit MF (A9) | Next club joined | C1, C7, onboarding | Partly (a big club could approximate) | Low |
| 10 | **Club-to-club member flow** | Backbone transitions (C5) | Club rise and decline | C5, C7 | Only cross-club | Medium |
| 11 | **Influence / seed value** | IM on backbone + experiments (A6) | Marginal recruitment | Seed campaigns | Only cross-club | Medium |
| 12 | **Team-composition fit** | $p$/$q$ mix + turn-taking (A8) | Project completion | C3 | Only cross-club | Low |
| 13 | **Multi-club engagement → retention** | Portfolio + survival (A10) | Persistence (*correlational*) | University reporting, aggregate only | Only cross-club | **High** |
| 14 | **Isolation** | Degree + diversity ≈ 0 (C4) | Disengagement | C4 — student-facing only | Only cross-club | **Highest** |

Note the shape of this table: **the highest-value signals are the lowest-risk ones**, because they are properties of *organizations and situations* rather than verdicts on people. That is a fortunate alignment and we should lean into it deliberately.

## 2. The model stack

**v1 — six months. No machine learning worth the name.**
- Bitemporal event store; every fact with `valid_time` and `observed_time`.
- SDSM backbone extraction on the co-attendance bipartite graph (`backbone` R package or a Python port). **Never use a raw projection.**
- Leiden with a $\gamma$ sweep on the club-club backbone → named club communities.
- Descriptive portfolio math: $w$, HHI, $N^{\text{eff}}$, entropy, turnover $\tau$.
- Cross-classified logistic MLM via `lme4` for $\theta_i, \delta_j$. **Ship $\delta_j$ (club difficulty) to officers; keep $\theta_i$ internal.**
- Implicit-ALS matrix factorization for club recommendation, with a randomized-exposure slot and logged propensities from day one.
- Baselines everywhere: "attended 2 of last 3," "most popular club in your community." Every later model must beat these on a **held-out future term**.
- Products: C7 (benchmarking), C8 (campus pulse), C2 student-facing.

**v2 — twelve to eighteen months.**
- Bayesian multilevel model in `brms`/Stan with the $\gamma_{ij}$ interaction; report posterior intervals and let uncertainty gate the UI.
- 2PL IRT fit for club *discrimination* $a_j$; weight evidence by it.
- Conditional and then mixed logit on the conflict corpus (Halton draws).
- Discrete-time promotion hazard; sequence-analysis archetypes.
- metapath2vec embeddings on `S–E–S` and `S–C–S` metapaths, evaluated against tier-0/1 baselines, kept only if they win.
- Randomized-encouragement seed experiments; first causal result.
- Products: C1, C3, C5, C6-internal.

**v3 — two years plus, and only if v2 has validated.**
- The **selective-club admission RD** as a flagship research program with a university partner and IRB cover. This is the scientific crown jewel.
- Staggered DiD (Callaway–Sant'Anna) on club-level interventions.
- Multi-campus hierarchical model: club-type-level priors pooled across campuses, with campus random effects. **This is the real cross-campus moat — not a person-level dossier, but a prior over what a "consulting club" looks like that makes a brand-new campus useful on day one.**
- Temporal GNN (TGN/HGT) *only* if it beats the memory baseline on forward-chained evaluation.
- Node-DP release layer with degree capping for any institutional reporting.

## 3. The "do not compute" list

Reproduced from D3 as a standing engineering rule: no romantic/sexual inference; no mental-health or crisis scores; no inferred religion, orientation, immigration status, disability, or politics (and blocklist proxy clubs from the feature store, not just from display); no race as a feature and an audit process for proxies; no individual risk scores exported to administrators; no portable reliability or leadership-potential score for employers; no friendship-strength numbers shown to anyone; no passive location or WiFi-derived attendance ever; no "who is avoiding whom"; no cross-campus person linking without affirmative opt-in.

Two meta-rules that generate the list, and should be in the engineering handbook:
- **The mirror test.** If a signal cannot be shown to the student it is about, in plain language, with a working off switch, we do not compute it.
- **The incentive test.** Before exporting any person-level signal, ask what the recipient's incentives do to the student when the signal is wrong. Mount St. Mary's is the worked example of that question being skipped.

## 4. The single highest-value thing that is only possible because we see across clubs

**Separating the person from the situation.**

Every other party on campus observes a student in exactly one context and cannot tell whether what they see is a property of the student or a property of the setting. A club president looking at 40% attendance genuinely cannot distinguish "our members are flaky" from "we meet at 9pm on a Thursday across campus" from "we ask more of people than most clubs do." That confound is the source of nearly every bad decision a student organization makes — the officer who concludes their members don't care, the student who concludes they're bad at commitment, the advisor who concludes a club is failing.

We are the only system that can decompose it, because we observe the **same person in multiple clubs** and **multiple people in the same club** simultaneously. That is a fully crossed design, handed to us for free, and it is the exact structure that lets a cross-classified multilevel model — equivalently, a Rasch model — identify $\theta_i$ (person), $\delta_j$ (situation), and $\gamma_{ij}$ (fit) separately.

Everything valuable in this document is a corollary:

- Fair benchmarking between clubs is $\delta_j$.
- Honest feedback to an officer that their attendance is fine and their *time slot* is the problem is $\delta_j$ plus A2.
- Matching a student to a club where they will actually thrive is $\gamma_{ij}$.
- Any legitimate reliability claim is $\theta_i$ with proper shrinkage.
- And the most humane product in the whole list — telling a student who feels like they're failing that they are in three unusually demanding organizations and are doing fine — is only sayable if you can measure $\delta_j$.

The commercially seductive reading of "we see across all their clubs" is *a richer dossier on each student*. That reading is wrong, legally exposed, ethically indefensible, and — the part that should actually settle it — **statistically weaker**, because a dossier is a pile of confounded observations. The correct reading is *a natural experiment in which the situation varies while the person is held fixed*.

Build that. It is more defensible, more useful, harder to copy, and it is the version of this company that can survive being written about.

---

*Flagged as unverified and requiring internal validation before being built on: the incremental predictive lift of club affiliation over year/dorm/major (A7) — the single most important early experiment; the breadth-vs-depth relationship to retention (A10); the ordering of which club a student drops under load (A1); the single-event reliability $r_1$ for club attendance that determines the observation threshold (A3); the exact structural-diversity conversion curves in Ugander et al. (A5). Legal claims in D2 require counsel.*
