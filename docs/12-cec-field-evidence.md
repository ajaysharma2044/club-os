# CEC field evidence — what the eboard chat actually shows

*From the Cornell Entrepreneurship Club eboard group chat, 29 July – 10 September 2026, 638 messages across 7 officers. This is the operator input that `cornell-research.md` said it was missing. Individuals are referred to by role. No candidate assessments, contact details, or credentials are reproduced here.*

---

## 0. Why this matters

Every prior document in this repo reasoned from public sources and inference. This is the first direct observation of the club actually operating. **It confirms most of the thesis and corrects the priority order.**

The activity shape alone tells a story. Summer baseline was 18–69 messages a week. The week of September 7 was **588**. The operational crunch is not spread across the year, it is compressed into the first two weeks of the semester, exactly as the seasonality research predicted.

---

## 1. Room booking is the number one crisis, and it is worse than we modeled

This consumed more officer attention than anything else observed.

What happened over two days in September: a room request was denied. The president could not determine who held the space they wanted, because **the booking system shows a room as taken without showing who took it**. Different buildings have different schedulers. The one scheduler they had a contact for only covered one building and said no. The relevant staff member was out of office. The booking portal refuses reservations less than two days out. They seriously discussed simply occupying a room without booking it, reasoning that if they could not book it, nobody else could either.

Two direct quotes, because they are the product argument:

> "We can't advertise until there is a room and I'm afraid the turnout will be bad"

> "I think I need some time to rationally think about this. I've tried all the best options I have."

**Then it got worse in a way that is purely a data problem.** They eventually secured a room in a different building. The event listing was never updated. On the night of the event, officers and attendees went to the wrong building, and someone posted `URGENT` in the chat at 6:55pm. Another officer, at the event, asked why no room was listed on the event page at all.

**Product implication.** This is not "integrate with room booking," which the spec correctly deferred as requiring institutional access. This is something much cheaper and more valuable: **one event record that is the single source of truth for where the event is**, propagating to the listing, the calendar, the announcement, and the check-in page at once. The booking fight is the university's dysfunction and we cannot fix it. The wrong-address-at-7pm failure is entirely ours to fix, and it is the difference between 40 people in a room and 40 people in the wrong building.

---

## 2. The recruitment funnel is running right now, at real scale, tracked nowhere

Live numbers from the chat, mid-cycle:

| Stage | Count |
|---|---|
| Interest signups | 100+ |
| Coffee chat responses | ~110 |
| Coffee chats actually completed | ~60 |
| Target applications | 100 |
| Planned first-round interviews | ~35 |
| Planned second rounds | ~17 |
| Expected new class | ~8 |

Interview structure, as stated by the recruitment lead: first round is a behavioral one-on-one with an eboard member, or one-on-two with non-eboard members. Second round is a technical one-on-four.

**Where it breaks.** Coffee chat counts are already unknowable: *"it's hard to count bc some ppl email directly."* Pairings are made by one officer and sent by another, deliberately, for standardization. Forty-five invitation emails went out by hand in a single day. Assessment notes live in a spreadsheet, and officers proposed flagging strong candidates in that same sheet.

**And the institutional memory failure appears verbatim.** Asked how many applications they received last semester, the answer was *"Idr"* — I don't remember. That is the founding thesis of this entire product, observed in the wild, in a club that is otherwise extremely well run.

---

## 3. Interview scheduling is the next acute pain, and it arrives in about five days

This is the most important scheduling finding, because it is predictable and imminent.

Roughly 35 first-round interviews plus 17 second rounds, with a second round requiring four interviewers simultaneously, across seven officers who are full-time students with class schedules, in a single week. Nobody has built anything for this. The recruitment lead was about to send a form to recruit *additional* interviewers, sizing the round by how many interviews they could physically staff.

**This is precisely the problem the workspace spec already designed for**: interviewer pools with per-person weekly limits, availability-aware slot generation, and conflict checks. It is a well-scoped, buildable feature, and the need lands within a week.

---

## 4. Scheduling one board meeting is a small disaster

The president asked for a meeting and preemptively apologized: *"since we are all busy I have to ask that you make an inconvenience time work."*

A time was proposed. Officers responded by reacting to the message. Four tapped Like, one tapped Dislike. **Message reactions were functioning as an ad-hoc poll**, with no tally, no quorum rule, and no record. The time was later changed from 8:30 to 8:00 in a follow-up message, and the confusion surfaced immediately: *"I thought 8:30?"*

**Product implication.** The availability model in the workspace spec, ternary states with a top-three recommendation, is directly validated. But the simpler lesson is that a proposed time needs one authoritative record that updates everywhere when it changes, rather than living in the scrollback of a chat.

---

## 5. An officer asked for channels and topics, unprompted

Mid-crisis, with the room search flooding the eboard chat, the president wrote:

> "Want to switch to our text chain so we don't flood eboard more"

That is a user independently arriving at the exact structural argument in the chat specification: a 7-person group chat cannot hold parallel workstreams, and the overflow response is to fragment into side chats, which is how context gets lost. **Channels plus lightweight topics is validated by a user asking for it in their own words.**

