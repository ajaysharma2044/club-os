# CEC operating model and implementation priorities

September 11, 2026. Proposed design based on [the source-backed research](cornell-research.md) and a code review of the CEC pilot. This document changes the plan, not the running application. Numerical examples and proposed workflows are illustrative.

## The product CEC should use

Give the organizing team one place to prepare events, recruit and onboard contributors, manage relationships, and transfer responsibility between terms. Give the wider builder community an easy way to attend, share work, ask for help, and opt into introductions. The backend should explain what happened and what remains to be done.

A person's record should distinguish community participation, internal responsibilities, self-declared interests, submitted work, reviewed evidence, and specific sharing permissions. These are different facts, not interchangeable indicators of ability. The website's organization roles and the university's Startup Hours description motivate this separation; see the research note for evidence and date qualifications.

## 1. Separate identity, membership, and applications

Proposed relationships:

- Account: how a person signs in; verification status is explicit.
- Community participation: event registrations or a voluntary community profile.
- Application: belongs to a person AND recruitment cycle; multiple cycles are allowed.
- Membership: starts and ends independently of an application record.
- Team assignment: Events, Media, or other officer-configured team, with effective dates.
- Responsibility: event publisher, recruitment reviewer, educator, finance owner, or handoff owner; scoped by cycle, team, event, or term.
- External relationship: a guest, alumnus, mentor, speaker, or firm representative, with the relationship's source and scope.

A student who only wants to attend Thursday's gathering should not be labelled a recruitment applicant. An unsuccessful application should not prevent permitted public event participation. A member can later become an officer or alumnus without losing their work history.

Current gap: `auth()` creates every new user with `role='applicant'`; `users.role` combines membership and permission. `applications` uses the person ID as its primary key. This cannot represent repeated cycles or simultaneous relationships correctly.

## 2. Make Startup Hours an operational workflow

Proposed sequence, with timing configurable per occurrence:

1. An Events owner creates an occurrence from a series template. Confirm venue, event format, capacity, collaborators, and who pays for what.
2. Assign speaker coordination, room confirmation, catering, promotion, check-in, and follow-up tasks. Attach the run-of-show and venue confirmation.
3. Publish one authoritative registration link. Media can prepare distribution links for the website, Instagram, and the university listserv. Sending still requires a responsible person's action or an explicitly enabled automation.
4. At the food cutoff, reconcile confirmed registrations, cancellations, ticket categories, and uncertainty. An officer approves the food order.
5. Record check-ins and, if useful, aggregate meals distributed. Explicitly record whether check-in coverage was complete.
6. Reconcile expenses and collect an optional short outcome: what the attendee worked on, whether they met someone useful, and whether they want an introduction or to return.
7. Close the occurrence with unresolved tasks, actual costs, and notes for the next owner.

The repeated workflow creates useful data while reducing officer coordination. Room attendance, food demand, and meaningful participation are separate measurements.

Current gap: event publication, RSVP capacity, attendance, tasks, and money entries exist. Recurrence, food ticket types, linked event budgets, reservation approval, registration-source reconciliation, and automated follow-up do not. Waitlisting exists; automatic waitlist promotion does not.

## 3. Recruitment needs a cycle and interview workflow

Proposed sequence:

`cycle configured → application submitted → review → interview round(s) → decision → invitation accepted → onboarding`

Coffee chats remain a separate optional activity unless the cycle explicitly makes them a requirement. Each cycle owns its tracks, questions, deadlines, rubric version, reviewer assignments, and available team capacity. Keep interview slots distinct from interviews actually completed. A structured review links an assessment to a question or submitted artifact and identifies its reviewer.

Acceptance should create an invitation; joining records an explicit membership transition. Corrections to decisions must have defined effects on membership and permissions. A rejected candidate can reapply in another cycle.

Current gap: the pilot has a short form, internal notes, simple decision stages, and booking conflict checks. Acceptance immediately changes an applicant to a member. Changing a previously accepted application to declined does not revoke that membership. That is an unresolved lifecycle rule, not a complete reversal workflow. No cycle-aware uniqueness, reviewer rubric, multi-round interview object, invitation acceptance, or email notification exists.

## 4. Make the Canvas-like part useful to the educator

Proposed onboarding: welcome/resource module, track introduction, first useful assignment, artifact submission, educator feedback, and a project or event responsibility. Templates should be editable and assigned to a cohort. Completion should mean meeting a stated requirement; opening a document is only a view.

For ongoing work, store task owner, expected artifact, due date, dependencies, review outcome, and handoff notes. Link a submitted pitch, code repository, design, event plan, or media asset to the project and contributing people. Retain the difference between author-declared work and an officer-reviewed submission.

Current gap: assignments, submissions, feedback, tasks, and link-based documents exist. Cohort assignment, a versioned curriculum, file storage, and granular Drive permissions are not implemented. The seeded welcome assignment is a template, not CEC's official curriculum. There is no demonstrated reason to import academic grades into this workflow.

## 5. Give relationships a purpose and next action

A relationship record should answer: who introduced us, what they offered or requested, who owns the relationship, what event or project it concerns, what was agreed, and what happens next.

Keep speaker outreach, mentor introductions, funding support, event sponsorship, and recruiting opportunities as distinct pipelines. A sponsor commitment should link to its deliverables, amount, payment status, and an agreement. A public association with CEC does not establish a paid customer.

