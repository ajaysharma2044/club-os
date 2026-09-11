# 16 — Collaborative Workspace, Projects, Scheduling, Applications & Forms

*Research track: best-in-class patterns to borrow for a free "operating system" for college clubs.*
*Compiled 2026-09-10. Primary sources fetched directly; inline URLs throughout.*

---

## 0. The framing problem

A club is not a company and not a class. It has four properties that break every general-purpose tool:

1. **100% turnover on a 4-year clock.** Every officer graduates. Institutional memory is the scarcest resource, and it currently lives in a senior's personal Google Drive and a Slack workspace nobody pays for.
2. **Zero budget and zero admin.** Nobody will pay $99/mo. Nobody will configure a Jira workflow. The tool must be free and must work on first use with no setup.
3. **Voluntary labor.** There is no manager, no performance review, and no consequence for ignoring a task. Accountability has to come from social visibility, not enforcement.
4. **Extreme heterogeneity.** A robotics team, a consulting club, a dance company, a newspaper, and an investment fund all call themselves "clubs" and share maybe 30% of their workflow.

Every pattern below should be read against those four constraints. The recurring conclusion: **borrow Basecamp's shape, Linear's opinions, Notion's templates-not-features scaling strategy, and Donut's mechanical simplicity.**

---

## 1. Project and task systems

### 1.1 The landscape, and what each one actually gets right

