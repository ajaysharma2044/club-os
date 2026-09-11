# Club OS — Economics and Monetization

*Draft v0.5. Full research in `/research/19-economic-capture.md`.*

---

## 1. The thesis was right, but inverted

The instinct that clubs sit on enormous economic activity is correct. The part that needs correcting is **which pool is reachable.**

The visible pool is the least capturable. Ohio State's $4.6M activity fee yields only about $650K that actually reaches orgs. Penn State flatly prohibits external club bank accounts. SGA money is reimbursement-based and university-held, and we will never touch a dollar of it.

**The capturable pool is member-to-club money the university never sees.** Dues, tickets, merch, trip payments, sponsorship, catering. Roughly **$8 to $12 million per 20,000-student campus**, today running through personal Venmo accounts.

So the SGA budget-request tooling stays in the product, but as a **retention feature, not a revenue line.** It is why the treasurer adopts. The money comes from elsewhere.

---

## 2. The campus money map

One campus, 20,000 students, about 500 registered orgs, roughly 20% Greek participation. Base case.

| Flow | Annual $ on campus | Capturable | Our mechanism | Our take |
|---|---|---|---|---|
| Student activity fee pool | $3.0–5.0M | No, university-held | — | $0 |
| SGA allocations | $800K–4.0M | No, reimbursement-based | Budget-request tooling, for retention | $0 |
| Greek dues excluding housing | $4.0–8.0M | Partly | Recurring dues billing | $22,000 |
| Non-Greek club and sport dues | $400–700K | Yes | Same | $8,000 |
| Event tickets | $1.0–1.5M | **Strongly** | Ticketing at 3.5% + $0.99 | $28,000 |
| Club merch | $1.0–1.3M | Partly | Print-on-demand referral | $22,000 |
| Food and catering | $1.5–2.5M | Supply side | Group-ordering commission | $30,000 |
| Travel and formals | $500–800K collected | Yes | Trip collections | $6,000 |
| Club sponsorship | $350–600K | **Strongly** | Marketplace at 15% | $30,000 |
| Employer recruiting at clubs | $600K–1.2M | Yes | Club Pipelines subscription | $35,000 |
| Local business ad spend | $500K–2.4M | **Strongly** | Self-serve and direct local ads | $30,000 |
| Student housing leasing marketing | $2.6–6.5M | **Strongly** | Seasonal placements, group-lease intent | $15,000 |
| National brand student acquisition | $200–500K | Yes | Verified-student affiliate | $20,000 |
| Alumni giving to orgs | $320K | Partly | Peer-to-peer campaigns | $4,000 |
| Club card spend | $1.5–2.5M | **Strongly** | Issuing interchange | $18,000 |
| **National org licensing** | see §8b | **Yes** | Per-chapter license to the national | **not per-campus; see below** |
| **Total activity touched** | **$28–50M** | | | **$268,000** |

**Routable GMV is about $3.5M.** Our take is roughly 8% of that. **ARPU lands at $14.15.**

Three cases: **$87K conservative, $295K base, $760K aggressive** per large campus. That is $4, $15, and $38 ARPU, bracketing Nextdoor's $11.94.

---

## 2b. What clubs actually get, from the one campus that publishes every number

Virginia Tech is required by statute to disclose **every organization's allocation by name**. It is the single best dataset located in this research, and it should anchor any model of club budgets.

**2024–25: 267 organizations, $1,637,393 allocated.**

| Statistic | Value |
|---|---|
| Mean allocation | $6,133 |
| **Median allocation** | **$2,246** |
| Minimum | $15 |
| Maximum | $308,969 |

| Band | Orgs |
|---|---|
| Under $500 | 45 |
| $500–1,000 | 24 |
| **$1,000–2,500** | **72** |
| $2,500–5,000 | 64 |
| $5,000–10,000 | 41 |
| $10,000–25,000 | 12 |
| $25,000+ | 9 |

