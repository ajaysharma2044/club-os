# Club OS — Problem to solution map

*Every problem below was directly observed in CEC's iMessage and Slack between 29 July and 10 September 2026. Evidence is in `12-cec-field-evidence.md`. Nothing here is hypothetical, and nothing is included because it seemed like a good feature.*

---

## How this is prioritized

Three questions, in order. **Is it on fire right now?** **Did they try to build it themselves?** **Would anything else be wasted without it?**

That ordering matters because it contradicts the instinct to build the impressive thing first. The matchmaking engine has a validated $400-per-event price attached and it still does not go first, because a matching algorithm on top of an attendance record nobody trusts produces confident garbage.

---

# TIER 1 — Days, not weeks

## 1.1 Interview scheduling

**The problem, exactly.** Roughly 35 first-round interviews plus 17 second rounds. Second rounds need four interviewers simultaneously. Seven officers with class schedules. One week. The recruitment lead was sizing the round by how many interviews they could physically staff, and was about to recruit extra interviewers via a form to raise capacity. He had already hand-invented per-person caps: *"im assigning 2 max per person rn"*, then *"what if we limit to like 3 per eboard and differ the rest to reg mems."*

**The solution.**

An **interviewer pool** per round. Each interviewer sets a weekly cap and their unavailable blocks, pulled from a calendar or entered as a grid once. The system generates candidate slots that satisfy every constraint at once: interviewer caps, panel size (1, 2, or 4), no double-booking, and no conflict of interest where the interviewer already coffee-chatted that candidate.

Three things that matter more than the algorithm:

- **Capacity is shown before the round opens.** "At current caps you can run 31 first rounds this week. You need 35. Raise two caps by one, or add one interviewer." That single number is what the recruitment lead was trying to compute by hand.
- **Drops are self-healing.** When an interviewer drops, the slot re-enters the pool and the candidate is re-offered automatically. Today the failure surfaces as *"so i dont have to find out from the prospective member emailing me back for a new person."*
- **Panel assembly for round two.** Four interviewers at once is a set-cover problem, not a calendar invite. The system finds the panels that exist rather than asking a human to.

**Why first.** It is the only pain with a hard date inside the week, and it is entirely solvable with data we can collect in an afternoon.

---

## 1.2 Archive the Slack before it deletes

**The problem, exactly.** CEC's workspace went to the free plan on 4 September. History is capped at 90 days and is rolling off now. This is the only record of the recruitment cycle whose numbers nobody could remember last time.

**The solution.** Not a product feature. An export, run this week, into the club's own storage, and then imported as the first real content in the Club OS record. Channel structure, threads, links, and attachments preserved with their original timestamps and authors.

**Why it matters beyond CEC.** This is the single most repeatable acquisition wedge we have found. Every club on a free Slack is on the same timer and does not know it. **"Your club's history starts deleting in N days, here it is, saved, free"** is a cold open that needs no pitch.

---

## 1.3 Coffee chat tracker

**The problem, exactly.** An officer asked in the recruitment channel on 2 September: *"where do we put coffee chat notes?"* **It was never answered.** Meanwhile: 110 responses, roughly 60 completed chats, a count that is already unknowable because *"some ppl email directly,"* 45 invitation emails sent by hand in one day, pairings claimed by writing names into a shared spreadsheet, and an explicit desire to record whether someone ghosted the email versus no-showed the chat, with the officers correctly treating those as different-strength signals.

**The solution.**

One object, the **chat record**, holding: candidate, assigned officer, requested-sent-scheduled-completed-or-missed state, the outcome note, and a structured recommendation. The state machine is the product, because it makes the count knowable and the funnel visible without anyone tallying anything.

Specifics that come straight from the evidence:

