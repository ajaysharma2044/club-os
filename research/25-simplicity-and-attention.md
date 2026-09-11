# 25 — Simplicity and Attention: What to Steal from Addictive Apps, What to Refuse

*Implementation brief, 2026-09-10. Not a new thesis. Locked product decisions stand: reverse-chronological feed with light boosts, no ML ranker first, no free-text posts in v1, six club nav items, three-tier notifications with suppression as the feature, north star = officer handoff completion rate. This document answers one question: how Instagram, LinkedIn, and similar products pull people back, which named UX laws they use or abuse, and what Club OS should implement so the product is super simple and still worth opening.*

---

## 0. The one-sentence answer

Those apps are sticky because they turn **unpredictable social reward** into a habit loop, then hide the cost of that loop behind infinite scroll, red dots, and ranking that optimizes session length. Club OS should steal the **simplicity** (few choices, one job per screen, familiar patterns, defaults) and refuse the **slot machine** (variable content dopamine, shame streaks, ML For You, notification spam). Pull people back with **unfinished work they already owe**, not with content they did not ask for.

That is already the record: a member sees three things this week; an officer sees what is due, who is doing it, what we have, and what we decided — one screen ([`docs/09-the-record.md`](../docs/09-the-record.md) §8). The north-star metric is handoff completion, not minutes in app ([`.cursor/rules/club-os-claude-session.mdc`](../.cursor/rules/club-os-claude-session.mdc)).

---

## 1. What Instagram, LinkedIn, and the rest actually do

### 1.1 The shared machine: variable rewards, then habit