**The shape is what matters.** It is a long tail. About a quarter of orgs receive under $1,000, the median club gets around $2,250, and a handful of large chartered organizations absorb an enormous share. The single largest allocation was 19% of every dollar distributed.

**Design consequence:** the product must work for a club with $15 and for a club with $300,000, and the default experience should assume the median, which is roughly $2,000 a year.

### Caps and fund rates, which govern the budget-request tool

| Campus | Rule |
|---|---|
| Ohio State | Up to $500 operating, plus up to $3,000 or $4,500 for special programs. Registered orgs also get a $250 prepaid line of credit. |
| Illinois | Hard cap $5,000 per org per year, $5,000 per application, and **$999.99 per single line item** |
| Rutgers | Orgs may apply for four programs but are funded for at most two. When requests exceed the pot, an **across-the-board percentage cut** is applied. |
| Florida | Transfers over $1,500 per semester must go to the Senate |
| Lafayette | Aggregate **fund rate of 49.8%**: $391,712 allocated against $786,101 requested |

**Roughly half of every requested dollar is funded.** That is the number the budget-request generator exists to improve, and it is the promise that gets a treasurer to adopt.

### Florida is the outlier, and it changes campus selection

In most states, $20 to $80 per student per year actually reaches student-organization grant-making. Penn State's grant committee is $54.33 per student, Wisconsin's allocable fee is $70.06, North Carolina's student-organizations line is $49, Michigan's is around $15, Indiana's is about $5.

**Florida allocates the entire activity and service fee by statute**, at $300 to $570 per student per year, producing:

| Campus | Student-allocated pool |
|---|---|
| University of Florida | **$23,425,197** |
| University of South Florida | **~$21,000,000** |
| UCLA (a non-Florida comparison) | ~$10,000,000 |
| University of Chicago | $2,100,000 |

Those Florida pools are an order of magnitude larger than a typical campus, they are allocated by students rather than administrators, and the process is a documented annual grind.

**This is worth weighing in choosing campus one.** It does not change the conclusion that we cannot take a percentage of that money. It does change how acute the budget-request pain is, and therefore how fast a treasurer adopts.

---

## 3. The hardest number in the model

**Payments alone yields $50,000 to $150,000 per large campus, and that is not a company.**

A club runs about $7,000 a year of volume. The average Toast restaurant runs $1.3 million. That is a 185× difference, and it means the Toast playbook of free software funded by payment processing **does not work at club scale on its own.**

Ads, employer subscriptions, food commissions, and card interchange have to carry roughly half the model. Anyone underwriting this as a pure payments business is going to be disappointed.

Two of those lines are the best take rates in the whole map precisely because **neither shows a fee to a student**: food commissions paid by the merchant, and card interchange paid by the network.

---

## 4. Monetization sequence

| Phase | Timing | What ships | At 1 campus | At 50 campuses |
|---|---|---|---|---|
| **0. Free, no money** | Months 0–9 | Roster, events, officer transition, manual ledger, SGA request generator, deadline tracker, reimbursement with dual approval | $0 | $0 |
| **1. Pay links** | Months 9–18 | Stripe Connect Express, club-owned accounts, dues and tickets and trip collections, ACH default above $60, EIN wizard | $15–40K | $0.8–2M |
| **2. Local demand** | Months 15–24 | Sponsored events and perks at flat weekly rates, food commission from campus-adjacent merchants | $30–70K | $1.5–3.5M |
| **3. Employers** | Months 18–30 | Club Pipelines at $6K / $24K / $60–120K, plus 15% on sponsorship deals | $50–90K | $2.5–4.5M |
| **4. The card** | Months 24–36 | Issuing cards, receipt capture, per-committee limits, advisor visibility | $15–40K | $0.8–2M |
| **5. Affiliate** | Months 30–42 | Verified-student discount marketplace | $10–25K | $0.5–1.2M |
| **6. Treasury** | Year 4+, conditional | Only if a large cohort sustains >$5K/yr each and a licensed partner is contracted | — | — |