---

## 6. They are already building pieces of this product themselves

Two hours before an event, the president asked whether a sign-in system was ready, wanting to track who attends, explicitly saying it could be bare bones. Another officer shipped a check-in page with a QR code that same afternoon, on the club's own domain.

**Read that carefully.** Attendance check-in is so obviously needed that a student officer built it from scratch, under time pressure, on the day of an event. This is the strongest possible signal for the roster-plus-event-plus-check-in slice the spec already identified as the wedge.

They are also running form-design iteration in real time (*"might needa make linkedin and other fields non-optional"*) and inventing a sponsorship pitch: an engineering fellowship interest form built specifically so they can tell venture firms that a hundred engineers already signed up.

---

## 7. The tool sprawl, enumerated from actual use

Observed in six weeks: SharePoint for slide decks, Google Forms (at least three separate forms), Google Sheets for coffee chat notes, Google Docs, Instagram for promotion and link-in-bio, a separately hosted website with its own DNS, Luma for event listings, 25Live and an AREA portal for room booking, email for interview invitations, and iMessage as the actual coordination layer.

Two artifacts of the sprawl worth noting. The club's **former name still appears in the slide deck and on the website**, caught only by chance during review. And access is fragmented enough that officers repeatedly ask each other who has access to which portal, with answers like *"u shd have access"* and *"just look it up."*

---

## 8. One security problem, stated plainly

**A shared account password was posted in plaintext in the group chat**, and account verification codes were relayed by message. This is not a criticism of the officers; it is the only mechanism available to them, because the account belongs to a club and the club has no way to own an account.

It is also exactly the failure the officer-transition design exists to prevent. When a shared credential lives in a chat, it survives every graduation, it cannot be revoked per-person, and it leaks to everyone who ever scrolls back. Worth raising with them directly, and worth building the alternative.

---

## 9. What this changes

**Confirmed, with direct evidence:** institutional memory loss is real and measurable; the seasonal crunch is real and is happening now; check-in is the most obviously missing primitive; chat structure breaks under parallel work; the club is a legal and technical orphan with no way to own its own accounts.

**Corrected:** room booking matters far more than we ranked it, but not as an integration. It matters as **event-record consistency**, which is cheap to build and was being treated as a low-priority detail.

**New, and not in any prior document:** interview scheduling at 35-to-50 sessions across seven constrained calendars is an acute, dated, well-scoped pain arriving within a week.

**Sharpened:** the wedge is not the money features. Nobody in six weeks of eboard chat argued about dues or a ledger. They argued about rooms, times, who was sending what, and who had access. **The wedge is coordination and the record, exactly as `09-the-record.md` argues, and payments can wait.**

---

# Part II — The Slack workspace

*Added after connecting to the CEC Slack (`cornellentrep-fjr7327`), 5 Aug – 10 Sept 2026. Eight channels: `#all-cornell-entrepreneurship-club`, `#eboard`, and six `#fall26-*` sub-team channels, all created 5 August by the president. Individual candidate assessments and demographic preferences expressed during coffee-chat assignment are deliberately not reproduced here; where they bear on product design, the structural issue is described instead.*

---

## 10. The record is being deleted right now

**On 4 September 2026, CEC's Slack downgraded from the Pro plan to the free plan.** Slack's own bot notified the workspace.

The free plan caps visible history at 90 days. **Every planning decision, every spreadsheet link, every speaker thread, and the entire record of this recruitment cycle begins disappearing on a rolling basis from now on.** By the time the next e-board takes over in spring, most of what is written above will be unreachable.

This is not an argument we constructed from research. It is the exact failure mode the chat specification predicted, dated, and happening to the pilot club this month. When `08-chat-and-community.md` argued that permanent free history is a wedge rather than a feature, this is the club it was describing, six days before it happened.

---

## 11. The club's domain is owned by a graduated president, personally

From `#fall26-internalltools`, 10 September:

> "rn rohan owns domain access on porkbun"

Rohan is listed elsewhere in the workspace as **President Emeritus**. He is not a member of the channel where this was discussed. The club's primary public asset, `cornellec.com`, sits in a former president's personal account at a domain registrar, and the current officers were mid-conversation about how to get it transferred when the discussion trailed into "wait j text him."

In the same channel, on the same day: **the club still has no email address of its own.** An officer asked another to create a Gmail account tied to the domain. Recruitment emails for a 100-person funnel are being sent from personal student accounts.

**This is the thesis of `09-the-record.md` with a real asset attached.** A club cannot own anything, so everything it owns is really owned by a student who is leaving.

---

## 12. They are already building this product, in pieces, themselves

Three separate homegrown tools appeared in six weeks:

- **An internal events tool**, built by an officer and released to the team on 16 August: *"yep its all set feel free to start using, havent done super thorough testing but lmk if any bugs."* The president's response: *"Big shout again was using it today and it is super sick."*
- **A check-in dashboard with a QR code**, at `dashboard.cornellec.com/checkin`, built the afternoon of an event.
- **A members page on the club website**, backed by a Google Form officers fill in to update their own profiles, because *"some ppl dont have anything or its just wrong."*