- **Non-response and no-show are distinct states**, not one "didn't happen" bucket, because the officers already reason about them differently.
- **Notes are structured and private to the reviewer until a decision point**, which addresses both "where do notes go" and the fairness problem below.
- **Assignment is a system action, not a land grab.** Officers stated caps; the system enforces them. Claiming candidates from an open sheet is what produced demographic-based selection in the workspace, and blind assignment with recusal is the direct fix. This is not a compliance nicety bolted on. It is the observed failure.
- **Every chat rolls into the candidate's record**, so the interview round in 1.1 already knows who talked to whom.

---

# TIER 2 — This semester

## 2.1 The event record as single source of truth

**The problem, exactly.** They secured a room in a different building than originally listed. The event listing was never updated. At 6:55 pm on event night, an officer posted `URGENT` because attendees were walking into the wrong building. Another officer, standing inside the event, asked why no room was listed on the page at all.

**The solution.** One event object that owns its location, and every surface reads from it: the public listing, the calendar entry, the announcement, the check-in page, and the reminder. **Change the room once, and every surface changes.** A room change triggers a push and SMS to everyone who RSVP'd, because the workspace research already established that a calendar feed is too slow to carry a change.

**What we explicitly do not build.** Room booking integration. The university's booking system is the university's dysfunction: bookings gated to two days out, a different scheduler per building, and a system that shows a room as taken without showing who took it. We cannot fix that and should not try. **We fix the part that is ours, which is that the answer to "where is it" should exist in exactly one place.**

**The related fix.** A pre-event checklist attached to the event with owners and due dates: room confirmed, food ordered, pickup assigned, photographer assigned, marketing posted. Every one of those was chased by hand in the chat, and the Instagram post due on the 5th was still not up on the 7th, two days before the event, caught only because the president happened to check.

---

## 2.2 Check-in and attendance integrity

**The problem, exactly.** Two hours before an event the president asked whether a sign-in system was ready, wanting to track who attends, saying it could be bare bones. An officer shipped a QR check-in page that same afternoon. Separately, an officer's written Startup Hours proposal specified enforced sign-in with a time window to stop people taking food and leaving, with escalation: tolerated once, then blocked at the next sign-in.

**The solution.** QR check-in that writes to the roster, which we already specified and which they already built a version of. Plus the parts they designed and we should adopt:

- **A sign-in window** distinct from the event window, because food service time is the actual control point.
- **Attendance integrity with escalation**, recording take-food-and-leave as an event on the person's record, with a defined consequence rather than an officer's memory.
- **Structured capture at check-in** — the proposal asked for LinkedIn, background, and who the person wants to meet. That is a profile, gathered at the one moment a person is standing still and motivated.

**The compounding part.** Check-in data is what makes everything downstream real: attendance forecasting, the recruitment funnel that treats event attendees as prospects, and the matchmaking in 3.2. Build it early, not because it is impressive, but because nothing else works without it.

---

## 2.3 The roster that actually holds what they need

**The problem, exactly.** *"how many vegans do we have"* was asked in the e-board channel and answered by guess. The website's member data was wrong or missing for several people, fixed by sending out a Google Form. Officers' bios were wrong on the public site. Dietary restrictions, contact details, and profile data live in three places, none authoritative.

**The solution.** One roster, member-editable for their own row, officer-visible in aggregate, with the fields the club actually uses: dietary restrictions, year, major, contact, public bio, and links. The public members page renders from it. A catering question becomes a number instead of a guess, and the public site stops being a separate thing to maintain.

---

## 2.4 Club identity: the thing that makes a club able to own anything

**The problem, exactly.** The domain is owned by a graduated president on his personal registrar account, and he is not in the channel where its transfer was discussed. There is still no club email address, so a 100-applicant recruitment funnel runs from personal student accounts. A shared social media password was posted in plaintext in the group chat. Officers repeatedly ask each other who has access to what, answered with *"u shd have access"* and *"just look it up."*

**The solution.** Three parts, and this is the product's actual reason to exist.