### Four sequencing rules

1. **Earn the system of record before touching money.** The ledger is the wedge. Treasurers adopt for the budget-request generator, not for payments.
2. **Never charge a student more than the incumbent.** Every price above undercuts Cheddar Up, Eventbrite, or Venmo-plus-hassle. **Eventbrite takes about 24% on a $10 ticket**, which is why ticketing is the easiest first dollar in the entire product.
3. **Ads before employers before cards.** Ads have no regulatory surface. Employers need the graph to exist. Cards need the entity problem solved.
4. **Two product modes from day one.** Full payment rail on campuses that permit external accounts. **Ledger-only mode** on campuses like Penn State that prohibit them. Ledger-only mode exists to keep clubs compliant, not to be sold.

5. **Universities are not a customer.** We do not sell them dashboards and we do not seek their funding. This is a deliberate strategic choice, and section 10 covers what it costs us and what it buys.

---

## 5. The single most important product decision on the money side

**Give each club its own Employer Identification Number.**

Build a ten-minute in-product wizard that files the IRS form to obtain a free EIN for the club as an unincorporated association, then onboard the Stripe connected account as a company with the treasurer as representative.

This one decision cascades:

- The **1099-K never lands on a 19-year-old's Social Security number.** That matters enormously in states where the threshold is $600 to $1,000.
- The club, not the student, becomes the legal recipient of funds.
- It unlocks restaurant fundraiser programs. Chipotle explicitly requires a federal tax ID and will not write checks to individuals.
- It is the prerequisite for cards and treasury later.

**Be honest about tax status.** A default club is a taxable unincorporated association or a social club, **not** a charity. The product must hard-block a club from issuing a tax receipt or using the word "deductible" unless a real charitable entity is in the chain. Route donors who need receipts to the university foundation, and take credit with the university for doing so.

---

## 6. Legal structure

**Three layers, adopted in order. Never skip.**

**Layer 1, at launch.** Stripe Connect Express, each club a connected account, Stripe as processor of record handling identity verification, us taking an application fee. The terms of service must contain an explicit **agent-of-payee appointment**: the club appoints us as its limited agent, and a member's payment to us discharges their obligation to the club. That is the language that keeps us outside state money transmission licensing. Settle only over card networks and ACH, never by any other means, to preserve the payment-processor exemption. **Never custody funds.** Payouts go directly from Stripe to the club.

**Layer 2, years two to three.** For the minority of orgs that genuinely need deductible donations or grants, **contract with an existing charitable fiscal sponsor rather than becoming one.** Use a pre-approved grant relationship structure, where the project stays legally separate and the sponsor re-grants, because the comprehensive model makes the project's people into the sponsor's own.

**Layer 3, year four and only if the data demands it.** A separate, independently governed charitable entity with its own board, twelve months of reserves, and a fee no lower than 6 to 8%.

### The failure we are insuring against, stated precisely

Open Collective Foundation **stranded 600 projects and $18 million with nine months' notice.** The tell in the post-mortem is that it announced a separate, earlier deadline for ending *employment* than for ending *spending*. Employment was the unsustainable part.

Hack Club Bank survives at **7%**. Anything at or below 5% for comprehensive sponsorship of small, high-touch groups is how you die.

**Do not build a fiscal sponsor.**

---

## 7. What to tell a university general counsel

> Club money is already leaving your control. It is in students' personal Venmo accounts, which is exactly where the $200,000 Purdue embezzlement and the $30,000 Harvard case happened. We are not creating a shadow banking system. We are giving each organization its own tax ID, its own processor account, dual-approval controls, an immutable audit trail, and read-only advisor visibility. On campuses where external accounts are prohibited, we run in ledger-only mode and give you better visibility than you have today, for free.

**Risk reduction, not disintermediation.** That is the only version of this pitch that survives contact with a restrictive policy.

---

## 8. The finding nobody is acting on

