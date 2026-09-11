# 22 — Interface research: what to steal, and from where

*Design research, not a spec. The brief was "something our ICP is already used to,
Canvas-style but more active, because Canvas is too flat and static." This document
takes that seriously enough to say what "active" means mechanically, and to refuse
the four or five mechanics that are how most products get there.*

*Binding constraint, read first: [11 — cross-club graph](11-cross-club-graph.md) §7.
The mirror test and the do-not-compute list are engineering rules, and about a third
of the conventional "make it feel alive" toolkit fails them. Where that happens below,
it is named, not softened.*

---

## 0. Source quality, declared up front

This document cites what it can and flags what it cannot. Three categories:

- **Cited.** A URL is given inline. Primary sources (vendor docs, standards bodies,
  peer-reviewed work) are preferred.
- **Vendor-reported.** A number that originates in a marketing blog and has no
  independent confirmation. Marked `[vendor-reported]` at the point of use. Do not
  build a business case on these.
- **Inferred.** Reasoning from product behaviour, from the CEC field evidence in
  [12](12-cec-field-evidence.md), or from the existing decisions in
  [06](06-design-system.md) and [08](08-chat-and-community.md). Marked **[inference]**.

There is no user research behind this document. Nobody has watched a Cornell student
use Club OS, because it does not exist yet. The strongest empirical material available
is the six weeks of CEC eboard chat and Slack in [12](12-cec-field-evidence.md), and
that is observation of a club, not of an interface. **Every claim below about what a
student will do is a hypothesis with a test attached, not a finding.**

---

## 1. What Canvas gets right, and what students actually rely on

Canvas is the correct reference not because it is good but because it is *known*.
Roughly every US undergraduate has a trained motor pattern for it. That is a real
asset and the brief is right to want it.

### 1.1 The information architecture, named precisely

