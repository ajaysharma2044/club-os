# 20 — Context intelligence: audit, gap analysis, and plan

*Phase 0 deliverable. Written before any code, against a full read of the record
layer, the quant layer, the operational modules, the Python service, and all 46
tables. Supersedes nothing; it is the map the next phases are built from.*

---

## A. Existing architecture map

### A1. The two databases

| DB | Engine | Tables | Opened |
|---|---|---|---|
| `cec.sqlite` | `node:sqlite` `DatabaseSync` | 46 | `web/lib/cec/db.ts:30` |
| `quant.sqlite` | Python `sqlite3` | 4 | `services/quant/club_quant/store.py:105` |

They never share a connection. Facts cross via the `outbox` table and a
subprocess (`web/lib/cec/quant.ts:4`). The Python store validates every fact
against a **closed schema** (`store.py:56`) — exact key-set equality, unknown
kinds rejected.

### A2. The layers that exist

```
items / users / rsvps / audit          ← operational CRUD (db.ts, service.ts)
        ↓ captureItem / captureTask / capturePresence
episodes → episode_objects
        ↓ recordEvidence  (THE single insert point)
activity_events  (append-only, trigger-enforced, bitemporal columns)
        ↓
opportunities (offer ledger)  ·  outcomes (labels)  ·  work_blockers
        ↓ computeRaw(userId, asOf)
13 signals → peerPrior/betaPosterior/peerZ/momentum
        ↓ runRegistry (walk-forward IC/IR)
signal_registry_runs
```

### A3. What is genuinely strong and must be preserved

- **`recordEvidence` is the single insert point** into `activity_events`
  (`evidence.ts:89`). Nothing else writes it. Triggers forbid UPDATE and DELETE.
- **`source_key UNIQUE`** gives idempotent ingest for free; the audit-id-as-source-key
  idiom (`service.ts:287` → `291`) is the pattern to copy.
- **The corrected point-in-time patterns** in `signals.ts:315-323` (offer time +
  response-known-by test) and `signals.ts:408-412` (`status_at`). These are the
  reference implementations.
- **Refusal to speak**: `clubHealth` returns `index: null` below `MIN_PEERS = 8`;
  `peerPrior` falls back to a weak prior below 3 peers; `betaQuantile` intervals
  gate every rate.
- **`quant.py`'s `MODEL` dict + `forecast()` return** — the *only* complete
  model-output standard in the repo: name, version, feature_version, declared
  assumptions, declared limitations, point estimate, 90% interval, posterior
  parameters, maturity `status`, and row-level `lineage`.
- **`assets.role_key`** — ownership attached to a *position*, not a person.
- **The partial-unique-index idiom** for "only one active X"
  (`opp_open`, `blocker_open`).
- **Schema invariants locked by tests** — `tests/assets.mjs:76` fails if any
  column matching `/password|secret|credential|token/` appears on `assets`.

---

## B. Gap analysis

### B1. The finding that reorders everything

**Nothing outside tests imports `forecast.ts`, `clubhealth.ts`, `context.ts`,
`weather.ts`, or `academic.ts`.**

That is roughly 3,000 lines of tested, working code — the Beta-Binomial
attendance predictive, the newsvendor, the club health index, regimes, the
campus state vector, behavioural alpha, the academic load engine, the weather
engine — with **zero production callers**. The live `quant/forecast` endpoint
(`route.ts:293`) calls Python, which runs a featureless RSVP beta-binomial.

The specification asks for a much larger context system. Building more layers
before this one is load-bearing would produce more of the same. **The first
priority is therefore not a new layer. It is the spine that makes a factor reach
a decision, and that prevents the next 3,000 lines from also being dead.**

### B2. The structural defect that blocks a factor registry

`SignalDef` (`signals.ts:34`) carries **metadata only — no compute function**.
All 13 signals are hard-coded inside one 160-line `computeRaw()`
(`signals.ts:263-423`), coupled to their definitions by string key alone.