**Roughly 40 to 50% of every Greek member's dues is a pass-through to national headquarters.** Chapter treasurers collect it locally and remit it upward on a schedule, under threat of chapter suspension.

750,000 undergraduate members times $400 to $800 a year of national pass-through is **$300 to $600 million a year moving from chapters to headquarters.**

Those headquarters are large and sophisticated. One national's group tax return alone reports $79.5 million. They have a direct financial interest in chapters collecting dues on time and in having visibility into chapter finances, which is precisely what this product generates.

**This is a business-to-business-to-consumer distribution channel nobody is using.** Selling a national fraternity or sorority headquarters a chapter-finance product that automatically remits the national portion, reports arrears, and gives headquarters a dashboard would **install the platform at 200 to 400 chapters in a single contract**, with the dues volume already attached.

It is far faster than campus-by-campus adoption, and it **sidesteps the university-prohibition problem entirely**, because Greek chapters are legally independent of the university and already bank externally.

Recommend running this as a parallel track from Phase 1.

---

## 8b. National organization licensing — the cleanest line in the model

A national organization with campus chapters buys a **license to see and operate its entire chapter network.** College Democrats, a professional society, an honor society, a service organization, a Greek national. They are the customer; their chapters are the users.

### The specific first targets, now named

Professional societies split sharply by fit. IEEE and ACM are enormous, $714 million and $88 million in annual revenue respectively, but their student-chapter function is a small technical sliver of a much larger publishing and standards business. Chapter tooling would be a rounding error to them and the sales cycle would be long.

**SHPE, NSBE, and SWE are the better fit, because for them the chapter network is the organization**, not a side program. SHPE already tracks "active chapters" defined as ten-plus members as an internal metric, which means they already feel the exact pain this product solves and would recognize the pitch immediately. NSBE runs the same profile at larger scale, $24.6 million in revenue across 600-plus chapters in three tiers. SWE's revenue is heavily corporate-sponsor-funded, which means chapter visibility helps them sell sponsors on reach into chapters, a second-order revenue argument beyond internal operations.

**Alpha Phi Omega is the best non-professional-society target**, a clean, standalone national filer with 786 chapters and a real per-chapter administrative burden of service-hour tracking, elections, and insurance. It is a good proof point that the pitch generalizes beyond professional societies.

**Honor societies are a weaker fit than assumed.** Golden Key, the National Society of Collegiate Scholars, Tau Beta Pi, and Phi Kappa Phi all run on one-time induction fees rather than recurring dues, which means their national office does not carry the ongoing chapter-financial-administration pain this product is built around. Their real pain is eligibility verification at induction, a different product entirely.

### Why this is structurally the best revenue we have

| Property | Every other line | National licensing |
|---|---|---|
| Buyer | Diffuse, many small | One org, named buyer, real budget |
| Privacy tension | Real, must be designed around | **None.** A national already has a governance relationship with its own chapters and is entitled to know its own membership. |
| Ad load | Must be managed | Zero |
| Sales motion | Many small deals | One contract |
| Distribution | Campus by campus | **One signature installs hundreds of chapters** |
| What we sell | Attention, access, or a take rate | Ordinary business software |

**It is the only line where the product we sell is the exact by-product of clubs using the product normally.**

### What the national gets

- **Chapter health across the whole network**, with the peer-normalized index and the succession-risk flag. Which chapters are thriving, which are coasting, which are about to die.
- **Roster and membership compliance**, current rather than reconstructed from forms in April.
- **Officer records with dated terms**, so the national always knows who is actually in charge of each chapter and when that changes.
- **Dues remittance**, automated where the national collects a pass-through, with arrears reporting.
- **Compliance and risk reporting**: required trainings, hazing-related reporting obligations, incident records.
- **Officer transition**, which is the mechanism by which chapters die and the thing the national cannot currently influence.
- **Benchmarking**: how each chapter compares to peer chapters in its own network.

### The pitch is chapter mortality