- **An asset register.** Every club-owned thing, with its current owner, where it lives, and who has access: domain, social accounts, drive folders, forms, payment links, the Slack itself. Visible to officers, so "who has access" is a page rather than a question.
- **A credential vault scoped to a role**, not a person. The social media account belongs to the Media chair position. When that position changes hands, access follows automatically, and nothing is ever posted in a chat.
- **Transition as a first-class flow.** At handoff, every asset in the register is reassigned or explicitly flagged as stuck, and the outgoing officer cannot close out the transfer while something is unresolved. The domain problem would have surfaced in May, not in a scramble in September.

---

# TIER 3 — Once the record is real

## 3.1 Commitments that survive the meeting

**The problem.** Meeting notes are AI-generated and posted as a link. The president follows up with *"Everyone go in and make sure you do what you committed to doing during stand-up."* The commitments are in the notes; nothing tracks them. Separately, a master timeline spreadsheet goes stale and someone has to ask whether it's current.

**The solution.** Action items extracted from meeting notes become tasks with an owner and a due date, and each one carries a link back to the meeting that created it. This is the single highest-value interaction in the whole workspace spec, and the evidence shows exactly why: the commitment is made verbally, recorded in prose, and then enforced by a human re-reading prose.

## 3.2 Attendee matchmaking

**The problem and the price.** An officer proposed matchmaking at Startup Hours, reasoning that people come to build *with* others. Then cited the market rate: *"bubble lab's been running a lot of matchmaking for different events, good feedback overall, organisers pay 400 per event just for matches."*

**The solution.** Match on what check-in already captured: background, interests, and stated who-I-want-to-meet. Show the match as an introduction with a reason, not a score. Log suggested, seen, acted on, and outcome separately, per the recommender research, so usefulness is measurable before any model gets complicated.

**Why it waits.** It needs 2.2 to exist first. A matcher running on a guessed attendee list is worse than a host making introductions by hand, which is the proposal's own fallback option.

## 3.3 Institutional memory across cycles

**The problem.** *"How many apps did we get last semester?"* → *"Idr."*

**The solution.** Falls out of everything above at zero marginal cost. Once one cycle runs through the system, the next cycle opens with last year's funnel numbers, the event playbooks, the sponsor contacts, and the timeline that actually happened. This is not a feature to build. It is what the record *is*, and it is the reason every earlier tier is worth the effort.

---

# What we are explicitly not building

**Room booking integration.** Not ours to fix, requires institutional access, and the valuable part is event-record consistency instead.

**Payments, dues, or a ledger, for now.** In six weeks of two chats covering a 100-applicant cycle, a speaker series, and a club fair, **nobody argued about money once.** Not a single dues dispute, not one reimbursement fight. The spec's payment design is correct and it is not the wedge for this club. Build it when a club asks.

**A ranked feed or an ML recommender.** No content volume to rank, and the chat research was explicit that heavy ranking harms small communities.

**Anything requiring university registration.** CEC is not a registered student organization, which is precisely why they need us and why the incumbents cannot serve them.

---

# The build order, stated plainly

| Order | What | Why now |
|---|---|---|
| 1 | Slack archive | Deleting now, and it is the best cold-open we have |
| 2 | Interview scheduling | Hard deadline inside the week |
| 3 | Coffee chat tracker | Question asked and never answered; feeds 2 |
| 4 | Event record + checklist | Prevents the wrong-building failure repeating |
| 5 | Check-in and attendance | They built it themselves; unlocks everything downstream |
| 6 | Roster with real fields | Makes catering, the public site, and the funnel one thing |
| 7 | Asset register and credential vault | The domain is one lapsed renewal from gone |
| 8 | Transition flow | Sells itself in March, built before then |
| 9 | Commitments from meetings | Compounds once the record exists |
| 10 | Matchmaking | Has a price. Needs 5 first. |

**Items 1 through 3 are this week.** Items 4 through 6 are the rest of the semester and are mostly already built in the CEC pilot. Items 7 and 8 are the actual moat, and the domain situation is the argument that sells them.
