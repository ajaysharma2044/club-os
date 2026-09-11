# Club OS — The Record

*The spine of the product. Everything else is an interface to this.*

---

## 1. The thesis

A university is an institution. It keeps records. A dean can answer what happened, who decided it, when, and what it cost, going back decades.

**A club is also an institution, and it can answer none of that past last May.**

The roster is in a group chat. The money is in a personal Venmo. The decisions are in a Google Doc owned by someone who graduated. The attendance was never recorded. The sponsor contact was in an inbox that no longer exists. Every year the organization restarts from zero and calls it a transition.

**The product is institutional-grade record keeping for organizations that have never had it.** Who did what, when, with whom, under what decision, at what cost.

Free on the front, because the record is the asset. The backend business exists only because the record is complete, verified, and consented.

---

## 2. What gets recorded

Six chains. Each one is currently broken in every club on every campus.

| Chain | What it captures | What it replaces |
|---|---|---|
| **People** | Who joined, when, in what role, for what term, who attested it, when they left | A spreadsheet and a group chat |
| **Presence** | Who RSVP'd, who actually came, when they checked in, who no-showed | Nothing. It is simply not recorded today. |
| **Decisions** | What was proposed, who was in the room, what was decided, by what vote, what followed | A Google Doc that disappears |
| **Work** | What was assigned, to whom, from what decision, when it was done | A group chat message nobody can find |
| **Money** | Every dollar in and out, who approved it, against what receipt, under what budget line | A personal Venmo and a shoebox |
| **Relationships** | Which sponsor, which alum, which contact, who spoke to them, what was agreed, when to follow up | A graduating senior's inbox |

Note what those six have in common. **Each one is a chain, not a fact.** A decision without the meeting that produced it is trivia. An expense without an approver is a liability. A task without an origin cannot answer why we did it this way a year later.

**The chains are the product. Individual records are just rows.**

---

## 3. Meetings are a primary object, not a feature

Meetings are where clubs make decisions, and meetings are currently where clubs lose them.

The chain runs: **agenda → attendance → discussion → decision → action items → tasks → completion**, and every link is timestamped and attributable.

What that unlocks in practice:

- **"Why did we do it this way?"** answered a year later, by a president who never met her predecessor.
- **Action items become real tasks automatically.** This is the single most important interaction in the product. It is the moment a meeting stops being theater.
- **Attendance at meetings feeds the involvement record**, which is how a member becomes a documented contributor rather than a name on a roster.
- **Decisions become searchable**, so the fourth time someone proposes the thing that failed twice, the archive says so.

Recording is optional and consented. The structured output is not: agenda, attendance, decisions, and owners get captured whether or not audio was.

---

## 4. Provenance is user-visible

This is the part your framing changes most from what was previously specified.

**Every fact in the system carries a trail, and any person who can see the fact can open the trail.**

```
Maya Okonkwo — Treasurer
  Term: Mar 2026 – Mar 2027
  How we know: elected 14 Mar 2026, ballot archived, attested by
               outgoing treasurer J. Ruiz and advisor Dr. Patel
  Recorded:    14 Mar 2026, 9:42pm, by the election system
```

```
$412.88 — Catering, Fall Kickoff
  Approved by:  Maya Okonkwo (Treasurer), Dev Shah (President)
  Receipt:      attached, uploaded 2 Sep 2026
  Budget line:  Events / Food
  Reimbursed:   Dev Shah, paid 5 Sep 2026, 3 days
```

Three consequences worth stating:

1. **Corrections are entries, never edits.** A wrong record is fixed by a counter-entry that says who corrected it and why. Nothing is silently rewritten, because a record that can be silently rewritten is not a record.
2. **Every object has a history tab.** Not a feature flag, a default.
3. **Two timestamps on everything.** When it happened, and when we learned it. This is what lets the system answer what we knew at a point in time, which is what makes both audits and forecasts honest.

---

## 5. Ownership, which is what keeps this from being surveillance

