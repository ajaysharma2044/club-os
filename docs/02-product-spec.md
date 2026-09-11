# Club OS — Product Specification

*Draft v0.1.*

---

## 1. Object model

Everything in the product is one of eleven objects. Every club-type difference is a **template**, not a feature. This is the scope valve.

| Object | What it is | Key fields |
|---|---|---|
| **Campus** | A school. The tenant boundary. | domain(s), academic calendar, SGA config |
| **Club** | The org. Permanent, never term-bound. | name, category, recognition status, advisor, parent (council) |
| **Person** | A student, alum, advisor, or employer contact. | identity, campus, cohort year, major |
| **Membership** | Person ↔ Club, stateful and bitemporal. | tier, status (`invited/active/alumni/inactive`), dues_paid, joined_via, valid range |
| **Position** | A role held from a date to a date. Bitemporal. | title, elected vs appointed, term start/end, attested_by |
| **Event** | Anything on a calendar with people attached. | time, venue, capacity, cost, budget line, required-form checklist |
| **Attendance** | Append-only. RSVP, check-in, no-show. | status, method (qr/nfc/manual), minutes_after_start |
| **Project** | A unit of work with an owner, a team, and artifacts. | status, team, due, artifacts, template type |
| **Task** | Assigned work with a due date. | assignee, due, status, parent project |
| **Thread** | A channel, topic, or DM. | scope (club/committee/event/cross-club/dm), visibility |
| **Ledger entry** | Double-entry. Append-only. | account, debit, credit, payee, approver, receipt |

Plus three that hang off Club: **Form** (and Application as a staged form), **Election**, **Sponsorship**.

**Design rules.**
- Position and Membership are **bitemporal** (valid time and recorded time). Officer handoff, alumni status, and "who was treasurer in spring 2027" all fall out of this for free.
- Attendance, messages, and the ledger are **append-only**. Never mutate; correct with a counter-entry.
- A Club is **never term-bound**. The Canvas pattern of organization sites that expire at fiscal year end is exactly what destroys institutional memory.

---

## 2. Roles and permissions

Adopt Canvas's architecture — base type plus named permission switches plus custom roles — with club nouns.

**Base types:** Owner (President) · Officer · Member · Advisor (read-only, linked) · Prospective/Guest · Alumni

**~20 named switches**, so a Treasurer can be granted exactly money plus roster:
post announcements · manage events · manage roster · invite members · manage money · approve spend · edit files · moderate discussion · manage applications · run elections · manage integrations · edit club profile · manage committees · view analytics · export data · manage sponsors · assign tasks · transfer ownership

**Committees** are sub-spaces inside a club with their own lead, budget sub-account, tasks, and thread. This is Canvas's Group Set feature, which is one of its best-designed and least-used parts.

---

## 3. Navigation

### Club space
`Home · Events · Workspace · People · Money · Settings`

Six items, opinionated and non-configurable in v1. Canvas's fifteen-item configurable nav is its single most-criticized surface, because every instructor sets it up differently and students lose their bearings.

### Global
- **Dashboard** — three lenses: cards per club, a cross-club agenda, an activity stream. Persistent "Up next" rail with events and tasks due. This is the screen students open ten times a day, so it gets built first.
- **Discover** — ranked feed of events, clubs, people, opportunities.
- **Chat** — all threads across all clubs.
- **Profile** — the student's own record.

Per-club color and nickname propagate into the global calendar. Trivial to build, disproportionately loved in Canvas.

---

## 4. Feature inventory

Tagged **M** must-have for v1 · **S** should-have · **L** later.

### Membership and roster
- **M** One roster with tiers, status, dues-paid flag, attendance history. Export to the university's roster format.
- **M** Membership as stateful enrollment. Automatic alumni transition on graduation.
- **M** Public "claim your club" page with a join link and `.edu` verification, so interest forms convert to roster entries automatically.
- **S** Points system. QR check-in. Committee assignment.
- **L** Co-curricular record export.

### Events
- **M** Event with RSVP, QR check-in that **writes back to the roster**, budget line, and a required-form checklist (room booked? risk form? waiver?).
- **M** ICS subscription per user and per club. Add-to-calendar links. Two-way Google Calendar sync.
- **S** Waiver e-sign, catering and vendor tracking, co-host sharing across orgs, fee-transparent ticketing.
- **L** 25Live/EMS room booking, travel rosters with per-person cap validation.