Consequences, all live today:

- Adding a signal requires two coordinated edits; **forgetting the second yields
  a silently-zero signal, not an error.**
- `halfLifeDays` is declared on all 13 signals and **never read** — `momentum()`
  is called with its defaults at `signals.ts:485` and `:505`.
- `opportunityAdjusted` and `family` are inert pass-through metadata.
- 6 of 15 action families are **never emitted** (`JOIN`, `EXECUTE`, `HANDOFF`,
  `REQUEST_HELP`, `DECIDE`, `COMMUNICATE`), yet `help_response` and
  `handoff_completion` compute against them. Those two signals are
  **structurally unreachable** and can only ever report zero observations.

### B3. Five driver shapes, three version stamps, three factor conventions

| Concern | Implementations |
|---|---|
| "explain the drivers" | `FeatureAdjustment[]`, `WeatherFactor.components[]`, `AcademicFactor` (flat), `Alpha.factors[]`, `RegistryRow` |
| version stamping | `POLICY` string, `model`/`features` consts, Python `MODEL` dict |
| factor declaration | `SIGNALS`, `ATTENDANCE_ADJUSTMENTS`, `COMPONENTS` — plus `weatherFactor`/`academicFactor`, unregistered entirely |

### B4. The composition hazard

The context engine emits **multiplicative factors on expected turnout**.
`forecast.ts` consumes **additive log-odds on a conversion rate**. They cannot be
composed without an explicit conversion.

Worse, both independently price the academic calendar — `ATTENDANCE_ADJUSTMENTS.finals`
against `REGIME_TURNOUT` plus `REGIME_BASELINE_PRESSURE`. **Naive composition
double-counts finals**, which is exactly the failure `academic.ts:837` was
written to avoid within its own layer.

### B5. Point-in-time gaps

- **`recordEvidence` sets `occurred_at = observed_at` always**
  (`evidence.ts:103`, `:120`). No code path writes them differently. The
  bitemporal pair is currently degenerate — and this is **the single blocker for
  ingesting external campus events**, which genuinely have `published_at ≠
  observed_at`.
- `opportunities.takeRates()` still filters `observed_at`, which is never updated
  on response — the C1 leak, fixed in `signals.ts` but not at its source. Latent:
  the function has zero callers.
- `evidence.ts:477/483/488` read episodes, events and blockers **unbounded and
  unpaginated**; `work_blockers` has no org scope at all.
- `personOutcomes` hard-filters `subject_type='person'` (`outcomes.ts:111`), so
  the three object-level outcome kinds are unreachable from the registry.
- `users` has **no `created_at`** — tenure and cohort are unknowable from the row.

### B6. No Artifact entity

