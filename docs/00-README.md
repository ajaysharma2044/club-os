# Club OS — Research and Specification

Twenty-one research tracks, roughly 120,000 words, about 900 sources. Raw reports in `/research/`. Synthesis in `/docs/`.

---

## The documents

| # | Doc | What it settles |
|---|---|---|
| 01 | [Strategy](01-strategy.md) | Thesis, why now, the numbers for the deck, business model order, go-to-market |
| 02 | [Product spec](02-product-spec.md) | Navigation, roles, feature inventory by priority, jobs to be done |
| 03 | [Data architecture](03-data-architecture.md) | Schema, the 30 tracked events, profile feature vector, club health index, consent tiers |
| 04 | [Quant engine](04-quant-engine.md) | Jane Street ideas that port, the signal catalog, three worked chains |
| 05 | [Workspace](05-workspace.md) | Object model, templates, calendars, coffee chats, applications |
| 06 | [Design system](06-design-system.md) | Anti-slop diagnosis, computed color ramps, type scale, twenty never-dos |
| 07 | [Economics](07-economics.md) | Campus money map, monetization sequence, legal structure |
| 08 | [Chat and community](08-chat-and-community.md) | Channel model, notifications, feed, discovery, growth loops |
| **09** | **[The Record](09-the-record.md)** | **The spine. What gets recorded, provenance, ownership, what "free" means in writing, why every revenue line depends on it.** |
| 10 | [Talent verification market](10-talent-verification-market.md) | Quant firms, prestige fellowships, VC scouts as premium buyers of the same record |
| 11 | [The cross-club graph](11-cross-club-graph.md) | The math of seeing a person across every club they're in, and why it's not a dossier |
| **12** | **[CEC field evidence](12-cec-field-evidence.md)** | **What a real club's chats actually show. The only primary operator evidence in the repo.** |
| **13** | **[Problem to solution map](13-problem-solution-map.md)** | **Every observed failure, the specific fix, and the build order. Start here to build.** |
| **14** | **[Quant engine per feature](14-quant-per-feature.md)** | **The math under each tool: max-flow scheduling, hierarchical attendance, newsvendor food, Rasch reliability, succession risk.** |
| **15** | **[Behavioral quant layer](15-behavioral-quant-layer.md)** | **Turning operational activity into tested predictive signal. Opportunity adjustment, signal registry, and why the factor zoo waits.** |
| 16 | [Quant review](16-quant-review.md) | Adversarial review of the math (pending) |
| **17** | **[Two-layer intelligence](17-two-layer-intelligence.md)** | **Why club-level and person-level are one model, what differs, and where the real value sits (the interaction).** |

**Read 09 first.** The other eight documents are interfaces to it.

---

## The twelve things that matter most

**1. The window is open right now.** GroupMe announced on 17 August 2026 that it is killing SMS mode, which was the entire structural reason it beat Discord and Slack on campus. It is going away mid-semester. Fall 2026 is the switching window and it will not repeat.

**2. The incumbent collapsed.** Anthology filed Chapter 11 in September 2025 and Engage sold to Encoura for $50M in February 2026. Contracts across 2026 to 2028 are in play.

**2b. Clubs are institutions that lose their memory every year.** A dean can answer what happened, who decided it, and when, going back decades. A club cannot answer any of it past last May. The product is institutional-grade record keeping for organizations that have never had it, free, owned by them. Every revenue line is downstream of that record being real.

**3. Four pains are one object.** Fragmented rosters, officer transition data loss, reimbursement latency, and the treasurer's personal Venmo are the same problem seen from four seats: **there is no org-owned, transferable container for roster, money, and records.** That container is the product.

**4. Every club is one graduation from extinction, and it is vendor-documented.** Deleting a graduate's school account puts their files on a 20-day fuse, and transferring a folder transfers only the folder, not the files inside. The standard handoff gesture provably fails.

**5. The reachable money is member-to-club, not university-to-club.** About $3.5M of routable volume per 20,000-student campus. Underwrite at $14 per user per year, not $200. Payments alone is $50K to $150K per campus, which is real but not a company.

**5b. The median club gets about $2,250 a year, and roughly half of every requested dollar is funded.** From Virginia Tech's statutory per-org disclosure: 267 orgs, $1.64M, median $2,246, minimum $15, maximum $308,969. Build for the median, survive the tail. Florida is the outlier, where statute puts the entire fee in student hands and produces $23M and $21M pools at Florida and South Florida.

