# Club OS — Workspace, Projects, Calendars, Applications

*Draft v0.2.*

---

## 1. The reason this product exists, stated in one paragraph

When a student graduates and their `.edu` account is deleted, Google puts their files on a **20-day fuse**. Ownership transfer is domain-locked. And the detail nobody knows until it bites them: **transferring a folder transfers only the folder, not the files inside it.** The standard club handoff gesture, "I'll transfer you the Drive folder," provably does not work.

That is vendor-documented behavior, not a complaint. Every club's institutional memory is sitting on a timer owned by someone who is leaving.

**Club-owned storage from the first byte.** This is the constraint the entire architecture serves.

---

## 2. The object model

Eleven objects. Not twelve. Every feature request must map onto these or be refused.

| Object | What it is |
|---|---|
| **Club** | The tenant. Campus, type, term calendar, roles, constitution, computed bus factor |
| **Space** | A standing body that persists across years: E-Board, Marketing, Case Team A, Alumni. One lead, members, visibility, enabled tools. No end date. This is the Basecamp project page. |
| **Project** | A finite effort that ends and archives. Type, term, owners, append-only log, milestones, external links, outcome, postmortem, and a **required succession note** |
| **Task** | Exactly one assignee. Todo / Doing / Blocked / Done. Carries `origin`: manual, meeting, form, template, recurring |
| **Doc** | Rich text in a page tree, versioned, club-owned storage always |
| **Thread** | A message-board post with threaded comments. Durable, searchable, linkable. |
| **Event** | Calendar item with place, RSVP, attendance. RRULE plus EXDATE, bound to a term |
| **Meeting** | An Event with agenda, attendance, notes, decisions, and action items that become Tasks |
| **Form** | Versioned, immutable on publish. Serves interest forms, RSVPs, waivers, dues, feedback |
| **Application** | A Form wrapped in a cycle: stages, reviewer assignments, rubrics, interviews, decisions |
| **Person** | Member, alum, applicant, or guest. **One identity that survives graduation.** |

### The four relationships that carry the product

1. **Everything belongs to a Space or a Project.** No orphaned content, no "where does this go?" moment.
2. **Person is continuous across the graduation boundary.** A member becomes an alum without becoming a different record. This single decision is what makes the alumni graph, the coffee-chat network, and institutional memory possible. Every incumbent gets it wrong by modeling students as enrollments that expire.
3. **Task carries `origin`.** Traceability from task back to meeting back to decision is what lets the archive answer *why did we do it this way* a year later.
4. **Archiving is mandatory and lossless.** Nothing is deleted. A succession note is **required** to archive a Project, which is how the handoff memo actually gets written: at the moment of completion, not in a panicked May email.

Underneath, Task, Doc, Thread, Event, and Project share one content-item base providing permissions, comments, mentions, attachments, search, and audit. That is the Notion insight. But the user never sees a "create a database" button, only the named objects above. **Notion's power, Basecamp's surface.**

---

## 3. Templates, not features

Build one product, ship many templates, at four levels: club type, process, recurring item, field and rubric.

| Club type | Spaces seeded | Signature process | Signature object |
|---|---|---|---|
| Consulting | E-Board, Recruiting, Case Teams, Alumni | 4-stage recruitment funnel | Interview scorecard |
| Robotics | E-Board, Build, Software, Outreach, Fundraising | Competition season | Append-only build log |
| Dance / theatre | E-Board, Production, Choreo, Tech | Show production on a T-minus schedule | Run-of-show |
| Newspaper | Editorial, Desks, Design, Web | Issue production cycle | Issue as Project, articles as Tasks |
| Finance / investment | E-Board, Research, Portfolio, Recruiting | Pitch cycle | Pitch memo, networking CRM prominent |
| Cultural / affinity | E-Board, Events, Outreach | Large-event runbook | Budget request, vendor contacts |
| Hackathon org | Organizing, Sponsorship, Logistics, Tech | Event runbook | Sponsor pipeline |
| Greek chapter | Exec, Recruitment, Philanthropy, Standards | Rush cycle, dues cycle | Dues status, points |
| Pre-health / pre-law | E-Board, Mentoring, Events | Mentor matching round | Coffee chat rounds prominent |

Two rules make this scale. **Relative dates** in every template, so "book the room at T-30" works in any semester. And **community-published templates**, so a club publishes its recruitment funnel and a club at another school installs it. That turns our best users into our product team, and it creates the one defensible network effect available to us: cross-campus process transfer.

Onboarding falls straight out. Pick your club type, and the workspace arrives already populated with Spaces, a recurring e-board meeting, a constitution stub, and an interest form. **Time to value under 60 seconds**, which is the only budget a volunteer officer will give us.

---

## 4. Calendars

### Reading availability

Google `freeBusy` only. Busy and free in, no event titles out. Hard caps: **50 calendars** per call and 100 groups, so a 40-person club is one call and 51-plus requires sharding.

Microsoft Graph `getSchedule` for Outlook campuses. It returns a digit-per-slot availability string where 0 is free, 1 tentative, 2 busy, 3 out-of-office, plus each user's working hours.