Nationals lose chapters every year, almost always for the same reason: the officers graduated and nobody picked it up. Rechartering a dead chapter costs far more than keeping a live one alive, and the national usually finds out months after the fact.

**We see it coming, and we can say so.** That is the sentence the whole SKU rests on.

### Pricing

Per-chapter licensing is the established norm and the market has already accepted the price. Greek nationals pay roughly **$600 to $850 per chapter per year** for narrower tooling today.

| National size | Chapters | Annual contract at $600–850/chapter |
|---|---|---|
| Small | 50–100 | $30K–85K |
| Mid | 100–500 | $60K–425K |
| Large | 500+ | $300K+ |

A 300-chapter national lands around **$180,000 to $255,000 a year**, which is six to eight times our largest employer contract, from a single sale.

Chapters continue to use everything free. The national pays for the network view.

### Category differences that change the sale

| Category | Money flows | Implication |
|---|---|---|
| Greek social | Up, as dues pass-through | Largest dollars, but incumbents exist |
| Professional and technical societies | Often **down**, as grants to chapters | Sale is compliance and chapter health, not payments |
| Honor societies | One-time induction fees | Sale is roster integrity and induction management |
| Service and civic | Charters and conventions | Sale is chapter mortality and reporting |
| Religious | Mixed, see below | Real budget varies enormously by org |
| Political and advocacy | Varies | Real, but see the neutrality posture below |

### The religious category is not one category, and this matters for who to approach

Prior research assumed religious organizations are a uniformly easy sale because they have paid campus staff. Direct research into five major national religious organizations found the opposite: **most of them do not employ their campus staff at all.**

| Organization | US chapters | Revenue | Funding model |
|---|---|---|---|
| InterVarsity Christian Fellowship | 1,121 chapters, 772 campuses | **$104M** (FY2020) | Staff are true employees, but must personally raise their own full salary from donors |
| Hillel International | 800 campuses | **$73M** (FY2025) | Hybrid. Local Hillels are independently incorporated nonprofits; national gives grants to help them hire, but does not employ local staff |
| Chabad on Campus | 376 full-time houses, 958 campuses | **$22M** (FY2025) | Fully decentralized. Each Chabad House is an independent nonprofit; national seeds new locations, then expects local self-sufficiency |
| Cru (Campus Crusade) | ~2,115 campus ministries | Not disclosed, exempt from tax filing | Classic missionary support-raising: staff personally fundraise their entire budget |
| Muslim Students Association National | 200-plus chapters | Unverified | Entirely student and volunteer run, no paid staff found |

**Only InterVarsity and Hillel have anything resembling a national budget line for chapter operations.** Cru and Chabad staff are financially independent operators who raised their own money, which makes the national office a governance body rather than a funder, and changes the sales conversation from "the national pays for its chapters" to "the national pays to keep its decentralized network from losing track of itself." That second pitch is still real. It is a different pitch.

### The incumbent software market is already consolidating into two clusters

This matters because it shows the market has already accepted "national buys, chapters use" as a normal software motion, and it shows where the openings are.

**Cluster one, Greek-life finance and CRM:** re:Members, formed from Billhighway acquiring ChapterSpot in 2024, backed by private equity, priced per member. OmegaFi is the older incumbent, visibly losing chapters to re:Members.

**Cluster two, Salesforce-based professional and trade association management:** Nimble AMS, starting around $160 per user per month, and Fonteva, both now under the same private-equity ownership after a 2024 acquisition.

**Neither cluster serves religious national organizations at all**, and neither serves service organizations or honor societies. That is open ground, and it is exactly where the earlier-stated pitch about chapter mortality has no incumbent to argue against.

### Neutrality posture, decided in advance, now with a real precedent behind it

Serving political organizations is legitimate and we should do it. But there is now a specific, current legal case that makes this concrete rather than theoretical.

