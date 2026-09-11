# Club OS — Strategy

*Draft v0.1. Sources: `/research/01` through `/research/21`.*

---

## 1. The one-sentence thesis

**Clubs are institutions that lose their memory every year. We keep the record — who did what, when, under what decision, at what cost — free, and it belongs to them. Everything we sell is downstream of that record being real.**

See [09-the-record.md](09-the-record.md) for the full articulation. It is the spine; the rest of these documents are interfaces to it.

Positioning line: **the operating system clubs choose, not the portal the university assigns.**

---

## 2. Why now

Four things changed at once.

| Change | Evidence |
|---|---|
| The incumbent collapsed | Anthology filed Chapter 11 on 29 Sept 2025 with $1.7B debt on $450M revenue. Its whole student-engagement line sold to Encoura for $50M on 2 Feb 2026. Renewals across 2026–28 are in play. |
| The category consolidated into PE and stopped shipping | CampusGroups to Ready Education/Level Equity, Presence to Modern Campus, Symplicity to Constellation (Feb 2026). App-store reviews cluster at 1 star. |
| The student-side incumbent is unowned | GroupMe is a neglected Microsoft property. Slack's free tier caps history at 90 days. Discord intimidates non-technical clubs. Nobody owns the roster. |
| Nobody banks college clubs | Hack Club Bank narrowed to teen-led (13–18) orgs. College clubs have no compliant money product at all. |

---

## 3. The problem, in numbers

These are the claims that go in the deck. Every one has a source in `/research/13`.

- **36%** of US undergraduates have never joined a single campus activity. 64% at community colleges, 55% for students working 30+ hours, 49% for first-generation students.
- Students who stopped out were **nearly twice as likely** to have been uninvolved (60% vs 35%).
- Org membership or leadership was associated with **14-point higher** fall-to-fall retention at IU Indianapolis.
- **"Every RSO is one generation away from extinction."** — University of Nebraska–Lincoln, on 12-month officer turnover.
- The attendance curve: **80 people at the first meeting, 15 by week six.**
- **32%** of enrolled students considered leaving in the past six months. Only **36%** are flourishing.
- **87%** of faculty advisors received no training.
- Club embezzlement cases run from **$764** (ECU, via Cash App, 2026) to **$130,000** (Harvard). A Harvard dean on club finances: "we don't monitor finances."
- Penn's activity budget is frozen at **$3M** while funded clubs doubled. USF cut **350+ orgs by 50%** in one semester. ASU's **$945K** pool ran dry two years running.
- Minnesota left **~$240K of a $1.2M** pool unspent, largely because clubs cannot get reimbursed in time.

---

## 4. The top pain points, ranked

From `/research/12`, scored on frequency × intensity × software-solvability.

| # | Pain | Who feels it |
|---|---|---|
| 1 | Roster fragmented across GroupMe, Forms, and the portal. Nothing is authoritative. | Everyone |
| 2 | Officer transition is total data loss: Drive, Venmo, logins, sponsor list. | President, Treasurer, Advisor |
| 3 | Reimbursement latency of 3 weeks to 6 months; rejected receipts. | Treasurer, members who front cash |
| 4 | Personal Venmo is the club bank. Banned by many schools, with no alternative offered. | Treasurer |
| 5 | Communication scattered across five platforms; nobody reads any of them. | Everyone |
| 6 | The 200 → 80 → 15 recruitment funnel with no follow-up tooling. | VP Membership |
| 7 | RSVP is not attendance. No check-in that writes back to the roster. | Events chair |
| 8 | The compliance calendar is invisible until a deadline is missed. | President, Secretary |
| 9 | SGA budget requests denied on technicalities, with 40-day lead times. | Treasurer |
| 10 | The president does everything, then burns out and quits. | President |

**Items 1 through 4 are one object seen from four seats: an org-owned, transferable container for roster, money, and records.** That object is the product.

---

## 5. What we are building

### The Canvas mental model, collapsed

Canvas won on a uniform mental model: one space type, an identical tool palette in every space, and one global dashboard that aggregates across them. Students already have thousands of hours of muscle memory in that layout. We borrow the model and cut the nav from Canvas's fifteen items to six.

**Club space nav:** Home · Events · Workspace · People · Money · Settings

**Global surfaces:** Dashboard (this week across all my clubs) · Discover (feed) · Chat · Profile

### The four layers

