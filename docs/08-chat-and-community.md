# Club OS — Chat, Feed, Discovery, Growth

*Draft v0.1. Full research in `/research/21-chat-and-community.md`.*

---

## 1. The window just opened

**On 17 August 2026, GroupMe announced it is killing SMS mode**, rolling out per-user seven-day countdowns.

SMS fallback was the entire structural reason GroupMe beat Discord and Slack on campus. It let anyone participate with no account, no install, and no smartphone. That moat is gone, and it is going away **mid-semester**.

**Fall 2026 is the switching window.** It will not come again. Phone-number invites with SMS join links survive, and copying that is the first growth loop to build.

The supporting case is already strong. Slack's free tier caps history at 90 days, and a 40-person club would pay $3,480 a year to escape that. **Permanent free history is a wedge, not a feature.**

---

## 2. This resolves the open disagreement: build chat

The workspace research argued against building chat, on the reasoning that moving clubs off GroupMe is a social migration rather than a feature gap.

That reasoning was sound when GroupMe was structurally better. It is no longer. **Build chat.**

The additional arguments hold: RSVP, polls, payments, and task assignment have to be native message objects rather than links, and vendor chat pricing is incompatible with a free product.

---

## 3. Channel and topic model

**Channels plus mandatory lightweight topics.** This is Zulip's model, simplified. It is the right structure for a 40-person club with six committees, and a second product converged on it independently.

Default channels: `#general`, `#announcements`, `#eboard`.

- **Committee channels** are org objects. They materialize on first post and auto-archive after 60 days of silence.
- **Events create topics, not channels.** Topics auto-resolve 48 hours after the event.
- Topics are named, renameable, movable, resolvable, and individually mutable, and they render in the main view rather than hidden behind a thread pane.
- **Every channel's membership derives from the roster and role graph, and auto-rotates at officer transition.** The office keeps the history, not the person. This is the single most important structural difference from every incumbent.
- **Cross-club channels are free**, and they are a growth loop.
- DMs and small groups exist and are deliberately boring.

---

## 4. Notifications

This is the number one complaint about every tool clubs currently use, so it gets a real design.

**Three tiers.**

**Tier 1, guaranteed push, breaks mute.** Officer announcements, direct mentions and DMs, and your own due commitments. **Capped at three per club per week, with the attention budget shown to the sender.** Making the sender see the cost is what actually reduces volume.

**Tier 2, one batched daily push at a learned time.** Followed-topic replies, new topics, RSVPs, reactions, friend activity. **Suppressed by an incrementality model** if you have been active recently, and diversity-demoted to avoid repetition. Instagram's uplift model cut notification volume with no engagement loss, which means **suppression is the feature students will actually notice.**

**Tier 3, in-app only.** Everything else.

**User granularity.** Channel set to all, mentions, or muted. Topic set to followed, normal, or muted. Auto-follow any topic you start, reply in, react to, or are mentioned in. Keyword alerts. Quiet hours from 11pm to 8am by default.

Settings initialize from join-time answers, and a single "too many, too few, or about right" prompt in week two supplies the training label.

---

## 5. Rich objects in chat

Every one of these is at most two taps from the composer, renders as a live card, updates in place, **writes to the club's structured record**, resolves its topic on completion, and is readable by the assistant.

RSVP card · availability poll · poll or vote with optional quorum · payment request with a live paid roster · task assignment · acknowledgment request · reminder · file and doc preview · inline form · decision record · event check-in and QR · reimbursement request

That list is the reason chat cannot be outsourced. Each object is a write into the system of record, disguised as a message.

---

## 6. Moderation baseline, non-negotiable for v1

The four App Store requirements: pre-post filtering, in-app reporting with a real response commitment, user blocking, and a published contact.

Plus:

- Per-club officer tools (delete, timeout, remove) with an audit log
- Automated moderation on all content, and **hash-matching on all uploads**
- Per-club custom keyword filters
- A **hazing-specific classifier on new-member channels**, which is now a federal reporting matter
- Child-safety reporting registration with a report-and-preserve-one-year pipeline
- A published retention and legal-request policy
- **No end-to-end encryption on group text.** Encrypt calls, moderate text. That is the line the large platforms landed on and it is the right one for a platform with student DMs.

**Do not build on Perspective API. It shuts down 31 December 2026.**

---

## 7. The feed

### What appears

Event check-ins, club joins, new events, event photo albums, project and competition wins, officer elections, personal milestones, officer-authored weekly recaps, friend RSVPs.

**No free-text posts in v1.** Every feed item is the by-product of a real action. That is what makes the feed both un-fakeable and un-empty.

### How it ranks

**Reverse-chronological with light multiplicative boosts, not a machine-learned ranker.**

This contradicts the instinct to build a TikTok-style algorithm on day one, and the evidence supports it. Reddit's ranking formula and Nextdoor's failure mode both show that **heavy ranking hurts small communities**. Boosts are proximity (your clubs, then friends, then dorm and major, then campus) multiplied by actionability, with same-club and same-author diversity demotion.

**Revisit ML ranking above roughly 100 items per day per user.** The full multi-stage architecture from the recommender research is the destination, not the starting point. Building it before there is content to rank is how feeds die.

### What it optimizes

In priority order: **actions taken from the feed**, then **new connections formed**, then **return visits.**

Explicitly not session length.

### The density benchmark

Fizz reaches **30% of weekly actives creating content**, against an industry norm near 1%. That is the number to chase, and it is reachable through campus-only scope and treating action as contribution, **without resorting to anonymity**.

### Seeding

The feed is seeded on day one with every public campus event and every claimed club page, so it is full before the first user posts.

---

## 8. Discovery

- **Clubs.** Category browse, search, "your friends joined," "for your major," **"meets when you're free,"** and a six-question quiz.
- **Events.** "This week on campus" as the home tab, with filters for tonight, free food, near me, and friends going, plus visible guest lists.
- **People.** Classmates, major, dorm, shared clubs, opt-in coffee-chat matching.
- **Freshman onboarding under 90 seconds**, whose success metric is exactly one RSVP.

---

## 9. Growth loops, ranked

1. **Officer roster import with SMS join links.** The direct GroupMe replacement.
2. **Public event RSVP pages that work without the app.**
3. **Pre-created "claim your club" pages** for every org in the campus directory.
4. **"3 friends going" social proof** on events.
5. **QR codes at club-fair tables.**
6. Permissioned contact import showing friends already present.
7. **Cross-club channels for co-hosted events.**
8. Paid campus ambassadors with per-signup club bounties.
9. **Officer-invites-officer.** Students holding positions in multiple clubs are the hubs of the entire graph.
10. Shareable weekly club recap cards for Instagram Stories.

**Sequenced against the calendar:** club fair week from late August to mid September, then the spring restart in late January, then **elections in March and April**, which is when officer handoff sells itself.

---

## 10. Weekly engagement model

| | Sessions/week | Push cap | Guaranteed | Success |
|---|---|---|---|---|
| **Member** | 3–4 | 6 | Sunday digest, one announcement, one event reminder | At least one action per week |
| **Officer** | 8–12 | 10 | Plus a Monday officer brief | At least one object created per week |

**Officer weekly actives is the leading indicator. Member weekly actives is derived from it.**

**Two weeks without an officer-created object is a club-death signal**, and it should trigger a human intervention, not a notification.