For external builder discovery, a member chooses the profile fields and artifacts to share and the recipient or purpose. Record introduction requested, consent obtained, introduction made, and outcome independently. Investor interest is an outcome to verify; it is not automatically revenue or investment.

Current gap: officer contacts, deals, money entries, and a double-opt-in public project directory exist. There are no firm accounts, recipient-specific grants, paid discovery subscriptions, introduction workflow, or verified hiring/funding outcomes. Public profile sharing alone is not consent to sell data.

## 6. Integration sequence

| Priority | Connection | First useful exchange | Boundary |
|---|---|---|---|
| 1 | Luma | Officer export of events/registrations/check-ins, with reconciliation preview | No public guest scraping; one registration authority per event. API access depends on subscription and credentials. |
| 2 | Existing application form/sheet | Officer-controlled import into a named cycle; duplicate review before commit | Preserve original question version and source IDs; import does not send decisions. |
| 3 | Google Drive/Docs | Select club-owned folders and link authoritative event plans, minutes, and artifacts | A linked document retains source access controls. Do not turn edit count into contribution quality. |
| 4 | Google Calendar | Publish confirmed event times and interview availability | A calendar entry does not confirm the venue or prove attendance. ICS export already works; live sync does not. |
| 5 | Slack | Explicitly turn a selected message into a task or confirmed decision, with a source link | Announcements and reminders need configured destinations; private message content is not a default input to matching. |
| 6 | Cornell resources | Link venue reservations and source-dated opportunities; attach confirmations | SSO, room-booking automation, and Canvas access require their own approved access. |

Only Luma's export/API capabilities were independently checked in this research pass. The remaining rows are proposed integration scope, not a claim that these connectors are configured or that every requested operation is available. Luma's official documentation is linked in the research note.

## 7. Where quantitative methods earn their place

Start with operational questions whose outcomes can actually be observed. The following are proposed extensions; they do not describe all current engine behavior.

### Attendance and food

Use an event-level attendance forecast with uncertainty. For a simple beta-binomial example, assume a uniform Beta(1,1) prior, 80 comparable RSVPs with complete check-in, and 60 attendees. The posterior attendance probability is Beta(61,21); its mean is 61/82. For 90 comparable future RSVPs, expected attendance is approximately 67. This example is hypothetical and relies on comparability; incomplete check-in must not be coded as 20 confirmed no-shows.

Compare against simple baselines on later events. Track mean absolute error and prediction-interval coverage. The current Python service supplies an attendance baseline, but the example's assumptions are not a description of the service's exact pooling policy.

For food orders, let D be meal demand, Cu the cost of a shortage, and Co the cost of an unused meal. A standard single-period decision rule chooses the smallest order q satisfying P(D ≤ q) ≥ Cu/(Cu+Co), subject to budget and operational constraints. Officers must specify those costs; the system cannot infer that an expensive meal shortage is worth any price. Ticket type and cutoff behavior can inform D once enough reliable outcomes exist.

### Recruitment operations

Measure counts and time in each stage by cycle, reviewer backlog, and interview-slot utilization. Denominators must refer to the same eligible cohort. Use volunteer scheduling to maximize feasible interview coverage subject to availability, workload limits, and conflicts of interest. Neither a response delay nor an incomplete application is a general assessment of a person's potential.

### Work and handoff

Measure approved deliverables, overdue dependencies, and responsibilities with a successor plus accepted handoff. A proposed handoff-completion metric is accepted handoffs divided by responsibilities requiring transfer, with the denominator shown. Compare within the same type of task and term; raw task counts are easy to inflate.

### Matching and outcomes

Use declared needs, interests, shared artifacts, availability, and explicit eligibility to generate collaboration candidates. Log suggestion, visible exposure, action, consented introduction, and outcome separately. The existing token-cosine model is a baseline. Evaluate usefulness through opt-in outcomes before training a more complex model. Observational conversion rates do not establish causal lift; a future randomized experiment needs assignment and exposure records before any causal claim.

## 8. Next implementation order and acceptance criteria

1. **Identity and permissions:** a guest can attend without applying; event staff cannot access recruitment notes; term changes remove only the relevant grants.
2. **One real Startup Hours workflow:** one registration authority, reconciled imports without duplicates, owner checklist, venue confirmation, food cutoff, and expense links. An officer can explain every forecast input.
3. **Cycle-aware recruitment:** the same person can apply in two cycles; questions and tracks preserve their submitted version; scheduling and decisions have explicit owners and correction behavior.
4. **Education and handoff:** a cohort receives assignments; reviewed work links to artifacts; a successor accepts each transferred responsibility.
5. **Introduction pilot:** a small opt-in set of projects, named recipients, specific needs, revocable sharing, and recorded outcomes. Test whether partners value the service before treating the proposed annual price as validated demand.

Pilot success means officers can complete these jobs with fewer manual reconciliations and reliably transfer the record. More logged events alone does not establish product value.

## Inputs needed from club operators

The smallest useful operational sample is one recent Startup Hours export plus its event checklist/budget, one recruitment-cycle form and rubric, the intended responsibility structure, and the club-owned source links. Those would let us validate field mappings and permissions without importing whole personal accounts. These materials were not accessed in this research pass.