B.F. Skinner showed that a **variable-ratio** schedule — sometimes a reward, sometimes nothing — produces the most extinction-resistant behavior. Nir Eyal packaged the product version as Trigger → Action → Variable Reward → Investment (*Hooked*, 2014). The reward that keeps people searching is not the like itself; it is **not knowing** whether the next pull will pay ([Eyal, "Variable Rewards"](https://www.nirandfar.com/want-to-hook-your-users-drive-them-crazy/)).

A 2020 *Business Ethics Quarterly* paper names the same mechanism as the ethics problem of the attention economy: intermittent reinforcement, pull-to-refresh as a slot-machine gesture, and social-validation rewards (likes, streaks) designed to maintain checking ([Bhargava & Velasquez](https://www.cambridge.org/core/journals/business-ethics-quarterly/article/ethics-of-the-attention-economy-the-problem-of-social-media-addiction/1CC67609A12E9A912BB8A291FDFFE799)). A 2025–2026 computational line of work fits the same loop to real posting data: likes modulate posting speed the way food pellets modulate lever-pressing, and a habitual system takes over for frequent users ([Lindström et al., *Nature Communications*](https://www.nature.com/articles/s41467-026-73547-6); review in [*Biological Psychiatry*](https://doi.org/10.1016/j.biopsych.2024.12.012)).

**Club OS takeaway.** A treasurer opening the app to sign a receipt is goal-directed. A member opening the app to see if anything new appeared is habitual. We want the first. We will not build the second.

### 1.2 Instagram: stories, digest pings, then fewer pings

Instagram’s stickiness is not one feature. It is:

- **Infinite / continuous surfaces** (Feed, Stories, Reels) with no end state.
- **Social proof** that is quantified and public (likes, follower counts, view counts).
- **Identity performance** (the profile as a highlight reel).
- **Notifications as the external trigger.**

The useful engineering fact, already cited in our chat spec, is that Instagram **cut notification volume without losing engagement** by switching from a click-through-rate filter to an **uplift / incrementality** model: send only if the ping is predicted to change whether the person would have opened the app anyway ([Meta Engineering, 2022](https://engineering.fb.com/2022/10/31/ml-applications/instagram-notification-management-machine-learning/)). In 2025 they added a diversity layer that **penalizes repetitive authors and surfaces**, again reducing daily volume while raising CTR ([Meta Engineering, 2025](https://engineering.fb.com/2025/09/02/ml-applications/a-new-ranking-framework-for-better-notification-quality-on-instagram/)).

They did this because spammy notifications cause people to **turn notifications off**, which destroys the habit trigger. Suppression is not kindness. It is how you keep the channel alive.

**Club OS takeaway.** Copy the *outcome* (fewer, more incremental pings). Do not copy the *optimizer* (time spent, CTR). Our locked notification design already does this: three tiers, officer announcements capped at three per club per week with the attention budget shown to the sender, Tier 2 batched and suppressed if the person has been active, quiet hours 11pm–8am ([`docs/08-chat-and-community.md`](../docs/08-chat-and-community.md) §4).

### 1.3 LinkedIn: identity, recency, dwell — not a confirmed “360Brew feed”

LinkedIn is addictive in a different register. The variable reward is **professional status**: who viewed you, who endorsed you, whether the post landed. The investment is the profile, which becomes a public CV you cannot afford to abandon.

What is **confirmed** from LinkedIn engineering:

- The feed is a multi-stage ranker. Implicit signals include clicks, likes, comments, shares, and **time viewed** ([LinkedIn Feed team](https://engineering.linkedin.com/teams/data/artificial-intelligence/feed)).
- In 2024 they published how they use **dwell time** as both a skip signal and a “long dwell” signal, normalized so they do not just promote whatever format already holds the eye. A/B tests lifted sessions and time spent, especially among passive scrollers ([Zhang, Kothari, Tiwana](https://www.linkedin.com/blog/engineering/feed/leveraging-dwell-time-to-improve-member-experiences-on-the-linkedin-feed)).

What is **not** confirmed, and should not drive our product:

- Creator-economy writeups treat **360Brew** as the 2026 live ranker that “reads posts like an editor.” LinkedIn has a research paper on a decoder-only ranking model with that name. A LinkedIn VP of engineering, Tim Jurka, has been quoted saying the 360Brew test was **shut down** as not the right fit ([Phil Szomszor summary of Jurka](https://www.linkedin.com/pulse/truth-behind-360brew-what-we-actually-know-dont-phil-szomszor-7yzre)). Treat 360Brew multipliers, “15-second dwell = +40% reach,” and similar cookbook numbers as **marketing inference**, not primary fact.

**Club OS takeaway.** LinkedIn’s real lesson for us is **identity continuity** (the person survives graduation; the profile is the record) and **recency of real work**, not dwell-optimized thought-leadership. We already locked: no ML ranker first; feed items are by-products of real actions; optimize actions taken, then new connections, then return visits — **explicitly not session length** ([`docs/08-chat-and-community.md`](../docs/08-chat-and-community.md) §7).

### 1.4 TikTok / Reels: the For You as a slot machine

Short-form video stacks three attention-capture patterns: **algorithmic personalization**, **infinite scroll**, and **autoplay**. A 2025 CHI study that paginated TikTok and turned autoplay off found measurable gains in users’ sense of agency ([Monge Roffarello et al.](https://iris.polito.it/retrieve/handle/11583/3008098/15d05b0d-fa80-463c-ada4-6003a1e181c8/3772363.3798790.pdf)). A 2024–2025 survey of college students found TikTok’s recommendation accuracy, serendipity, and effortlessness rated higher than Reels or Shorts, and those affordances predicted engagement and then problematic use ([Roberts & David](https://doi.org/10.1089/cyber.2024.0338)). Binge-scrolling research finds infinite scroll produces a perceived **loss of self-control**, then regret ([Telematics and Informatics](https://www.sciencedirect.com/science/article/abs/pii/S0736585324001047)).

**Club OS takeaway.** Do not ship a For You. Do not autoplay. Do not infinite-scroll club memory. A meeting list has an end. That end is a feature.

### 1.5 Snapchat: streaks as shame

Snapchat Streaks quantify consecutive days of exchange. Adolescents describe them as a chore they schedule first, send empty snaps to protect, and feel anxious about losing ([Throuvala et al.](https://irep.ntu.ac.uk/id/eprint/35383/1/12917_Throuvala.pdf); [Hristova et al., 2022](https://doi.org/10.1016/j.chbr.2022.100172)). A Belgian study of 2,483 early adolescents found streak participation associated with FOMO ([Franchina et al.](https://doi.org/10.1016/j.teler.2023.100087)). Mark Griffiths names the sunk-cost: the higher the streak, the more expensive it feels to stop ([Griffiths](https://irep.ntu.ac.uk/id/eprint/35779/1/13313_Griffiths.pdf)).

**Club OS takeaway.** Never streak a treasurer. “7-day ledger streak” is how you get fake receipts and muted officers. Handoff completion is a **finite checklist with a due date**, not a fire to keep lit.

### 1.6 GroupMe: the campus default, and why students mute it

GroupMe won campus because it was **just text the group**: phone number, no account, SMS fallback. On 17 August 2026 it began killing SMS mode on a rolling 7-day countdown ([GroupMe](https://groupme.com/blog/goodbye-sms-mode)). What remains is the thing clubs hate: reply-all noise. Microsoft documents that every reply notifies everyone, and groups over 200 “can get noisy.” The rational response is mute. A student paper calls it “a problematic necessity” and puts **notifications first** in the complaint list — DMs that do not alert, 100-person chats that must be muted, first-years added at the fair who then generate noise forever ([The Bucknellian](https://bucknellian.net/126849/opinion/groupme-a-problematic-necessity-for-college-campuses/)).

**Club OS takeaway.** Steal “just text the group.” Inbox stays GroupMe-ish. Do not Slack-ify it. The product differentiator is that a message object **writes the record** (RSVP, vote, payment, task) and that membership **rotates with the office**, not the graduating senior ([`docs/08-chat-and-community.md`](../docs/08-chat-and-community.md) §§3, 5).

---

## 2. Law-by-law: use / adapt / refuse

Definitions below follow [Laws of UX](https://lawsofux.com/) (Yablonski’s compilation of older findings). “IG/LI” is shorthand for the consumer social pattern, not a claim that each company cites the law in a design doc.

| Law | One-line definition | How IG / LI use or abuse it | Club OS |
|---|---|---|---|
| **Hick’s Law** | Decision time grows with the number and complexity of choices ([Hick & Hyman, 1952](https://lawsofux.com/hicks-law/)). | Stories / Reels / Shop / Live is choice overload dressed as features. Composer is simple; the *app* is not. | **Use.** Six club nav items, locked. One primary action per screen. No extra global destinations. |
| **Fitts’s Law** | Time to hit a target = distance + size ([Fitts, 1954](https://lawsofux.com/)). | Huge like / next-Reel targets; tiny “not interested.” | **Use.** The owed item and the check-in button are large and close. Mute and export are not hidden, but they are not the fat target. |
| **Miller’s 7±2** | Working memory is small; chunk, don’t recite the number as a hard cap ([Miller, 1956](https://lawsofux.com/millers-law/)). | Badge counts (“99+”) dump the whole graph into working memory. | **Use as chunking.** Officer home: due / people / money / last decision. Not seven widgets. |
| **Jakob’s Law** | People expect your product to work like the ones they already use ([Nielsen](https://lawsofux.com/jakobs-law/)). | IG taught the world the tab bar + infinite feed. LI taught the public CV. | **Adapt.** Inbox = GroupMe. Home = Canvas-ish dashboard. Do not invent a new information architecture. |
| **Tesler’s Law** | Complexity is conserved; someone has to eat it. | IG eats complexity in ranking so the surface stays “scroll.” The user pays in lost agency. | **Use, inverted.** We eat complexity in the record (bitemporal membership, two timestamps, append-only ledger). The front stays dumb. |
| **Peak-end rule** | People remember the peak and the end, not the average ([Kahneman](https://lawsofux.com/)). | Session ends on a cliffhanger Reel. | **Adapt.** End a meeting on the decision + owners. End handoff on “you are done.” Do not end on a tease. |
| **Zeigarnik** | Unfinished tasks stay in memory. | Red dots and “you have 14 notifications” as fake unfinished work. | **Use on real work only.** Open reimbursements, unsigned minutes, unclaimed clubs. Never on “people you may know.” |
| **Goal-gradient** | Effort increases as the goal nears. | LinkedIn profile strength bars; Snap streaks. | **Adapt for handoff.** A 9-item transition list that fills as docs, bank signers, and roster transfer. No daily login bar. |
| **Postel’s Law** | Be liberal in what you accept, conservative in what you emit. | LI accepts any post; emits a ranked, polished feed. | **Use.** Accept messy roster CSVs, Venmo screenshots, GroupMe exports. Emit one clean record. |
| **Aesthetic-usability** | Attractive UI is judged more usable. | Both apps invest heavily in craft so friction feels like quality. | **Use.** Craft is already specified ([`docs/06-design-system.md`](../docs/06-design-system.md)). Beauty is not a substitute for a short path. |
| **Von Restorff** | The different item is remembered. | The red badge, the “Sponsored” interruption, the story ring. | **Use once.** One visual accent on the thing you owe. Refuse a page of badges. |
| **Serial position** | First and last items are remembered. | Tab bars put Home/For You first and Profile last. | **Use.** Club nav: Home first, Settings last. Owed items first on Home. |
| **Parkinson’s Law** | Work expands to fill the time available. | Infinite scroll removes the stopping cue, so the session expands. | **Refuse the infinite. Use the deadline.** Quiet hours, announcement caps, meeting that produces tasks and ends. |
| **Occam’s razor** | Prefer the fewer-assumption design. | Feature accretion is the opposite. | **Use.** If a screen needs a tooltip to explain itself, cut the screen. |

---

## 3. What would poison this product

These are not aesthetic disagreements. They corrupt the north star or the record.

1. **An infinite club feed of free-text posts.** Empties in week two or fills with memes. Locked: no free-text posts in v1; items are by-products of actions.
2. **An ML For You / dwell ranker.** Optimizes session length. Small communities die when ranking hides the last real update (the Reddit / Nextdoor lesson already in [`docs/08-chat-and-community.md`](../docs/08-chat-and-community.md) §7). Revisit only above ~100 items/day/user.
3. **Red-dot spam and uncapped officer announcements.** Clubs already mute GroupMe. A muted Club OS is a dead record. Suppression is the feature.
4. **Streaks, points-for-login, shame counters on money or minutes.** Produces fake compliance. Handoff is a finite checklist.
5. **Pull-to-refresh as entertainment.** Refreshing the ledger should show the same $412.88 until someone files a counter-entry.
6. **Content dopamine (Reels of the bake sale, like counts as status).** The feed may show event albums; it may not become a performance surface.
7. **Configurable nav.** Canvas’s fifteen-item instructor-configured nav is the failure mode. Six items, non-configurable.
8. **Selling student data or university dashboards.** Locked. Attention we sell is verified and consented; the student and the club own the record.
9. **Forecasting on by default, or many knobs.** One control, off.
10. **A proprietary Inbox students will not check.** If chat feels like Slack, they stay in GroupMe. Keep it flat and text-first.

---

## 4. What to steal so it stays super simple

Twelve concrete rules. These are the implementation list.

1. **Six places, always.** Club: Home, Events, Files, People, Money, Settings. Global: Home, Discover, Inbox, Account. No seventh item “just for officers.”
2. **One primary action per screen.** Everything else is secondary or disclosed. Dashboard: do the thing you owe. Club Home: do the thing this club owes. Events: the next event or New event. Money: the next unsigned payment.
3. **“You owe” outranks “what’s new.”** Zeigarnik on real commitments only. The first thing on Home is the oldest open obligation, not an activity stream.
4. **Recognition over recall (Canvas, not Notion).** Clubs as colored cards you already know. No “create a database.” No empty composer asking you to perform.
5. **Defaults, then progressive disclosure.** Quiet hours on. Forecasting off. Announcement cap visible before send. Advanced ledger accounts behind one more click.
6. **Inbox is “just text the group.”** Channels + lightweight topics underneath; the member should not have to learn Slack. Rich objects are two taps from the composer and write the record.
7. **Stopping cues.** Lists end. Meetings resolve. Topics auto-resolve 48 hours after the event. A completed handoff says completed.
8. **Social proof only on action.** “3 friends going” on an event RSVP is allowed ([`docs/08-chat-and-community.md`](../docs/08-chat-and-community.md) §9). Follower counts, public like tallies, and “your post is performing” are not.
9. **External trigger = due work, not FOMO.** Push: officer announcement (capped), direct mention, your own due commitment. Sunday member digest. Monday officer brief. Two weeks without an officer-created object triggers a human, not a badge.
10. **Eat the complexity in the backend.** Tesler: bitemporal positions, two timestamps, append-only money, club-owned files. The treasurer sees one number.
11. **Familiar nouns.** Dashboard (Canvas), Inbox (GroupMe/iMessage), Files (not Workspace), Money (not Treasury), People (not Roster CRM).
12. **Measure return by obligation cleared, not session length.** Member success: one action a week. Officer success: one object created a week. Company success: handoff completed.

---

## 5. We will not ship (dark patterns)

Explicit refuse list. If a PR contains one of these, it is not a taste issue; it is out of scope.

- For You / ML ranker / dwell-optimized feed
- Infinite scroll or autoplay on any club surface
- Free-text posting in v1
- Streaks, daily login rewards, disappearing “use it or lose it” history
- Red-dot counts that mix mentions, likes, and marketing
- Recapture email / push after a user said too many
- Fake urgency (“3 people looking at this event”) that is not a real RSVP
- Confirmshaming (“No, I don’t care about my club”)
- Roach-motel: easy to join, hard to export. Export is one click, always ([`docs/09-the-record.md`](../docs/09-the-record.md) §5)
- Dark-pattern consent for employer or sponsor access
- Public leaderboards of dues owed or attendance shame
- Read receipts on ordinary chat (must-read announcements only)
- Badge-hunting gamification of the record (points may exist later for attendance; they will not gate basic use)
- Seventh nav item, configurable nav, or a “Home vs For You” toggle

---

## 6. What this brief does *not* reopen

Universities are not a customer. Feed ranking stays reverse-chronological with light boosts. Chat stays channels + topics with a GroupMe-feeling Inbox. Forecasting stays one switch, off. The person is continuous across graduation. We do not sell student data. We do not start a second research track on attention economics beyond what is needed to keep the front simple.

The front is simple so the record can be real. Stickiness that corrupts the record is not growth. It is how clubs lose their memory again, this time inside our product.

---

## Sources

- Hick, W. E.; Hyman, R. Choice reaction time. Summarized at [Laws of UX: Hick’s Law](https://lawsofux.com/hicks-law/).
- Fitts, P. M. (1954). The information capacity of the human motor system. Summarized at [Laws of UX](https://lawsofux.com/).
- Miller, G. A. (1956). [The magical number seven, plus or minus two](https://psychclassics.yorku.ca/Miller/). [Laws of UX: Miller’s Law](https://lawsofux.com/millers-law/).
- Nielsen, J. [Jakob’s Law](https://lawsofux.com/jakobs-law/).
- Yablonski, J. [Laws of UX](https://lawsofux.com/) (Tesler, Peak-end, Zeigarnik, Goal-gradient, Postel, aesthetic-usability, Von Restorff, serial position, Parkinson, Occam).
- Eyal, N. [Variable Rewards: Want To Hook Users? Drive Them Crazy](https://www.nirandfar.com/want-to-hook-your-users-drive-them-crazy/).
- Bhargava, V. R.; Velasquez, M. (2020). [Ethics of the Attention Economy](https://www.cambridge.org/core/journals/business-ethics-quarterly/article/ethics-of-the-attention-economy-the-problem-of-social-media-addiction/1CC67609A12E9A912BB8A291FDFFE799). *Business Ethics Quarterly*.
- Lindström, B. et al. (2026). [A computational model of reward learning and habits on social media](https://www.nature.com/articles/s41467-026-73547-6). *Nature Communications*.
- Lindström et al. review. [Old Strategies, New Environments: Reinforcement Learning on Social Media](https://doi.org/10.1016/j.biopsych.2024.12.012). *Biological Psychiatry*.
- Zhang, N. (2022). [Improving Instagram notification management with machine learning and causal inference](https://engineering.fb.com/2022/10/31/ml-applications/instagram-notification-management-machine-learning/). Meta Engineering.
- Sun, X. et al. (2025). [A new ranking framework for better notification quality on Instagram](https://engineering.fb.com/2025/09/02/ml-applications/a-new-ranking-framework-for-better-notification-quality-on-instagram/). Meta Engineering.
- Zhang, F.; Kothari, M.; Tiwana, B. S. (2024). [Leveraging Dwell Time to Improve Member Experiences on the LinkedIn Feed](https://www.linkedin.com/blog/engineering/feed/leveraging-dwell-time-to-improve-member-experiences-on-the-linkedin-feed).
- LinkedIn. [Feed relevance](https://engineering.linkedin.com/teams/data/artificial-intelligence/feed) (implicit signals include time viewed).
- Szomszor, P. [The truth behind ‘360Brew’](https://www.linkedin.com/pulse/truth-behind-360brew-what-we-actually-know-dont-phil-szomszor-7yzre) (quotes Tim Jurka: test shut down).
- Roberts, J. A.; David, M. E. [Technology Affordances… TikTok, Instagram Reels, and YouTube Shorts](https://doi.org/10.1089/cyber.2024.0338).
- Monge Roffarello, A. et al. [Am I in Control? How the Design of the TikTok Feed Shapes Users’ Sense of Agency](https://iris.polito.it/retrieve/handle/11583/3008098/15d05b0d-fa80-463c-ada4-6003a1e181c8/3772363.3798790.pdf).
- [Unveiling the dynamics of binge-scrolling](https://www.sciencedirect.com/science/article/abs/pii/S0736585324001047).
- Throuvala, M. et al. [Motivational processes… adolescents](https://irep.ntu.ac.uk/id/eprint/35383/1/12917_Throuvala.pdf).
- Hristova, D. et al. (2022). [“Why did we lose our snapchat streak?”](https://doi.org/10.1016/j.chbr.2022.100172).
- Franchina, V. et al. (2023). [Snapchat streaks… FOMO](https://doi.org/10.1016/j.teler.2023.100087).
- Griffiths, M. [Adolescent social networking: How do social media operators facilitate habitual use?](https://irep.ntu.ac.uk/id/eprint/35779/1/13313_Griffiths.pdf).
- GroupMe (2026-08-17). [Saying goodbye to SMS mode](https://groupme.com/blog/goodbye-sms-mode).
- The Bucknellian. [GroupMe: A problematic necessity for college campuses](https://bucknellian.net/126849/opinion/groupme-a-problematic-necessity-for-college-campuses/).