### Workspace (projects, tasks, docs)
- **M** Org-owned document vault that does not die with a `.edu` account. Vendor, sponsor, and alumni contact book.
- **M** Agenda and minutes tied to the org, searchable.
- **S** Projects with a team, tasks, due dates, and artifacts. Committee spaces with their own budget line.
- **S** Year-over-year event playbooks auto-built from past events and budgets.
- **L** Deep GitHub, Figma, Notion, Drive embeds.

### Money
- **M** Org-owned (not person-owned) payment link for dues, tickets, and donations. Roster updates automatically on payment.
- **M** Unified ledger: SGA allocation plus own funds, budget vs actual, **two-signer approvals**, receipt capture, reimbursement queue.
- **M** Budget-request generator that outputs the campus form's exact fields and tracks that campus's deadlines.
- **S** Sub-budgets per committee and event. Sponsor invoicing with W-9 and EIN on file. Forecasting.
- **L** Cards, banking, fiscal sponsorship, 990-N, sales tax.

### Communication
- **M** Announcement composer that fans out to in-app, email, push, and mirrors to GroupMe and Discord webhooks. Read receipts on must-reads.
- **M** Native chat: channels with topics, scoped to org structure (club, committee, e-board, event, cross-club, DM).
- **S** Segmented sends by tier or committee. LLM "catch me up" for new members.

### Recruitment and applications
- **M** Interest form → contact list → automatic follow-up nudges. Club-fair QR that captures name, email, and year.
- **S** Application pipeline with stages, reviewers, rubrics, blind review, interview scheduling, and decisions.
- **L** Campus-wide "common app" for clubs.

### Elections and transition
- **M** Positions with **dated terms**. One-click transition that reassigns ownership of every asset: payment link, docs, socials list, bank signer checklist.
- **M** Auto-generated transition document built from the year's actual activity.
- **S** Bylaws-compliant voting with secret ballot, quorum, archived results.

### Compliance
- **M** Per-campus deadline and requirement tracker: re-registration, trainings, audits, forms.
- **S** Post-event audit packet auto-assembled from receipts plus attendance plus budget.
- **L** Hazing and Title IX training records. Viewpoint-neutrality-ready allocation reports for SGAs.

---

## 5. Jobs to be done

The spec is correct only if each of these is true in one flow.

1. **President.** When it's Sunday night and I don't know what's due, who's doing what, or whether we have money, I want one screen that tells me, so I can lead instead of chase.
2. **Treasurer.** When a member fronts $200, I want to capture the receipt, get a second approval, and emit the university's form in one flow, so I can pay them back in days without touching my own bank account.
3. **Secretary.** When someone joins, attends, or pays, I want the roster to update itself, so I can produce registration, points, and attendance without re-typing.
4. **VP Membership.** When 200 people sign up at the fair, I want each of them nudged toward their first two events and tracked to "member," so I keep 60 instead of 15.
5. **Events chair.** When I create an event, I want RSVP, reminders, check-in, waivers, tickets, and attendance to exist automatically, so I plan for the people who actually come.
6. **Committee lead.** When I run a sub-project, I want my own budget line, team, tasks, and files inside the org, so I ship without becoming a shadow treasurer.
7. **Member.** When I've joined a few clubs, I want one place showing this week's events and whether my friends are going, so I show up without reading 400 messages.
8. **Freshman.** When I arrive on a campus with 1,000 clubs, I want to see which are open, which require applying, and where people like me went, so I find my people without being rejected in week one.
9. **Alumni.** When I graduate, I want a low-effort way to mentor, recruit, and give, so I keep the thing that mattered to me.
10. **Advisor.** When a student needs my approval, I want a link with context and a ten-second signature with a record, so I support the org without operating it.
11. **Student Activities staff.** When 1,000 orgs re-register, I want the data to already be true because students used the tool all year.

---

## 6. What we deliberately do not build in v1

- Elections with full bylaws compliance (v2)
- Room booking (needs an institutional contract)
- Co-curricular transcripts (until a university asks and pays)
- A gradebook analog of any kind
- Anonymous posting, ever
- A proprietary inbox students will not check