**Scope strategy, corrected.** Calendar scopes are **not** restricted scopes, so they do not trigger the annual third-party security assessment that Gmail and Drive scopes do. But the broad ones are **sensitive**, requiring brand verification, a demo video, and a narrowest-scope justification. Design for **`calendar.app.created` plus `calendar.freebusy`**, which avoids the sensitive tier entirely. We write only to a calendar we created and read only opaque busy blocks. That is the whole product at the cheapest review tier.

**A landmine specific to us.** Google's own limits documentation notes that limits are stricter for education accounts. Our entire user base sits in the stricter bucket.

**Push is a latency optimization, never a source of truth.** Watch channels have a 7-day time-to-live, there is no automatic renewal, and Google states plainly that notifications are not 100% reliable and a small percentage of messages will drop. Always back push with sync-token polling. A 410 response means wipe and full-resync.

### Writing to calendars: a three-tier ladder, best available wins

| Tier | Mechanism | Latency | Requires |
|---|---|---|---|
| 1 | Write into a dedicated secondary calendar via API | Instant | OAuth write scope |
| 2 | Per-user secret ICS subscription feed | Hours, on Google's undocumented poll | One URL paste. Works on Apple, Outlook, Google |
| 3 | In-app, push, SMS | Instant | Nothing |

**The rule: ICS carries the stable semester calendar, push and SMS carry anything that changed.** Never rely on an ICS feed to deliver a time change.

### Class schedules — a correction

**The Canvas ICS feed does not contain class meeting times.** This was verified against the Canvas source: the feed concatenates assignments, calendar events, and appointment reservations only, and the Calendar Events API has exactly two event types. **Recurring lecture blocks are not in Canvas's data model at all.** Treat the Canvas feed as a deadlines source, and note that its feed code is an unauthenticated bearer secret, so anyone holding the URL can read the whole calendar.

True meeting-time export exists but every school does it differently. Banner 9 emits an ICS as a one-shot email attachment with no subscription or refresh, and schools can hide the button. Workday Student has no documented ICS at all, which is why students build their own converters. Purdue's scheduling system gives a genuinely subscribable auto-updating URL. Penn State emails a file. Cornell offers a one-time download.

**There is no universal API, and well under half of US students can self-serve a true class-meeting file today.** The fraction who know they can is far smaller.

So the defensible build is a **paste-or-upload ICS parser** that gets recurrence rules and term boundaries right, plus Canvas ingestion as a separate deadlines layer, plus per-school scrapers only for our densest campuses.

### Recurrence modeling, and two rules that will bite us

Model "every Tuesday at 7pm except finals week" as **one** event with a recurrence rule and an exception-date list, not as many events.

1. **Store the start with a timezone identifier, never in UTC.** A semester crosses a daylight-saving boundary, and "Tuesday 7pm" has to stay 7pm local through it.
2. **Cancel by exception, never by shortening the rule.** Truncating the series destroys history. An exception date preserves it. Finals week, spring break, and holidays are all exception lists, which argues for a per-campus academic calendar table that generates them.

### Conflict detection, which nobody ships

Three kinds, in increasing order of value:

- **Personal.** Aggregate counts only. "12 of 40 are busy," never "Sarah has BIO 101."
- **Cross-club.** Grows more valuable with campus density. This is a real network effect.
- **Institutional.** Finals, breaks, home games, religious holidays, from a seeded campus calendar.

### Group availability

**The algorithm is not the moat.** Forty people across four weeks of 15-minute slots is a few hundred kilobytes and milliseconds to score. The moat is the **scoring policy**.

Use three states, not two: free, if-need-be, busy. Score them 1.0, 0.4, and a hard veto. Two open-source tools arrived at this independently, and Microsoft's `findMeetingTimes` encodes the same idea as confidence percentages: free is 100%, **unknown is 49%**, busy is 0%, averaged across attendees.

The 49% is the elegant part. An unknown attendee can never push a slot to full confidence, but never vetoes it either.

Add what none of them have: **quorum weighted by role**, so an e-board member's "no" outranks a general member's. And copy the participant-visibility control, because 40-person clubs have real social dynamics around who sees whose availability.

Surface the **top three options with who would be missing**. When nothing works, say why.

### Cross-club conflict detection is the feature nobody has

Normalize everything — club recurrence rules, class blocks, personal busy time — into one expanded interval set per student per term, then run a sweep line. Expand once at write time and cache. Never re-expand recurrence rules per query.

At 40 members across 15 weeks this is trivially fast. And it is the one thing no incumbent offers: the scheduling-poll tools do not know about classes, the AI calendar assistants do not know about clubs, and **neither knows a student belongs to six organizations at once.**

---

## 5. Coffee chats

The flow: **Round** (pool, type, cadence, constraints) → **Match** → **Intro with a conversation guide** → **three suggested slots, one tap to book** → **T+3 "did you connect?"** → **notes** → **networking CRM**.

