# Club OS — Data Architecture

*Draft v0.1. The quant engine that sits on top of this is documented separately in `04-quant-engine.md`.*

> Historical architecture proposal, not the current implementation contract. The running
> pilot uses SQLite. Message-metadata analytics and hidden profile proposals below do not
> describe the current privacy boundaries. See [System design](23-system-design.md),
> [MVP scope](24-mvp-system.md), and the repository README for the current direction.

---

## 1. Three layers, kept separate

| Layer | Store | Mutability | Purpose |
|---|---|---|---|
| **Operational** | Postgres (+ Apache AGE for graph queries) | Mutable, except where noted | Runs the product |
| **Event stream** | Activity Schema table, append-only | Immutable | Records what happened |
| **Derived** | dbt-built tables: computed traits, features, scores, embeddings | Rebuilt | Powers ranking, forecasts, dashboards |

The separation matters. The operational layer must be correct and fast. The event stream must never be rewritten, because every forecast and every audit depends on being able to reconstruct what we knew at a point in time. The derived layer is disposable and can be rebuilt from the other two.

---

## 2. Core schema

```
person ──< person_identity (edu_email, oauth_sub)
person ──< membership (club_id, tier, valid tstzrange, recorded tstzrange, joined_via)
person ──< position   (club_id, role, valid, recorded, source_event, attested_by)
club   ──< club_revision (SCD-2: name, category[], status, advisor, parent_club)
club   ──< event ──< event_revision (starts_at, venue, capacity, cost, type, sponsor_id)
event  ──< attendance (person_id, status, ts, method)              -- append-only
club   ──< post ──< reaction
club   ──< channel ──< thread ──< message                          -- append-only
club   ──< journal_entry ──< journal_line (account, debit, credit, payee, approver)
club   ──< budget (term, version) ──< budget_line (category, allocated)
club   ──< project ──< task (assignee, due, status)
club   ──< sponsorship (employer_id, amount, in_kind, term) ──< deliverable
club   ──< election ──< candidacy ; election ──< ballot (voter_hash) ; result → position
form   ──< form_response (schema_vendor/name/version, payload jsonb)
integration_signal (source, external_id, payload, observed_ts) → normalized event/post
employer ──< ad_campaign ──< ad_creative ──< ad_impression / ad_click
activity_stream (ts, actor_id, activity, entity_type, entity_id, features jsonb, campus_id)
consent (person_id, purpose, granted_at, revoked_at, version)      -- first-class
```

**Rules.**
- Position and Membership are **bitemporal**: a valid range (when it was true in the world) and a recorded range (when we learned it). This is what makes "who was treasurer in spring 2027" answerable, and it is what makes point-in-time correct model training possible.
- Attendance, messages, the ledger, and `activity_stream` are **append-only**.
- Every derived table carries `(entity_id, feature_ts)` so training never leaks the future into the past.
- `consent` is a real table, not a boolean on the user row, and dbt refuses to compute a feature for a person who lacks the purpose.

---

## 3. The 30 tracked events

Named `Object Verb-ed`, following the Amplitude and Segment convention.

| # | Event | Key properties |
|---|---|---|
| 1 | Account Created | campus, cohort_year, major, referral_source |
| 2 | Interests Declared | interest_ids[] |
| 3 | Consent Updated | purpose, granted |
| 4 | Club Viewed | club_id, source (feed/search/link) |
| 5 | Club Followed | club_id |
| 6 | Club Joined | club_id, joined_via, tier |
| 7 | Club Left | club_id |
| 8 | Member Invited | club_id, invitee_id |
| 9 | Event Created | club_id, event_type, capacity, cost |
| 10 | Event Published | event_id, channels[] |
| 11 | Event Viewed | event_id, source |
| 12 | Event RSVPed | event_id, rsvp_status |
| 13 | Event Checked In | event_id, method, minutes_after_start |
| 14 | Event No-Showed | event_id (derived nightly) |
| 15 | Event Rated | event_id, rating |
| 16 | Post Published | club_id, channel, media_types[] |
| 17 | Post Reacted | post_id, reaction |
| 18 | Message Sent | channel_id, thread_id, is_reply — **no content** |
| 19 | Task Assigned / Completed | club_id, assignee_id |
| 20 | Position Started / Ended | club_id, role, via (election/appointment) |
| 21 | Election Opened / Vote Cast / Closed | election_id, voter identity hashed |
| 22 | Budget Submitted / Approved | club_id, term, amount |
| 23 | Transaction Recorded | club_id, account, amount, payee_type, approver_id |
| 24 | Reimbursement Requested / Approved / Paid | amount, days_to_approve |
| 25 | Sponsorship Signed | employer_id, amount, in_kind |
| 26 | Form Submitted | form_id, schema_version |
| 27 | Integration Connected / Signal Received | source, object_type |
| 28 | Feed Item Impressed / Clicked | item_type, item_id, position, dwell_ms |
| 29 | Notification Sent / Opened | template_id, arm_id, channel |
| 30 | Employer Profile Viewed / Student Opted In | employer_id, fields_shared[] |