**In July 2025 the EEOC subpoenaed the University of Pennsylvania for a list of every Jewish and Jewish-affiliated campus organization and their member rosters. A district court ordered compliance in March 2026.** That is a federal agency successfully compelling disclosure of exactly the kind of organization-and-roster data this product stores, for exactly the kind of identity-and-political-adjacent group we would serve. It is not a hypothetical. It has already happened, to a real university, with a real court order.

Separately, **Southworth v. Board of Regents** requires a public university to administer student activity fee money in a **viewpoint-neutral** manner. Any product that touches university-connected resource allocation for political organizations, including a "chapter health score" that could read as an official judgment, has to be neutral in design or a university relying on it inherits Southworth liability.

Four rules follow directly:

1. **Store only structural facts for political and identity-based orgs: roster count, officer terms, dues collected, meeting cadence. Never content, positions, or activity descriptions.** This is not a courtesy, it is what keeps a chapter-health metric from being read by a court as a viewpoint judgment.
2. **Identical terms for every political organization, across the spectrum, published as policy rather than practice.** No exceptions, no editorial judgment, no featuring any of them.
3. **Minimal retention and fast deletion, specifically for this tier.** Given the Penn precedent, consider not retaining individual member names for political orgs at all, only aggregate counts and officer roles rather than officer people.
4. **Treat political and identity-based orgs as a separate, higher-friction tier, not the default onboarding flow.** They are real customers. They should not be the customers the whole data model is designed around.

---

## 9. Eleven conclusions

1. The addressable money is member-to-club, not university-to-club. About $3.5M of routable volume per 20,000-student campus.
2. Payments alone yields $50–150K per large campus. Real, but not a company.
3. Ticketing is the best first dollar, because the incumbent charges about 24% on a $10 ticket.
4. Food commissions and card interchange are the two best take rates, because neither shows a fee to a student.
5. Student housing leasing is the largest unserved local ad budget on any campus, and clubs are the only way to target group-lease intent.
6. **The employer arbitrage is roughly 30×.** Handshake's median contract is $29,835 for a whole school. A club's gold sponsorship is $1,000 for a pre-qualified pool.
7. Get the club an EIN. Everything downstream depends on the club being an entity rather than a student.
8. Stripe Connect Express plus an agent-of-payee clause keeps us out of money transmission.
9. Do not build a fiscal sponsor. Partner with one at 7% or more, and never touch employment.
10. **Underwrite at $14 ARPU, not $200.** Base case is $275–295K per large campus.
11. The fastest path to payment volume is not a campus. It is a national Greek headquarters.


---

## 10. Universities are not a customer

**Decided.** We do not sell universities dashboards and we do not seek institutional funding.

### What this buys us

- **No procurement.** No five-year enrollment-priced contracts, which is precisely what turned every incumbent into slow admin software.
- **No FERPA school-official entanglement.** If a university never supplies us data and never contracts with us, the education-record regime does not attach to what students and clubs put in themselves. That keeps the employer product and the ad product legally clean.
- **No conflict of interest.** We answer to clubs and students. The moment a university pays, they expect visibility into student behavior, and we would be selling out the people whose trust the record depends on.
- **Speed.** Bottom-up adoption plus national contracts move in months. University sales move in years.

### What it costs us, honestly

We give up a defensive moat. A university under contract has a reason to protect us. Without one, we can be discouraged or blocked.

**How we compensate.** Prior research found that universities ban tools for one reason: anonymity plus harm. They tolerate identity-bound tools indefinitely. So we stay **non-anonymous, roster-scoped, officer-moderated**, and we reduce institutional risk rather than creating it.

The framing for any administrator who asks:

> Club money is already outside your control, sitting in students' personal payment apps, which is where the documented embezzlement cases happened. We give each organization its own tax ID, dual-approval controls, an audit trail, and read-only advisor visibility. On campuses that prohibit external accounts we run ledger-only. We are not asking you for anything.

**Risk reduction, and nothing to sign.** That is a much easier conversation than a sale.