- Peer rounds use the **circle method** round-robin, which is provably repeat-free over n−1 rounds.
- Mentor and mentee matching uses the **Hungarian algorithm**, weighting interest, industry, and availability overlap, minus a prior-pair penalty. Cohort constraints enter as negative-infinity weights.
- Hard constraints stay hard. Donut leaves people unmatched rather than pairing badly, and that is correct. Odd headcount produces one group of three.
- Three things the clones omit and we will not: **snooze, opt out, and block a specific person.**
- The **T+3 confirmation is the most valuable telemetry in the product.** It drives completion rate, reputation weighting, no-show reassignment, and the officer dashboard.
- The **club-owned alumni graph with member-level privacy** (share the contact, not the notes) is what makes this survive board turnover. It is the wedge against the Sheets plus Apollo plus Gmail stack students run today.

---

## 6. Applications

Selective clubs run real hiring funnels. Four borrows from systems that already work:

- **Ashby's interviewer pools with weekly limits.** An interviewer says "three per week" and the scheduler respects it. This is the difference between a functioning process and a burned-out e-board.
- **Stack-rank score normalization**, borrowed from the hackathon judging world. Reviewers calibrate differently; normalize before comparing.
- **Blind review with conflict-of-interest recusal.** A reviewer who knows the applicant recuses, and the system knows it.
- **Decisions with feedback.** Rejection without feedback is what makes selective-club culture toxic, and it is now a compliance issue on some campuses.

---

## 7. Build order

**v1 — the club runs its week here.**
Club, Space, Person, Task, Doc, Thread, Event, Meeting. Club-type templates and a recurring meeting template. Agenda → notes → **action items become Tasks**, which is the single most important interaction in the product. ICS feed out. Basic RSVP. Roster with roles. Mobile-first.
*Success test: the e-board stops using a Google Doc for meeting notes.*

**v2 — the club recruits and schedules here.**
Full forms with logic and payment links. Applications with cycles, stages, rubrics, blind review, reviewer assignment, normalization, decisions with feedback. Interview scheduling with interviewer pools and weekly limits. Group availability polling. Calendar read via free/busy. Personal conflict detection. Automatic check-ins. Hill charts for committee work.
*Success test: a selective club runs its entire fall recruitment without a spreadsheet.*

**v3 — the club remembers, and the network compounds.**
Projects with append-only logs, milestones, and mandatory succession notes. The guided **officer transition flow** that packages Spaces, docs, contacts, and logins for the incoming board. **Bus factor** on the officer dashboard. Coffee chats and the networking CRM. Alumni graph. Cross-club conflict detection. Community template marketplace. Decision-log search.
*Success test: a club president who never met her predecessor can run the club from the archive.*

---

## 8. Expensive-to-reverse decisions, to make now

1. **Person is continuous across graduation.** Not separate student and alum tables. Everything in v3 depends on this and it cannot be retrofitted.
2. **Never custody money.** Record dues status, generate a payment link. University policy usually requires funds to flow through a student-government account anyway, and this sidesteps money-transmission risk entirely.
3. **Club-owned storage from the first byte.** Recreating the Drive failure would be fatal.
4. **Free must be genuinely free at club scale.** Donut caps free at 24 users. Basecamp's education discount excludes student orgs. Typeform's free tier is vestigial. Tally and Fillout already made forms free. The only defensible position is unlimited members, unlimited rounds, unlimited forms, with monetization coming from the institution and employer side, never from the club.

---

## 9. Resolved: build chat

This research originally recommended **not** building chat, on the reasoning that clubs live in GroupMe and iMessage and moving them is a social migration rather than a feature gap.

**That is now overtaken by events.** On 17 August 2026, GroupMe announced it is killing SMS mode. SMS fallback was the entire structural reason GroupMe beat Discord and Slack on campus, and it is disappearing mid-semester.

**Build chat.** See `08-chat-and-community.md`. Threads for durable decisions still exist, and they sit alongside chat rather than instead of it.

## 10. Items to verify before building

- Google's ICS refresh cadence is **undocumented**. Two support pages were checked and neither states an interval, so any specific number circulating is folklore. Microsoft does publish one: roughly every 3 hours, possibly over 24. Apple puts it under user control. **Measure it before promising anything.**
- ESIGN and UETA statutory text, before making any compliance claim in product copy.

### Three resolved: do not embed a scheduling library

**Build booking natively.** Cal.com's open-source repo now redirects to a stripped MIT fork that its own README calls strictly non-production and that has had teams, organizations, and workflows removed. Clubs *are* teams. Meanwhile the Platform product that would have let us embed the real thing **stopped accepting new signups in December 2025**. Paying per seat is structurally wrong for orgs with many members and few organizers.

A "book the treasurer" flow is a few hundred lines over a free/busy query. The hard parts are timezones and conflicts, and we own those anyway.

**Two patterns worth copying from the AI scheduling tools.** Organizers need accounts, members never do, because we will not get 40 signups. And write **durable, self-describing calendar events** with export from day one. Clockwise shut down in March 2026 and deleted every event it had written into users' calendars. Clubs turn over leadership annually, so app-owned holds that can vanish are unacceptable.

**Two dated corrections worth knowing:** GitHub Classroom was retired on 28 August 2026. And Ten Thousand Coffees was never acquired by Nestlé; it raised $75M CAD and acquired Abode.