---

## 4. The profile feature vector

Per person, recomputed nightly, every row stamped `(person_id, feature_ts)`.

| Group | Dims | Contents | Visible to student? |
|---|---|---|---|
| Static / declared | ~20 | campus, cohort year, expected grad term, major, declared interests over a ~300-node campus taxonomy | Yes |
| Lifecycle | ~10 | Duolingo-style state (new/current/at-risk/dormant/resurrected) at platform and per-club level; semesters active; days since last check-in | Partly |
| Computed traits | ~60 | counts (30/90/365d), aggregations (avg dwell, avg minutes late), first/last, most-frequent, unique lists | Yes, subset |
| Skills | ~40 | calibrated probabilities with **evidence pointers**: event planning, fundraising, leadership, finance, marketing, recruiting, speaking, plus technical tags inherited from club taxonomy | Yes |
| Network | ~10 | degree, PageRank, betweenness, Leiden community, bridge score, distinct communities touched | Yes |
| Interest embedding | 64 | recency-weighted mean of club/event/post embeddings engaged with; two-tower trained on `Event Checked In` as the positive | No |
| Survival / propensity | ~8 | P(active next semester), P(joins a new club in 30d), P(runs for office), uplift for the current nudge | **No, and never exposed to employers** |

The skills group is the one that becomes the verified involvement record. Every inferred skill shows the events that justify it.

---

## 5. Club Health Index

Eight components, each z-scored **against a peer group** (same campus, same category, same size band) so a 15-person poetry club is not compared to a 300-person business fraternity.

```
CHI_c = 100 · Σ w_k · σ(z_k,c)

components (weight):
  retention            0.20
  attendance trend     0.15
  officer engagement   0.15
  bus factor           0.10
  funding runway       0.10
  content cadence      0.10
  network centrality   0.10
  pipeline             0.10
```

Two things ride alongside the index:

- **Form**, borrowed from Strava's fitness-and-freshness model: `EWMA₄₂d(activity) − EWMA₇d(activity)`. It is a leading indicator, so a club that is coasting on past momentum shows up before the attendance does.
- **Succession risk flag**, raised when ≥50% of officers are within one term of graduation and no successor has held any role. This is the single most predictive warning we can give, because it is the mechanism by which clubs die.

---

## 6. Privacy and consent

The goal is to learn a great deal without being creepy or illegal. Five design decisions do most of the work.

**Purpose-bound consent tiers**, enforced in the transformation layer rather than in application code:

| Tier | Purpose | Basis |
|---|---|---|
| 0 | Run the club: memberships, roles, attendance, ledger | Contractual necessity |
| 1 | Personalize my feed: computed traits, embeddings | Opt-out |
| 2 | Calendar and social integrations: free/busy only, club accounts only | Opt-in |
| 3 | Show my evidence to employers | Opt-in, per employer, per field, revocable |
| 4 | Ads personalization | Explicit, separate from the terms of service |

**Minimization by construction.** No message content in profiles. The interest vector is capped at a coarse taxonomy, decays, and carries 5% random-topic noise, following the Topics API pattern. Dorm and precise location are never collected. Grades are never ingested.

**Right to see, contest, and delete.** Every inferred skill or score displays its supporting evidence. Any employer-facing or funding-affecting automated decision gets human review. Deletion propagates through the event stream via tombstones and re-materialization.

**The institutional boundary.** FERPA education records stay out of the platform. If a university becomes the data controller for its instance, that is a separate tenant with school-official terms and **no employer or ad surfaces at all**. This single rule keeps the ad business and the university business from poisoning each other.

**Fairness monitoring.** Four-fifths-rule dashboards on any ranking exposed to employers or funding bodies. Goodhart guardrails: displayed scores depend on outcomes produced by others (retention of the people you recruited, attendance at events you ran), are capped per activity, and are audited quarterly for gaming.
