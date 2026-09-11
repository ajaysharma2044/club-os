# Cornell Entrepreneurship Club: evidence and product implications

Updated September 11, 2026. This replaces the earlier short research note. Public sources were checked against the current pilot code. Recommendations below are our interpretation; they are not approved CEC procedures. Website observations do not establish current officer authority, financial contracts, or university endorsement.

## Main finding

CEC needs a shared operating record for its organizing team and the broader community participating in its programs. A public event attendee, recruitment applicant, team member, officer, alumnus, and visiting mentor are different relationships. One person can hold several of them. The current pilot incorrectly makes every new account an `applicant`; recruitment status should instead belong to an application for a particular cycle.

The proposed workflows and implementation sequence are in [CEC operating model](cec-operating-model.md). They are proposals, not additional shipped functionality.

## What the sources establish

### 1. CEC has a defined operating team

The club's public members page lists co-presidents and responsibilities for Events, Recruitment, Media, New Member Education, Socials, and Internal Operations, along with former presidents. It also describes September and February recruitment. Treat this as the site's displayed organization structure, not a verified access-control roster. [CEC members](https://www.cornellec.com/members)

Implication: create term-bound responsibility assignments and handoff records. Assign access by responsibility: publishing an event should not automatically expose recruitment notes. Do not grant accounts privileges by matching their names to this webpage.

### 2. Recruitment has cycles and multiple rounds

The opened recruitment page lists Events, Media, and Generalist, a 5–8 hour weekly commitment, information sessions, and first and final interviews. However, search-indexed content for the same URL lists Events, Media, and Builders, with a February timeline. The year is unclear. These conflicting representations cannot establish the active cycle or its track names. The linked Google Form could not be retrieved in this research session; its actual questions and reviewer rubric remain unknown. [CEC recruitment](https://www.cornellec.com/recruitment)

Implication: configurable, versioned cycles and tracks are necessary. The current fixed three-track form and one-application-per-account rule are pilot shortcuts. Coffee-chat booking is not evidence that an interview happened, and the public timeline does not establish that coffee chats are mandatory.

### 3. Startup Hours is a recurring community service

CEC's events page describes a Thursday evening series, 7:30–9:00 p.m. during the semester, and links to Luma. Its speaker archive is a club-published claim; individual events still need dates and organizer attribution. [CEC events](https://www.cornellec.com/events)

Entrepreneurship at Cornell's dated March 3, 2026 newsletter advertises March 5 Startup Hours on eHub's third floor, gives a Wednesday 5 p.m. RSVP deadline, identifies CEC as host and Entrepreneurship at Cornell as funder, and describes project work, advice, and connections with builders and investors. This corroborates the operating pattern through spring 2026, not any September 2026 booking. [University newsletter](https://www.linkedin.com/pulse/march-3-2026-eshipatcornell-ihuqe)

Implication: model a recurring series with separately confirmed occurrences, owners, venues, registration deadlines, tasks, and follow-up. Allow community participation independently of recruitment.

### 4. Food planning is part of the actual event workflow

A historical CEC Luma listing titled “Startup Hours - 4/24” displays Standard and Priority registration, with food priority closing Wednesday at 5 p.m. Other historical listings use different priority deadlines. The indexed listing was available, but direct retrieval failed. It is evidence of prior ticket structure, not the current catering rule. Public “Went” counts were not used as verified attendance or imported as person records. [Historical Luma listing](https://luma.com/vvnul1qr)

Implication: ticket type, food cutoff, confirmed catering quantity, cost, and actual meal distribution are distinct fields. Forecast meals separately from room attendance.

### 5. Campus resources have their own approvals

The eHub page identifies Kennedy Hall and Collegetown locations and a separate reservation system. Multipurpose room bookings require Entrepreneurship at Cornell staff approval. The page lists a $500 custodial charge for Collegetown events serving food; whether a funded Startup Hours occurrence is charged or covered needs confirmation. [Official eHub guidance](https://eship.cornell.edu/item/ehub/)

Implication: store reservation status and confirmation evidence separately from event publication. Track payer, estimated cost, approved amount, and receipt separately. A calendar entry is not a reservation or an invoice.

### 6. CEC's history requires careful entity matching

CEC's LinkedIn page says the group previously used the Life Changing Labs name and now distributes event registrations through Instagram, its website, and Cornell's entrepreneurship listserv. Its fundraising and accelerator headline claims are self-reported and have no defined cohort or audited attribution in the materials reviewed. [CEC LinkedIn](https://www.linkedin.com/company/cornell-ec)

A July 2024 Cornell Chronicle article independently describes MathGPT's founders attending Life Changing Labs' Thursday Startup Hours and meeting other founders there. This supports the historical community function; it does not show that attendance caused the startup's success. [Cornell Chronicle, July 2024](https://news.cornell.edu/stories/2024/07/cornell-startup-offers-ai-powered-math-help)

An older Cornell ILR article also uses the Cornell Entrepreneurship Club name in another historical context. Names alone cannot establish continuity between organizations, nonprofits, or former clubs. [Cornell ILR historical article](https://www.ilr.cornell.edu/news/about-ilr/tech-tools-churches)

Implication: preserve source organization IDs and historical names. Have an officer confirm historical imports; do not automatically combine similarly named records.

### 7. External relationships need event-level evidence

Cornell's October 2, 2025 Startup Hours listing names CEC, its university funder, other campus organizations, and venture organizations in different roles. It does not establish that every named firm sponsors CEC, has an active agreement, or will purchase access to members. [Cornell event listing](https://eship.cornell.edu/event/startup-hours/)

The club's speaker archive overlaps with people documented at wider university events: for example, Cornell's April 2024 report describes Tim Barry speaking at Entrepreneurship at Cornell's Celebration. That does not disprove a separate CEC appearance, but it cannot independently verify one. [Cornell Celebration report](https://news.cornell.edu/stories/2024/04/entrepreneurship-celebration-honors-alumni-student-innovators)

Implication: distinguish speaker, alumnus, introducer, mentor, co-host, funder, sponsor, and prospective customer. Record the specific event or agreement supporting each relationship.

### 8. Education and building belong in the workspace

CEC's homepage describes practical venture learning, building products, and support for startups. It explicitly calls its Engineering Fellowship upcoming and unconfirmed. No complete curriculum or confirmed fellowship placements were found. [CEC homepage](https://www.cornellec.com/)

Cornell's startup guide organizes university resources by venture stage. These are external resources with their own eligibility and application processes. [Cornell startup guide](https://eship.cornell.edu/cornell-startups/how-to-launch-a-startup-at-cornell/)

Implication: the new member educator needs reusable assignments, artifact submissions, feedback, and project milestones. Keep external opportunities source-linked and time-bounded. Do not advertise an unconfirmed fellowship as open or infer access to Cornell Canvas courses.

## Integration finding: Luma is an optional migration source

Luma documents host-side CSV guest exports and distinguishes registration approval from ticket-level check-in. An approved registration is not proof of attendance. [Luma guest-list documentation](https://help.luma.com/p/managing-your-guest-list)

Its API requires Luma Plus and calendar-scoped credentials; the developer guide warns that a calendar key grants full calendar access. We did not establish CEC's subscription or access rights. [Luma API guide](https://docs.luma.com/reference/getting-started-with-your-api)

Product direction: operate new event registration natively in Club OS. Luma is optional for officer-provided historical exports or later synchronization, and is not required to use the product. Existing externally registered events need an explicit migration decision. Preserve external IDs, timestamps, and source status during any import; never scrape public attendee tiles to construct the club roster. This updates the earlier integration-first recommendation without changing the underlying research findings.

## What remains unknown

- Active recruitment year, track names, exact form, interview rubric, reviewer assignments, and acceptance policy.
- Current operating roster, role owners, permission boundaries, and handoff practice.
- Actual Luma calendar, source-of-truth spreadsheet, Slack channels, shared Drive folders, and Google Calendar ownership.
- Upcoming confirmed events, catering arrangements, room-cost exceptions, and actual budgets.
- Membership size, verified attendance, longitudinal startup outcomes, and any signed commercial commitment.
- University registration identity and whether Cornell SSO or Canvas access is relevant or authorized for this deployment.

Public research is enough to define the next product changes. These private operational facts require an officer-provided source or configuration; none were invented or seeded into the application.