The spec's Skill Evidence Graph needs `Person → Episode → Action → Artifact →
Outcome`. There is no artifact entity. `submissions` is the de-facto store and is
**mutable in place** with no revision history and no episode link — invisible to
the record.

### B7. Multi-tenancy

No `institution_id` or `campus_id` anywhere in runtime code. `organization_id`
exists on exactly two tables and is always the literal `"cornell-ec"`
(`evidence.ts:35`). `opportunities` and `outcomes` have **no org column at all** —
worse than hard-coded, since rows from two tenants would silently commingle.
Twenty specific sites are catalogued in the schema audit.

---

## C. Implementation plan

Ordered by leverage, not by the spec's numbering.

**Phase 1 — the Factor Registry (the keystone).**
One declaration site for every factor, of every entity type, with a **bound
compute function**, a hypothesis, a provenance chain, a privacy class, permitted
uses, and a validation status. Fixes B2, B3. Pure module, no DB, so it is
testable and replayable like `behavioral.ts`.

**Phase 2 — factor values + evaluation, persisted.**
`factor_values` mirroring `outcomes` (the best existing precedent for a
subject-polymorphic bitemporal numeric row). `factor_evaluations` extending
`signal_registry_runs` rather than paralleling it.

**Phase 3 — make the context engine load-bearing.**
Resolve B4 explicitly: one documented conversion between the multiplicative and
log-odds worlds, with the finals double-count named and prevented, and the
existing forecast wired to real campus/academic/weather factors.

**Phase 4 — context sources + canonical campus events.**
Requires the `occurred_at`/`observed_at` split in `recordEvidence` (B5) first.
Dedup with traceable merges.

**Phase 5 — regimes, exposure, person/club state.**
**Phase 6 — planning baseline.**
**Phase 7 — skill evidence substrate** (needs B6 fixed first).
**Phase 8 — sponsor campaign substrate.**

---

## D. Proposed schema changes

Following the established idiom exactly: `let ready = false` guard,
`CREATE TABLE IF NOT EXISTS` inside one `db().exec()`, additive columns via
`PRAGMA table_info` + `ALTER TABLE ADD COLUMN` (nullable or constant default
only — SQLite cannot add `NOT NULL` without one).

**`factor_values`** — modelled on `outcomes`, which is the closest existing
precedent for a subject-polymorphic, bitemporal, evidence-graded numeric row:

```
id, factor, entity_type, entity_id, value REAL, unit,
occurred_at, observed_at,          -- genuinely distinct here, unlike activity_events
computed_at, source, evidence_level, model_version, context,
UNIQUE(factor, entity_type, entity_id, occurred_at, model_version)
```

`entity_type` gains `campus` and `club` alongside `person`/`event`.

**`factor_evaluations`** — the same shape as `signal_registry_runs`
(`signal, outcome, pairs, windows, ic, ir, sign_agrees, verdict, policy,
computed_at`) generalised to any factor, so one table holds both.

**`context_sources`** — persisting what `CAMPUS_SOURCES` (`campus.ts:61`) holds
in code today, plus `institution_id`, `permission_basis`, `trust_level`,
`parser_version`, `last_attempt_at`, `last_success_at`.

**`campus_events` + `campus_event_sources`** — a dedicated table, *not* `items`
(whose `owner` is `NOT NULL REFERENCES users(id)`; an external event has no
owner) and *not* `activity_events` (whose `episode_id`/`actor_id`/`subject_id`
are all `NOT NULL` FKs). Idempotency via `UNIQUE(source_id, external_record_id)`,
matching how `records UNIQUE(club,source,external_id)` already works.

**Deferred deliberately**: no `institution_id` backfill onto `episodes` /
`activity_events` in this phase. Adding a column is not tenant isolation
(`docs/adaptive-workflows-and-evidence.md:185` says so), and doing it half-way is
worse than doing it once, properly, with the uniqueness constraints in §B7
revisited together.

---

## E. Files

**New**
- `web/lib/cec/factors.ts` — the registry (pure)
- `web/tests/factors.mjs`

**Modified**
- `web/lib/cec/signals.ts` — bind the 13 `SignalDef`s to compute functions
  through the registry rather than the string-keyed switch
- `web/lib/cec/forecast.ts` — accept registry factors; document the conversion
- `web/lib/cec/evidence.ts` — split `occurred_at` from `observed_at`
- `web/package.json` — test script

---

## F. Standing constraints this plan inherits

From [11 — cross-club graph](11-cross-club-graph.md) §7, binding:

- **The mirror test.** If a signal cannot be shown to the person it is about, in
  plain language, with a working off switch, it does not get computed.
- **The incentive test.** Before exporting any person-level signal, ask what the
  recipient's incentives do to a student when the signal is wrong.
- **Proxies for protected attributes are blocked at the feature store, not just
  from display.** This must be enforced in code, not policy — hence a privacy
  class on every factor, checked at registration.
- **No portable reliability score sold to employers.** From
  [10](10-talent-verification-market.md) §6: *evidence, never a score.*

And the honest framing the repo already keeps: a campus-involvement score is
substantially a wealth-and-free-time score. That belongs in the model
documentation, not in a discovery after launch.