1. **System of record.** Roster, positions with dated terms, membership as a stateful enrollment (`invited → active → alumni`), attendance, ledger, documents. Org-owned, never person-owned. Survives graduation.
2. **Workflow.** Events with RSVP and QR check-in that writes back to the roster. Projects, tasks, and committees. Applications and forms. Elections and one-click officer handoff. Calendar sync in both directions.
3. **Network.** Chat scoped to org structure. A ranked discovery feed. Student profiles with a verified involvement record. Coffee chats and alumni.
4. **Engine.** A quant layer that forecasts attendance, scores club health, flags succession risk and financial anomalies, ranks the feed, and prices the ad and sponsorship market.

The first two layers are the product people adopt. The third makes it a network. The fourth is the business and the moat.

---

## 6. Business model

**Free for students and clubs, forever, with no ad load inside the working surfaces.** Revenue comes from the money and attention that already move around clubs.

Sequence matters. From `/research/03`, `/research/04`, `/research/05`, `/research/19`.

| Order | Line | Why this order |
|---|---|---|
| 1 | **Payments.** Dues, tickets, merch, reimbursements on Stripe Connect. | It is the utility that drives adoption, it produces GMV data investors trust, and universities ban the alternative. |
| 2 | **Sponsorship marketplace.** Brands and employers pay clubs directly; we take 10–15%. | It makes clubs *richer*, needs no profiling, and gives sales a warm intro to every local business clubs already work with. |
| 3 | **Employer product.** Verified, opt-in talent pools defined by club, role, and evidence. $6k / $24k / $60–120k tiers. | Handshake abandoned campus depth. Verification is a thing nobody else can sell. |
| 4 | **Ads.** Sponsored events and perks, sold direct, school and club-category targeted. | Only after density. Ad load capped at 1 in 8 feed items, zero in chat, rosters, payments. |

Running alongside all four, on its own track: **national organization licensing.** A national with campus chapters buys a license to see and operate its whole network, priced per chapter at the $600–850/year the market already pays. A 300-chapter national is a $180K–255K contract, and one signature installs the product across hundreds of campuses. It is the cleanest line we have: a real buyer with a real budget, no ad load, and no privacy tension, because a national is entitled to know its own membership.

**Universities are not a customer.** No dashboards, no procurement, no institutional funding. See `07-economics.md` §10.

Target ARPU: **$3–6 in years one and two, $10–15 at maturity.** That is Nextdoor-to-Pinterest territory, at roughly a quarter of Instagram's ad load.

---

## 7. Go to market

**Do not sell to Student Affairs first.** Five-year, enrollment-priced contracts are precisely why every incumbent became slow admin software.

| Phase | When | Goal |
|---|---|---|
| One campus to density | Fall 2026 | 30% of registered orgs, 20% of undergrads by Thanksgiving |
| Ship officer handoff | Spring 2027, before March elections | The retention test. Track handoff completion rate as the north-star metric. |
| 5–10 campuses | Fall 2027, launched in one six-week window | Big Ten / ACC flagships and Greek-heavy privates, chosen for club density and peer adjacency |
| Employer and advertiser pilots | Spring 2028 | First verified-targeting revenue |
| 50+ campuses | Fall 2028 | Self-serve ad beta |

**Concentrate 80% of growth spend into two windows:** late August to mid September, and the first three weeks of January. Nothing else in the year moves the curve.

**Beachhead segment:** STEM competition teams and hackathon organizers. Pain is acute and money-shaped, no vendor owns the slot, users are builders reachable through MLH, SAE, and society mailing lists, and the sponsor-CRM plus ledger plus handoff generalizes to business, cultural, media, and MBA clubs. Cultural orgs are the fast follow.

---

## 8. Principles

1. **Own the roster, not the chat.** Chat is table stakes and we will build it well, but the directory of membership and roles is the asset that compounds year over year.
2. **Make graduation a feature.** Alumni status is automatic. Alumni keep read access, mentor, recruit, and give. This is the seed of a network Hivebrite charges five and six figures to reconstruct.
3. **Design for a 12-month tenure.** Onboarding under ten minutes, no training webinar. Every incumbent's reviews praise customer support because the product needs it.
4. **Stay non-anonymous and roster-scoped.** Yik Yak burned $73M. Sidechat and Fizz got network-blocked by the UNC system. Real identity is both a safety moat and the reason a university tolerates us without a contract.
5. **Never sell student data.** Sell verified attention and consented signal. Investors will diligence this hard after Frank.
6. **Prefer a template over a feature.** When a club asks for something, first ask whether it is a template of existing primitives. This is the scope valve that keeps the product simple.
7. **No feature that requires someone to maintain it.** Anything that decays without an owner will decay, because the owner graduates.
