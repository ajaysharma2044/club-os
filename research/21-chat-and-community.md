# 21 — Chat and Community: Product Design for College Clubs

*Research compiled 2026-09-10. Every claim is linked to a primary source where one exists. The final section is a directly implementable spec.*

---

## 0. The headline: the incumbent just dropped its own moat

On **17 August 2026**, GroupMe announced it is killing SMS mode. From the company's own post: *"We're winding down SMS mode on a rolling basis."* The next time a non-app member receives a group message by text, they get a notice and a **7-day countdown**, after which *"group messages will stop arriving by SMS"* ([GroupMe, "Saying goodbye to SMS mode"](https://groupme.com/blog/goodbye-sms-mode)). GroupMe's stated reason is that the app has *"grown far beyond what a text message can hold"* — photos, videos, events, polls, shared albums, DMs, reactions — and *"SMS can't carry any of that. It can carry one line of plain text."*

This matters more than any feature gap in the category. SMS fallback was the **entire** structural reason GroupMe beat Discord and Slack on US campuses: it was the only major group chat where a person could participate *with no account, no install, and no smartphone*. GroupMe's own marketing said so as recently as this year — *"GroupMe's SMS fallback even allows members without smartphones or app access to join via regular text messages"* ([GroupMe blog](https://groupme.com/blog/why-more-parents-teachers-and-teams-are-choosing-groupme-for-group-communication)) — and its Discord-comparison page leaned on it as the differentiator ([GroupMe blog](https://groupme.com/blog/blog-private-group-chat-trusted-by-millions-discord-alternative)). A change.org petition against the shutdown has **5,862 verified signatures** and quotes GroupMe's own broken promise back at it: *"Even your friends without smartphones can join."* ([petition](https://www.change.org/p/urge-groupme-to-continue-supporting-sms-messaging)).

What survives at GroupMe is precisely what we should copy and then beat: *"you can still invite friends to a group or event by their number, and they'll get a text with a link to join."* Phone-number invites, SMS-delivered join links, zero-password onboarding. Everything else is now up for grabs, and **fall 2026 is the switching window** — the first fall where the thing every club relied on stops working mid-semester.