Recording who did what and when is one design decision away from feeling like surveillance. **Students will leave instantly if it reads that way**, and no amount of privacy policy will fix it after the fact.

The defense is ownership, and it has to be architectural and visible rather than promised.

| Who | Sees |
|---|---|
| **A student** | Their own complete record, across every club, with full export |
| **An officer** | The club's record, scoped to their role's permissions |
| **An advisor** | Read-only club record, no personal data beyond membership |
| **A national organization** | Its own chapters' records, under its existing governance relationship with them |
| **An employer** | Only what a student explicitly released, per employer, per field, revocable |
| **Us** | Aggregates for product and forecasting. Never message content in profiles. |

Four rules that make it true rather than stated:

- **The record belongs to the club and to the student. We are the custodian, not the owner.**
- Export is one click, complete, and always available. A product you cannot leave is a product you cannot trust with a record.
- Message content never enters a profile. Message *metadata* does.
- No inferred fact about a person exists without the evidence that produced it being visible to that person.

---

## 6. What "free" means, written down

A vague free promise is worth nothing to a treasurer deciding whether to move the club's money and history onto a new platform. So it gets committed in writing.

**Free forever, with no member cap, no history cap, no feature gate:**

- Unlimited members, officers, and alumni
- **Permanent message and record history.** Not 90 days. This is a direct answer to Slack, where a 40-person club pays $3,480 a year to keep its own history.
- Unlimited events, RSVPs, check-ins, forms, applications, and meetings
- The full ledger, budget tracking, and reimbursement workflow
- Officer transition and the complete archive
- Export of everything, at any time

**What is ever paid, and by whom:**

| Paid by | For |
|---|---|
| The payer | A transparent processing fee on dues and tickets, always below the incumbent |
| Merchants | Commission on food and vendor orders |
| Employers | Access to verified, opt-in talent pools |
| Sponsors and local businesses | Placement and sponsorship, capped at one ad per eight feed items, zero in chat, rosters, payments, or an event you already joined |
| National organizations | A per-chapter license to see and operate their own chapter network |

**The club never pays. The student never pays to participate.** That is the sentence, and it should be short enough to survive being repeated by an officer to their e-board.

---

## 7. Why the backend only works if the record is real

This is the part that makes the whole structure cohere rather than being two businesses stapled together.

| Backend line | What it requires from the record |
|---|---|
| **Payments** | A ledger that a treasurer and an advisor both trust, with approvals and receipts |
| **Employer product** | Verified positions with dates and attestation, measured attendance, budgets actually managed, and per-field student consent |
| **Sponsorship** | Attendance that was counted rather than claimed, and deliverables that were tracked |
| **Ads** | Predicted attendance, which requires honest attendance history |
| **The quant engine** | Point-in-time correct history. Without two timestamps, every forecast is fiction. |
| **National org license** | Chapter-level health, rosters, officer terms, and compliance that are already true because chapters used the tool all year, rather than assembled from forms in April |

**Every revenue line is downstream of the record being complete and honest.** That is the discipline. It also means shortcuts that corrupt the record are not shortcuts, they are the destruction of the asset.

The inverse is the moat. A club that has three years of history in the product cannot leave, not because we locked it in, but because the history is genuinely valuable and genuinely theirs.

---

## 8. What the record does for each person

The front end has to be simple, so the record surfaces as answers rather than as a database.

| Person | What they see |
|---|---|
| **Member** | Three things this week. And, quietly accumulating, a record of everything they did. |
| **Officer** | What is due, who is doing it, what we have, what we decided. One screen. |
| **Treasurer** | One number, and every dollar behind it in two clicks. |
| **New president** | The last three years, searchable, on day one. |
| **Alum** | Their own record, permanent, exportable, and a way to stay connected. |
| **Advisor** | A link with context and a ten-second signature that leaves a trace. |
| **A national org** | Every chapter's health, and the ones about to die, months before they would otherwise find out. |

---

## 9. The three sentences

**Clubs are institutions that lose their memory every year.**

**We keep the record, free, and it belongs to them.**

**Everything we sell is downstream of that record being real.**