| Product | Core object model | The one thing it gets right | Why it fails a club |
|---|---|---|---|
| **Basecamp** | Project → {Message Board, To-dos, Docs & Files, Campfire, Schedule, Card Table, Check-ins} | **One page per project containing every tool.** No tab sprawl, no integrations to wire up. | Flat pricing, but $99/mo Pro tier; free tier is 1 project / 5 users ([pricing](https://basecamp.com/pricing)). No membership, events, or applications. |
| **Linear** | Team → Issue (status, assignee, estimate, priority, labels, project, cycle) → Project → Initiative | **Opinionated speed.** Refuses configurability; keyboard-first; cycles create rhythm. | Built for one job (shipping software) by full-time paid staff. Assumes a backlog culture clubs don't have. |
| **Asana** | Workspace → Team → Project → Section → Task → Subtask; Portfolios, Goals | **One task, one assignee.** Ownership is never ambiguous. | Heavy UI, paid for anything real, no social layer. |
| **Trello** | Board → List → Card (members, labels, due date, checklist) | **Approachability.** Sign up, make a board, done — the lowest-friction PM tool ever shipped ([tour](https://trello.com/tour)). | Breaks down past ~50 cards; no reporting, no docs, no accountability. |
| **Notion** | Page; Database (pages-as-rows) with property types + many views | **Everything is one primitive.** A database row *is* a page ([intro to databases](https://www.notion.com/help/intro-to-databases)). | Requires an architect. One person builds a beautiful workspace, graduates, and nobody can maintain it. |
| **Monday** | Board → Group → Item → Subitem, with column types | Colorful status columns make state legible at a glance. | Per-seat pricing; heavy sales motion. |
| **Jira** | Project → Issue Type → Workflow (statuses + transitions) → Board → Sprint | Configurable workflow engine; genuine audit trail. | Configuration *is* the product. Catastrophic for volunteers. |
| **GitHub Projects** | Project = a view layer over Issues/PRs + up to 50 custom fields; table / board / roadmap views; draft issues; built-in automations ([docs](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)) | **Metadata layer over items that live elsewhere.** Issues stay canonical; projects are lenses. | CS-only. Non-technical club members will never sign up. |
| **Height** | Task + attributes + lists; pivoted to "autonomous AI project manager" | Attempted to remove chores via AI. | Small, uncertain longevity. |
| **Campfire (ONCE)** | Rooms, @mentions, DMs — self-hosted, one-time purchase, now MIT-licensed and free ([once.com/campfire](https://once.com/campfire)) | Proof that chat can be a 2GB-RAM commodity, not a $8/user/mo SaaS. | Chat only. |

### 1.2 Basecamp in depth — the closest fit

Basecamp's structural claim is the one worth stealing wholesale: **"Every project in Basecamp receives its own dedicated page"** containing a fixed, small set of tools, and tools can be added or removed per project ([features](https://basecamp.com/features)). The pitch is explicitly anti-sprawl: *"spreading everything across different apps, browser tabs, emails, and chats doesn't work,"* and they position against tools that are *"bloated, complicated, and confusing,"* arguing *"software that's hard to use doesn't get used"* ([why-basecamp](https://basecamp.com/why-basecamp)).

The six tools inside a project map almost perfectly onto what a club committee needs:

| Basecamp tool | Club analogue |
|---|---|
| Message Board (posts + threaded comments, replaces email) | Officer announcements, "should we do X?" decisions with a durable record |
| To-dos (lists, assignee, due date, attachments, subtasks, notify-on-complete) | Event task lists |
| Docs & Files (searchable; links out to Figma/Google Docs) | Constitution, budget, design assets |
| Campfire chat (multiple rooms per project) | The Discord/GroupMe replacement |
| Schedule (with Google/Outlook calendar subscription) | Event calendar |
| Card Table (kanban with a **Triage** intake column) | Sponsorship pipeline, recruiting pipeline |
| Automatic Check-ins | The thing that replaces the weekly status meeting |

**Automatic Check-ins** are the single most underrated feature for volunteer organizations. They are *"recurring questions asked on schedules you define,"* whose *"responses aggregate into logs for easy team review, reducing meeting overhead"* ([features](https://basecamp.com/features)). For a club this is enormous: "What did your committee do this week?" asked every Sunday at 6pm, answers visible to everyone, no meeting required. It converts accountability from *managerial* (someone must chase you) to *social* (everyone sees you didn't answer). That is exactly the accountability model available to an organization with no authority over its members.

**Card Table** is Basecamp's kanban, but opinionated: it ships with a **Triage** column for incoming requests rather than an empty canvas, and supports notifications on new cards and new columns ([features](https://basecamp.com/features)). The lesson is that an intake column beats a blank board — the same lesson Linear encodes in Triage (§1.3).

**Hill Charts** deserve their own treatment. From Shape Up ch.13 ([basecamp.com/shapeup/3.4-chapter-13](https://basecamp.com/shapeup/3.4-chapter-13)):

- Work has two phases: **uphill** (figuring out — unknowns, exploration) and **downhill** (execution — known steps, predictable effort). The dinner-party example: deciding on a cuisine is uphill; shopping and cooking are downhill.
- Percent-done and task counts mislead because *"to-do lists grow as teams discover problems."* An empty list can mean "finished" or "we haven't discovered the work yet." The source is blunt that *"it's not meaningful to write '4 hours, or maybe 3 days' as the estimate."*
- The unit on the hill is a **scope** — an independent chunk like "Email Notification," not a task. Each scope is one dot.
- Team members drag their dots; snapshots are logged, so managers compare *movement over time*, not position.
- The key social mechanic: **a dot that hasn't moved raises a flag without anyone admitting they're stuck.** Instead of "are you stuck?" (which invites defensiveness), a lead asks *"What unknown is holding back 'Autosave'?"*

For clubs this is the answer to the hardest interpersonal problem in volunteer work: how do you notice that the sponsorship chair has done nothing for three weeks without accusing them? A hill chart makes stalled work visible as a property of the *work*, not the person. **This is a top-tier feature to steal.**

The surrounding Shape Up method also supplies useful vocabulary ([ch.1](https://basecamp.com/shapeup/0.3-chapter-01)): **appetite** (not estimate) — "How much time do we want to spend? How much is this idea worth?"; the **circuit breaker** — projects that run over "don't get an extension by default"; **scope hammering**; and **no backlog** — *"important ideas come back."* A club semester is structurally a 14-week cycle with a hard circuit breaker called finals.

One commercially relevant fact, with an important caveat. Basecamp's pricing page advertises education pricing, but the [discounts page](https://basecamp.com/discounts) narrows it sharply: teachers and students qualify only if they *"agree to use this Basecamp account **only** for classroom work,"* and *"we can only discount one account"* per entity. **Student organizations are not listed as qualifying.** So the closest structural competitor is *not* actually free for clubs — a meaningful opening. (The 501(c)(3) nonprofit discount is also out of reach for most clubs, which are not independently incorporated.)

### 1.3 Linear in depth — the opinions, not the features

Linear publishes seven principles ([linear.app/method/introduction](https://linear.app/method/introduction)): build for the creators; **purpose-built** (*"overly flexible software invites workflow chaos as organizations expand"*); create momentum, don't sprint; meaningful direction; **aim for clarity** (*"Don't invent terms if possible, as these can confuse and have different meanings in different teams"*); **say no to busy work** (*"A tool should work for you, not the other way around"*); simple first, then powerful.

The three bolded ones are directly applicable and non-obvious here. Clarity in particular: do **not** invent a proprietary vocabulary ("Pods," "Quests," "Hubs"). Clubs already say *e-board, committee, event, meeting, application, member, alumni*. Use those words — with 100% annual turnover, every invented noun is onboarding debt that never amortizes.

**Triage** ([docs](https://linear.app/docs/triage)) is *"a special inbox for your team"* where work from outside the team lands before entering the workflow. Issues enter from integrations, from non-team members, or directly. Actions are Accept / Decline / Mark as duplicate / Snooze, and there is a rotating **responsibility** assignment so someone is always on the hook for the queue. The club analogue writes itself: a member DMs "hey can we do a resume workshop?" — that should land in an e-board triage queue with a rotating officer-of-the-week, not evaporate in a group chat.

**Projects** ([docs](https://linear.app/docs/projects)) are *"units of work that have a clear outcome or planned completion date,"* consisting of issues plus optional documents, with a **single Lead** ("Single designated owner to maintain clear accountability"), flexible target dates (day/month/quarter/half/year granularity), an overview page with description and milestones, and Initiatives grouping projects for roadmap views. Note two design choices worth copying: **flexible date precision** (a club's "sometime in October" is a real answer) and **one lead, always**.

**Cycles** create the rhythm: fixed-length, with unfinished issues rolling automatically into the next cycle. A club's natural cycle is the week (meeting-to-meeting) with the semester as the initiative.

### 1.4 The minimum viable "club project" object

Synthesizing: the smallest object that covers a club's real work is closer to a **Basecamp project** than a Linear issue, but it should carry Linear's ownership discipline.

```
Project (a.k.a. "Space" for standing bodies, "Project" for finite efforts)
  identity:     name, emoji/cover, one-line purpose, visibility
  ownership:    lead (exactly one), members[], parent club
  time:         start, target date (with precision: day|week|month|semester), status
  contents:     Tasks[], Docs[], Threads[], Files[], Events[], Checkins[]
  progress:     hill position per sub-scope (optional), open/closed task counts
  lifecycle:    template_origin, archived_at, handoff_note
```

And the task:

```
Task
  title, description (rich text)
  assignee: ONE person (plus optional watchers)   # Asana's rule
  due_date: nullable, with "no date" a first-class state
  status: from a FIXED 4-state set — Todo / Doing / Blocked / Done
  list / section (grouping inside a project)
  subtasks[], attachments[], comments[]
  origin: manual | meeting_action_item | form_response | template | recurring
```

Fixed four statuses, not configurable workflows. **Blocked** is the one non-obvious inclusion: in volunteer work, "I'm waiting on the advisor / on the university / on a sponsor reply" is the single most common real state, and tools that force it into "In Progress" make dashboards lie.

Ownership modeling rules worth being dogmatic about:
- **Exactly one assignee.** Shared ownership is no ownership — this is Asana's oldest and best opinion.
- **Due date is optional, but a task with no date and no cycle is invisible.** Provide a "someday" list explicitly rather than letting undated tasks silently rot.
- **Every task can be traced to its origin.** A task created from a meeting action item should link back to the meeting; one created from a template should know its template. This is what makes the handoff story work later.

---

## 2. Shared workspace and the institutional-memory problem

### 2.1 The Google Drive ownership problem — the strongest single argument for this product

This is worth stating carefully because it is the rare product argument backed by vendor documentation rather than anecdote. **A club's institutional knowledge does not die from negligence. It dies because the default, well-intentioned handoff gesture provably does not work.**

Google's own docs establish four facts:

1. **Ownership in My Drive is personal.** In a shared drive, *"Your organization owns the files in a shared drive, not an individual"* — versus My Drive, where the owner is *"the individual who created the file or folder"* ([support.google.com/a/answer/7212025](https://support.google.com/a/answer/7212025)).
2. **Deleting a graduate's account starts a 20-day fuse.** Google's admin documentation: *"Drive files the user owns — These files are saved for 20 days but are only accessible if you restore the user."* Files in shared drives are unaffected ([delete or remove a user](https://knowledge.workspace.google.com/admin/users/delete-or-remove-a-user-from-your-organization)).
3. **Transfer is domain-locked.** *"You can only transfer ownership of files and folders to someone in your organization,"* and *"You can't transfer a file from your personal Google account to someone with a work or school account"* ([support.google.com/drive/answer/2494892](https://support.google.com/drive/answer/2494892)). You can also only transfer to someone you already shared with.
4. **The folder trap — the detail almost nobody knows.** Transferring a folder transfers *only the folder*: *"you retain ownership of files contained within."* The outgoing president who "transferred the club folder" at graduation has transferred an empty shell. Every file inside still dies with their account.

Recovery requires a super admin to restore a deleted account, within 20 days, for a club they have never heard of. This is not a workflow a student can execute.

**Product implication:** the club OS must own storage at the *organization* level from the first file, and must never let an artifact's canonical home be a personal account. This is not a feature; it is the reason to exist. It should also be said out loud in marketing — most officers have lived this and have never been told why it happened.

### 2.2 The knowledge-tool landscape

| Tool | Core primitive | Ownership model | Lesson |
|---|---|---|---|
| [Notion](https://www.notion.com/help/intro-to-databases) | Database rows *are* pages | [Teamspace](https://www.notion.com/help/intro-to-teamspaces)-scoped (Open/Closed/Private) | Page-as-row is the best structural fit for a club Project; teamspaces are Notion's answer to the shared-drive problem |
| [Notion relations & rollups](https://www.notion.com/help/relations-and-rollups) | Two-way relations; rollups (count/sum/avg/earliest/latest) | — | "Events → budget spent," "officer → projects owned" come free |
| [Confluence](https://www.atlassian.com/software/confluence/guides/get-started/confluence-overview) | Spaces containing a hierarchical **page tree** | Space-scoped | Page trees beat flat databases for deep procedural docs (runbooks, bylaws) |
| [GitHub wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/about-wikis) | Wiki attached to a repo | Repo/org-scoped | Weak as a knowledge base: write-access-only editing by default, ~5,000-file soft limit, indexed by search engines only above 500 stars |
| Coda | Docs that behave like apps | — | Cautionary: absorbed and rebranded under Superhuman ([coda.io/product](https://coda.io/product)) |

A genuinely useful free lever: [Notion for Education](https://www.notion.com/product/notion-for-education) gives students and educators at accredited colleges a free **Plus** plan with a school email (personal Gmail excluded), and **verified student-led organizations get Plus free for all members plus up to 100 guests.** This is both a competitor and a possible substrate.

### 2.3 Runbooks, playbooks, and the PARA insight

[PagerDuty's incident response documentation](https://response.pagerduty.com/) is the best open model of operational memory — explicitly *"a cut-down version of our internal documentation… to prepare new employees for on-call responsibilities,"* published for others to fork. Its structure transfers directly: on-call training → officer role onboarding; named roles (Incident Commander, Deputy, Scribe) → day-of event roles; severity definitions → "is this an e-board or a chair decision?"; and **templated postmortems** → the **event postmortem**, the single most valuable club doc nobody writes.

[PARA](https://fortelabs.com/blog/para/) supplies the organizing axiom worth adopting verbatim: organize by **actionability, not subject** — Projects (goal-bound, they end), Areas (ongoing, no end date), Resources, Archives. This resolves a real IA question: *Recruiting* is an Area owned by a role permanently; *Fall 2026 Recruiting Drive* is a Project that archives. And **archive, never delete** is exactly what institutional memory requires.

### 2.4 Governance and succession, borrowed from open source

Open source has spent 25 years solving "the person who knows everything leaves," which is a club's core problem in a different costume.

- **`GOVERNANCE.md` records how contributors become maintainers** — i.e., a club's officer-election procedure. [opensource.guide](https://opensource.guide/leadership-and-governance/) documents three models: **BDFL** (Python), **meritocracy** (Apache), and **liberal contribution** (Node.js, Rust). Clubs map to meritocracy with elections.
- **Succession advice is explicit:** distribute ownership, offer active contributors larger roles, and formally transfer control rather than letting a project stagnate ([best practices](https://opensource.guide/best-practices/)). The same guide reframes docs as boundary-setting: *"Writing things down makes it easier to say no when something doesn't fit into your scope."*
- **[Apache](https://www.apache.org/foundation/how-it-works.html)** contributes committee structure — PMCs, merit-elected members, **lazy consensus** (positive votes, no vetoes) — and warns that projects need a **diverse committer base for long-term stability**.
- **The bus factor is computable.** CHAOSS defines the [**Contributor Absence Factor**](https://chaoss.community/kb/metric-contributor-absence-factor/) (*"previously called the Bus Factor"*) as **the minimum number of contributors responsible for 50% of all contributions**.

That last one is the best product idea in this section. A club OS has the raw data — who owns events, who edits docs, who closes tasks — to compute a live **Bus Factor** and surface it on the officer dashboard: *"3 of your 7 areas depend on one person. Two of them are seniors."* No incumbent does this, it requires no new user input, and it makes the product's core value (continuity) visible and measurable.

### 2.5 Student-org handbooks — and the gap in them

[The MLH Organizer Guide](https://guide.mlh.com/) is a community-maintained student hackathon playbook, **CC-BY 4.0 licensed and accepting pull requests** — already an open, forkable knowledge repo. Its [after-the-event section](https://guide.mlh.com/general-information/after-the-event.md) covers sponsor reports with *"key numbers, event highlights, and your best photos,"* attendee and sponsor surveys, settling accounts, and *"Collect evidence of your success."*

**The notable finding is what's missing:** MLH's post-event guidance is oriented toward *promoting the next hackathon*, not toward *operational handoff to next year's organizers*. There is no "write the transition memo" step. The largest student-hackathon organization's own playbook has exactly the gap this product exists to fill. [Hack Club](https://hackclub.com/clubs/) similarly supplies pre-built meeting content ("Jams"), a leader Slack, recruiting materials, and nonprofit financial infrastructure — but no documented succession process either.

### 2.6 What a club's permanent repository should contain

| Layer | Artifacts | Why it must be permanent |
|---|---|---|
| **Charter** | Constitution, bylaws, advisor of record, university registration | Required by most campuses; otherwise rewritten from scratch every few years |
| **Governance** | Officer roles, election procedure, quorum, succession and emeritus roles | The `GOVERNANCE.md` pattern |
| **Operations** | Event runbooks, day-of role cards, **event postmortems**, venue/vendor contacts | The PagerDuty pattern |
| **Money** | Budget history by year, reimbursement process, funding applications + outcomes, **sponsor contacts, past decks, benefits delivered** | Sponsor relationships are the single most turnover-fragile asset a club owns |
| **Identity** | Logos, brand kit, slide/poster templates, photo archive, press mentions | MLH: photos are *"invaluable for promoting your next"* event |
| **People** | Officer transition memos, recruiting materials, alumni contacts | The layer even MLH omits |
| **Access** | **Vendor logins policy** — named accounts, a shared password vault, no personal-account ownership of anything | Direct mitigation of §2.1 |
| **Work** | Past projects, deliverables, build logs | See §3 |

---

## 3. Version control and a "build repository" for student projects

### 3.1 A dated correction

**GitHub Classroom was retired on 28 August 2026** — twelve days before this report. Accounts, repos, and orgs created through it are unaffected; GitHub now points educators to Codio and to **Classroom 50**, a free open-source alternative from the Fifty Foundation ([github.com/orgs/community/discussions/205975](https://github.com/orgs/community/discussions/205975)).

This matters twice over. Strategically, it is a concrete, dated instance of **a free education tool being withdrawn from under students' feet** — which strengthens the case for a durable, club-owned system and warns against building any core workflow on a single vendor's education program. Practically, it means any plan that assumed GitHub Classroom as infrastructure is already stale.

Two mechanics from Classroom remain worth borrowing regardless:

- **Template-repo instantiation.** Student repos were *forks* of a repo created from an org-owned template ([docs](https://docs.github.com/en/education/manage-coursework-with-github-classroom/teach-with-github-classroom/create-an-assignment-from-a-template-repository)). "Seed a new project from the club's proven scaffold" is exactly the Project-template mechanic in §8.3.
- **Zero-config autograding presets.** Three presets required no CI knowledge — I/O tests, `pytest`, and run-command exit codes — with CSV score export ([docs](https://docs.github.com/en/education/manage-coursework-with-github-classroom/teach-with-github-classroom/use-autograding)). The generalizable lesson: *offer three preset configurations that need no expertise, and an escape hatch for the 5% who want the raw config.*

### 3.2 The comparison set

| Platform | Model | Transferable lesson |
|---|---|---|
| **[Devpost](https://info.devpost.com/)** | Hackathon registration + submission + judging in one place; *"a dedicated, permanent gallery"* plus participant portfolios | **The single best analogue.** A submission = elevator pitch + media + links + team + judging. And note the two-sided value: the org gets a gallery, the *student* gets a portfolio |
| **Devfolio** | Same category, India-centric, wallet/identity-linked | Submission-as-identity |
| **Figma multiplayer** | Real-time canvas with native version history | Don't reimplement — **link**, don't re-host |
| **Google Colab** | Notebook sharing via Drive | Inherits every problem in §2.1 |
| **Hack Club workshops** | Prebuilt, runnable meeting content | Content-as-product; see templates (§8.3) |

### 3.3 How non-CS clubs actually version work

| Club type | Native artifact | How they version today | What they actually need |
|---|---|---|---|
| Robotics | Engineering notebook / build log | Dated, append-only entries documenting design iterations | Timestamped immutable log with photos |
| Consulting | Slide deck | `v1_FINAL_v2_ACTUALFINAL.pptx` in a personal Drive | Named milestones + one canonical "current" pointer |
| Design | Figma file | Tool-native multiplayer + history (already good) | Embed and link |
| Business plan | Doc + financial model | Doc revision history | Milestone snapshots tied to competition deadlines |
| Newspaper | Issue (InDesign/CMS) | Issue number *is* the version | Issue as a container of many items |
| Dance / theatre | Run-of-show, cue sheets, rehearsal schedule | Printed and reprinted each rehearsal | Revision-dated operational doc with an "opening night final" lock |

The unifying insight: **non-CS clubs do not need diffs. They need an append-only dated record, a clear "current" pointer, and archived predecessors.** That is the robotics engineering notebook, generalized — and it is much closer to what most clubs need than Git is.

### 3.4 Integrate GitHub, or build?

**Integrate.** Git is free, durable, and institution-independent; repos survive account deletion in a way My Drive files provably do not. CS clubs already live there. Forks, review, and history are solved problems, and version control built badly is worse than a link.

**Build.** Git's mental model (commit, branch, merge, resolve conflict) is a hard wall for dance, theatre, consulting, and newspaper clubs — i.e., the majority of the market. Binary artifacts (InDesign, video, decks) version poorly in Git. And GitHub is a single vendor that **just demonstrated it will retire education products**.

**Recommended position:** build a thin, universal **Project** object that owns *metadata and memory* — append-only dated updates, named milestones, ownership, outcome, postmortem — and **link out** for tool-native storage (GitHub repos, Figma files, Colab notebooks, Devpost entries, Drive folders in a club-owned shared drive). Own the memory; borrow the storage. Offer a GitHub connection as an optional enrichment for CS clubs, never as a dependency.

### 3.5 The proposed Project object

One schema, five very different clubs. Notion-style: every Project is a full page that also carries structured fields.

| Field | Type | Notes |
|---|---|---|
| `title` | text | |
| `type` | enum | build / deliverable / submission / production / issue / research |
| `status` | enum | proposed → active → shipped → **archived** (PARA: archive, never delete) |
| `term` | relation → Academic Term | powers "what did we do in Fall 2025" |
| `owners` | relation → Members | feeds the Contributor Absence Factor calculation |
| `succession_note` | long text | **required before status → archived** — the transition memo MLH omits |
| `one_liner` | text ≤200 chars | Devpost-style elevator pitch; makes the archive browsable |
| `description` | rich page body | the artifact itself |
| `log[]` | append-only dated entries (author, date, body, media) | the engineering notebook, generalized |
| `milestones[]` | named + dated snapshot pointers | replaces `v1_FINAL_v2` |
| `external_links[]` | typed URLs (repo, Figma, Drive, Colab, Devpost, CMS) | borrow tool-native storage |
| `assets[]` | files in **club-owned** storage | never a personal account |
| `outcome` | text + enum (placed / published / performed / delivered) | |
| `postmortem` | template-backed page | PagerDuty pattern |
| `reusable_from` | relation → prior Project | the fork/template mechanic |

| Case | `type` | `log[]` | `milestones[]` | `external_links[]` | `outcome` |
|---|---|---|---|---|---|
| Robotics build | build | daily build entries with photos | Kickoff, Week-6 robot, Competition | CAD, code repo | Award / rank |
| Consulting deliverable | deliverable | client meeting notes | Hypothesis, Interim, Final readout | Deck, model | Client sign-off |
| Hackathon submission | submission | commits, build notes | Demo-ready | Repo, Devpost, video | Prize / gallery |
| Dance show | production | rehearsal notes, cue changes | Tech rehearsal, Opening night | Run-of-show, cue sheet | Performances, recording |
| Newspaper issue | issue | per-article status | Copy deadline, To press | CMS, InDesign, PDF | Published date |

---

## 4. Scheduling and calendars

Scheduling is the hardest *technical* problem in this product and the one with the clearest user pain. A club's scheduling reality is four distinct problems that most tools conflate.

### 4.1 The four problems

| Problem | Shape | Best existing answer |
|---|---|---|
| **Find a time for 40 people** | Many-to-many, coarse, one-off | When2Meet / LettuceMeet grid polls |
| **Book a 1:1 with one person** | One-to-one, precise | Calendly / Cal.com booking link |
| **Publish the club calendar to members** | One-to-many, ongoing | ICS subscription feed |
| **Avoid colliding with classes, other clubs, and finals** | Constraint checking | Nothing does this well |

### 4.2 Group availability polling

**When2Meet** is what students actually use, and its design is instructive: no account, no app, a grid of 15- or 30-minute slots by day, painted by click-drag, and a **heatmap** where cell darkness = number available. Hovering a cell names who is free and who isn't. It is ugly, free, and has near-universal recognition on campus. **LettuceMeet** is the modern restyling with Google Calendar import to pre-fill availability — a genuinely better idea, since the biggest cost of a When2Meet is manually re-entering your schedule.

**[Rallly](https://rallly.co/)** is the open-source option (self-hostable; free tier = unlimited polls, participants and votes, with polls auto-deleting when inactive; Pro adds branding and indefinite retention). **Doodle** is the incumbent, now heavily monetized and ad-laden. **Crab.fit** is a clean When2Meet clone.

**The algorithm for "best time across 40 people"** is simple and worth getting right:

1. Discretize the window into 15-minute slots.
2. For each slot, compute a score. Don't just count — **weight** it:
   - Availability states should be **ternary**, not binary. When2Meet's "if need be" is the most-copied feature for a reason. Microsoft Graph's `findMeetingTimes` formalizes the same idea with an explicit numeric model: free = 100%, **unknown = 49%**, busy = 0%, and the slot's **confidence is the average across attendees** ([docs](https://learn.microsoft.com/en-us/graph/api/user-findmeetingtimes)). Copy this directly.
   - **Weight by role.** A slot that works for 38 members but not the president is worse than one that works for 35 plus all officers. Mark required vs. optional attendees.
3. Find maximal runs of contiguous slots meeting the required duration.
4. Rank by (weighted availability, then earliest, then fewest required-attendee conflicts) and surface the **top 3**, not a raw grid, with the explicit list of who would be missing.

Graph's `minimumAttendeePercentage` parameter (default 50%) and its `emptySuggestionsReason` field are both worth imitating: when no time works, **say why** ("no slot has more than 40% of officers free — try extending the window or dropping the Tuesday constraint") rather than returning an empty list.

### 4.3 Booking links: Calendly and Cal.com

**[Cal.com](https://cal.com/pricing)** is the open-source Calendly: free forever for individuals (unlimited event types, 100+ app integrations), Teams $12/user/mo, Organizations $28/user/mo, plus self-hosting.

**A significant 2026 development, flagged for verification:** the canonical repo at [github.com/calcom/cal.com](https://github.com/calcom/cal.com) now presents as **"Cal.diy," stated to be fully **MIT licensed** with *"no commercial/enterprise code"* and the `/ee` enterprise directory **removed** — an explicit departure from the open-core model Cal.com ran for years (48.4k stars, Next.js + tRPC + Prisma + Postgres + Turborepo monorepo). If accurate, this materially changes the build-vs-embed calculus, because AGPL-3.0 with a carve-out directory was the main legal friction in embedding Cal.com into a commercial product. **This should be verified against the LICENSE file directly before any architectural decision is made on it.**

**Recommendation: do not embed Cal.com.** Even at its most permissive, it brings a large monorepo, its own Prisma schema, its own auth and calendar-connection layer, and its own upgrade treadmill — for a feature (booking links) that is perhaps 800 lines of logic once you already have calendar OAuth, which this product needs regardless. Embedding a scheduling platform to get booking links is the tail wagging the dog. Study its availability model (working hours, date overrides, buffers, minimum notice, multi-calendar conflict checking) and reimplement the ~20% that clubs need.

### 4.4 Calendar APIs: the real constraints

**Google Calendar** is the only one that truly matters — most US universities are Google Workspace shops.

| Capability | Detail | Implication |
|---|---|---|
| [`freebusy.query`](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query) | Returns only **busy time ranges**, no event details. `timeMin`/`timeMax`/`items[]`. **`calendarExpansionMax` caps at 50 calendars per query**; `groupExpansionMax` at 100; exceeding returns `tooManyCalendarsRequested` | **A 40-person club fits in one call. A 100-person club does not** — batch and merge. This cap is a real architectural constraint |
| Scopes | `calendar.freebusy` is a narrow scope returning only busy/free — far less invasive than `calendar.readonly` | **Use `calendar.freebusy` for availability and `calendar.events` only for writing club events.** Minimizing scopes reduces Google's verification and security-assessment burden, which is a real cost for a free product |
| [Push notifications](https://developers.google.com/workspace/calendar/api/guides/push) | `watch` channels POST to an HTTPS endpoint with a **valid, non-self-signed certificate**. The notification body is **empty** — it carries only headers (`X-Goog-Resource-State`) and you must call the API for details. **"There's no automatic way to renew a notification channel"** | Push is a *sync trigger*, not a data feed. You still need sync tokens and a channel-renewal cron |
| Secondary calendars | A club can own its own calendar which members add | The clean model for club → member publication |

**Microsoft Graph** offers [`findMeetingTimes`](https://learn.microsoft.com/en-us/graph/api/user-findmeetingtimes) (server-side suggestion with confidence scoring, `activityDomain` of work/personal/unrestricted, `meetingDuration` in ISO 8601) and `getSchedule` for raw free/busy. Note `findMeetingTimes` requires **delegated** permissions — application permissions are not supported — so it only works acting as a signed-in user.

**Apple Calendar / CalDAV** (RFC 4791) is technically open but practically painful: iCloud requires app-specific passwords, there is no clean OAuth, and support is inconsistent. **Do not build CalDAV for v1.** Serve Apple users via ICS subscription, which works natively and well.

### 4.5 ICS subscribe vs. push — the key architectural decision

Publishing the club calendar to members has two paths, and the tradeoff is stark.

**ICS subscription** (RFC 5545): the club exposes a secret, per-user webcal URL; the student adds it once and it appears in whatever calendar app they use, forever, with zero further action. This is the correct default because it requires **no OAuth, no write permission, and no ongoing consent** — and it works identically on Google, Apple, and Outlook.

**The catch, and it is a serious one:** Google's help doc for [adding a calendar by URL](https://support.google.com/calendar/answer/37100) documents the steps but **does not state any refresh cadence** — and in practice Google polls external ICS feeds slowly and unpredictably (widely reported in the range of many hours to a day-plus). **A newly added event may not appear on a student's phone for a day.** That is fatal for "meeting moved to 7:30 tonight."

**Therefore: a hybrid.**

- **ICS subscription** is the baseline for the stable semester calendar — recurring meetings, known event dates. Set a low `X-PUBLISHED-TTL` and `REFRESH-INTERVAL`, accept that clients will ignore them, and treat the feed as eventually consistent.
- **Push** for anything urgent or changed: if the member has connected Google/Microsoft with write scope, write the event directly into a dedicated secondary calendar so it appears instantly. Otherwise, notify in-app and by SMS/push, which is the only genuinely real-time channel.
- **Never rely on ICS for a time change.** Change notifications are a messaging problem, not a calendar problem.

### 4.6 Class schedules, conflicts, and semester recurrence

**Importing class schedules** is the highest-value and most under-built input. Ranked by realism:

1. **Canvas LMS ICS feed.** Canvas exposes a per-user calendar feed URL, and most universities run Canvas. A student pastes one URL. This is the best available path, though it captures assignment due dates more reliably than class meeting times.
2. **Registrar / SIS export.** Banner and Workday Student sometimes offer "add to calendar." Highly institution-specific; not a scalable v1 strategy.
3. **Manual entry with a good UI.** Five courses, each with days-of-week and a time range, is ~2 minutes with a well-designed grid. Underrated — this is a one-time cost per semester with permanent payoff.
4. **Screenshot / OCR parse.** Every student can screenshot their schedule. A vision model parsing it into structured course blocks is genuinely feasible now and is the highest-delight option. Treat as an accelerator for path 3, always with a confirmation step — never trust an OCR'd schedule silently.

**Semester recurrence** should be modeled with RFC 5545 **RRULE**, which handles "every Tuesday 7pm" natively (`FREQ=WEEKLY;BYDAY=TU;UNTIL=...`) and — critically — supports **EXDATE** for exceptions. A club's real pattern is *"every Tuesday 7pm, except spring break, except the week of finals, and the Nov 4 one moved to Wednesday."* RRULE + EXDATE + per-instance overrides expresses exactly this. **Bind the recurrence to an Academic Term object** so "ends at the end of the semester" is automatic rather than a date the officer must remember to set.

**Conflict detection** is the genuinely novel opportunity — no incumbent does it:

- *Personal conflicts:* when an officer schedules an event, show how many members have a class or another club commitment then. This turns scheduling from guesswork into a decision.
- *Cross-club conflicts:* if multiple clubs at one school use the product, warn the officer that the pre-med society's general body meeting is at the same hour. This is a **network effect that grows with campus density** and is one of the few defensible ones available.
- *Institutional conflicts:* finals, breaks, home football games, religious holidays. Seed a per-campus academic calendar and warn on collision.

The privacy line matters: surface conflicts as **aggregate counts** ("12 of 40 members are busy"), never as "Sarah has BIO 101." Free/busy in, no event details out — which is also exactly why `calendar.freebusy` is the right scope.

---

## 5. Coffee chats and 1:1 networking

### 5.1 Donut — the reference implementation, and why a "dumb" bot wins

Donut is the category definer: **18.5M intros, 20,000+ teams** ([donut.com](https://www.donut.com/)). Its mechanics are worth copying almost exactly:

| Mechanic | How Donut does it |
|---|---|
| **Opt-in** | A dedicated Slack channel — *joining the channel is the opt-in*. Donut explicitly warns completion rates are higher with a voluntary channel than defaulting to `#general` |
| **Pairing** | Pairs people with **minimal shared-channel overlap** (channel co-membership as a proxy for social distance) and keeps pair history to avoid repeats. It does not read message content |
| **Cadence** | Weekly / biweekly / monthly; **biweekly is the recommended default**; sent 10am in the admin's timezone |
| **Types** | Standard, Cross-group, Within-group, Lottery |
| **Odd numbers** | *"One lucky group of three so as to not leave anyone out"* |
| **Cross-group** | Groups synced from HRIS (dept, location, tenure); pairs *across* them. Unassigned members are excluded and auto-reminded one business day before the round |
| **Hard constraints** | "Match Working Hours" requires ≥1hr overlap — and it's **hard**: people go unmatched rather than get a bad pair |
| **Scheduling** | It does **not** auto-book. It *suggests* mutually-free times in the group DM; users pick |
| **Follow-up** | Follows up a few days later to **confirm the meeting actually happened** — the completion-rate telemetry loop |
| **User controls** | Snooze, opt out, **block specific people**, set working hours |

Free tier: **up to 24 users per round in 1 channel** ([pricing](https://www.donut.com/pricing/)); Standard from $74/mo annual. Published outcomes: 84% report increased collaboration, 78% improved belonging.

**Why the dumb version works.** The value is not the algorithm — it's that **the bot owns the awkwardness**. Four mechanisms: (a) *diffusion of responsibility* — neither person chose the other, so neither is imposing and rejection isn't personal; (b) *a legitimate pretext* — "Donut matched us" fully justifies a stranger's calendar invite; (c) *precommitment* — one cheap decision (join the channel) generates N future meetings, converting a recurring willpower problem into a one-time one; (d) *visible norm-setting* — everyone in the channel is doing it. Note also that Donut deliberately optimizes for **weak ties** (least channel overlap); Granovetter's strength-of-weak-ties is the actual product thesis.

### 5.2 The adjacent market

- **Lunchclub** ([lunchclub.com](https://lunchclub.com/)) is **still operating in 2026**, now "powered by AI," intent-first onboarding ("your background, goals, and what you're excited about"), video-native, weekly availability windows, post-call ratings feeding the matcher. It is a consumer network with **no team/club deployment surface**.
- **Ten Thousand Coffees** ([10kc](https://www.tenthousandcoffees.com/about)) — *correction to a common premise: 10KC was **not** acquired by Nestlé.* It raised **$75M CAD from Five Elms Capital in 2022** and itself **acquired Abode in 2025**; Nestlé is a customer. Its structure: **Hubs** (a branded community — a university, a company, a cohort) inside which smart-matching runs on skills, interests, and high-potential status. **Every match ships with an expert-designed discussion guide** so neither party invents the agenda. Claims 86% feel more connected, 1.5M+ conversations. The university model is RBC-funded: alumni sit in a school Hub, students match into them.
- **Mentor Collective** ([mentorcollective.org](https://www.mentorcollective.org/)) — 500K learners, 200K mentors; software **plus human program staff**; claims an 8–19% boost in sense of belonging. **PeopleGrove** ([peoplegrove.com](https://www.peoplegrove.com/)) — 20M+ users, 500+ institutions; Engagement Hub + PathwayU; claims 57% of alumni more likely to give back. Both are **institution-sold, six-figure, admin-heavy, demo-gated** — which is exactly the gap a free club-level tool fills.
- **YC Co-Founder Matching** ([ycombinator.com/cofounder-matching](https://www.ycombinator.com/cofounder-matching)) — 100,000+ matches. Profile with interests/skills/preferences; the feed is *"optimized for rapid review"*; **mutual acceptance creates a match**. Three transferable design choices: a **shared-context gate** (everyone did Startup School, so both share a vocabulary), **double opt-in** (no unsolicited contact), and a **prescribed next step** — YC tells matches to run a time-boxed trial project rather than commit.
- **Consolidation signal:** Icebreaker → Gatheround → Donut ([icebreaker.video](https://icebreaker.video/) now redirects to gatheround.com, © Donut Technologies). Bumble Bizz still resolves but is visibly stale since 2020 — *no primary-source confirmation of formal discontinuation; state cautiously.*

### 5.3 What "coffee chat" actually means on campus

This is the crux, and the term means something very different than in HR-land. In pre-professional culture (IB, consulting, pre-law, pre-med), a coffee chat is a **15–30 minute one-way audition disguised as a conversation** — an unpaid, informal screening step that gates access to formal recruiting.

The documented norms, from [Mergers & Inquisitions' networking guide](https://mergersandinquisitions.com/investment-banking-networking/):

- **Cold email: 5 sentences max**, anchored on a *specific* commonality (same school, hometown, sport). Email, not LinkedIn DM — "bankers live in their email inboxes." Weekday midday, recipient's timezone.
- **Response rate 10–25%**; roughly half of responders take a call.
- **Call length 15–20 min. Talk 30%, listen 70%.** Never ask comp, hours, or anything Googleable.
- **Volume**: speak with **50–200 bankers**; ~20–30 become genuine advocates. A few hundred emails at a target school, **1,000–2,000 at a non-target**.
- **Follow up 2–3 times**; maintain warm contacts with an update email **every 4–6 months**.
- **Ladder upward**: start Analyst→VP, harvest referrals. The "mini-ask" (pass my resume along) precedes the real ask.
- Start **6–12 months before recruiting opens**.

**Timeline compression is the defining pressure.** M&I notes that if you're not prepared by the start of sophomore year you likely won't join a large bank, with banks filling ~50% of intern classes from sophomores. A live WSO thread on **SA 2028** timing reports Evercore dropping applications around **September 9, 2026** — sophomores recruiting ~20 months out ([SA 28 Timeline](https://www.wallstreetoasis.com/forum/investment-banking/sa-28-timeline)).

**How students track this today: Google Sheets.** A WSO thread on cold-email tooling is unusually concrete — the working stack is **Sheets for tracking + Apollo for sourcing + manual Gmail sends**, because automation platforms (Mail Meteor, GMass) made response rates *"tank (sometimes to 0)"*; ~10/day at ~5 min each is the accepted rate ([thread](https://www.wallstreetoasis.com/forum/investment-banking/any-cold-email-volume-hacks)). Consulting mirrors this, with the wrinkle that **consultants get referral bonuses**, making them motivated counterparties ([Management Consulted](https://managementconsulted.com/consulting-networking/)).

**The club-level reality** is two distinct graphs: **internal** (upperclassman→freshman mentoring, a bipartite cohort-constrained problem — never pair two freshmen) and **external** (a privately-held alumni contact spreadsheet that is the club's single most valuable asset, and which walks out the door every time a board graduates). That memory loss is the sharpest unserved pain in this track.

### 5.4 Matching algorithms

| Problem | Approach | Note |
|---|---|---|
| Rotating 1:1s, no repeats | **Circle-method round robin** — fix one person, rotate the rest; n−1 rounds covers every pair exactly once | Deterministic and *provably* repeat-free — better than Donut's heuristic for a bounded club roster |
| Odd headcount | **Dummy participant** (whoever draws it gets a bye), or a group of three | Never leave a real person unmatched — top churn driver |
| Mentor ↔ mentee | **Hungarian algorithm**, weighted bipartite matching, O(n³) | Weight = interest overlap + industry + availability − prior-pair penalty. Cohort constraints are just weight = −∞ |
| Peer pool, irregular constraints | **Blossom algorithm**, general-graph maximum matching | For the non-bipartite case round-robin can't handle |
| Ranked preferences | **Gale–Shapley** deferred acceptance, O(n²), no blocking pairs | Proposer-optimal, so let *mentees* propose. Capacity-limited mentors = hospital-residents variant. Adding couples/joint constraints makes it **NP-complete** |
| No-shows | Reputation weight decayed over rounds; auto-reassign after a 48h unconfirmed window | |

**Practical call:** weighted bipartite matching (Hungarian) with hard constraints as −∞ weights covers ~90% of club cases and is far easier to explain to a student officer. Reserve stable matching for the once-a-semester mentor draft where preferences are explicitly ranked.

### 5.5 The proposed Coffee Chats feature

Donut solves *internal* weak ties; 10KC and Mentor Collective solve *institutional* mentoring at six figures. **Nobody serves the club**, which is where the pre-professional coffee-chat economy actually lives.

1. **Round.** An officer creates a Round: pool (whole club / cohort), type (peer round-robin | mentor–mentee | alumni office hours), cadence (default **biweekly**), constraints (never same-class, never same-major, ≥1hr availability overlap). Members opt in per round, can snooze, and **can block specific people** — a must-have Donut ships and its clones omit.
2. **Intro.** Double-sided bot intro in the club's Slack/Discord/SMS with each person's three interest tags and one surfaced commonality. **Attach a conversation guide** — 5 prompts tailored to the round type ("questions to ask a banking analyst"). This is 10KC's best idea and it is free to copy.
3. **Scheduling handoff.** Do **not** build a scheduler here. Propose 3 mutually-free slots from connected calendars; one tap books with a video link; fall back to a booking link. Donut's evidence: suggestion-plus-handoff beats forced auto-booking.
4. **Follow-up nudge.** T+3 days: *"Did you two connect?"* — Yes / Rescheduling / Didn't happen. This is the most valuable data point in the feature: it powers completion rate, reputation weighting, no-show reassignment, and the officer dashboard. A "Yes" triggers a **thank-you note nudge** with a pre-drafted editable note — same-day thank-yous are a hard norm in IB/consulting and students routinely forget.
5. **Notes.** A 30-second post-chat capture: free text or voice memo, plus three structured fields — *what they do*, *what they offered*, *next touchpoint date*. **Private by default.**
6. **Personal networking CRM — the retention hook.** Every contact becomes a card with last-contacted date, notes, and a **4–6 month warm-touch reminder** (the exact M&I cadence). Pipeline by firm: *"you know 3 people at Evercore, 0 at Centerview."* Roll up into a **club-owned alumni graph** so the contact list survives board turnover, with member-level privacy controls — **share the contact, not the notes.** This replaces the Sheets + Apollo + Gmail stack students already run, without the automation that tanks reply rates.

**Competitive posture:** Donut's free tier caps at **24 users in one channel** — precisely one small club, and precisely the point where a growing club must pay. Unlimited members and unlimited rounds, free, is the sharpest available contrast.

---

## 6. Applications and forms

Selective clubs — consulting, finance, a cappella, dance, robotics competition teams, pre-professional societies — run real admissions funnels: 200 applicants, essays, resumes, two interview rounds, a rubric, and a four-hour deliberation. They currently do this with Google Forms plus a shared spreadsheet plus a GroupMe. This is the single most under-served workflow in the market.

### 6.1 Form builders — and the free-tier floor we must clear

| Product | The one thing | Free tier (verified) |
|---|---|---|
| [Google Forms](https://support.google.com/docs/answer/141062) | Zero friction + Sheets. Everyone already has an account | Unlimited, everything |
| [Tally](https://tally.so/pricing) | Free-first, Notion-like block editor; *"99% of our features are available to all users without limits"* | **Unlimited forms and submissions**, conditional logic, signatures, file uploads, calculations, Sheets/Notion/Airtable/Zapier. Pro $24/mo to de-brand |
| [Fillout](https://www.fillout.com/pricing) | Most generous free tier + **native scheduling** and PDF generation | 1,000 responses/mo, unlimited forms/seats, logic, payments, scoring |
| [Typeform](https://www.typeform.com/pricing/) | One question at a time — the form feels like a conversation | Effectively none; Basic **$28/mo** caps at 100 responses/mo. Logic Jump on all tiers |
| [Airtable Forms + Interfaces](https://www.airtable.com/platform/interface-designer) | The form writes into a **database**, and Interface Designer gives reviewers a scoped review UI over the same data | Free plan; **form submitters and read-only collaborators are never billed** |
| [Formbricks](https://formbricks.com/pricing) | Open-source, self-hostable (**AGPLv3 core**, separate Enterprise license for `/apps/web/modules/ee`) | Cloud: 250 responses/mo; **self-host unlimited** |
| [Jotform](https://www.jotform.com/pricing/) | Breadth — widest widget library, signatures + payments inline | 5 forms, 100 submissions/mo |

**The strategic read:** Tally and Fillout have already made form-building free and excellent. A club OS **cannot win on the form builder** and shouldn't try. It wins on *what happens after submit* — review, interviews, deliberation, decisions, and the fact that the resulting people become members with a permanent record.

### 6.2 The minimum viable logic model

Three models exist, in increasing power: Google's **section jumping** (only works on Multiple choice and Dropdown, no AND/OR); Tally's **rule-based show/hide + jump** with `ALL`/`ANY` matchers and one level of nested groups ([docs](https://tally.so/help/conditional-form-logic)); and Typeform's per-question **Logic Jump** with variables.

For clubs, ship deliberately less:
- Conditions: `field <op> value`, ops = `is / is not / contains / >= / <= / is empty`; grouped by `ALL | ANY`, one nesting level.
- Exactly three actions: `show field`, `skip to page`, `set variable` (for auto-scoring).
- **One reserved pattern covers 90% of real club applications: the role/track selector** ("Design / Engineering / Marketing" → show that track's supplemental questions). Ship that as a *template*, not as a logic builder the user has to discover.

### 6.3 What to steal from real review systems

**Greenhouse** ([interviewing & decision-making](https://greenhouse.com/interviewing-decision-making)) supplies the core discipline: define **key decision criteria in advance**, explicitly *"to avoid inadvertent shifting of criteria during the interview process."* A scorecard is *N attributes × a rating + one overall recommendation*, and each interview in a plan is assigned only a **subset** of attributes, so no single interview grades everything. Anonymized take-homes are a first-class feature, not an add-on.

**Ashby** ([scheduling](https://www.ashbyhq.com/platform/recruiting/scheduling)) supplies the operational machinery that maps almost perfectly onto a club exec board trying to interview 150 people with 12 volunteer interviewers:
- **Direct booking links** (candidate self-books) and **candidate availability links**.
- **Interviewer pools** with **daily and weekly per-interviewer limits** — load balancing across volunteers.
- Two-way calendar sync including **secondary personal calendars** for true availability.
- Auto-generated panel schedules and native debriefs that include prior interviewers' context.

This is the highest-leverage borrow in the entire track. The bottleneck in club recruiting is never the form — it is scheduling 150 interviews against 12 students' class schedules.

**Admissions reading rooms** (the UC system publishes its [13-factor holistic review](https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-freshman/how-applications-are-reviewed.html), judging achievement *relative to opportunities available at the applicant's school*) supply the deliberation patterns: anchored reader rubrics, **norming sessions** where all readers score the same samples until they converge, blind review, **double reading with third-reader tiebreak**, committee escalation for borderline files, and the principle of **context in, identity out**.

**MLH's judging plan** ([guide.mlh.com](https://guide.mlh.com/general-information/judging-and-submissions/judging-plan.md)) is the best cheap-review model in existence and contains one genuinely important idea. Science-fair format, 3 judging rounds per project, 4 minutes per project per judge (2 demo + 1 Q&A + 1 travel), with a judge-count formula `J = ⌈(P × n × t) / T⌉` — 175 projects in a 2-hour window needs ~18 judges. Winners are chosen by **stack ranking**: each judge reports their **top 3** from their own assigned set, scored 3/2/1. MLH's stated rationale is that this **normalizes across judges with varying evaluation standards**. That is a far more robust answer to reviewer harshness than statistical normalization, it works at tiny N, and it's explainable to a sophomore in one sentence.

**Y Combinator** ([apply](https://www.ycombinator.com/apply)) contributes two norms clubs never follow and could adopt for free: **same-day decisions after interview**, and *"we give everyone who interviews detailed feedback on our decision."* When review data is already structured, feedback costs almost nothing — and for a club, rejected applicants are next semester's applicants and this year's event attendees. Rejection experience is a retention feature.

### 6.4 Scoring and deliberation design

| Decision | Recommendation | Why |
|---|---|---|
| Dimensions | **3–5 max**, with anchored wording at the endpoints | Volunteer reviewers; more dimensions means invented scales |
| Dimension scale | **1–5, odd**, with written anchors | 1–10 gives false precision and clusters at 7–8 |
| Overall call | **4-point, even** (strong no / no / yes / strong yes) | Forces a side; no middle to hide in |
| Normalization | **Both**: z-score per reviewer for the dashboard, **stack-ranking as tiebreak** | z-scores need 8–10 reviews to stabilize; ranking works immediately |
| Calibration | **Norming round** — everyone scores the same 3 applications before live review; show the group the spread | The most under-copied practice in club recruiting |
| Reliability | Surface in plain English: *"Reviewer A is 1.2 points harsher than the pool"*; *"14 applications had disagreement > 2 points — route to committee"* | Never show Cohen's κ to a club president |
| Blind review | Hide name, photo, year, pronouns during read; reveal at decision. **Unblinding is an explicit, logged action** | |
| Conflict of interest | Reviewers flag conflicts (roommate, dated, recruited them); the assignment engine **excludes conflicted reviewers before distributing** | Recusal must be auditable, not honor-system |
| Waitlist | A **ranked queue**, not a status flag; on a declined offer, surface the next person with an expiry clock | |
| Analytics | apply → review → interview → offer → accept, with stage conversion, time-in-stage, and **per-source** breakdown (club fair vs. Instagram vs. friend) | Answers "we lost 40% between offer and accept — why?" |

### 6.5 Waivers, signatures, and dues

**E-signature.** Under the federal **ESIGN Act** (2000) and state **UETA** adoptions, a signature cannot be denied legal effect solely because it is electronic; the practical requirements are intent to sign, consent to transact electronically, association of signature with record, a retainable reproducible record, and attribution evidence. [Documenso](https://documenso.com/pricing) is the open-source reference implementation (**AGPL-3.0**, free tier 5 documents/month, claims ESIGN/UETA/SOC 2/HIPAA).

But a club needs far less than an envelope-routing product. It needs liability waivers, media releases, travel forms, code-of-conduct acknowledgments, and — critically — **parent/guardian countersignature for under-18 members**, re-signed each cycle. That is *checkbox + typed name + timestamp + IP + immutable PDF + audit trail*. The audit trail is the entire legal value; build that, don't build DocuSign.

**Dues and payments.** [Stripe Payment Links](https://docs.stripe.com/payments/payment-links) are no-code, Stripe-hosted, reusable, QR-shareable, support 40+ payment methods and *"customers can choose what to pay"* (good for pay-what-you-can dues) — but **no partial payments or payment plans**, and attributing a payment to a specific applicant requires passing an ID in the URL. That seam is the integration point a club OS should own. Pricing: [Stripe](https://stripe.com/pricing) **2.9% + $0.30** cards, **ACH 0.8% capped at $5** — ACH is dramatically cheaper above ~$50. Tally proves the bolt-on model works on a free tier with *"no markup"* ([payment forms](https://tally.so/help/payment-forms)). A [Venmo business profile](https://venmo.com/business/) is **1.9% + $0.10** and uses the app students already have.

**The critical constraint:** most universities require dues to flow through a student-government or university account, not a third-party processor. **A club OS should record dues status and generate a payment link — it should not custody money.** That sidesteps money-transmission risk, university policy conflict, and the entire compliance burden.

### 6.6 The Applications data model

```
ApplicationCycle
  name, opens_at, closes_at, timezone, target_cohort_size
  status: draft | open | reviewing | deciding | closed
  settings: { blind_review, reviews_per_submission, rubric_id,
              auto_assign, allow_waitlist }

Form                      # versioned; IMMUTABLE once published
  cycle_id, version, pages[] → blocks[]{type,label,required,options}
  logic_rules[]{ trigger_page, match:ALL|ANY,
                 conditions[{field,op,value}],
                 action: show|hide|jump|set_variable }
  payment{ enabled, amount_cents, optional, link_template }
  signature_blocks[]{ document_id, requires_guardian }

Submission
  cycle_id, form_version, applicant_id, answers(jsonb), files[]
  payment_status, signature_records[], submitted_at, source(utm)
  current_stage_id, anonymized_label   # "Applicant #047"

Stage        order, type: review|interview|decision|waitlist
             rubric_id, sla_days, auto_advance_rule

ReviewerAssignment
  submission_id, stage_id, reviewer_id, due_at
  status: pending|submitted|recused
  conflict_flag, conflict_reason, blind   # snapshot of setting

Score        # one reviewer × one submission × one stage
  assignment_id, dimensions[]{dimension_id, value 1-5, note}
  overall_recommendation, within_set_rank, z_score(computed)

Rubric / RubricDimension   name, weight, anchors{1..5: text}

Interview
  submission_id, panel[]{interviewer_id, role}, scheduled_start
  scheduling_mode: self_book | availability_match | manual
  interviewer_pool_id, kit_id, debrief_note

InterviewerPool            members[], weekly_limit, daily_limit,
                           meeting_hours          # Ashby load balancing

Decision
  outcome: offer|waitlist|reject|withdrawn, waitlist_rank
  decided_by[], offer_sent_at, offer_expires_at
  response, feedback_to_applicant        # the YC norm

AuditEvent   actor, entity, action, before, after, at
             # every unblind, recusal, override
```

Three structural notes. `Form` is **immutable on publish and versioned**, so a submission always renders against the exact form the applicant saw. `Score` hangs off `ReviewerAssignment`, not `Submission` — that is what makes per-reviewer normalization, recusal, and inter-rater reliability computable at all. `Stage` is **data, not code**, so a one-stage interest form and a four-stage consulting-club gauntlet run on the same schema. And `AuditEvent` is what turns blind review and COI recusal from a stated policy into an actual guarantee.

---

## 7. Meetings: the highest-leverage integration point

Clubs run on meetings — weekly e-board, general body, committee. Almost every task a club will ever create is born in a meeting, and almost none of them get written down.

**The current tool landscape:**

| Tool | Capture method | Output | Notable |
|---|---|---|---|
| **Granola** ([granola.ai](https://www.granola.ai/)) | **No bot** — transcribes system audio in the background | Merges *your sparse typed notes* with the transcript into "clear notes, personal to you"; auto action items; pre-meeting Briefs from calendar context | Free tier: unlimited notes, 30-day retention. Works on Zoom/Meet/Teams **and in person via mobile** |
| **Fireflies** ([fireflies.ai](https://fireflies.ai/)) | Notetaker bot (`fred@fireflies.ai`) auto-joins calendar events; also Chrome extension, mobile, uploads | Transcript, speaker ID, summaries, action items; **auto-creates tasks in Asana/Trello**, posts to Slack | Claims 95% accuracy, 100+ languages; SOC 2 II / GDPR / HIPAA |
| **Otter** | OtterPilot bot | Live transcript, summary, action items | Minute-capped free tier |
| **Zoom AI Companion** | Native to the platform | Meeting summary + "next steps" | Zero-install for Zoom-centric orgs |

**The design lesson for clubs:** the bot-in-the-meeting model is wrong for student orgs. Club meetings are overwhelmingly **in person, in a reserved classroom, at 8pm**. Granola's approach — capture in the room, merge with human notes — is far closer, and Granola's *Briefs* pattern (pre-meeting context assembled from the calendar) is directly transferable.

But the more important insight is that clubs don't primarily need transcription; they need **structure**. A club meeting has a known shape:

```
Meeting
  series (recurring: weekly e-board, biweekly committee)
  agenda[]           # items proposed before the meeting, by anyone
  attendance[]       # who came — doubles as engagement data
  notes (rich text, collaborative, live)
  decisions[]        # first-class object: what we decided + who dissented
  action_items[]     # each becomes a Task with assignee + due date
  linked: project/space, event, recording/transcript
```

Three mechanics matter more than AI:

1. **The agenda is built before the meeting by everyone.** A persistent "add to next week's agenda" affordance turns the agenda into a rolling inbox — the meeting equivalent of Linear's Triage.
2. **Action items are typed, not prose.** The highest-value interaction in the whole product: highlight a line in the notes → `@assign` → it becomes a Task with an owner and due date, linked back to the meeting. Fireflies proves the demand by integrating this outward into Asana/Trello; a club OS should have it natively.
3. **Last meeting's action items open this meeting's agenda automatically.** Recurring template with carry-forward. This one mechanic — not AI — is what keeps a club's task list alive.

**Decisions as a first-class object** is the underrated piece. Clubs relitigate the same arguments every year ("dues $20 or $30?", "do we do the formal?") because decisions live in expired Discord scrollback. A searchable decision log, auto-populated from meeting notes, is an institutional-memory feature disguised as a meeting feature.

AI's correct role is narrow: draft the agenda from open tasks and upcoming events; propose action items with suggested assignees for human confirmation; and format minutes to whatever the student-activities office requires for funding — unglamorous mandatory work nobody wants.

---

## 8. The "one place" question: absorbing workflows without bloat

### 8.1 What the winners actually do

Jason Fried's argument is the clearest statement of the failure mode ([*The next product*](https://world.hey.com/jason/the-next-product-42d6eaf9)): *"Entire categories can roll downhill, gathering complexity as they go. Each product one-upping the next until more becomes too much."* He calls it *"a loop of mutual destruction through perpetual over-improvement,"* and argues the winning entrant isn't more innovative — it just feels like *"someone opened the curtains and let the sun back in."* The strategy is **compete by simplification**. For a club OS entering a category where the incumbents are institutional engagement platforms that students actively avoid, this is the entire thesis.

The five scope-management strategies observable in the market:

| Product | Scope strategy | Mechanism | Cost |
|---|---|---|---|
| **Basecamp** | **Fixed tool set, per-project toggles** | Six tools, always the same six. You turn them off, never add new kinds. | Can't serve specialized workflows at all |
| **Linear** | **Refuse configurability** | *"Overly flexible software invites workflow chaos."* No custom workflows for most teams. | Only serves one job well |
| **Notion** | **One primitive, infinite arrangements** | Page + database. All "features" are user-assembled. | Requires an architect; the workspace dies with them |
| **Airtable** | **Platform + interfaces** | Bases/fields/views plus an app-building layer on top | Became a developer tool; left its original users behind |
| **Slack** | **Extend via surfaces, not features** | Canvas, Lists, Workflow Builder — new *surfaces* inside the same channel model | Surface proliferation; users don't discover them |

Note the cautionary tale in the data: **Coda**, the most ambitious "docs-are-apps" attempt, has been absorbed and rebranded under Superhuman ([coda.io/product](https://coda.io/product)) — maximum flexibility did not produce a durable standalone category.

### 8.2 The single object model idea

The Notion insight — *"Every item you enter into your database is a Notion page"* — is the most powerful structural idea in the space, and also the most dangerous. It's powerful because it means one set of mechanics (permissions, comments, search, templates, views) serves every use case. It's dangerous because it pushes information architecture onto the user.

The right synthesis for clubs: **a single object model underneath, a fixed set of named objects on the surface.** Internally, Task, Doc, Event, Application, and Thread can share a "content item" substrate with common permissions/comments/search/attachments. But the user never sees a generic "create a database" button. They see *"New event," "New application," "New task."* Notion's power with Basecamp's surface.

The governing rule, from Linear's principle 5: **use the club's existing vocabulary.** Every new noun you invent is onboarding debt paid by every officer, every year, forever — and with 100% annual turnover, that debt never amortizes. This is a structurally stronger argument against jargon in a club product than in any B2B product.

### 8.3 Templates as the mechanism for club-type variation

This is the central strategic answer to "how do we serve a robotics team and a dance company without building two products."

The evidence that templates carry variation:

- **Notion database templates** pre-fill both properties *and* page body for every new row — a bug report template sets Priority=P1 and lays out the page ([docs](https://www.notion.com/help/database-templates)). **Repeating templates** auto-create pages daily/weekly/monthly — the canonical use case listed is *weekly meeting notes*. That is exactly a club's weekly e-board meeting.
- **Basecamp project templates** let a repeated process (every event, every semester) be instantiated with its to-do lists, docs, schedule, and check-in questions intact.
- **Linear templates** prefill issue/project fields at team or workspace scope.

A template system for a club OS should operate at **four levels**, which is more than any of these products does, because clubs vary at more levels:

| Level | What it instantiates | Examples |
|---|---|---|
| **1. Club type** | The entire starting workspace: which Spaces exist, which roles, which recurring meetings, which doc stubs, which forms | Consulting club, robotics team, dance company, newspaper, investment fund, cultural org, pre-health, Greek chapter, hackathon |
| **2. Process** | A Project with its task list, phases, and doc stubs, with **relative** due dates ("T-30 days from event") | Run an event, run a recruitment cycle, run a fundraiser, produce an issue, build a robot for competition |
| **3. Recurring item** | An object auto-created on a schedule | Weekly e-board agenda, monthly budget check-in, end-of-semester transition memo |
| **4. Field/rubric** | Reusable structured fragments | Application rubric, interview scorecard, event postmortem questions, check-in questions |

Two design rules make this work:

- **Relative dates, not absolute.** A "Run an Event" template must express "book the room 30 days before" not "book the room on Oct 3." Basecamp does this; it is what makes process templates reusable rather than one-shot.
- **Templates are community content, not company content.** The winning move is letting a club publish its template and another club at another school install it. This is how Notion scaled to every use case without building any of them, and it converts your best users into your product team. It also creates the only real network effect available: *cross-campus process transfer*. The Michigan consulting club's recruitment funnel installed by the Texas consulting club is a moat no incumbent has.

### 8.4 The discipline: what to refuse to build

Stated as rules, in Basecamp/Linear style:

1. **No custom workflows.** Four task statuses. Forever.
2. **No generic database builder.** If a club needs a new kind of object often enough, you build it as a named object for everyone.
3. **No per-club permission matrices.** Three roles — member, officer, advisor — plus per-space visibility. Permission complexity is where volunteer tools go to die.
4. **No feature that requires someone to maintain it.** Anything that decays without an owner will decay, because the owner graduates.
5. **Prefer a template over a feature.** When a club asks for something, first ask whether it's a template of existing primitives. This is the scope valve.

---

## 9. Recommended workspace architecture

### 9.1 The core object model

Eleven objects. Not twelve. Every feature request must map onto these or be refused.

```
Club                 the tenant. name, campus, type, term_calendar,
                     roles[member|officer|advisor], constitution_doc,
                     bus_factor (computed), archive_policy

  Space              a standing body that persists across years.
                     "E-Board", "Marketing", "Case Team A", "Alumni".
                     Has: lead (one), members[], visibility, tools_enabled[]
                     PARA "Area": no end date. THIS is the Basecamp project page.

  Project            a finite effort that ends and archives.
                     PARA "Project". The §3.5 object: type, term, owners,
                     log[] (append-only), milestones[], external_links[],
                     outcome, postmortem, succession_note (required to archive)

  Task               ONE assignee. Todo/Doing/Blocked/Done. optional due_date.
                     origin: manual|meeting|form|template|recurring
                     belongs to a Space or Project

  Doc                rich text, in a page tree (Confluence-style), versioned.
                     Club-owned storage always. Never a personal account.

  Thread             a message-board post + threaded comments. Durable,
                     searchable, linkable. NOT chat — see §9.6

  Event              a thing on the calendar with a place, an RSVP, and
                     attendance. Has RRULE + EXDATE. Bound to a Term.

  Meeting            a special Event with agenda[], attendance[],
                     notes, decisions[], action_items[] → Tasks

  Form               versioned, immutable-on-publish. Blocks + logic.
                     Serves interest forms, RSVPs, waivers, dues, feedback

  Application        a Form wrapped in a Cycle: Stages, ReviewerAssignments,
                     Scores, Rubrics, Interviews, Decisions (§6.6)

  Person             member | alum | applicant | guest. One identity that
                     survives role changes and graduation. Carries
                     CoffeeChat contacts, notes, and the networking CRM
```

**The relationships that carry the product:**

- Everything belongs to a **Space** or a **Project**. There is no orphaned content and no "where does this go?" moment.
- **Person is continuous across the graduation boundary.** A member becomes an alum without becoming a different record. This one decision is what makes the alumni graph, the coffee-chat CRM, and institutional memory possible — and it is the decision every incumbent gets wrong by modeling students as enrollments.
- **Task carries `origin`.** Traceability from task → meeting → decision is what makes the archive answer *"why did we do it this way?"* a year later.
- **Archiving is mandatory and lossless.** Nothing is deleted. `succession_note` is required to archive a Project, which is how the handoff memo actually gets written — at the moment of completion, not in a panicked May email.

**The shared substrate.** Underneath, Task/Doc/Thread/Event/Project share one content-item base providing permissions, comments, mentions, attachments, search, and audit. That is the Notion insight. But the user never sees a generic "create a database" button — only the named objects above. Notion's power, Basecamp's surface.

### 9.2 How templates cover club-type variation

Build **one** product. Ship **many** templates, at four levels (§8.3): club type → process → recurring item → field/rubric.

| Club type | Spaces seeded | Signature process templates | Signature objects |
|---|---|---|---|
| Consulting | E-Board, Recruiting, Case Teams, Alumni | Recruitment funnel (4-stage app), Case delivery | Interview scorecard, client deliverable Project |
| Robotics | E-Board, Build, Software, Outreach, Fundraising | Competition season, Build log | Append-only build log, parts budget |
| Dance / theatre | E-Board, Production, Choreo, Tech | Show production (T-minus schedule) | Run-of-show, rehearsal recurrence, cue sheet |
| Newspaper | Editorial, Desks, Design, Web | Issue production cycle | Issue-as-Project with per-article Tasks |
| Finance / investment | E-Board, Research, Portfolio, Recruiting | Pitch cycle, Alumni networking round | Pitch memo, **networking CRM prominent** |
| Cultural / affinity | E-Board, Events, Outreach | Large-event runbook, Culture show | Budget request, vendor contacts |
| Hackathon org | Organizing, Sponsorship, Logistics, Tech | MLH-shaped event runbook | Sponsor pipeline (Card Table), judging |
| Greek chapter | Exec, Recruitment, Philanthropy, Standards | Rush cycle, Dues cycle | Dues status, attendance/points |
| Pre-health / pre-law | E-Board, Mentoring, Events | Mentor matching round, Speaker series | **Coffee chat rounds prominent** |

Two rules make this scale: **relative dates** in every process template ("book the room T-30"), and **community-published templates** — a club publishes its recruitment funnel and a club at another school installs it. That converts your best users into your product team and creates the one defensible network effect available: cross-campus process transfer.

**The onboarding flow follows directly:** pick your club type → the workspace is already populated with Spaces, a recurring e-board meeting, a constitution stub, and an interest form. Time-to-value is under 60 seconds, which is the only budget a volunteer officer will give you.

### 9.3 Calendar sync design

**Read (availability):** Google `calendar.freebusy` scope only — busy/free in, no event details out. Respect the **50-calendar cap** on `freebusy.query` by batching and merging for large clubs. Microsoft Graph `getSchedule` for Outlook campuses. Cache aggressively; refresh on `watch` channel triggers with sync tokens, plus a renewal cron since **channels do not auto-renew**.

**Write (publication) — a three-tier ladder, best available wins:**

| Tier | Mechanism | Latency | Requires |
|---|---|---|---|
| 1 | Write into a dedicated secondary calendar via API | Instant | OAuth write scope |
| 2 | Per-user secret **ICS subscription** feed | Hours (Google's undocumented poll) | One-time URL paste. Works on Apple/Outlook/Google |
| 3 | In-app + push + SMS | Instant | Nothing |

**The rule: ICS is for the stable semester calendar; push/SMS is for anything that changed.** Never rely on an ICS feed to deliver a time change.

**Class schedules:** Canvas ICS feed first, manual grid second (2 minutes, one-time per semester), screenshot-OCR as a delight accelerator with mandatory confirmation. Model recurrence as **RRULE + EXDATE bound to an Academic Term** so "ends at semester end" is automatic.

**Conflict detection** is the differentiator nobody ships: personal (aggregate counts only — "12 of 40 are busy," never "Sarah has BIO 101"), cross-club (grows with campus density — a real network effect), and institutional (finals, breaks, home games, religious holidays from a seeded campus calendar).

**Group availability:** ternary states (free / if-need-be / busy) scored on Graph's model (100 / 49 / 0, averaged), weighted by required-vs-optional attendee, surfaced as **top 3 options with who'd be missing** — and when nothing works, say *why*.

### 9.4 Coffee-chat matching design

**Round** (pool, type, cadence default biweekly, constraints) → **Match** → **Intro with a conversation guide** → **3 suggested slots, one-tap book** → **T+3 "did you connect?"** → **notes** → **networking CRM**.

- Peer rounds: **circle-method round-robin** (provably repeat-free over n−1 rounds).
- Mentor–mentee: **Hungarian algorithm**, weight = interest + industry + availability overlap − prior-pair penalty; cohort constraints as −∞ weights.
- Hard constraints stay hard (Donut leaves people unmatched rather than pairing badly); odd headcount → one group of three.
- Must-haves the clones omit: **snooze, opt out, and block a specific person.**
- The **T+3 confirmation** is the most valuable telemetry in the product — it drives completion rate, reputation weighting, no-show reassignment, and the officer dashboard.
- The **club-owned alumni graph** with member-level privacy (share the contact, not the notes) is what makes this survive board turnover — and it is the wedge against the Sheets + Apollo + Gmail stack students run today.

### 9.5 Build order

**v1 — "The club runs its week here."** Win the weekly loop or nothing else matters.
Club, Space, Person, Task, Doc, Thread, Event, Meeting. Club-type templates and a recurring meeting template. Agenda → notes → **action items become Tasks** (the single most important interaction in the product). ICS subscription feed out. Basic RSVP form. Roster with roles. Mobile-first web.
*Success test:* the e-board stops using a Google Doc for meeting notes.

**v2 — "The club recruits and schedules here."** The two acute seasonal pains.
Full Forms with logic and payments-by-link. **Applications**: cycles, stages, rubrics, blind review, reviewer assignment with COI recusal, stack-rank normalization, decisions with feedback. **Interview scheduling with interviewer pools and weekly limits** (the Ashby borrow). Group availability polling with calendar import. Google/Microsoft calendar read via `freebusy`. Personal conflict detection. Automatic check-ins. Hill charts for committee work.
*Success test:* a selective club runs its entire fall recruitment without a spreadsheet.

**v3 — "The club remembers, and the network compounds."** The moat.
Projects with append-only logs, milestones, and mandatory succession notes. **Officer transition flow** — a guided handoff that packages Spaces, docs, contacts, and logins for the incoming board. **Bus factor / Contributor Absence Factor** on the officer dashboard. Coffee chats and the networking CRM. Alumni graph. **Cross-club conflict detection.** Community template marketplace. Decision log search. Optional GitHub/Figma/Drive linking.
*Success test:* a club president who never met her predecessor can run the club from the archive.

### 9.6 Five decisions to make now, because they are expensive later

1. **Person is continuous across graduation.** Not "student" and "alum" as separate tables. Everything in v3 depends on this and it cannot be retrofitted.
2. **Don't build chat.** Clubs live in GroupMe, Discord, and iMessage and will not move — that is a social migration, not a feature gap. Build **Threads** (durable, searchable, linkable decisions) and integrate *outward* into the chat they already use. Basecamp bundles Campfire because it's a workplace; a club is not. Losing this fight costs a year.
3. **Never custody money.** Record dues status, generate a payment link. University policy usually requires funds to flow through a student-government account anyway, and this sidesteps money-transmission risk entirely.
4. **Club-owned storage from the first byte.** The §2.1 Drive failure is the reason to exist; recreating it would be fatal.
5. **Free must be genuinely free at club scale.** Donut caps free at 24 users, Basecamp's education discount excludes student orgs, Typeform's free tier is vestigial, and Tally/Fillout have already made forms free. The only defensible position is unlimited members, unlimited rounds, unlimited forms — and monetization later from the institution or the employer side, never from the club.

### 9.7 Open items to verify before building

- **Cal.com's current license.** The repo now presents as "Cal.diy," MIT, with `/ee` removed. Verify against the LICENSE file; it changes the embed calculus (though the recommendation to *not* embed stands regardless).
- **Google's actual ICS refresh cadence.** Undocumented; measure it empirically before promising anything about calendar latency.
- **Canvas ICS feed coverage** — whether it reliably includes class *meeting times* or only assignment due dates, across Banner and Workday-backed institutions.
- **Basecamp education eligibility** for student orgs specifically (the discounts page says classroom-only, one account per entity).
- **Bumble Bizz status** — no primary-source confirmation of discontinuation.
- **ESIGN/UETA primary statutory text** — cited here from secondary sources; confirm before making compliance claims in product copy.
- **Devpost's judging mechanics** and SlideRoom/Common App architecture — doc URLs were unreachable; the "shared core profile + per-program supplement" pattern is worth confirming.