**Four more findings that should move the roadmap**, each developed below: Slack free is **90 days of history** and $7.25–8.75/user/month to escape ([Slack](https://slack.com/pricing)) — $3,480/yr for a 40-person club, so permanent free history is a defensible wedge, not a feature. Instagram's **incrementality model beat its CTR model on notification volume with no engagement loss** ([Meta](https://engineering.fb.com/2022/10/31/ml-applications/instagram-notification-management-machine-learning/)) — suppression is a product feature. **Perspective API shuts down 31 Dec 2026** ([Perspective](https://perspectiveapi.com/)), so build moderation on OpenAI's free omni-moderation endpoint plus a CSAM hash-matching vendor. And **Fizz gets 30% of weekly actives creating content against a ~1% industry norm** ([Forbes](https://www.forbes.com/sites/ianshepherd/2025/04/18/gen-zs-underground-social-network-just-went-national-and-its-blowing-up/)) — campus-bounded scope collapses the lurker ratio ~30×.

---

## 1. The incumbent landscape, precisely

### 1.1 GroupMe: what it actually is

| Property | Reality | Source |
|---|---|---|
| Identity | Phone number (or email); number is hidden from other members | [GroupMe](https://groupme.com/blog/why-more-parents-teachers-and-teams-are-choosing-groupme-for-group-communication) |
| Structure | One flat group. No channels, no threads, no topics | product |
| Group cap | *"By default, you can have up to 5,000 members in a group. GroupMe can't support groups larger than 5,000."* | [Microsoft Support](https://support.microsoft.com/en-us/groupme/can-i-increase-the-group-limit-in-groupme) |
| Noise model | *"GroupMe is reply-all, so whenever a member replies to the group number, everyone in the group will get a notification"*; groups over 200 *"can get noisy"* | [Microsoft Support](https://support.microsoft.com/en-us/groupme/can-i-increase-the-group-limit-in-groupme) |
| Objects | Likes (heart), polls, events, calendar, shared albums, DMs, reactions | [GroupMe](https://groupme.com/blog/goodbye-sms-mode) |
| Price | *"every single feature in GroupMe is free… Polls? Free. Events? Free."* | [GroupMe](https://groupme.com/blog/blog-private-group-chat-trusted-by-millions-discord-alternative) |
| SMS | **Removed, rolling from Aug 2026** | [GroupMe](https://groupme.com/blog/goodbye-sms-mode) |

**Why clubs pick it.** Three reasons, in order. (1) **Zero account friction**: at a club fair you collect a phone number on a clipboard and add the person; they do not create an account, pick a username, accept an invite, or join a "server." (2) **It is the campus default**, so a freshman already has it — the app is a social protocol, not a choice. (3) **It is flat**, so an officer posting "meeting moved to 7" reaches everyone with no structure to get wrong. The Bucknellian's student write-up frames it as *"a problematic necessity"* — nobody likes it, everybody uses it ([The Bucknellian](https://bucknellian.net/126849/opinion/groupme-a-problematic-necessity-for-college-campuses/)).

**Failure modes** (all of these are our product spec in negative):

- **Notification overload from reply-all.** Microsoft documents it as a property of the system, not a bug. The rational response is to mute, and a muted GroupMe is a dead GroupMe — the officer's announcement and the meme land in the same undifferentiated stream, so muting one mutes both.
- **No threading.** Six committees braid into one scroll. Zulip's critique of optional threading applies doubly to no threading: *"threads being made after the fact with many conversations braided together, so you have to untangle them"* ([HN discussion](https://news.ycombinator.com/item?id=27149487)).
- **No search worth using, no roles, no permissions.** Every member can add members, rename the group, and post. There is no e-board channel; officers open a *second* GroupMe, which is how a 40-person club ends up with five group chats.
- **No history for new members** in any usable sense. A January joiner inherits an unlabeled scroll.
- **Weak moderation.** GroupMe has been the medium for serious campus incidents — e.g. the University of Oklahoma student no longer enrolled after racist GroupMe messages ([The Daily Pennsylvanian](https://thedp.com/article/2016/11/university-of-oklahoma-student-no-longer-enrolled-after-racist-groupme-messages)).
- **Institutional amnesia.** Corroborated directly in our own Reddit corpus: *"Clubs were running everything through spreadsheets, Google Forms, GroupMe, random docs, and then when new officers took over, half the stuff was gone or outdated"* (r/berkeley, see `notes.md`).

### 1.2 Discord

Discord is structurally the *most* capable of the incumbents and the worst fit for the median club. DePaul's Office of Student Involvement publishes a recommended server layout — welcome/rules, leadership-only announcements, exec planning, introductions, general chat, events, bot-spam — and tells orgs to *"use Categories to group related channels and avoid over-complication"* ([DePaul OSI](https://dehub.depaul.edu/osi/discord-servers/)). It also puts the entire trust-and-safety burden on 20-year-olds: monitor for suspicious accounts, vet members in an intro channel, ban and delete, use Slow Mode and AutoMod, read audit logs.

AutoMod is real but shallow: one *"Commonly Flagged Words"* preset plus **up to 3 custom keyword filters of 1,000 keywords each**, actions limited to block / alert / timeout, exempting anyone with Manage Server ([Discord Safety](https://discord.com/safety/auto-moderation-in-discord)); over 20 million messages were blocked in its first months ([Engadget](https://www.engadget.com/discord-automod-announced-150037142.html)). Servers then bolt on MEE6 or Carl-bot for levels and logging — a second product surface a volunteer now administers.

The **dead-server problem** is the dominant failure: *"Empty channels actively hurt servers by signaling to every new member that the place is dead,"* with the prescription that a small-to-medium server needs **5–8 channels, not 25** ([Phantom Blog](https://phantombot.gg/blog/what-to-do-when-your-discord-server-dies-reviving-an-inactive-community)). A 40-person club that copies DePaul's seven-channel template has five channels at zero messages by week three. Add the cultural tax — Discord reads as gaming infrastructure to a dance team or a pre-law society — and the officer's real choice becomes Discord *plus* GroupMe. Our own corpus has an anime club where *"nobody's shown up to meetings for at least 2 semesters… only the discord's still active"*: the server outlives the club, which is the inverse of useful.

### 1.3 Slack: confirmed dead for clubs, and why

The free tier is **90 days of history**: *"90 days of message history. Messages are saved and searchable for 90 days,"* plus **10 app integrations** and 1:1-only huddles ([Slack pricing](https://slack.com/pricing)). Paid is **$8.75/user/month** monthly or **$7.25/user/month** annual for Pro; **$18 / $15** for Business+ ([Slack pricing](https://slack.com/pricing)).

Do the arithmetic a club treasurer does: a 40-member club on Pro annual is **$3,480/year**. Typical RSO funding is in the low hundreds to low thousands (see `07-club-needs-and-funding.md`), and one Georgia Tech thread argues over raising a per-student activity fee *"from the current $40 to $60"* to keep engineering RSOs alive (`notes.md`). Slack is not expensive-but-worth-it for a club; it is an order of magnitude outside the budget. And the 90-day limit deletes exactly the asset a club needs most: the institutional memory that survives officer turnover. **Slack's free tier is structurally incompatible with an organization whose defining feature is annual leadership replacement.**

Slack's *ideas* remain the best in the category and we should steal them: Block Kit's actionable messages, Workflow Builder's no-code automations, Slack Connect's cross-org channels. More on each in §2.6 and §2.2.

### 1.4 WhatsApp, iMessage, Instagram

- **WhatsApp** dominates international-student cohorts and any club with a diaspora or language affiliation. Communities (a parent container with an announcement group plus sub-groups) is structurally the closest mainstream product to what clubs need. Its weaknesses are the same as GroupMe's — phone-number identity leaks to the group by default, no roles beyond admin, no searchable institutional archive, no objects beyond polls.
- **iMessage groups** are where the e-board actually lives. Every club has a green-bubble-excluding officer group chat that carries the real decisions, and this is a *permanent* feature of the landscape, not a gap to close. Design implication: our e-board channel must be better than an iMessage group at the three things officers do there — deciding, delegating, and remembering — or it will not displace it.
- **Instagram is the single most under-appreciated club surface.** The club's public identity, its event flyers, and its recruiting all run through an Instagram account; interest lists run through **group DMs**; and one-way officer→member blasts increasingly run through **Broadcast Channels**, a creator-to-audience channel where only the owner posts and members react. Any club OS that cannot ingest or link an Instagram presence is fighting the club's actual front door. (Fizz measures this behavior directly: **57%** of students share posts off-platform ([Fizz](https://fizz.social/advertise)).)

### 1.5 The purpose-built group apps

- **BAND** — boards + chat + calendar + polls + attendance + notices, popular with sports teams and church groups. Closest philosophical ancestor to what we're building, but not a campus product and not a social network.
- **Heylo** — free, with *"topic-organized chats and event-specific discussions that keep members connected before, during, and after gatherings,"* plus RSVPs, waitlists, waivers, dues, and attendance analytics; monetized on a service fee on payments ([Heylo](https://www.heylo.com/)). **This is independent convergent evidence for our core chat structure**: a club-shaped product, built by people who studied clubs, landed on *topics + event-scoped chats*, not channels.
- **Geneva** — interest-group "homes" with rooms; **acquired by Bumble**, acquisition *"has officially closed"* ([Geneva](https://www.geneva.com/)). Geneva's failure mode is instructive: beautiful rooms, no reason to open the app on a Tuesday.

### 1.6 Scorecard

| | Account friction | Structure | History for new members | Roles/permissions | Notification control | Rich objects | Cost |
|---|---|---|---|---|---|---|---|
| GroupMe | Lowest (phone #) | Flat only | None usable | None | Mute/unmute | Likes, polls, events, calendar | Free |
| Discord | High (server, username) | Channels + roles + forums | Full but unnavigable | Excellent | Best-in-class granularity | Buttons, selects, modals, slash cmds | Free |
| Slack | Medium (workspace invite) | Channels + threads | **90 days** | Good | Excellent | Block Kit, Workflows | $7.25–18/user/mo |
| WhatsApp | Low (phone #) | Communities + groups | Full, unsearchable | Admin only | Per-chat mute | Polls, events | Free |
| Instagram DM/Broadcast | None (already there) | Flat / one-way | None | Owner-only | Coarse | Reactions, polls | Free |
| Heylo / BAND | Low | Topics + events | Full | Yes | Medium | Events, dues, attendance | Free / freemium |

---

## 2. Chat product design for clubs

### 2.1 Structure: the answer is channels + topics, and it is not close

The four available models:

1. **One flat group (GroupMe).** Zero cognitive cost, zero organization. Breaks above ~30 messages/day or ~2 concurrent conversations.
2. **Channels (Slack/Discord).** Requires someone to design an information architecture up front, before anyone knows which conversations will exist. Clubs over-create channels and then stare at empty ones — the dead-server problem.
3. **Channels + optional threads (Slack).** The documented failure: *"when threading is optional, people don't use it,"* which produces after-the-fact braiding ([HN](https://news.ycombinator.com/item?id=27149487)). Slack itself treats threads as *"secondary to the main conversation"* and shows them in a side panel — Zulip's critique is that *"that cramped panel is where you may read most substantive discussions"* ([Zulip](https://zulip.com/help/introduction-to-topics)).
4. **Channels + mandatory lightweight topics (Zulip).**

**Zulip's model, studied closely.** A channel determines *who receives messages*; a topic organizes *what the conversation is about* within it. *"Lots of conversations can happen in the same channel at the same time, each in its own topic."* Sending requires naming a topic, framed to the user as *"Hey, can we chat about…?"*, with guidance to keep names *"brief but specific."* Topics can be renamed (*"you can always change it later"*), **resolved**, moved between topics, and moved between channels. Critically, topics render **in the main message view, not a side panel**, and are **labeled**, so *"threads [are] easy to find"* rather than requiring you to remember which first message anchored a thread ([Zulip](https://zulip.com/help/introduction-to-topics)).

The asynchronous property is the one that matters for clubs: *"pick up a conversation thread hours (or days!) later"* because new messages resurface a long-running topic, removing *"the stress of needing to respond to chat messages right away"* — and directly addressing the failure that *"being unavailable when a discussion is happening often means your perspective will never be heard"* ([Zulip](https://zulip.com/why-zulip/)). A college student's day is an interrupt-driven schedule of classes, shifts, and practice. The GroupMe model punishes everyone who was in a three-hour lab. The topic model does not.

**Recommendation for a 40-person club with 6 committees.** Do not ship an empty channel tree. Ship:

- **#general** — one channel, always present, seeded with the club's own history.
- **#announcements** — officers post, members read and acknowledge (§2.3).
- **One channel per committee**, but **auto-created only on first use**: the committee exists as an org object (a roster), and its channel materializes the first time someone posts to it. A committee with no traffic has no empty room to advertise its own death.
- **Topics inside every channel, mandatory but free.** Compose asks "about what?" with a pre-filled suggestion from the last topic, one tap to accept. The tax is one tap; the payoff is a labeled, resolvable, searchable, individually-mutable conversation.
- **Event channels are topics, not channels.** An event auto-creates a topic in the owning channel, auto-resolves 48h after the event, and archives into the event record.

This gives a 40-person club roughly **3 channels and 5–15 live topics** in a normal week — dense enough that nothing looks dead, structured enough that the treasurer can mute #social-committee without missing dues.

### 2.2 Scoping to org structure

Chat scoping must be **derived from the org chart, not hand-built**. The club already has roles (president, treasurer, committee chairs), a roster, cohorts (class year, pledge class, project team), and events. Every one of those is a channel candidate that the system can create and populate automatically, and, crucially, **maintain across officer transition** — the thing that kills every hand-built Discord.

| Scope | Membership rule | Lifecycle |
|---|---|---|
| Club-wide | All active members | Permanent |
| Announcements | All members; post = officer role | Permanent |
| E-board | Role = officer | Membership **auto-rotates at election**; history stays with the office, not the person |
| Committee | Committee roster | Auto-created on first post; auto-archived after 60 days silent |
| Cohort | Class year / project team | Per academic year |
| Event | RSVP "going" + organizers | Topic, auto-resolves 48h post-event |
| DM / small group | Ad hoc | Permanent |
| **Cross-club** | Two clubs' designated reps | Per collaboration |

**Cross-club channels** are the highest-leverage and least-served case. Co-hosted events (a cultural showcase run by four orgs, a hackathon with three sponsors-and-clubs) currently run on a fifth GroupMe that nobody owns. Slack Connect is the right shape — *"you don't need to give people access to your whole Slack workspace — just the channels that you need to collaborate in,"* with admin control over *"what partners can join, what they can see and share"* ([Slack Connect](https://slack.com/connect)) — but it is paid-only. We should ship it free, because it is also a **growth loop**: a cross-club channel drags a second club's officers into the product at full context.

**E-board history is the killer feature.** When a president graduates, the office's channel, its pinned decisions, its budget threads, and its vendor contacts stay. Officer transition is the single most-cited structural pain in our corpus — *"the officers previously were seniors and graduated. Leaving the club to 5 members"* (`notes.md`) — and no incumbent solves it.

### 2.3 Announcements vs discussion

These are different products wearing the same UI, and conflating them is why GroupMe gets muted.

- **Announcement posts are records, not messages.** They carry a title, a body, an optional action (RSVP / pay / acknowledge / read), an author who is an *office* not just a person, and an expiry.
- **Read receipts as a roll call.** Officers do not want "delivered"; they want *"who has seen this"* as a list, because the follow-up is a targeted DM to the four people who haven't. Ship a seen-by roster on announcements only, never on ordinary messages (the latter is a social-anxiety generator among peers).
- **Acknowledgment requests.** A one-tap "Got it" that produces a completion percentage. This is the digital version of the thing officers currently do by reading names at a meeting. Fizz's data says students *will* tap: **64%** participate in polls ([Fizz](https://fizz.social/advertise)).
- **Pinned must-reads.** A small, capped set (max 5) of pinned orientation items that a new member sees *first*, before any scroll.
- **Digest email** as the guaranteed-delivery backstop for announcements — see §2.4 and §6.

Design rule: **an announcement escalates, ordinary chat does not.** A member who mutes #general still gets announcements. That is the contract that makes muting safe, and making muting safe is what prevents the GroupMe death spiral.

### 2.4 Notification design — the #1 complaint everywhere

**What the incumbents do.**

| Product | Granularity | Quiet hours | Batching | Ranking |
|---|---|---|---|---|
| GroupMe | Mute / unmute per group | No | No | No |
| Discord | Server-level (All / @mentions / Nothing), **category and channel overrides**, suppress @everyone, per-role mention suppression, timed mutes | Partial | No | No |
| Slack | Global trigger (*"Everything"* vs *"Mentions and direct messages"*), per-channel overrides, **keyword alerts** (*"Keywords are not case-sensitive, but only exact matches will trigger"*), *"notification schedule"* (*"Outside of the schedule you set, your notifications will be paused"*), *"When I'm not active on desktop"* mobile timing, thread-reply badge exclusion ([Slack](https://slack.com/help/articles/201355156-Configure-your-Slack-notifications)) | Yes | Mobile delay only | No |
| Zulip | Per-channel desktop/mobile/email; **per-topic** follow / normal / unmute / mute; auto-follow topics you start, participate in, or are mentioned in; unread badge can count *followed topics only* ([Zulip](https://zulip.com/help/channel-notifications), [Zulip](https://zulip.com/help/follow-a-topic)) | Yes | No | No |
| Instagram | Coarse user controls | Yes | Yes | **ML-ranked** |
| LinkedIn | Coarse user controls | Yes | Yes | **ML-ranked** |

**What the ML platforms do**, and this is the part nobody in the club-tools category has copied:

- **LinkedIn's Air Traffic Controller (ATC)** unifies every notification through one Samza-based pipeline that does *channel selection* (email / SMS / push / in-app, chosen from member preferences, installed apps, and predictive models), *aggregation* (delay into RocksDB, then send a ranked group), *delivery-time optimization* (locale + engagement patterns, avoiding sleep hours), and *relevance filtering* (ML scores can suppress a notification entirely, downgrade it to in-app-only, or promote it to push). Result: *"we've been able to cut member complaints in half and create double digit increases in member engagement site-wide,"* at over a billion requests/day ([LinkedIn Engineering](https://www.linkedin.com/blog/engineering/messaging-notifications/air-traffic-controller-member-first-notifications-at-linkedin)).
- **Instagram's incrementality model** is the single most important idea here. CTR models sent digests to people *"who are relatively active in terms of using Instagram"* — people who would have seen the content anyway. Meta reframed it as a **user selection problem**, ran a 50/50 randomized send/drop experiment, and trained *"a neural network-based uplift model to predict the incremental impact between not sending and sending."* Scores are quantile-transformed to hold a fixed send rate. Outcome: they *"reduced the sending volume substantially compared to using the CTR model and also saw no decline in user engagement"* ([Meta Engineering](https://engineering.fb.com/2022/10/31/ml-applications/instagram-notification-management-machine-learning/)).
- **Instagram's 2025 diversity-aware ranking** multiplies relevance by a demotion factor — `Score(c) = R(c) × D(c)` — penalizing candidates similar to recent sends along author, content type, and surface, because engagement-only models *"risk creating monotonous experiences that feel 'spammy,' potentially causing users to disable notifications."* It *"significantly reduced daily notification volume while improving CTR"* ([Meta Engineering](https://engineering.fb.com/2025/09/02/ml-applications/a-new-ranking-framework-for-better-notification-quality-on-instagram/)).
- **Duolingo's sleeping/recovering bandit** optimizes *which* reminder template to send, handling novelty decay (a recency penalty on recently-sent arms) and conditional eligibility (arms that are ineligible this round). Published result: *"a 0.5% increase in total daily active users (DAUs) and a 2% increase in new user retention over a strong baseline"* ([KDD 2020](https://www.kdd.org/kdd2020/accepted-papers/view/a-sleeping-recovering-bandit-algorithm-for-optimizing-recurring-notificatio.html); [paper](https://research.duolingo.com/papers/yancey.kdd20.pdf)).
- **Linear** is the qualitative benchmark for the opposite philosophy: no ranking at all, just ruthlessly narrow defaults — you are notified about things *assigned to you or that you subscribed to*, and nothing else. For a 40-person club, Linear's discipline beats LinkedIn's ML on day one.

**Our design: a three-tier notification contract.**

**Tier 1 — Guaranteed (always breaks through, ignores mute, ignores quiet hours only for time-critical):**
1. An **announcement** from an officer in a club you belong to.
2. A **direct mention** of you, or a DM.
3. A **commitment you own** coming due — you RSVP'd and the event is in 2 hours; you have an assigned task due today; you owe dues that close tonight.

That is literally "the 3 things that matter." Cap Tier 1 at **3 pushes per club per week**; the 4th announcement in a week from the same club degrades to Tier 2 and the officer sees a visible "you are approaching your members' attention budget" meter. Making the *sender* feel the cost is more effective than making the receiver manage settings.

**Tier 2 — Batched digest (one push, once a day, at a learned time):** replies in topics you follow, new topics in channels you're in, RSVPs to your event, reactions, feed activity from friends. Delivery-time optimization per LinkedIn ATC; content selection by incrementality per Instagram — do not push a digest to a member who opened the app 20 minutes ago.

**Tier 3 — In-app only, no push:** everything else. Visible on the badge, never on the lock screen.

**Granularity we expose to the user** (Zulip's model, simplified to three words): every channel is **All / Mentions / Muted**; every topic is **Followed / Normal / Muted**. Auto-follow any topic you start, reply in, react to, or are mentioned in. Unread badge counts followed topics only. Plus Slack-style **keyword alerts** (a member who only cares about "formal" or "reimbursement" gets those). Plus **quiet hours**, default 11pm–8am, with an explicit override for Tier 1 time-critical only.

**The killer default:** a new member's first notification settings are set *from their answers at join time* ("I'm on the social committee; I'm not on marketing"), not from a global default they'll never open. And the app must ask, once, in week two: *"Too many, too few, or right?"* — a single three-option prompt, which is both a user-experience win and the labeled training data for the ranking model.

### 2.5 Onboarding a new member into existing history

A January joiner and a September freshman both arrive mid-story. Incumbents give them an unlabeled scroll (GroupMe, WhatsApp), an unnavigable archive (Discord), or nothing (Slack free after 90 days). Four mechanisms:

1. **Searchable, permanent archive** — the baseline, and a direct attack on Slack's 90-day limit. Full-text plus semantic search across messages, files, events, and decisions. Never delete.
2. **Labeled topics as the navigable unit.** Zulip's reading views are the model: the **Inbox** *"provides an overview of your conversations with unread messages"*, **Recent conversations** gives *"an overview of all the ongoing conversations"* with a "Participated" filter, and the **Combined feed** merges channels and DMs ([Zulip](https://zulip.com/help/reading-strategies)). A new member scanning 20 topic *titles* is doing something a new member scanning 4,000 messages cannot.
3. **LLM "catch me up."** Generate, on join: what this club does, who the officers are and what each owns, what's happening in the next 14 days, the 5 decisions made this semester, and the 3 things you personally need to do. Regenerate on demand ("catch me up on #fundraising since Tuesday"). This is the single most defensible feature against every incumbent, because it requires the permanent archive *and* the structured objects (events, tasks, roles) that a chat app doesn't have. Note the boundary: summarize, never act; and never summarize a channel the member cannot read.
4. **Pinned orientation.** Max 5 items, officer-curated, shown as a checklist before first scroll: what we do, when we meet, dues, the Drive, the calendar.

### 2.6 Rich objects in chat — "chat as a surface for actions"

The prior art is unambiguous. Slack **Block Kit** spans messages (50 blocks), modals (100), and App Home (100), with *"interactive components such as buttons, menus and text inputs"*, and the stated philosophy that adding one *"opened the door to user interaction"* — messages become interfaces ([Slack](https://docs.slack.dev/block-kit/)). **Workflow Builder** adds seven trigger types — link, webhook, scheduled, list update, message keyword, **channel join**, and **emoji reaction** — with Slack/connector/custom steps and buttons that pause a workflow pending a human ([Slack](https://slack.com/help/articles/17542172840595-Guide-to-Workflow-Builder)). Discord now supports **23 component types** and **up to 40 components per message**: buttons (5 per action row, 6 styles), string/user/role/channel/mentionable selects (25 options), text inputs, file upload, radio groups, checkboxes, media galleries, sections, separators ([Discord](https://docs.discord.com/developers/components/reference)). iMessage apps proved the consumer version: a payment or a poll rendered inline in a thread.

**Our catalog.** Every object is (a) createable from the composer in ≤2 taps, (b) renders as a live card, (c) updates in place, (d) writes to the club's structured record, and (e) is addressable by the LLM.

| Object | Inline affordance | Writes to |
|---|---|---|
| **RSVP card** | Going / Maybe / Can't + live count + "3 friends going" | Event, attendance, feed |
| **Availability poll** | Grid of times, tap-to-fill | Event scheduling |
| **Poll / vote** | Options, live bars, optional anonymous, optional quorum | Decision record |
| **Payment request** | Amount, deadline, Pay button, live paid/unpaid roster | Dues/treasury ledger |
| **Task assignment** | Assignee, due date, Done button | Task board |
| **Acknowledgment** | "Got it" + completion % | Announcement receipt |
| **Reminder** | "Remind me / remind the channel" at a time | Notification queue |
| **File / doc preview** | Inline preview + permanent link | Club Drive |
| **Form** | 1–5 fields inline, no leaving chat | Roster/application |
| **Decision** | Proposal → vote → resolved, pinned, permanent | Institutional memory |
| **Check-in code / QR** | Tap to check in at an event | Attendance, feed |
| **Reimbursement** | Upload receipt, amount, approve button | Treasury |

**Two design rules.** First, **resolvable topics**: any topic anchored by an object auto-resolves when the object completes (event passed, poll closed, task done), which is how a club's chat stays at 5–15 live topics instead of 200. Second, **the officer never leaves chat**: creating an event, collecting $15 from 30 people, and assigning three tasks all happen in the composer. The reason clubs use six tools is that every action requires leaving the chat; collapsing that is the product.

### 2.7 Moderation and safety: the non-negotiable baseline

We are a US consumer app hosting UGC among 18–22-year-olds, including minors (early-entry students, and high-school-aged admitted students). The obligations are concrete.

**App Store Guideline 1.2** requires, verbatim, four things of any UGC or social-networking app: *"A method for filtering objectionable material from being posted to the app"*; *"A mechanism to report offensive content and timely responses to concerns"*; *"The ability to block abusive users from the service"*; and *"Published contact information so users can easily reach you."* It also warns that apps used primarily for *"random or anonymous chat"* or *"bullying" "do not belong on the App Store and may be removed without notice"* ([Apple](https://developer.apple.com/app-store/review/guidelines/)). Guideline 1.1.1 bars *"defamatory, discriminatory, or mean-spirited content."* Guideline 5.1.4 governs data from minors ([Apple](https://developer.apple.com/app-store/review/guidelines/)). **These four mechanisms must ship in v1 or we do not ship.**

**CSAM / NCMEC.** 18 U.S.C. § 2258A requires providers with **actual knowledge** of apparent violations to report to the CyberTipline; reported content must be preserved **one year after submission**; penalties for failure reach **$850,000** for providers with ≥100M MAU and **$600,000** otherwise on a first violation, rising to **$1,000,000 / $850,000** for subsequent ones. There is **no affirmative duty to monitor or scan** — the duty triggers on actual knowledge ([18 U.S.C. § 2258A](https://www.law.cornell.edu/uscode/text/18/2258A)). Over 1,400 companies are registered to file ([NCMEC](https://www.missingkids.org/theissues/csam)). Practical implication: register with NCMEC before launch, build the report-and-preserve pipeline, and hash-match uploads.

**Title IX.** Title IX reaches *"sex-based harassment; sexual violence"* in *"any education program or activity receiving Federal financial assistance"* ([ED.gov](https://www.ed.gov/laws-and-policy/civil-rights-laws/title-ix-and-sex-discrimination)). Club chat is squarely inside a school's program or activity. Two design consequences: (1) **retention and export** — a university conducting a Title IX or student-conduct investigation will ask for records, and we need a lawful, auditable, narrow process for that, published in advance; (2) **hazing** — new-member/pledge chats are the highest-risk surface in the entire product, and we should build a hazing-specific classifier and a clearly-signposted anonymous report path, not rely on generic toxicity scores.

**Tooling.** The market just shifted under us. **Perspective API is being discontinued — *"The service will remain active until December 31, 2026"*, with *"no direct migration support"*** ([Perspective](https://perspectiveapi.com/)). Do not build on it. The **OpenAI moderation endpoint** (`omni-moderation-latest`) is *"free to use"*, handles text and images up to 20 MB, and scores thirteen categories: *harassment, harassment/threatening, hate, hate/threatening, illicit, illicit/violent, self-harm, self-harm/intent, self-harm/instructions, sexual, sexual/minors, violence, violence/graphic* ([OpenAI](https://developers.openai.com/api/docs/guides/moderation)). **Hive** is the enterprise option, processing *"billions of pieces of online content"* monthly for trust-and-safety teams ([Hive](https://hivemoderation.com/)). (Sift is fraud/ATO, not content — not a fit ([Sift](https://sift.com/products/content-integrity)).) Ship on OpenAI moderation + a hash-matching CSAM vendor + Discord-style keyword AutoMod that officers configure per club.

**E2EE.** Follow Discord's line exactly. Its DAVE protocol E2E-encrypts *audio and video only* — DM calls, group calls, voice channels, Go Live — while *"messages on Discord will continue to follow our content moderation approach and are not end-to-end encrypted"* ([Discord](https://discord.com/blog/meet-dave-e2ee-for-audio-video)). A product with a statutory CSAM duty, a Title IX-adjacent user base, and an App Store 1.2 filtering obligation cannot E2EE its group text. Encrypt in transit and at rest, be explicit and public about it, and do not promise what we will have to break.

**Baseline v1 checklist:** report content / report user (≤3 taps, from any message), block, per-club officer moderation (delete, timeout, remove), automated pre-post filter with per-club keyword lists, automated classifier on all public-feed content, published safety contact, NCMEC registration + preservation pipeline, retention policy and law-enforcement/university request policy published before launch, and a named human on call.

---

## 3. The social layer: making a campus feel alive

### 3.1 What the precedents teach

**Strava is the most important model and the least imitated.** Its feed is not posts; it is a feed of **real actions that cost something to produce**, with a one-tap social primitive (kudos) as the return. The scale is the proof: **14 billion kudos in 2025, up 20% year over year**; **activities with photos get 3.1× as many kudos**; **Strava Clubs nearly quadrupled in 2025 to over 1 million clubs**, with running clubs up **3.5×** and club events up **1.5×**; and **37% of respondents view run clubs as good places to meet people** ([Year in Sport analysis](https://www.hereandthere.club/p/a-look-at-stravas-2025-year-in-sport)). A feed where *the price of posting is having actually done the thing* cannot be gamed into slop, and it doubles as an attendance ledger.

The detail that matters most for us: **group activity multiplies social reciprocity.** For running, *"small groups of 2-3 see a 35% increase in kudos earned, while larger groups of 4 or more account for a 95% increase"*; for cycling the figures are **46%** and **121%** ([Strava statistics compilation](https://sqmagazine.co.uk/strava-statistics/)). A club event is, definitionally, a group activity. Strava has also had to spend real engineering on integrity — ML-based leaderboard-cheat detection applied retroactively to **34 million leaderboards, removing 6.5 million impossible activities from the top 10** ([TechCrunch](https://techcrunch.com/2024/05/16/strava-taps-ai-to-weed-out-leaderboard-cheats-unveils-family-plan-dark-mode-and-more)) — which is the standing warning about any campus leaderboard we might ship.

**Letterboxd and Untappd** prove that a feed of logged real-world actions compounds at small scale without algorithmic help. Letterboxd passed **30 million members**, with **898.5 million films logged in 2025 (+28%)**, 143.6M reviews (+49%), and 12.9M lists (+88%), and its Year in Review email reached **5.8 million users, up 14.3%** ([Letterboxd Year in Review](https://letterboxd.com/year-in-review/)). Untappd has surpassed **one billion check-ins** with badges as the immediate in-app reward ([The Untappd Lounge](https://lounge.untappd.com/everything-you-need-to-know-about-untappd-badges/)). Both give us the annual-recap ritual — a "your year in clubs" card — which is the cheapest dormant-user reactivation mechanic in existence and is inherently shareable.

**Fizz is the campus proof of density.** *"Trusted by over 1M U.S. college students"* across **750+** schools, *"used by over 95% of students"* at a list of elite campuses, **5.5 sessions per day**, **40M posts**, **64% participate in polls**, **57% share posts off-platform**, **58% use search intentionally** ([Fizz](https://fizz.social/advertise)). Growth is campus-by-campus with ambassadors who *"slid small paper slips in college buildings," "set up tables,"* and *"work[ed] with clubs, paying the club for each member that signed up"* ([The Consumer App Growth Playbook](https://getresidualthoughts.substack.com/p/the-consumer-app-growth-playbook)). Its moderation history is also the cautionary tale: 4,000 volunteer student moderators, then dedicated T&S staff plus *"technology from OpenAI"*, after **the UNC system moved to ban** anonymous apps including Fizz, Yik Yak, Sidechat, and Whisper over cyberbullying ([TechCrunch](https://techcrunch.com/2024/07/03/fizz-the-anonymous-gen-z-social-app-adds-a-marketplace-for-college-students/); [Inside Higher Ed](https://www.insidehighered.com/news/tech-innovation/teaching-learning/2024/03/13/unc-system-banning-anonymous-social-apps-over)). **Anonymity buys density and buys bans.** We take the campus-verified identity and the density playbook, and we do not take the anonymity.

**The single most load-bearing statistic in this whole report** also comes from Fizz: *"while most platforms have only 1% of users posting, on Fizz 30% of weekly active users create content"* ([Forbes, Apr 2025](https://www.forbes.com/sites/ianshepherd/2025/04/18/gen-zs-underground-social-network-just-went-national-and-its-blowing-up/)). A campus-bounded, low-identity-risk feed collapses the 90-9-1 lurker ratio by roughly **30×**. That effect is available to us without anonymity, by using **campus-only scope** and **actions rather than prose** as the contribution unit — the bar for "checking in at an event" is lower than the bar for typing something, and lower still than typing something under your real name in front of 20,000 classmates.

**The others, briefly.**
- **BeReal**: forced synchrony produced spectacular growth and an equally spectacular decay — roughly **15M DAU in October 2022 down to ~6M by early 2024**, acquired by Voodoo in June 2024 for up to **€500M (~$166M cash + ~$334M earn-out)** ([Tubefilter](https://www.tubefilter.com/2024/06/12/game-company-voodoo-acquires-bereal-500-million/); [TechCrunch](https://techcrunch.com/2024/06/15/deal-dive-bereal-got-its-best-case-scenario-exit)). A daily prompt is a notification product, not a community: there was no durable layer under the moment. Any synchrony mechanic we ship must leave a persistent artifact behind.
- **Instagram Close Friends and Notes**: the green ring is the best intimacy primitive in consumer software (close-friends posts reportedly draw ~10% engagement vs ~2.4% public), and Notes is the lowest-effort status format in the category — *"short posts of up to 60 characters using just text and emojis"*, shown to mutuals or Close Friends at the top of the inbox for 24 hours, with *"replies to notes… arrive as DMs"* ([Meta Newsroom](https://about.fb.com/news/2022/12/sharing-features-on-instagram-notes-group-profiles-and-more/)). Both argue for expiring, small-audience, sub-60-character formats over permanent public posts.
- **Snap Map**: ambient "who is nearby right now" at **300M+ monthly users** with Ghost Mode as the opt-out. It is the primitive our demographic already understands, and the one we should implement most conservatively.
- **Duolingo friend streaks**: *"over 70% of DAUs have a streak longer than one week, and nearly 20% have a streak longer than a year"*, and *"one-third of DAUs have a Friend Streak"* ([Deconstructor of Fun](https://www.deconstructoroffun.com/blog/2025/4/14/duolingo-how-the-15b-app-uses-gaming-principles-to-supercharge-dau-growth)). The key design move is that the streak is owed to *another person*, not to yourself.
- **GitHub's contribution graph**: a persistent, unranked visualization of real actions — and a cautionary tale, since any streak that becomes externally legible gets gamed with backdated commits, and critics correctly note it *"measures neither productivity, nor skill, nor engagement"* ([DEV](https://dev.to/sylwia-lask/your-github-contribution-graph-means-absolutely-nothing-and-heres-why-2kjc)). Never let a club attendance grid become a résumé metric.
- **Discord Rich Presence**: a profile that shows what someone is doing *right now*, with a **Join button** that drops a friend straight in ([Discord docs](https://docs.discord.com/developers/platform/rich-presence)). Our analog is "3 members are checked in at the club room now — join."

### 3.2 Our feed

**Objects that appear** (all of them real actions, none of them free-text posts in v1):

| Object | Who sees it | Why it's safe to show |
|---|---|---|
| Checked into an event | Campus + friends | Proof of presence; drives FOMO |
| Joined a club | Friends + that club | The "clubs your friends joined" loop |
| Club posted an event | Campus (if public) / club | Discovery |
| Photos from an event (album) | Club, optionally campus | 3.1× kudos effect |
| Shipped a project / won something | Campus | Rare, high-signal |
| New officer elected | Club + campus | Recognition; transition record |
| Hit a streak / milestone | Friends | Personal artifact |
| Club recap ("we did 4 events, 61 people came") | Campus | Officer-authored, weekly |
| Friend RSVP'd to an event you can join | Friends | Highest-converting item in the whole feed |

**Ranking — and an important correction.** The instinct is to rank. The evidence says *don't, yet.* Instagram's own case for ranking was a volume problem: pre-algorithm, *"Instagram users were missing 70 percent of all posts and 50 percent of their friends' posts."* That justification does not apply to a feed with 30 items a day. Worse, ranking actively harms low-volume communities: Reddit's Hot formula combines score with time decay, so it **requires an upvote velocity a small or new community cannot generate**, systematically burying legitimate content. And engagement-optimized ranking in small, high-stakes local communities is actively dangerous — After Babel's critique of Nextdoor observes that *"a small number of crime and safety posts are a huge source of engagement"* and that such ranking is not *"aligned with building social cohesion and trust"* ([After Babel](https://www.afterbabel.com/p/the-algorithm-next-door)). A campus is exactly that kind of small, high-context, everyone-knows-everyone community.

So: **reverse-chronological with a light boost, not a ranker.** Order by recency; apply a small multiplicative boost for proximity (your clubs > your friends > your dorm/major > campus) and for actionability (anything with a button beats anything without); apply an Instagram-style **diversity demotion** capping consecutive items from the same club or author, since one hyperactive club would otherwise own the feed ([Meta Engineering](https://engineering.fb.com/2025/09/02/ml-applications/a-new-ranking-framework-for-better-notification-quality-on-instagram/)). Revisit ML ranking only when a campus feed exceeds roughly 100 items/day per user, which is a Year-2 problem. Objectives, in priority order: (1) **actions taken from the feed** (RSVPs, joins, check-ins), not time spent; (2) **new-connection formation**; (3) **return visits**. Explicitly *not* an objective: session length.

**Scopes:** club-only (default for anything internal), campus-only (default for events and check-ins), friends-only (personal milestones), public (club profile pages, for recruiting and SEO). Never cross-campus in v1.

**Avoiding the dead feed in week one.** The failure mode is an empty room; the fix is to make the feed *derivative of work that already exists*. On day one of a campus launch, the feed should already contain: every public event on campus for the next two weeks (imported or officer-entered), every club's profile card, and the "claim your club" prompts. Then week one's user-generated density comes from check-ins at events that were going to happen anyway. **We never need a user to write a post for the feed to be full.** That is the structural advantage over Fizz, BeReal, and Geneva, all of which need someone to type something.

---

## 4. Discovery and "find your people"

**The club fair is the demand spike and the leaky bucket.** Rutgers' Involvement Fair is **Sunday, August 30, 2026, 3–7pm, with over 700 booths** ([Rutgers](https://sca.rutgers.edu/campus-involvement/traditions-and-signature-programs/involvement-fair)); Dartmouth's is **Sunday, September 13, 2026, 3–5pm** ([Dartmouth](https://students.dartmouth.edu/collis/events/orientation/student-involvement-fair)). The documented dynamic is that orgs *"try to grow their ranks by signing up swarms of — mostly — freshmen for email lists and GroupMe groups,"* and the fairs are *"chaotic, with too many options, too much noise"* ([Wake Forest Old Gold & Black](https://wfuogb.com/21008/opinion/joining-student-orgs-is-hot-but-but-the-involvement-fair-doesnt-have-to-be/); [Modern Campus](https://moderncampus.com/blog/22-creative-ways-to-promote-student-orgs-beyond-flyers-and-club-fairs.html)). Our own corpus quantifies the leak: *"we managed to get around 80 new signups… Guess how many people ended up coming to meetings out of those 80? 10. How many ended up staying? 0."* (`notes.md`). **A 12.5% show rate and a 0% retention rate is the problem to solve, and the fix is not more signups — it is what happens in the 72 hours after the signup.**

**Four discovery surfaces:**

1. **Club discovery.** Browse by category; search; **"clubs your friends joined"** (the single highest-converting recommendation type, per the Tinder/Facebook social-proof pattern); **"clubs for your major"**; **"clubs that meet when you're free"** (we have the schedule — nobody else does); and a 6-question quiz at onboarding whose real job is to seed the recommender, not to be accurate.
2. **Event discovery.** "This week on campus" as the default home tab; filters for *tonight*, *free food*, *near me*, *friends going*. Luma's free tier is the bar for frictionless RSVP — unlimited events and guests, email/SMS/push/WhatsApp reminders, check-in, 5% platform fee only on paid events ([Luma pricing](https://luma.com/pricing)) — and Partiful's lesson is social, not functional: real-time guest-list visibility where attendees *"stalk"* the list, comment, and reply to friends, with a text-blast channel and **no app required** ([Partiful](https://partiful.com/)). **Guest-list visibility is the feature. "Who else is going" converts strangers into attendees.**
3. **People discovery.** Classmates, same major, same dorm, same clubs, and an opt-in coffee-chat match. This is the highest-value and highest-risk surface: it must be opt-in, reciprocal, and never expose location or schedule.
4. **Freshman onboarding.** The whole flow in under 90 seconds: verify with .edu or phone → major/year/dorm → six interest taps → "here are 8 clubs and 5 events this week, 3 of your contacts are already here" → follow 3 clubs → RSVP to 1 event. **The success metric of onboarding is one RSVP, not one account.**

Meetup's model (categories + location + in-person/online split + "popular cities") is the generic version ([Meetup](https://www.meetup.com/)); ours is better because a campus is a bounded, dense, time-synchronized graph — everyone is in the same square mile with the same calendar. University directories and the incumbent admin platforms (CampusGroups, Anthology Engage, Presence) are the negative example: comprehensive, institutional, and unused. Even a competing vendor concedes the pattern — *"Mobile functionality was also extremely limited, which meant that students didn't use it all that much,"* and that when platforms are thin, *"adoption remains low. In some cases, institutions abandon the platform entirely"* ([Ready Education](https://www.readyeducation.com/articles/4-reasons-institutions-switch-student-engagement-platforms/)).

---

## 5. Growth loops for a campus product

The unit of adoption is **not** the student. It is **the club**, because chat is only useful when the whole group is there. Andrew Chen's framing is exact: *"The 'atomic network' is the smallest network needed that can stand on its own,"* and *"your product's first atomic network is probably smaller and more specific than you think"* — Uber's was "5pm at the Caltrain station," Facebook's was one campus ([Lenny Rachitsky, "The Atomic Network"](https://www.lennysnewsletter.com/p/atomic-network)). NFX's parallel "Minimum Viable Network" is *"the smallest number of users for which they will continue to generate actions in the system"* ([NFX](https://www.nfx.com/post/network-effects-manual)). **Ours is one club of 40 with its officers — not one campus.** A campus is a collection of atomic networks; you win it by winning ten of them.

**The multiplayer trigger.** A whole club switches at once when the officer's pain exceeds the switching cost *and* switching is a single decision by a single person. Three triggers, in descending strength:

1. **A forced break in the incumbent.** GroupMe's SMS shutdown is exactly this, right now ([GroupMe](https://groupme.com/blog/goodbye-sms-mode)).
2. **Officer transition.** In March–April, a new e-board inherits a mess and is explicitly looking for a fresh start. This is the annual, reliable trigger.
3. **A high-stakes event.** A club running a 300-person formal or a hackathon needs RSVPs, payments, and check-in in one place for a week, and the chat follows the event.

**Top 10 loops, ranked by expected impact:**

| # | Loop | Mechanism | Why it ranks here |
|---|---|---|---|
| 1 | **Officer imports the roster** | Paste phone numbers / upload CSV / import from GroupMe or Discord; everyone gets an SMS join link | One decision moves 40 people. This *is* the product's growth engine |
| 2 | **Event RSVP link pulls in non-users** | Public event page, RSVP with a phone number, no app required; app install offered after | Partiful/Luma's proven mechanic; every event is an acquisition channel |
| 3 | **"Claim your club" pages** | Pre-create a profile for every org in the university directory; officers claim | Yelp/LinkedIn playbook; makes the campus look full before anyone joins |
| 4 | **Guest-list social proof** | "3 of your friends are going" on every event | Converts discovery into attendance; the single highest-CTR feed item |
| 5 | **QR at the club fair** | One code per club, scanned at the table, lands on the club page pre-followed | Compresses the fair's 80 signups into 80 *accounts*, not 80 illegible emails |
| 6 | **Contact-import "3 friends already here"** | Permissioned contact match at onboarding | Density perception at first open; the Facebook/Tinder mechanic |
| 7 | **Cross-club channels** | Co-hosted event creates a shared channel; drags club #2's officers in at full context | Club-to-club referral with the highest intent of any loop |
| 8 | **Campus ambassadors** | Fizz's model: tabling, flyering, **pay clubs per member signed up** | Documented to work at 750+ campuses ([Fizz](https://fizz.social/advertise)) |
| 9 | **Officer invites officers** | "Which other clubs are you in?" at signup; one tap to invite their e-boards | Officers are multi-club by definition; highest-leverage individual node |
| 10 | **Weekly recap that's worth sharing** | Auto-generated club recap card, shareable to Instagram Stories | Rides the surface students already use (57% of Fizz users share off-platform) |

**Seasonal windows.** Late August–mid September (fair week and the first two weeks — the annual peak; Rutgers Aug 30, Dartmouth Sept 13); late January (spring recruitment and semester restart); **March–April (elections and officer transition — the second-best window and the one everyone ignores)**; and the budget-request deadline, whenever the student government sets it, which is when the treasurer has acute pain.

**Cold-start sequence:** one campus → one *type* of club (the multi-club officers who sit at the center of the graph, e.g. cultural orgs or Greek life) → 10 clubs at >80% roster coverage → the campus feed has enough events to be worth opening → then widen. Tinder's USC tour is the template: Whitney Wolfe presented to sororities, got the whole chapter to install, then walked to the brother fraternity — growing from **5,000 to 15,000 users** over one college tour ([Scott Clary case study](https://medium.com/scott-d-clary/sorority-parties-to-50-million-users-the-tinder-go-to-market-strategy-marketing-case-study-9c003b48dc8d)). Group-at-a-time, not person-at-a-time.

---

## 6. Retention: what brings a student back weekly

The honest constraint: **clubs meet weekly, so the utility clock ticks weekly.** A pure utility product is opened 1–2×/week and is therefore always one mute away from irrelevance. The mix has to be three-part.

| Driver | Frequency | Mechanism |
|---|---|---|
| **Utility** | 1–3×/week | The thing you must do: RSVP, pay dues, check the task, read the announcement |
| **Social** | 3–7×/week | Chat replies, friend activity, kudos on your check-in, "3 friends going" |
| **Serendipity** | 1–2×/week | "This week on campus", a club you didn't know existed, free food tonight |

**How the incumbents earn opens:** GroupMe earns them purely through notification interrupts (and loses them permanently on mute). Discord earns them through presence and always-on chat. Slack earns them through work obligation. None of these is available to us in week one — which is why the feed and the digest, not chat volume, are the retention instruments early.

**Instruments, with evidence:**
- **Tiered notifications** (§2.4): Tier 1 guarantees ~2–3 high-value opens/week per club.
- **A weekly digest**, Sunday evening — the one moment a student plans the week. Contents: your 3 commitments, your clubs' 5 events, 2 events your friends are going to, anything you owe. This is the guaranteed-delivery channel that survives push-permission denial.
- **Delivery-time optimization** per LinkedIn ATC (locale + engagement patterns, avoid sleep hours) ([LinkedIn Engineering](https://www.linkedin.com/blog/engineering/messaging-notifications/air-traffic-controller-member-first-notifications-at-linkedin)).
- **Streaks, carefully, and owed to another person.** Duolingo's notification bandit produced *"0.5% increase in total DAUs and a 2% increase in new user retention"* ([KDD](https://www.kdd.org/kdd2020/accepted-papers/view/a-sleeping-recovering-bandit-algorithm-for-optimizing-recurring-notificatio.html)) — real but modest. Its *social* streaks are far stronger: *"one-third of DAUs have a Friend Streak"* ([Deconstructor of Fun](https://www.deconstructoroffun.com/blog/2025/4/14/duolingo-how-the-15b-app-uses-gaming-principles-to-supercharge-dau-growth)). A daily personal streak is wrong for a weekly product; a streak owed to a teammate is right. Use a **semester attendance grid** (GitHub-style, private by default per the gaming critique) and **committee-level streaks** ("4 weeks running, your committee has had full attendance"), never a public personal daily streak.
- **The annual recap.** Letterboxd's Year in Review email reached **5.8M users, up 14.3% YoY** ([Letterboxd](https://letterboxd.com/year-in-review/)). A "your year in clubs" card at the end of each semester is the cheapest reactivation asset we can build and rides the Instagram-Story sharing behavior directly.
- **Kudos.** One-tap recognition on check-ins and completed tasks. Strava's 14 billion kudos ([Year in Sport](https://www.hereandthere.club/p/a-look-at-stravas-2025-year-in-sport)) is the proof that a costless positive primitive carries an enormous amount of a community's social weight.

**Weekly engagement model — the target:**

| | Members (the 35) | Officers (the 5) |
|---|---|---|
| Sessions/week | **3–4** | **8–12** |
| Push notifications received | ≤6 (3 Tier 1 + ≤3 digests) | ≤10 |
| Guaranteed weekly touches | Sunday digest; 1 announcement; 1 event reminder | Same + Monday officer brief |
| Core actions | 1 RSVP, 1 chat reply, 1 check-in, 1 feed scroll | 1 event created, 3 tasks moved, 1 announcement, 1 money action |
| Success metric | ≥1 **action** (not open) per week | ≥1 **object created** per week |
| Failure signal | 2 consecutive weeks with an open but no action → surface a lighter-weight re-engagement, not more pushes | No object created in 2 weeks → the club is dying; alert and offer help |

Officer WAU is the leading indicator of everything; member WAU is lagging. If officers create objects, members get pulled in. **Instrument officer retention as the primary metric and member retention as the derived one.**

---

## 7. Chat and community, specified

**7.1 Channel/topic model.** Channels + mandatory lightweight topics (Zulip's model, simplified). Default channels: **#general**, **#announcements**, **#eboard**. Committee channels are org objects that materialize on first post and auto-archive after 60 days of silence. Events create topics, not channels; topics auto-resolve 48h after the event. Topics are named, renameable, movable, resolvable, individually mutable, and render in the main view. Every channel's membership is derived from the roster/role graph and **auto-rotates at officer transition**; the office keeps the history, not the person. Cross-club channels are free and are a growth loop. DMs and small groups exist and are boring on purpose.

**7.2 Notification model.** Three tiers. **Tier 1 (guaranteed push, breaks mute):** officer announcements, direct mentions/DMs, and your own due commitments — capped at 3 per club per week, with a visible attention budget shown to the *sender*. **Tier 2 (one batched daily push at a learned time):** followed-topic replies, new topics, RSVPs, reactions, friend activity — suppressed by an incrementality model if you've been active recently, and diversity-demoted to avoid repetition. **Tier 3 (in-app only):** everything else. User granularity: channel = All/Mentions/Muted; topic = Followed/Normal/Muted; auto-follow topics you start, reply in, react to, or are mentioned in; keyword alerts; quiet hours 11pm–8am by default. Settings are initialized from join-time answers, and a single "too many / too few / right" prompt in week two supplies the training label.

**7.3 Rich-object catalog.** RSVP card, availability poll, poll/vote with optional quorum, payment request with live paid roster, task assignment, acknowledgment request, reminder, file/doc preview, inline form, decision record, event check-in/QR, reimbursement request. Every object is ≤2 taps from the composer, renders as a live card, updates in place, writes to the club's structured record, resolves its topic on completion, and is readable by the assistant.

**7.4 Moderation baseline (v1, non-negotiable).** The four App Store 1.2 mechanisms — pre-post filtering, in-app reporting with a real response SLA, user blocking, published contact. Plus: per-club officer tools (delete, timeout, remove) with an audit log; OpenAI `omni-moderation-latest` on all content and hash-matching on all uploads; per-club custom keyword filters (Discord AutoMod's shape); a hazing-specific classifier on new-member channels; NCMEC registration with a report-and-preserve-one-year pipeline; a published retention and legal-request policy; no E2EE on group text (Discord's DAVE line — encrypt calls, moderate text); and **do not build on Perspective API, which shuts down 31 Dec 2026.**

**7.5 Feed composition and ranking objectives.** Objects: event check-ins, club joins, new events, event photo albums, project/competition wins, officer elections, personal milestones, officer-authored weekly recaps, and friend RSVPs. No free-text posts in v1 — every feed item is the by-product of a real action, which is what makes the feed un-fakeable and un-empty. **Reverse-chronological with light multiplicative boosts**, not an ML ranker: proximity (your clubs > friends > dorm/major > campus) × actionability, plus same-club/same-author diversity demotion. Revisit ranking above ~100 items/day/user. Objectives in priority order: **actions taken from the feed**, then **new connections formed**, then **return visits**. Not session length. Target contribution rate: Fizz's **30% of WAU creating content** (vs ~1% industry norm) is the benchmark, reachable via campus-only scope and action-as-contribution rather than anonymity. Scopes: club-only, campus-only, friends-only, public club profile. Seeded on day one with every public campus event and every claimed club page, so the feed is full before the first user posts.

**7.6 Discovery surfaces.** (a) Club directory: category browse, search, "your friends joined", "for your major", "meets when you're free", 6-question quiz. (b) Event discovery: "this week on campus" as the home tab, with tonight / free food / near me / friends-going filters and visible guest lists. (c) People: classmates, major, dorm, shared clubs, opt-in coffee-chat matching. (d) Freshman onboarding under 90 seconds, whose success metric is one RSVP.

**7.7 Top 10 growth loops, ranked.** (1) Officer roster import with SMS join links. (2) Public event RSVP pages that work without the app. (3) Pre-created "claim your club" pages for every org in the directory. (4) "3 friends going" social proof on events. (5) QR codes at club-fair tables. (6) Permissioned contact import showing friends already present. (7) Cross-club channels for co-hosted events. (8) Paid campus ambassadors with per-signup club bounties. (9) Officer-invites-officer (multi-club officers are the graph's hubs). (10) Shareable weekly club recap cards for Instagram Stories. Sequenced against the calendar: fair week (late Aug–mid Sept) → spring restart (late Jan) → **elections (March–April)**.

**7.8 Weekly engagement model.** Members: 3–4 sessions/week, ≤6 pushes, guaranteed Sunday digest + 1 announcement + 1 event reminder, success = ≥1 action/week. Officers: 8–12 sessions/week, ≤10 pushes, plus a Monday officer brief, success = ≥1 object created/week. Officer WAU is the leading indicator; member WAU is derived. Two weeks without an officer-created object is a club-death signal and should trigger an intervention, not a notification.