**The global navigation rail** is a fixed, narrow, icon-plus-label column on the left,
and it never changes between pages: Account, Dashboard, Courses, Groups, Calendar,
Inbox, History, Help. Eight items, non-configurable by the student
([Instructure Community](https://community.instructure.com/en/kb/articles/662861-how-do-i-use-the-global-navigation-menu),
[Wilmington University](https://www.wilmu.edu/canvas/Canvas-Menus-Student.aspx)).

**The Dashboard has three mutually exclusive views**, switched from a kebab menu:
Card View (course tiles with a name, code, a user-chosen colour or image, and a star
to favourite), List View (a compact vertical list grouped by date), and Recent Activity
(a reverse-chronological stream of announcements, discussions, assignments, and
conversations across all courses)
([St. Petersburg College](https://staffsupport.spcollege.edu/hc/en-us/articles/36009436852891-Mastering-the-Canvas-Dashboard),
[Ohio University](https://help.ohio.edu/TDClient/30/Portal/KB/Article/820/Organizing-your-Canvas-Dashboard)).

**The right sidebar** carries To Do, Coming Up, Recent Feedback, and View Grades. It
persists across the Dashboard and every course page.

**Modules** are the course-level spine: an ordered, indentable list of items with
optional prerequisites and completion requirements.

### 1.2 What students genuinely rely on

Four things, and it is worth being exact, because the rest of Canvas is scaffolding
students route around.

1. **The To Do sidebar.** It is the only place in the product that answers "what do I
   owe and when." Its gravitational pull is so strong that when it under-reported —
   Instructure shipped a defect in January 2025 where the To Do list and Dashboard
   List View did not display all assigned work — universities issued emergency
   notices telling students not to trust it
   ([Penn State IT](https://www.it.psu.edu/?p=239160),
   [University of Iowa ITS](https://its.uiowa.edu/alert/10876)). **A product only gets
   an incident bulletin for the surface people actually depend on.**
2. **Grades.** The single most common reason to open the mobile app
   ([App Store listing](https://apps.apple.com/us/app/canvas-student/id480883488)).
3. **Per-course colour and nickname.** Cosmetic, student-controlled, and
   disproportionately loved — it is the one place Canvas lets a student assert
   anything. [02 §3](02-product-spec.md) already resolved to carry this over.
4. **The calendar as an aggregate.** One view, all courses, colour-keyed.

Everything else — Recent Activity, Groups, History — is close to dead surface. **[inference]**,
from the absence of these features in student-facing university how-to guides relative
to the To Do and Grades material, and from the App Store review corpus being almost
entirely about grades, submission, and notifications.

### 1.3 What Instructure gets right at the systems level

**InstUI is a genuinely serious design system** — 100+ packages, themeable through a
provider rather than global stylesheets, WCAG 2.1 AA as a stated component-level target,
AAA under the high-contrast theme, RTL support, no hardcoded user-facing strings
([GitHub](https://github.com/instructure/instructure-ui),
[developer docs](https://developerdocs.instructure.com/services/instui),
[instructure.design](https://instructure.design/v7/)). Whatever is wrong with Canvas
is not wrong at the component layer. That is the important lesson: **you can have a
rigorous, accessible, well-tokenised component library and still ship a flat product,
because flatness is an information-architecture property, not a component property.**

---

## 2. Why Canvas feels flat, mechanically

Not vibes. Six mechanisms, each of which we can decide about individually.

**2.1 Every surface is a snapshot fetched on navigation.** Nothing on a Canvas page
updates while you are looking at it. There is no socket, no poll, no live count. If an
instructor posts an announcement while your Dashboard is open, your Dashboard is wrong
and stays wrong until you reload. The consequence is not just staleness — it is that
**the page carries no information about whether it is current**, so a student learns to
distrust it and reload compulsively.

**2.2 The unread model is binary, undirected, and lives in your email.** Canvas's
notification design pushes state *out* of the interface into email and push, with
per-type, per-channel preference matrices that universities write multi-page guides to
explain ([Vermont State Colleges](https://support.vsc.edu/learning-tools/canvas/multiple-canvas-notifications-issue/),
[FSU](https://support.canvas.fsu.edu/kb/article/923-canvas-notification-settings-guide/)).
The interface itself cannot tell you which of your six courses has something new.
**Discord answers that question in the leftmost 72 pixels of the screen. Canvas cannot
answer it at all.**

**2.3 The to-do list is populated only by objects that carry a due date.** An
assignment appears; a posted reading does not; a changed room does not; a group
decision does not. This is the deep one. **A to-do list derived from a single field
is a to-do list that silently omits most of what is true.** It is also exactly the
failure mode we would inherit if we cloned it, because most club obligations —
"be in Phillips 203 at 7" — are not tasks with due dates.

**2.4 Course cards are identity, not state.** A Canvas card shows a name, a code, a
colour, and a star. It shows nothing about the course's condition. Six cards that look
identical whether you are on top of everything or three weeks behind.

**2.5 Navigation is configurable per course, so it is different in every course.**
Fifteen possible items, instructor-ordered and instructor-hidden. Navigation confusion
is the single most frequent complaint in student-role reviews
([Cubite's review synthesis of 53 verified users](https://cubite.io/blogs/canvas-lms-review),
[G2](https://www.g2.com/products/canvas-lms/reviews?qs=pros-and-cons)). [02 §3](02-product-spec.md)
already calls this "its single most-criticized surface" and fixes it with six
non-configurable items. That decision stands and this research reinforces it.

**2.6 No optimistic writes and no state-change motion.** Every action round-trips.
Nothing animates on change, so the interface never tells you that something happened
— it only ever shows you a different page than the one before. A design critique of
Canvas makes the same observation about persuasive design, though only the search
excerpt was retrievable; the article itself returned 403
([Arif Kabir, "A Design Critique of Canvas"](https://medium.com/@arifkabir/a-design-critique-of-canvas-89a4718dd0fd)) —
**cite with that caveat.**

### The one-sentence diagnosis

**Canvas is flat because state lives outside the interface.** It is in your email, in
the instructor's head, in a field that only some objects have. Every mechanic in §5
is a way of moving state back onto the screen.

### The mobile app makes all six worse

Students report that the app shows only assignments due *today* rather than upcoming
work, that grade screens freeze after a couple of swipes, and — the one that should
become a house rule — that **switching from the Comments tab to Files or Rubric
destroys an in-progress comment** ([App Store reviews](https://apps.apple.com/us/app/canvas-by-instructure/id480883488?see-all=reviews&platform=iphone)).
Losing a draft on navigation is the most expensive small bug a mobile product can
have, because it teaches users not to author anything on a phone.

---

## 3. What else students use constantly, and the one pattern each is worth

Researched: Discord, GroupMe, Instagram, Notion, Linear, Slack, BeReal, Geneva. One
pattern each. Five of these make the steal list in §4; three are researched and
explicitly rejected, with reasons, because knowing what we looked at and declined is
worth as much as the list.

| Product | The one pattern | Why it fits club operations |
|---|---|---|
| **Discord** | Two-tier unread in a persistent rail: an ambient dot means *something happened here*, a numbered badge means *something is addressed to you* | A student in four clubs needs to distinguish "my club is noisy" from "my club needs me." Nothing else on their phone makes that distinction visually |
| **GroupMe** | The coordination object lives *inside* the conversation — an event with RSVP tracking, a poll that does not notify everyone | CEC officers used message reactions as an ad-hoc poll with no tally ([12 §4](12-cec-field-evidence.md)). The object they needed already exists in the app they left |
| **Notion** | One collection, many saved views: table, board, calendar, filtered — each a different question against the same rows | The events chair needs a pipeline board; the member needs "this week." Same rows. One feature, not four |
| **Linear** | Assigned-to-me derived from the object graph, plus optimistic writes under 100ms | "What am I on the hook for" answered without anyone maintaining a list. Coffee-chat assignment is exactly this shape |
| **Instagram** | Low-stakes expiring authorship: the cost of posting approaches zero because the artifact does not have to be good or permanent | The feed has to be non-empty in a 40-person club without free-text posts ([08 §7](08-chat-and-community.md)) |
| **Slack** | *(rejected)* Aggregated activity tab with a global unread count | This is the model CEC is failing with right now. See §3.1 |
| **BeReal** | *(rejected)* Synchronised prompt that locks your feed until you comply | The cautionary tale, not the pattern. See §3.2 |
| **Geneva** | *(rejected)* A club "home" composed of mixed room types — chat, post, audio, video, broadcast | Real insight, wrong for v1. See §3.3 |

### 3.1 Why Slack's model is rejected

Slack's default is a numbered badge for every unread notification including DMs, with
an Activity tab as the triage surface
([Slack help](https://slack.com/help/articles/360025446073-Guide-to-Slack-notifications),
[Activity view](https://slack.com/help/articles/19693583638803-Triage-notifications-in-the-Activity-tab)).
This collapses "addressed to me" and "happened near me" into one number, which is
precisely the thing Discord's two tiers keep apart.

We have direct evidence this fails for our ICP. CEC ran eight Slack channels and the
president still wrote *"Want to switch to our text chain so we don't flood eboard
more"* ([12 §5](12-cec-field-evidence.md)). And on 4 September 2026 their workspace
downgraded to the free plan, putting their entire recruitment cycle on a rolling
90-day delete ([12 §10](12-cec-field-evidence.md)). **Slack's lesson for us is
commercial, not interactional: permanent free history is the wedge.** Its notification
model is a thing to avoid.

### 3.2 Why BeReal is the cautionary tale

BeReal's mechanic was pure compulsion: a synchronised push, a two-minute window, and
a feed locked until you posted. Downloads went from ~1.1M in February 2022 to ~53M by
October 2022, with under-25s near 80% of users in some markets. Daily actives then fell
roughly 61% from the peak — about 15M in October 2022 to under 6M by March 2023
([Statista topic page](https://www.statista.com/topics/10096/bereal),
[Platformer](https://platformer.substack.com/p/how-bereal-missed-its-moment),
[Dazed](https://www.dazeddigital.com/life-culture/article/61166/1/why-did-bereal-fail-social-media-instagram-authenticity)).
The reported reason is the one that matters to us: *"young people don't want to be
parented by their social media,"* and the buzz became something students dreaded
([The Tab](https://thetab.com/2025/09/23/its-time-to-delete-the-rise-and-fall-of-bereal-the-app-which-once-had-us-in-a-chokehold)).

**A mechanic that extracts compliance produces a step function up and then a cliff.**
Club OS is a four-year institutional-memory product. A cliff is fatal in a way it was
not for BeReal, because our value compounds across officer generations.

### 3.3 Why Geneva is right and still rejected for v1

Geneva is the closest thing to a direct competitor in spirit: a "home" per group,
composed of mixed room types — chat rooms, post rooms, video, audio, broadcast — aimed
explicitly at clubs and Greek life, positioned against GroupMe and Facebook Groups
([geneva.com](https://www.geneva.com/),
[Indie Hackers launch](https://www.indiehackers.com/post/introducing-geneva-an-all-in-one-communication-app-for-groups-clubs-and-communities-6301a80650)).
It is also a deliberate no-like-zone, which is the right instinct
([True Interactive](https://trueinteractive.com/blog/will-brands-cozy-up-to-geneva-the-no-like-zone/)).

We reject the room-type mix because **it is configuration surface, and configuration
surface is exactly what makes Canvas navigation unlearnable** (§2.5). [02 §3](02-product-spec.md)
already committed to six non-configurable club-nav items. A club that has to design
its own room layout before it can use the product has been handed the officer's least
transferable work. Revisit at v2 when there is evidence clubs want it.

### 3.4 The GroupMe fact that should scare us, and the one that should not

GroupMe is the incumbent and its dominance is real: it markets itself around 70%+ of
US colleges and a 200%+ surge in Campus group creation, with built-in event RSVP in
the chat ([groupme.com/campus](https://groupme.com/campus),
[GroupMe blog](https://groupme.com/blog/what-s-new-in-groupme-back-to-school))
`[vendor-reported]`. Student press describes it as *"a problematic necessity"*
([The Bucknellian](https://bucknellian.net/126849/opinion/groupme-a-problematic-necessity-for-college-campuses/),
[The UTC Echo](https://www.theutcecho.com/features/what-role-does-groupme-play-at-utc/article_271e021a-954c-11ed-b54a-4fa2b9be8195.html)).

**The scary part is not the chat. It is that joining costs nothing.** A link, an SMS,
no install, no account ceremony. That is the entire moat and it is why [08 §9](08-chat-and-community.md)
ranks roster import with SMS join links first. **The un-scary part is that GroupMe
retains nothing structured** — the RSVP tally does not become a roster row, and next
year's officers inherit a scrollback.

---

## 4. The five patterns worth stealing

Each one: the source, the mechanic stated precisely enough to build, and the named
club workflow it serves. The workflows are from [12](12-cec-field-evidence.md), so
these are not hypothetical.

### Pattern 1 — Two-tier unread in a persistent club rail
**Source: Discord.**

**The mechanic.** A fixed vertical rail of club chips, always present, never scrolling
away. Three states per chip: quiet (nothing), *ambient* (a small dot — activity exists
in this club), *directed* (a numbered badge — N things are addressed to you
specifically). Categories can be collapsed and muted, which suppresses ambient state
without suppressing directed state
([Discord: Channel Categories 101](https://support.discord.com/hc/en-us/articles/115001580171-Channel-Categories-101)).

**The rule that makes it work, stated as a law:** *a number is only ever for things
addressed to you.* The moment ambient activity earns a number, the number becomes
noise and the whole system degrades to Slack's.

**Club workflow.** A member in four clubs opens the app. Entrepreneurship Club has 40
messages about a room and nothing for them: dot. Consulting Club has assigned them a
coffee chat: badge with a 1. They tap the 1. That is the entire session.

**Mapping to existing decisions.** This is the visual form of [08 §4](08-chat-and-community.md)'s
three notification tiers. Tier 1 is the badge, Tier 2 and 3 are the dot. **The tiers
were specified without a place to render; this is the place.**

### Pattern 2 — The coordination object inside the conversation
**Source: GroupMe (event with RSVP, poll that does not notify).**

**The mechanic.** An object composed in two taps from the message composer, rendered
as a live card in the thread, updating in place as people respond, and writing to the
structured record. Not a link to a page. The card *is* the page.

**Club workflow, verbatim from the field.** CEC's president proposed a board meeting
time. Officers responded with message reactions — four Like, one Dislike — **which
was functioning as a poll with no tally, no quorum rule and no record.** Then the time
moved from 8:30 to 8:00 in a follow-up message and an officer wrote *"I thought 8:30?"*
([12 §4](12-cec-field-evidence.md)).

**What this pattern fixes that GroupMe does not.** GroupMe's tally is ephemeral. Ours
resolves to an authoritative record that updates everywhere it is displayed, which is
the mechanism that prevents the 8:30/8:00 confusion. [08 §5](08-chat-and-community.md)
already enumerates twelve of these objects; this document adds only the insistence
that **the card must show its tally live, without a reload, or it is a form with extra
steps.**

### Pattern 3 — One collection, many saved views
**Source: Notion.**

**The mechanic.** A single set of rows; table, board, calendar, list and gallery are
*views* over it, each with its own saved filters, sorts and grouping
([Notion: using database views](https://www.notion.com/help/guides/using-database-views),
[calendar view](https://www.notion.com/help/guides/calendar-view-databases)). The
critical property is that a view is a lens, not a copy — editing in one view edits the
row.

**Club workflow.** CEC's recruitment lead was moving 35 coffee chats across 7 officers
by claiming names in a shared spreadsheet, with per-person caps invented on the fly:
*"im assigning 2 max per person rn"*, *"what if we limit to like 3 per eboard"*
([12 §13](12-cec-field-evidence.md)). That needs a **board** grouped by interviewer.
The same rows, for the candidate, are a **calendar**. For the president they are a
**funnel count**. Three surfaces, one collection.

**Why this matters more than it looks.** It is the scope valve for the whole product.
[02 §1](02-product-spec.md) already says every club-type difference is a template, not
a feature. Views are the same argument one level down: **most feature requests from
officers will be view requests, and a product that can answer them with a saved view
does not grow a feature per club type.**

### Pattern 4 — Assigned-to-me, derived, with optimistic writes
**Source: Linear.**

**The mechanic, two halves.**

*Derived ownership.* "My Issues" is not a list anyone maintains. It is a query over
the assignee field. Nothing has to be copied into it and nothing can fall out of it.

*Optimistic writes.* State changes render locally and immediately, then reconcile;
searches and view switches hit a local object pool rather than the network
([performance.dev technical breakdown](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown),
[Linear design system notes](https://www.designsystems.one/design-systems/linear),
[gunpowderlabs on Linear's patterns](https://gunpowderlabs.com/2024/12/22/linear-delightful-patterns)).
The benchmark widely cited is Paul Buchheit's 100ms threshold for an interaction to
feel instantaneous.

**Club workflow, two of them.** First: the coffee-chat pool above, where "who is on
the hook" must be derived from assignment, not from a sheet someone remembers to
update. Second, and more operationally sharp: **QR check-in at the door.** An officer
built `dashboard.cornellec.com/checkin` the afternoon of an event
([12 §6](12-cec-field-evidence.md)). Check-in happens at a doorway, on a phone, on
campus wifi, with a queue of people waiting. **A check-in that round-trips is a check-in
that fails.** It must land locally in under 100ms and reconcile later, or officers go
back to a paper list.

**A caution against over-reading Linear.** Linear's density and keyboard-first design
are calibrated for professionals in the product eight hours a day. A club member opens
Club OS three to four times a week ([08 §10](08-chat-and-community.md)). **Steal the
latency and the derivation. Do not steal the density on member surfaces** — that is an
officer-surface decision, and [06 §6](06-design-system.md) already sets per-surface
density.

### Pattern 5 — Low-stakes authorship that expires from the feed and persists in the record
**Source: Instagram Stories.**

**The mechanic.** Authoring cost approaches zero because the artifact is explicitly not
permanent and explicitly not required to be good. State is carried on an avatar the
viewer already looks at rather than in a notification. **[inference]** — the specific
claim that the ring drives return visits *without* a push is reasoning from observed
product behaviour, not from a citable study; the retrievable sources on the Stories
ring were low-quality and are deliberately not cited here.

**The adaptation, and it is a real change.** [08 §7](08-chat-and-community.md) rules
out free-text posts in v1, correctly — every feed item should be the by-product of a
real action. So the thing that expires is not a post. **It is the officer's weekly
recap and the post-event photo set: cheap to make, gone from the feed in seven days,
and retained permanently in the club's record.** That inversion is the whole point.
Instagram deletes; we hide and keep. The feed pressure goes away; the institutional
memory does not.

**Club workflow.** Asked how many applications they received last semester, a CEC
officer answered *"Idr"* — I don't remember ([12 §2](12-cec-field-evidence.md)). The
recap that costs an officer 30 seconds in week 3 is the artifact that answers that
question in month 14. And [08 §7](08-chat-and-community.md)'s density benchmark —
Fizz at 30% of weekly actives creating content — is only reachable if authoring is
this cheap.

---

## 5. The recommended home screen

### 5.1 The recommendation

**A time-ordered commitment list for the next seven days, scoped across every club you
belong to, where each row is an object you can act on inline — with the club rail from
Pattern 1 as permanent chrome, and the feed demoted to a second tab.**

Call it **Up next**, which is the name [02 §3](02-product-spec.md) already uses.

What a member sees, concretely:

```
Tonight
  7:00pm   Startup Pitch Night          Phillips 203   ← moved from Statler 196
           going · 14 going · 2 friends                 [I'm going] [Can't]

Thursday
  5:00pm   Coffee chat — with the VP of Recruitment    [Confirm] [Reschedule]

Sunday
  11:59pm  Availability for interview week             [3 of 7 answered]

Later this week
  2 events you have not answered                                      [See all]
```

Four properties do the work:

1. **The top row is the next thing with a time and a place**, and a changed place is
   shown as a diff, not silently replaced.
2. **Every row carries its action inline.** Nothing on this screen is a link to a page
   where the action lives.
3. **Rows are not limited to objects with a due date.** An event, an unanswered poll,
   an assigned coffee chat, an outstanding reimbursement and a payment request all
   qualify. This is the specific repair of §2.3.
4. **Counts on rows are live.** "14 going" becomes 15 without a reload.

### 5.2 Why, against the four alternatives

| Model | Question it answers | Why it is not the home screen |
|---|---|---|
| Canvas to-do | "What do I owe?" | Right shape, wrong intake. Only objects with a due date get in, so most club obligations are invisible (§2.3) |
| Discord unread | "Where is there talking?" | Clubs do not fail from missing conversation. They fail from 40 people at the wrong building. Correct as chrome, wrong as the destination |
| Linear assigned-to-me | "What is assigned to me?" | No time axis, and it assumes every obligation has an assignee. "Be in a room at 7" has no assignee |
| Instagram feed | "What is happening?" | Optimises discovery, which is the freshman's problem, not the member's. See §5.3 |

The recommendation is Canvas's *shape* with Linear's *derivation* and a time axis, which
is the combination none of the four has.

**The governing evidence** is [12 §1](12-cec-field-evidence.md). A room request was
denied, a room was eventually secured in a different building, **the event listing was
never updated, and officers and attendees went to the wrong building.** Someone posted
`URGENT` at 6:55pm. The president had already written *"We can't advertise until there
is a room and I'm afraid the turnout will be bad."*

That is the single most expensive failure observed in six weeks, it is entirely ours to
fix, and it is a *home screen* problem: **the correct location has to be on the first
screen, and a change to it has to be visible rather than silent.** Any home screen that
does not put time-and-place first is optimising for something that has not yet cost this
club an event.

### 5.3 The rejected alternative, stated fully

**Rejected: a feed-first home, Instagram model.**

It is genuinely tempting. It is the most familiar pattern our ICP has, it makes the
product feel alive on first open, it is the best possible surface for a freshman with
zero clubs, and it is what "more active than Canvas" sounds like on first hearing.

Four reasons it is wrong:

1. **It is empty for the club that matters.** A 40-person club generates a handful of
   feed-eligible events a week. [08 §7](08-chat-and-community.md) already limits feed
   items to by-products of real actions, which is right and also means low volume.
   A sparse feed as the home screen reads as a dead product.
2. **It contradicts a metric already chosen.** [08 §7](08-chat-and-community.md)
   optimises for actions taken, then connections formed, then return visits —
   **explicitly not session length.** A feed-first home is the standard way to buy
   session length. Putting it first would quietly re-optimise the product for the one
   metric the spec refused.
3. **It serves the minority session.** Most sessions are a returning member with three
   to six clubs and a specific question. Discovery belongs behind a tab, and [08 §8](08-chat-and-community.md)
   already scopes it there.
4. **It is the thing that makes a university say no.** A feed-first club product is
   legible as a campus social network, and [11 §5](11-cross-club-graph.md) documents
   what happens to campus products that read as surveillance or as engagement
   machinery. **The home screen is a positioning decision, not only a UX one.**

**The honest cost of the recommendation.** A commitments home is empty when you have
no commitments, which for a passive member is most of the week. Do not paper over it
with a cheerful illustration — [06 §1](06-design-system.md) bans that. The empty state
*is the answer*: "Nothing due this week. 3 events across your clubs." with the rail
underneath. **A calm screen that is correct beats a busy screen that is padded.**

### 5.4 The officer home is a different screen, and should be

The president's job-to-be-done in [02 §5](02-product-spec.md) is *"it's Sunday night
and I don't know what's due, who's doing what, or whether we have money."* That is not
the member's screen with more rows on it; it is a club-scoped operational view. Ship
the member home first — it is the screen opened ten times a day — and let the officer
brief be a distinct route. **[inference]**, but strongly supported: [08 §10](08-chat-and-community.md)
already models officers at 8–12 sessions a week against members at 3–4, and surfaces
with a 3x usage gap should not share a layout.

---

## 6. The "active" checklist

Mechanics with a verdict each. No adjectives.

### 6.1 Ship these

| # | Mechanic | Specification | Evidence |
|---|---|---|---|
| 1 | **Optimistic write on every state toggle** | RSVP, check-in, task done, poll vote render locally in <100ms and reconcile in the background. Failure rolls back inline with a retry affordance, never a toast that disappears | Linear's architecture ([performance.dev](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown)); the 100ms instantaneity threshold |
| 2 | **Offline write queue for check-in** | Check-in specifically must survive a dead campus network and reconcile on reconnect | [12 §6](12-cec-field-evidence.md): check-in built same-day, used at a doorway |
| 3 | **Layout-matched skeletons above ~1s, nothing below** | Skeletons are for full-page loads under 10s. **Below 1s a looped animation is actively harmful** — users cannot keep up with what flashed | NN/g: [Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/), [Progress Indicators](https://www.nngroup.com/articles/progress-indicators/), [comparison video](https://www.nngroup.com/videos/skeleton-screens-vs-progress-bars-vs-spinners/). Already [06 §8.13](06-design-system.md) |
| 4 | **Live counts that tick without a reload** | "14 going" → "15 going" in place, with a 120ms crossfade, tabular numerals so nothing jitters | Social proof on event pages is reported to lift completed RSVPs, e.g. a widely repeated Eventbrite figure of ~40% `[vendor-reported]` ([ASP](https://support.asp.events/hc/en-us/articles/34536626138909-Using-Social-Proof-to-Increase-Event-Registrations), [Attendir](https://attendir.com/blog/increase-event-registrations-social-proof)). Treat the direction as sound and the number as unverified |
| 5 | **Two-tier unread: dot for ambient, number only for directed** | A number never appears for activity not addressed to you | §4 Pattern 1 |
| 6 | **The changed-field diff** | When an event's time or location changes within 48h of start, the row shows the previous value struck through for 24h, and the change is a Tier 1 push | **[inference]** — we found this in no researched product. It is a direct response to [12 §1](12-cec-field-evidence.md). Ours to invent, and the highest-conviction item on this list |
| 7 | **Live tally on polls and availability** | The card shows "3 of 7 answered" and fills as responses land | [12 §4](12-cec-field-evidence.md), reactions-as-poll |
| 8 | **Co-editing presence, scoped to a document** | Avatars on the agenda you are both editing, right now, while you are both there | Presence is useful when it is about an artifact. See §6.2 for why global presence is not |
| 9 | **Motion only on state change** | 70ms micro, 120ms hover/exit, 180ms enter, 240ms max. Transform and opacity only. Transitions not keyframes, so they are interruptible | [06 §4](06-design-system.md), already specified. This checklist adds only: **a state change with no motion is the mechanism of flatness** (§2.6) |
| 10 | **Execute-then-undo instead of confirm** | Eight-second undo on reversible actions | [06 §8.14](06-design-system.md) |
| 11 | **Model output behind an explicit affordance** | Forecasts, benchmarks, health indices off by default | [06 §7](06-design-system.md): *no student ever sees a model output they did not ask for* |

### 6.2 Do not ship these

| Mechanic | Verdict | Why |
|---|---|---|
| **Streaks** | Never | Streak mechanics backfire on the first miss via the abstinence-violation effect, and produce compulsive maintenance detached from the goal ([The Decision Lab: Streak Creep](https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification); [critical analysis of Duolingo, SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6846283); [gamification dark patterns survey, arXiv](https://arxiv.org/pdf/2403.08041)). A club member missing a week is normal life, not a lapse to punish |
| **Leaderboards on attendance or participation** | Never | This is a per-person ranking of students by involvement with a friendly skin. [11 §7](11-cross-club-graph.md) prohibits individual risk scores, and [11 §5](11-cross-club-graph.md) notes a campus-involvement score is substantially a wealth-and-free-time score |
| **Global online status / "last seen"** | Never | Presence indicators create an expectation of immediate reply and an anxiety of constant visibility ([the green status effect](https://gusto.com/resources/glossary/green-status-effect)). Also fails the mirror test's spirit: it reveals a pattern about a person continuously, with no moment of disclosure |
| **Per-person read receipts visible to officers** | Aggregate only — **and this amends [02 §4](02-product-spec.md)** | Read receipts generate documented pressure to reply and avoidance behaviour, including deliberately not opening messages ([CHI 2022, *Why Did You/I Read but Not Reply?*](https://dl.acm.org/doi/fullHtml/10.1145/3491102.3517496); [Delta Chat on read receipts and social pressure](https://delta.chat/en/2017-07-06-read-receipts-and-social-pressure)). **[02 §4](02-product-spec.md) specifies "read receipts on must-reads." Recommend narrowing to: officers see a count and a percentage; no officer ever sees a per-person seen/unseen list.** The count gives the officer the decision they need — resend or not — with none of the surveillance |
| **Numeric badge for ambient activity** | Never | It is the mechanism by which Slack and Canvas notifications became noise (§3.1, §2.2) |
| **Infinite scroll on the feed** | Never | Bounded, with an explicit "you're caught up." A feed you can finish is a feed people trust |
| **Synchronised prompts / compliance windows** | Never | §3.2 |
| **Celebration animation on ordinary actions** | Never | Confetti on an RSVP is the interface congratulating itself. [06 §8.20](06-design-system.md) bans copy a human would not say; the same test applies to motion |

### 6.3 One mechanic with genuinely mixed evidence: nudges

Reminder nudges to students have real but modest and inconsistent effects. Some
implementations move persistence a couple of percentage points; enhanced text coaching
moved well-being and success indices by ~4–5% of a standard deviation; large-scale
campaigns have found **no effect**, and the field's own leading researcher has written
about why they stop working at scale — informational value decays as everyone starts
sending them ([*Thx 4 the msg*, Research in Higher Education](https://pmc.ncbi.nlm.nih.gov/articles/PMC8853065/);
[Castleman & Meyer, West Virginia](https://muse.jhu.edu/pub/1/article/761652/pdf);
[Castleman in Behavioral Scientist](https://behavioralscientist.org/why-arent-text-message-interventions-designed-to-boost-college-success-working-at-scale/)).

**The implication is [08 §4](08-chat-and-community.md)'s cap, and it should be defended
against every future request to raise it.** Three Tier-1 pushes per club per week, with
the attention budget shown to the sender. The evidence says the marginal nudge is worth
roughly nothing, so the scarce resource is not the student's attention in aggregate —
it is the *credibility of the channel*. Protecting that credibility is why the
changed-location push (§6.1 #6) still gets through.

---

## 7. Mobile-first implications

### 7.1 The correction to "mobile-first"

The honest picture is a split, not a mandate. Smartphone ownership among undergraduates
is near-universal and roughly half of North American 16–20 year-old internet users call
the phone their primary internet device — **but around four in five students report the
laptop as their primary device for academic work**
([EDUCAUSE Review on mobile learning practices](https://er.educause.edu/articles/2023/1/the-evolving-landscape-of-students-mobile-learning-practices-in-higher-education);
ownership and primary-device percentages come from commercial statistics aggregators
and are `[vendor-reported]` — [DemandSage](https://www.demandsage.com/smartphone-usage-statistics/),
[WifiTalents](https://wifitalents.com/students-technology-statistics/) — directionally
useful, not load-bearing).

The CEC evidence matches exactly. Every homegrown tool officers built — the events tool,
the check-in dashboard, the members page, the coffee-chat spreadsheets — is laptop work.
Every member interaction — RSVP, "where is it," reading an announcement — is phone work
([12 §7, §12](12-cec-field-evidence.md)).

**So: member surfaces are phone-first and must be complete on a phone. Officer surfaces
are laptop-first and may be read-only on a phone.** Two shapes, designed separately,
rather than one responsive compromise that serves neither. **[inference]**, but it
follows directly from the observed split.

The named exception, because it breaks the rule: **check-in and the event-day surfaces
are officer work that happens on a phone, at a doorway, standing up.** They get
phone-first treatment with everything else officer-side.

### 7.2 Concrete mobile requirements

- **Touch targets.** WCAG 2.2 introduced 2.5.8 Target Size (Minimum) at Level AA:
  24×24 CSS px, with spacing, inline, equivalent, user-agent and essential exceptions
  ([W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/), explainer at
  [thewcag.com](https://www.thewcag.com/criteria/2.5.8)). **House rule: 44×44 for any
  primary action.** 24 is the floor for compliance; 44 is the floor for a person tapping
  while walking across the Arts Quad.
- **Primary action in the thumb zone**, bottom of the viewport, not top-right.
- **Never lose a draft on navigation.** Tab switches, back gestures and incoming calls
  must preserve composer state. This is a direct lesson from Canvas's mobile app
  destroying in-progress comments on tab switch (§2.6).
- **16px minimum on every input** so iOS does not zoom. Already [06 §2](06-design-system.md).
- **320px reflow in CI.** Already [06 §9](06-design-system.md).
- **Offline-tolerant writes** on RSVP and check-in (§6.1 #2).
- **One-handed reachability for the top three rows of Up next**, because those are the
  rows read while walking to the event.

### 7.3 Accessibility failures to avoid, named from the two references

**From Canvas.** Its VPAT/ACR discloses partial conformance, and the recurring
real-world barriers are for screen-reader and keyboard users — notably New Quizzes,
where screen readers have not reliably read back typed essay content, plus missing or
insufficient alternative text
([Canvas VPAT, hosted by Montclair State](https://www.montclair.edu/digital-accessibility-initiative/wp-content/uploads/sites/51/2019/02/Canvas-Voluntary-Product-Accessibility-Template.pdf);
[George Mason ATI](https://ati.gmu.edu/caresguide/canvas-accessibility/);
[Oxford CTL statement](https://www.ctl.ox.ac.uk/canvas-accessibility);
[York accessibility statement](https://www.york.ac.uk/eldt/canvas/canvas_accessibility.html)).
**The lesson is structural: the inaccessible parts of Canvas are the newest,
most-interactive parts.** Rich custom widgets are where conformance is lost. Every
live-updating component in §6.1 must ship with an `aria-live` decision, a keyboard
path, and a screen-reader pass **at authoring time**, because the "active" mechanics
are precisely the ones that regress.

**From Discord.** Its default role colours cannot meet 4.5:1 across both light and dark
themes — a user-configurable colour system with no contrast floor
([CSUSM accessibility guide for Discord](https://www.csusm.edu/iits/services/accessibility/guides/socialmedia/discord.html)),
and its 2021 rebrand drew documented WCAG complaints including specific harm reported
by neurodivergent users ([user report on contrast](https://support.discord.com/hc/en-us/community/posts/1500001014421-New-color-causes-eyestrain-new-font-unnecessary-doesn-t-pass-WCAG-test),
[report on neurodivergent impact](https://support.discord.com/hc/en-us/community/posts/1500000991901-New-colors-and-font-make-it-extremely-difficult-for-neurodivergent-people-ASD-ADHD-others-to-use-Discord)).
Discord has since committed to WCAG 2.1 AA and shipped saturation controls
([Discord a11y updates](https://canary.discord.com/blog/improving-app-accessibility-a11y-updates)),
and its keyboard and screen-reader work is well regarded
([A11y Up](https://a11y-up.com/articles/discord-accessibility-in-web-apps-done-right)).

**[06 §3](06-design-system.md) already solved this before it happened** — 12 fixed club
hues at identical lightness and chroma, used only for a 3px edge, a 20px chip, a
calendar dot and a tint, never carrying small white text. **That decision is worth more
than it looks, and this research is the evidence for why. Do not relax it into a colour
picker.**

**And the deadline is real.** The ADA Title II web rule compliance date is 26 April 2027
for populations of 50,000 and above, which is where most public universities land, and
it reaches third-party tools they adopt ([06 §10](06-design-system.md)). An
accessibility conformance report is a sales document, not only an ethical one.

---

## 8. What not to do

Twelve refusals. The first six are dark patterns; the last six are the specific ways a
club product turns into a social network, which is a slower and more dangerous failure.

1. **No streaks, no daily-login mechanics, no loss framing.** §6.2.
2. **No leaderboard ranking people by attendance, participation, points, or
   "engagement."** [11 §7](11-cross-club-graph.md) forbids individual risk scores; a
   leaderboard is one with a trophy on it.
3. **No per-person read receipts shown to officers.** Aggregate counts only. This
   amends [02 §4](02-product-spec.md); see §6.2.
4. **No online status, no "last seen," no typing indicators outside an open thread.**
5. **No manufactured urgency.** "Only 3 spots left" appears only when capacity is real
   and enforced. A countdown on an event with unlimited capacity is a lie in the UI.
6. **No friction on leaving.** Leaving a club is one tap with an undo, no confirmation
   guilt, no "your club will miss you." **A product that makes leaving hard is telling
   you it cannot make staying worth it.**
7. **No follower counts, no follower relationships between students.** Clubs have
   members. People do not have audiences here.
8. **No public activity feed of an individual's behaviour.** A person's profile shows
   what they choose to show. It never aggregates into "here is what this student has
   been doing."
9. **No feed as the home screen.** §5.3.
10. **No engagement-based ranking of people anywhere in the interface** — not in
    search, not in member lists, not in "suggested." Sorting humans by a computed number
    is the do-not-compute list expressed as a sort order.
11. **No signal displayed to an officer about a member that is not displayed to that
    member identically.** This is [11 §6](11-cross-club-graph.md)'s mirror test written
    as a UI rule: *if a number about a person renders in an officer's view, the same
    number renders in that person's own view, in the same words.* It is checkable in a
    code review, which is the point.
12. **No optimising for session length, ever, including indirectly.** Autoplay,
    endless scroll, and "you might also like" rails are all session-length mechanics
    wearing product clothes. [08 §7](08-chat-and-community.md) already chose actions,
    connections, and return visits. **The interface has to be built so that a satisfied
    user leaves quickly.**

### The test to run on any proposed mechanic

Three questions, in order. A mechanic has to pass all three.

1. **The mirror test** ([11 §6](11-cross-club-graph.md)). Does this show a person
   something about themselves that someone else can already see? If a signal reaches an
   officer before it reaches the student, it does not ship.
2. **The leaving test.** If this mechanic works, does the student want to be here, or
   do they want to not lose something? Streaks fail here. Live counts pass.
3. **The 2am test.** A student who has not opened the app in nine days opens it at 2am.
   Does the screen make them feel behind, or does it make them useful? **A club is a
   voluntary association. An interface that produces guilt is a resignation letter with
   a delay.**

---

## 9. What this resolves in the rest of the spec

**Confirms, and supplies the mechanism for:**
- [02 §3](02-product-spec.md)'s "persistent Up next rail" — §5 gives it a layout, an
  intake rule, and a reason.
- [02 §3](02-product-spec.md)'s six non-configurable club-nav items — §2.5 and §3.3
  are the evidence.
- [08 §4](08-chat-and-community.md)'s three notification tiers — §4 Pattern 1 gives
  them a place to render.
- [06 §3](06-design-system.md)'s fixed 12-hue club palette — §7.3 is the counter-example
  that proves it.
- [06 §8](06-design-system.md)'s bans on spinners, confirmation dialogs and
  colour-only state — §6 supplies external evidence for each.

**Amends:**
- **[02 §4](02-product-spec.md), "Read receipts on must-reads."** Narrow to aggregate
  counts. No per-person seen/unseen list, ever. §6.2.

**Adds, not present in any prior document:**
- **The changed-field diff** (§6.1 #6). The highest-conviction new mechanic here, drawn
  from the most expensive observed failure, and found in none of the eight products
  researched.
- **The member/officer device split** (§7.1), which argues against a single responsive
  layout.
- **The three-question test** (§8) as a reviewable gate.

**Open, and worth a dedicated pass:**
- No user research exists yet. The cheapest correction available is to put the Up next
  layout in front of eight CEC members for fifteen minutes each before it is built.
  Given [12](12-cec-field-evidence.md), the pilot club is reachable and currently
  building these tools themselves.
- [06 §11](06-design-system.md)'s open gap — no verified Gen Z authenticity research
  behind the copy voice — is not closed by this document either.