**6. Give each club its own tax ID.** It keeps the payment tax form off a 19-year-old's Social Security number, makes the club the legal recipient of funds, unlocks restaurant fundraisers, and is the prerequisite for cards.

**6b. There is now a real legal precedent for the political-org risk, not a hypothetical.** In July 2025 the EEOC subpoenaed Penn for a list of every Jewish and Jewish-affiliated campus organization and their member rosters, and a court ordered compliance in March 2026. That is a federal agency compelling exactly the kind of organization-and-roster data this product stores. Political and identity-based orgs get a separate tier: structural facts only, no content, minimal retention, identical terms published as policy.

**7. The fastest path to volume is not a campus, it is a national organization.** A national with campus chapters buys a license to see and run its whole network: chapter health, rosters, officer turnover, dues, compliance, and which chapters are about to die. Priced per chapter at the $600–850/year the market already pays, a 300-chapter national is a $180K–255K contract, and one signature installs hundreds of campuses. It is the cleanest revenue line in the model: real buyer, real budget, no ad load, and no privacy tension, because a national is entitled to know its own membership. The pitch is chapter mortality, since nationals lose chapters every year to officer turnover and find out months late.

**7c. Universities are not a customer.** No dashboards, no procurement, no institutional funding. It costs us a defensive moat and buys us speed, legal cleanliness, and the ability to answer to students rather than administrators.

**7b. The moat is statistical, not a network effect.** A hierarchical model that pools across club, category, and campus means campus two launches using campus one's posteriors as its prior. Every campus makes the next campus's cold start better. It is also the cold-start solution itself, since a brand-new club automatically inherits its category's prior.

**8. The campus version of "inbound flights" is not flights.** It is the academic calendar, a competing-events feed, and a class-schedule heatmap from public course APIs. Three free, high-frequency, universally available signals that essentially nobody in campus software uses. Ship check-ins, curate 200 academic calendars, wire up the events API. That beats every paid vendor combined.

**9. Do not build the TikTok ranker first.** Reverse-chronological with light boosts, because heavy ranking hurts small communities. Revisit machine-learned ranking above 100 items per day per user. The full architecture is the destination, not the start.

**10. The design tells have moved.** Escaping Inter by adopting Geist is the same tell one hop later. The color ramps in doc 06 were computed with real gamut and contrast math, which forced actual corrections: white on the accent solid fails, and input borders must be a darker step than intuition suggests.

**11. The engine computes ten thousand numbers and the interface shows one.** A member sees three things this week. A president sees a predicted attendance and why. Nobody sees a terminal. All forecasting sits behind one control that is off by default.

**11c. The cross-club position is not a dossier, it is a natural experiment.** We see the same person in several clubs and several people in the same club at once, which is a fully crossed design. That lets a single model separate a person's general reliability from a club's demandingness from the fit between them, statistically. The dossier reading of "we see everything" is not just riskier, it is the weaker analysis. See `11-cross-club-graph.md`.

**11b. The flights-to-pizza hypothesis was checked honestly, not flattered.** The shape is supported by fifteen years of tourism nowcasting, and the mechanism is already a real product. But arrivals-to-covers at a specific venue has no published study, and visitors are a small minority of covers in most metros. **Lead with lead time, not accuracy.** Bookings happen weeks ahead, which is where staffing and purchasing decisions live. Related: the Walmart Pop-Tarts story is a single 2004 quote with no baseline or replication. Cite it as narrative, never as a result.

**12. Never sell student data.** Sell verified attention and consented signal. Keep university-sourced data in a separate tenant with no employer or ad surfaces. That one boundary is what keeps the two businesses from poisoning each other.

---

## Open questions for you

1. **Which campus is campus one?** Everything in the go-to-market plan assumes a founding campus where you have real standing. Worth noting that Florida schools have student-allocated pools ten times a typical campus, which makes the budget-request pain far more acute there.
2. **Beachhead segment.** Research recommends STEM competition teams and hackathon organizers, because pain is acute, no vendor owns the slot, and the sponsor-plus-ledger-plus-handoff pattern generalizes. Worth confirming against where you actually have relationships.
3. **Do we run the Greek national headquarters track in parallel from the start?** It is the highest-leverage finding and it needs a different kind of selling.
4. **Brand voice** is the one section with no verified audience research behind it. Worth a dedicated pass before it is locked.

---

## What is not done yet

No code. No wireframes. No financial model spreadsheet. No pitch deck. The research and specification layer is complete enough to start any of those.