And an explicit request, in the tooling channel, that reveals the underlying problem:

> "for all tooling - pls create documentation and plans for this and future ones just so we can keep track of what's been built and what yall r working on"

**They are losing track of the tools they build to stop losing track of things.**

---

## 13. Coffee chat assignment is interviewer-pool load balancing, hand-invented

The recruitment lead, working through 35 responses across 7 officers, in real time:

> "theres 35 ish responses, which is like atl 4 chats per eboard member which is kind of on the heavy end"

> "im assigning 2 max per person rn"

> "what if we limit to like 3 per eboard and differ the rest to reg mems"

That is **per-person caps, pool expansion when the pool is over capacity, and manual reassignment** — precisely the interviewer-pool design in `05-workspace.md`, invented from scratch under deadline pressure by someone who had no idea a pattern for it existed.

The failure modes are visible too. Assignment happens by claiming names in a shared spreadsheet. Reassignment is manual and reactive: *"if anyone here fades a coffee chat fully please just lmk so i dont have to find out from the prospective member emailing me back for a new person."* And an officer reached for automation without tooling to support it: *"just have ai parse by interests."*

**One structural risk worth naming.** Assignment is preference-based and unstructured, with officers claiming candidates from an open sheet. Some claims in the workspace were made on demographic grounds. This is exactly why the applications design in `05-workspace.md` specifies blind review, structured rubrics, and conflict-of-interest recusal. It is not a compliance nicety. It is a live fairness problem in a real selective club, and the product is the intervention.

---

## 14. They want a reliability signal on candidates and have nowhere to put it

A direct exchange between the president and recruitment lead:

> "should it impact how we view them if they ghost the coffee email or the actual coffee chat?"

> "if they dont respond to the email its so-so maybe they just arent interested anymore, if they fade the coffee chat then its bad"

They are distinguishing **non-response from no-show**, correctly, as different-strength signals about a person. There is no system holding that distinction, so it lives in one officer's head. And when the same question was asked in the recruitment channel on 2 September — *"where do we put coffee chat notes?"* — **it appears never to have been answered.**

---

## 15. Event design: they specced four of our features and named a price

The most remarkable single artifact in the workspace is an officer's Startup Hours redesign proposal, written 18 August. Unprompted, it specifies:

1. **Enforced sign-in with a time window**, to solve people taking food and leaving.
2. **Attendance integrity with escalation** — one tolerated offense, then blocked at the next sign-in.
3. **Structured profile capture at check-in** — LinkedIn, background, and who the attendee wants to meet.
4. **Attendee matchmaking**, with two options sketched: manual introductions by a host, or an algorithm run fifteen minutes in.

And then, the sentence that matters most commercially:

> "bubble lab's been running a lot of matchmaking for different events, good feedback overall, organisers pay 400 per event just for matches"

**That is a validated market price, from a real competitor, for the recommendation engine, cited by a student organizer as a reason to build it.** Every prior document reasoned about matching as an eventual differentiator. Here it is a line item someone is already paying $400 an event for.

---

## 16. CEC is not a registered student organization

From `#eboard`, 4 September:

> "We aren't tabling inside since we aren't a registered club so it really doesn't matter."

This single fact explains a great deal that was previously puzzling. It is why room bookings get denied. It is why they cannot access university funding. It is why they are running an entire 100-applicant recruitment cycle on personal accounts, a personally-owned domain, and free-tier software.

**It also makes them a near-perfect pilot.** Every incumbent campus platform is gated behind university registration. CEC is a serious, well-run, high-output organization that the institutional stack structurally cannot serve. That is precisely the wedge `01-strategy.md` describes as the operating system clubs choose rather than the portal the university assigns.

---

## 17. The rest of the stack, and where it leaks

Additions to the tool inventory from Part I: **when2meet** for e-board scheduling, **Granola** for AI meeting notes, **Zoom vs Google Meet** debated for speaker audio quality, a **master timeline spreadsheet** that goes stale (*"Is this timeline updated?"*), a **coffee chat pairings spreadsheet**, and a **listserv** nobody is sure they are using.

Two recurring leaks:

**Deadlines slip silently.** An Instagram post scheduled for the 5th had not gone up by the 7th, two days before the event it was promoting, caught only because the president checked. Nothing was tracking it.

**The catering question nobody can answer from data.** *"how many vegans do we have"* — asked in the e-board channel, answered by guess. Dietary restrictions are roster data, and the roster is a spreadsheet with wrong fields in it.

---

## 18. The line to put on the wall

From an officer in `#eboard`, 4 September, unprompted:

> "why are we so disorganized"

They are not disorganized. They are running a 100-applicant recruitment funnel, a weekly speaker series, two info sessions, a club fair presence, and a venture-firm fellowship pitch, with seven people, no registration, no budget, no email address, a domain owned by someone who graduated, and a Slack that started deleting their history six days ago.

**They are organized. They have no system.** That is the entire product thesis, stated by a user, in four words.
