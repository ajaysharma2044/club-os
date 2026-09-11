# 16 — Adversarial correctness review of the quant layer

*Scope: `web/lib/cec/flow.ts`, `scheduler.ts`, `behavioral.ts`, `signals.ts`, `opportunities.ts`.
Checked against `docs/14-quant-per-feature.md` §1 and §4, `docs/15-behavioral-quant-layer.md`, and the
do-not-compute list and mirror test in `docs/11-cross-club-graph.md`.*

Every finding below was reproduced. Closed-form and `scipy` comparisons were used for the numerics;
randomised differential testing (30k instances) was used for the flow code; a throwaway SQLite
database was used for the signal pipeline. Repro scripts are listed at the end.

**Headline: three critical bugs.** Two of them are point-in-time leaks that silently invalidate
every registry result, and the third makes `computeFeasibility` name every candidate in the round as
stranded.

---

## CRITICAL

### C1. `task_take_rate` / `ownership_take_rate` / `panel_take_rate` can see the future

**`web/lib/cec/signals.ts:310-318`** (query at :311), root cause **`web/lib/cec/opportunities.ts:134-136`**.

```ts
// signals.ts:311
"SELECT kind,response,responded_at,offered_at FROM opportunities WHERE offered_to=? AND observed_at<=?"
```

`observed_at` is written **once, at offer time** (`opportunities.ts:105`) and is never touched again.
`respond()` updates only `response` and `responded_at`; `expireStale()` updates only `response` and
`responded_at`. So the filter `observed_at<=asOf` gates *when the offer was made*, not *when the
response was known*. Every offer made before `asOf` is returned **with its final response attached**,
no matter when that response arrived.

**Concrete failing input** (`scratchpad/atk-leak.mjs`):

```sql
INSERT INTO opportunities(...,offered_at,observed_at,response,responded_at,...)
VALUES ('o1','task','task','t1','u1','off','',
        '2026-01-01T00:00:00.000Z',   -- offered_at
        '2026-01-01T00:00:00.000Z',   -- observed_at (never updated)
        'accepted',
        '2026-06-01T00:00:00.000Z');  -- responded_at: FIVE MONTHS AFTER as-of
```

```
computeRaw("u1", "2026-02-01T00:00:00.000Z").task_take_rate
  actual   { successes: 1, failures: 0, points: [{ value: 1, ageDays: 0 }] }
  expected { successes: 0, failures: 0, points: [] }
```

Two separate damages:

1. The success is counted four months before it happened. `runRegistry` computes `x` from exactly
   these counts at `o.horizon_start`, so the "walk-forward" IC for all three take-rate signals is
   contaminated with the answer. Note the take rates are the flagship opportunity-adjusted signals
   from `docs/15` §3.
2. `ageDays(responded_at, asOf)` is `Math.max(0, negative) = 0`, so the leaked observation is given
   the **maximum possible recency weight** in `ewma`/`momentum`. Future events are not merely visible,
   they dominate.

**Correct behaviour.** `observed_at` must be the bitemporal "when we learned it" stamp of the *current*
state of the row, exactly as `activity_events` uses it.

**Suggested fix.** Either (a) `UPDATE opportunities SET response=?, responded_at=?, observed_at=?`
in `respond()` and `expireStale()` — cheapest, and makes the existing query correct; or better
(b) make the ledger append-only like `activity_events` (one row per state transition, with its own
`observed_at`) and read the latest row with `observed_at<=asOf`, which also fixes C-series bug M2
for free. With (a), also change the signal query to filter
`AND (responded_at IS NULL OR responded_at<=?)` as a belt-and-braces guard.

---

### C2. `interview_reliability` can see the future

**`web/lib/cec/signals.ts:393-407`** (query at :398), root cause **`web/lib/cec/interviews.ts:526-529`**.

```ts
// signals.ts:398
"SELECT panel,status,created_at FROM interview_assignments WHERE created_at<=? AND status IN ('completed','no_show')"
```

`interview_assignments` (`interviews.ts:63-71`) has **no `updated_at`, no `observed_at`, no
`completed_at`** — only `created_at`. `assignment/status` (`interviews.ts:528`) mutates `status` in
place. So the query filters on the creation time while reading a field that was written later.

**Concrete failing input:**

```sql
INSERT INTO interview_assignments(id,round_id,candidate_id,slot,panel,status,created_at)
VALUES ('a1','r1','c1','s0','["u1"]','completed','2026-01-01T00:00:00.000Z');
-- (status was 'offered' on 2026-02-01 and only became 'completed' on 2026-06-01)
```

```
computeRaw("u1", "2026-02-01T00:00:00.000Z").interview_reliability
  actual   { successes: 1, failures: 0, points: [{ value: 1, ageDays: 31 }] }
  expected { successes: 0, failures: 0, points: [] }
```

`interview_reliability` claims to predict `transition_completed`; its registry IC is computed from
outcomes that had not happened at the horizon. Note that the *interview happening at all* is itself
scheduled for a future slot, so in practice **essentially every row this query returns at a
historical `asOf` is a leak** — the status can only be terminal after the interview, which is after
`created_at` by construction.

**Correct behaviour.** Reliability at `asOf` must count only assignments whose terminal state was
already recorded by `asOf`.

**Suggested fix.** Add `status_at TEXT` (or `observed_at`) to `interview_assignments`, set it in
`assignment/status`, and filter `WHERE status_at<=? AND status IN ('completed','no_show')`.
Backfill from the `emit(u,"interview","assignment",...)` events, which already carry a correct
`occurred_at`/`observed_at` — in fact reading the reliability signal off `activity_events` instead of
the mutable table would sidestep the problem entirely and is the pattern the rest of `computeRaw` uses.

---

### C3. `Feasibility.stranded` names candidates who were fully scheduled

**`web/lib/cec/scheduler.ts:86-90`**, and the comment above it is mathematically wrong.

```ts
// A candidate still reachable from the source in the residual graph has slack
// on their demand edge — that is precisely an unmet candidate.
const seen = net.reachable(source);
const stranded = input.candidates.filter((c) => seen[candNode.get(c)!]);
```

Reachability in the residual graph is **not** the same as having slack on the source edge. A
*served* candidate `c2` is reachable whenever an *unserved* candidate `c1` shares any eligible seat
with them: the path is `source →(slack) c1 →(unused, cap 1) seat →(reverse residual) c2`. The
reverse edge `seat → c2` has residual `0 - (-1) = 1 > 0` precisely because `c2` is using that seat.

**Concrete failing input:**

```js
computeFeasibility({
  panelSize: 1,
  candidates: ["A", "B"],
  panelists: [{ id: "P", cap: 1 }],
  candidateSlots: { A: ["s1"], B: ["s1"] },
  panelistSlots:  { P: ["s1"] },
})
// actual:   schedulable 1, short 1, stranded ["A","B"]
// expected: schedulable 1, short 1, stranded ["A"] or ["B"] — exactly one
```

**And on the real instance from `docs/14` §1** (35 candidates, 7 officers, cap 3, everyone free at
all 20 slots):

```
demand 35   schedulable 21   short 14   stranded.length 35
```

It names **all 35 candidates as stranded** when only 14 are. Randomised testing:
`stranded.length !== short` in **10,647 of 30,000** random `panelSize:1` instances (35%).

The existing test (`tests/scheduler.mjs:59-74`) passes only because its stranded candidate `c2` has a
slot (`"zz"`) that nobody is free at, so `c2` shares no seat with `c1` and the residual path does not
form. Any instance where the stranded candidate actually competes for capacity breaks it.

**Correct behaviour.** An unmet candidate is one whose **source edge has residual capacity**:

```ts
const stranded = input.candidates.filter((c) => {
  const e = net.graph[source].find((x) => x.to === candNode.get(c));
  return !!e && e.cap - e.flow > 0;
});
```

For `panelSize:1` this makes `stranded.length === short` exactly. (Cheaper still: record the
source-edge index per candidate when you build the graph.)

`Feasibility.stranded` is exported through the `interviews/feasibility` API and is declared in
`components/cec/InterviewRounds.tsx:13`. It is not rendered *yet* — that is the only thing keeping
this off a user's screen.

---

## MAJOR

### M1. `offer()` is not idempotent when the offer is accepted in the same breath

**`web/lib/cec/opportunities.ts:83-88`** vs the partial index at **:54**.

The pre-check only looks for a row with `response='pending'`, and the unique index is
`WHERE response='pending'`. Both guards are blind to non-pending rows, so an offer created with
`response: "accepted"` is **never deduplicated**.

```js
offer(u, { kind:"task", objectType:"task", objectId:"tX", to:"u1", response:"accepted" });
offer(u, { kind:"task", objectType:"task", objectId:"tX", to:"u1", response:"accepted" });
offer(u, { kind:"task", objectType:"task", objectId:"tX", to:"u1", response:"accepted" });
// -> three distinct rows, all kind='task', response='accepted'
```

**This fires on a real code path.** `interviews.ts:279-286` (quickstart) and `interviews.ts:388-395`
(`panelist/set`) both call:

```ts
offer(u, { kind:"panel", objectType:"interview_round", objectId: roundId, to: who,
           response: who === u.id ? "accepted" : "pending" });
```

An officer who runs `quickstart` and then calls `panelist/set` on themselves — which
`tests/signals.mjs:200` does — inserts a second `accepted` panel offer. Every subsequent cap edit
adds another. `panel_take_rate` for that officer is inflated by one accepted offer per call, and
`opportunityState` totals drift permanently.

**Correct behaviour.** "Idempotent while pending" (the docstring at :68) has to mean idempotent on
the *object*, not on the pending state.

**Suggested fix.** Either widen the pre-check to `AND response IN ('pending','accepted')`, or make
the unique index unconditional on `(kind,object_type,object_id,offered_to)` and let re-offers be an
explicit `respond()` + new-row operation. Given M2, the append-only ledger in C1's fix (b) is the
cleaner answer.

---

### M2. `respond()` can apply a response to the wrong offer

**`web/lib/cec/opportunities.ts:125-132`** (SQL at :127).

```sql
SELECT id,kind FROM opportunities
WHERE object_type=? AND object_id=? AND offered_to=? AND response='pending'
  /* AND kind=? only when the caller passes one */
ORDER BY offered_at DESC LIMIT 1
```

When `r.kind` is omitted the query does not disambiguate kind, and `offered_at` is a millisecond ISO
string, so simultaneous offers tie and the winner is arbitrary.

**Concrete failing input:**

```js
offer(u, { kind:"task",  objectType:"interview_round", objectId:"rZ", to:"u1" });
offer(u, { kind:"panel", objectType:"interview_round", objectId:"rZ", to:"u1" });
respond(u, { objectType:"interview_round", objectId:"rZ", to:"u1", response:"declined" });
// before: [ {task,pending}, {panel,pending} ]  (identical offered_at)
// after:  [ {task,pending}, {panel,DECLINED} ]  <-- the panel seat was declined, not the task
```

Reachable from the generic API (`opportunities.ts:245-255` passes `kind` only when the caller
supplies `b.kind`) and from `service.ts:298`/`:348`/`:350`, which never pass `kind` — so any
`ownership`/`handoff`/`committee` offer created against an `object_type='task'` for the same person
can absorb a task accept/decline. The behavioural consequence is a *declined* recorded on the wrong
signal family, which is exactly the confusion the ledger exists to prevent.

**Suggested fix.** Make `kind` required on `respond()`; every internal caller already knows it.
Failing that, refuse to act when more than one pending row matches, and tie-break on a monotonic
`seq` rather than `offered_at`.

---

### M3. `takeRates().offered` is not the fair denominator the spec demands

**`web/lib/cec/opportunities.ts:206-211`**, contrast `OWN_CHOICE` at **:34** and `signals.ts:316`.

`t.offered++` counts **every** row, including `pending`, `withdrawn` and `reassigned`, which
`OWN_CHOICE` explicitly excludes. `signals.ts` filters correctly; `takeRates()` does not, and it is
the exported, publicly-named "per-kind take rates" function.

**Concrete failing input:**

```js
// u1's ownership offers: one withdrawn, one reassigned, one accepted
takeRates("u1")  // -> { kind:'ownership', offered:3, accepted:1, declined:0, expired:0, pending:0, excluded:2 }
accepted/offered                         = 0.333   // what any consumer will compute
accepted/(accepted+declined+expired)     = 1.000   // the fair rate, per docs/15 §3
```

`docs/15` §3 is explicit that the whole point of the ledger is the denominator; shipping a field
called `offered` that must not be used as a denominator is a loaded gun. It is currently unused
outside the module, which is the only reason this is not critical.

**Suggested fix.** Rename to `total` and add `answered = accepted + declined + expired`, or drop
`offered` and expose `answered` only. `takeRates` also carries the C1 leak (same `observed_at<=?`
filter) — fix both together.

---

### M4. Greedy assignment reaches only 50% of the optimum, at arbitrary scale

**`web/lib/cec/scheduler.ts:146-158`** (`eligible` sorts by load only) and **:190-192**.

`eligible()` sorts candidate panelists by current load and takes the first `k`. It never considers
how *scarce* a panelist is. Picking a flexible panelist when a dedicated one would do burns capacity
another candidate uniquely depends on.

**Minimal failing input (2 candidates, optimum 2, greedy 1):**

```js
computeAssignment({
  panelSize: 1,
  candidates: ["c0", "c1"],
  panelists:  [{ id:"p0", cap:1 }, { id:"p1", cap:3 }],
  candidateSlots: { c0: ["s0","s3"], c1: ["s0","s1"] },
  panelistSlots:  { p0: ["s1","s2","s3"], p1: ["s3"] },
})
// greedy: c0 -> s3 with p0, then c1 has nothing (only p0 can cover s1, and p0 is at cap)
// optimal: c0 -> s3 with p1, c1 -> s1 with p0
// => 1 of 2
```

**The gadget replicates, so the ratio holds at any size.** With `X_i` free at `s_i`, `Y_i` free at
`t_i`, `A_i` (cap 1) free at both and `B_i` (cap 1) free only at `s_i`:

| candidates | flow optimum | greedy | ratio |
|---|---|---|---|
| 2 | 2 | 1 | 0.50 |
| 10 | 10 | 5 | 0.50 |
| 20 | 20 | 10 | 0.50 |
| 40 | 40 | 20 | 0.50 |

Randomised search over 20,000 instances found no worse than 0.50, so 1/2 looks like the tight bound
for this heuristic family — but 1/2 is already what `docs/14` §1 warns about verbatim: *"Do not
hand-roll a greedy heuristic, because greedy fails badly on exactly the tight instances where you
need the answer."* Tight instances (7 officers, cap 3, 35 candidates) are the only instances CEC has.

**Suggested fix.** Short term, within the existing structure: break `eligible()` ties by *panelist
scarcity* (how many of the still-unplaced candidates' feasible slots this panelist can cover) rather
than only by load, and after the greedy pass run augmenting-path repair on the unplaced set —
for `panelSize:1` that recovers the exact optimum, which `computeFeasibility` already computes.
Long term, `docs/14` §1 calls for CP-SAT.

---

### M5. Panel feasibility prints "All N interviews fit" for instances where zero fit

**`web/lib/cec/scheduler.ts:80, 101-112, 123-126`.**

For `k > 1` the flow relaxation counts seats without forcing a panel's `k` seats into the same slot,
so `Math.floor(seats / k)` is only an upper bound. `exact:false` is set correctly — but
`explanation` is generated *before* that caveat and states the upper bound as fact.

**Concrete failing input:**

```js
computeFeasibility({
  panelSize: 2,
  candidates: ["A"],
  panelists: [{ id:"p1", cap:1 }, { id:"p2", cap:1 }],
  candidateSlots: { A: ["s0","s1"] },
  panelistSlots:  { p1: ["s0"], p2: ["s1"] },   // never free at the same time
})
// schedulable 1, short 0, exact false
// explanation: "All 1 interviews fit within current caps and availability."
// computeAssignment on the same input places 0 and returns unplaced ["A"]
```

`floor(seats/k)` is also not tight in the other direction — seats spread across candidates can leave
*nobody* fully served while the formula reports 1:

```js
computeFeasibility({ panelSize: 2, candidates: ["A","B"], panelists: [{ id:"P", cap:1 }],
  candidateSlots: { A:["s0"], B:["s0","s1"] }, panelistSlots: { P:["s0","s1"] } })
// schedulable 1 — truth is 0. computeAssignment places 0.
```

Separately, the comment at :123-125 says *"computeAssignment is the ground truth there."* It is not:
per M4 it is a greedy **lower** bound that can be half the optimum. The truth is bracketed between
the two and the code says so nowhere.

**Suggested fix.** When `k > 1`, phrase `explanation` as a bound ("at most N of M fit; panels need
everyone free at the same time"), and correct the comment to "computeAssignment is a lower bound".
The UI caveat at `InterviewRounds.tsx:167-172` already says the right thing; the library should not
contradict it.

---

### M6. A dropped commitment is always dated "today"

**`web/lib/cec/signals.ts:295`.**

```ts
else if (dropped.has(task)) hit(out.commitment_follow_through, false, asOf, asOf);
```

`dropped` is a `Set`, so the `task.cancelled` `occurred_at` — which is right there in the loop at
:289 — is thrown away and `asOf` is substituted. `ageDays(asOf, asOf) === 0`, i.e. **every drop,
however old, gets the maximum recency weight.**

**Concrete failing input** (as-of `2026-09-01`):

```
task "told": accepted 2024-01-01, cancelled by the assignee 2024-01-05   (2.7 years ago)
task "tnew": accepted 2026-08-25, completed 2026-08-26                   (6 days ago)

actual   points: [ {value:0, ageDays:0}, {value:1, ageDays:6} ]   momentum = -0.0288
correct  points: [ {value:0, ageDays:970}, {value:1, ageDays:6} ] momentum = +0.0239
```

The sign flips. A member whose only recent behaviour is finishing a task on time reads as
*declining*. `docs/15` §4.3 makes recency decay a core requirement; this signal has none for its
negative observations, which are exactly the ones that should decay.

**Suggested fix.** Make `dropped` a `Map<string,string>` of task → cancellation `occurred_at` and
pass that timestamp to `hit`.

---

### M7. The registry counts repeated measurements of the same person as independent

**`web/lib/cec/signals.ts:553-564`** and **:577**.

`personOutcomes(kind)` returns one row per `(subject, kind, horizon_start)`. A person with six
monthly outcomes contributes six pairs. `signalVerdict(pairs.length, ic)` treats `pairs.length` as
the sample size against `minN = 20`.

**Concrete failing input** (`scratchpad/atk-reg.mjs`): 4 people, take rates 1.0 / 0.8 / 0.4 / 0.1,
outcomes 1 / 1 / 0 / 0, each labelled for 6 monthly horizons:

```
distinct people: 4   pairs: 24   windows: 6   ic: 0.894   ir: null   verdict: "strong"
```

Four independent observations produce a **"strong"** verdict. Each person's `x` is identical across
all six of their rows (their events are all before the first horizon), so the IC is driven entirely
by 4 between-person differences; the 24 is pure duplication. `docs/14` §0 is explicit that this is
the failure mode to avoid: *"one campus, a few hundred events … testing many weak signals against it
produces confident nonsense."*

Note `ir` is `null` here too, so the one statistic that could have flagged the instability is silent
(see m1).

**Suggested fix.** Pass `new Set(pairs.map(p => p.subject_id)).size` — the number of distinct
subjects — to `signalVerdict`, not `pairs.length`. Store both `pairs` and `subjects` in
`signal_registry_runs` so the fact sheet can show them. Longer term, cluster the IC by subject or
use one outcome per person per registry run.

---

### M8. `peerPrior` returns a maximum-strength prior from six observations

**`web/lib/cec/behavioral.ts:161-172`**, specifically the floor at **:166**.

```ts
const betweenVar = Math.max(obsVar - sampVar, 1e-6);
const k = (m * (1 - m)) / betweenVar - 1;
const conc = Math.min(Math.max(k, 0.5), maxConcentration);
```

The moment identity `α+β = m(1−m)/v − 1` is correct, and so is subtracting the binomial sampling
variance in expectation. The bug is what happens when the estimate `obsVar − sampVar` comes out
**negative**, which is the *normal* outcome for small `n` — it means "no detectable between-person
variance", i.e. the concentration is **unidentified**. Flooring at `1e-6` instead reads that as
"between-person variance is essentially zero", which drives `k` to ~10^5 and then clamps to the
maximum allowed prior strength.

**Concrete failing input:**

```js
peerPrior([ {successes:1,failures:1}, {successes:1,failures:1}, {successes:1,failures:1} ])
// -> { alpha: 10, beta: 10, source: "peer" }
```

Three people who each answered two offers and said yes once produce a prior worth **20
pseudo-observations from 6 real ones**. Compare:

| peer group | real observations | resulting prior |
|---|---|---|
| 3 people, 1/2 each | 6 | Beta(10, 10) — conc 20 |
| 5 people, 500/1000 each | 5,000 | Beta(10, 10) — conc 20 |

Identical prior strength from 6 observations and from 5,000. The estimator's own uncertainty is
never propagated, and the `maxConcentration` clamp is what hides it: it turns an absurd number
(159,999 in the `n=10` case measured) into a plausible-looking one. The docstring at :147-152
describes the clamp as a guard against homogeneous groups; in fact it is load-bearing for *every*
small group, which is every group this product currently has.

Downstream: a member with 0/4 on a signal gets `betaPosterior(0, 4, Beta(10,10))` → mean **0.417**.
Their 0% is displayed as 42% on the strength of six coin flips by three other people.

**Suggested fix.** When `obsVar − sampVar <= 0`, return the weak prior — that is the honest answer
and it is the branch the function already has at :168. Additionally, cap `conc` by the total peer
evidence (e.g. `Math.min(conc, totalPeerObservations / 4)`) so the prior can never outweigh the data
it was estimated from.

*(Everything else about `peerPrior` checks out: degenerate groups are handled — all-zero and all-100%
mean → weak; fewer than `minPeople` usable → weak; `betweenVar >= maxVar` → weak; and over 200,000
random groups `alpha` and `beta` were always strictly positive and finite, and `betaPosterior` on the
result was always finite with `lo <= hi`.)*

---

### M9. Mirror-test violation: a member can invert their own posterior to recover a peer's private rate

**`web/lib/cec/signals.ts:477-495`** with **`behavioral.ts:144-173`**; `docs/11` §7.

`PersonSignal.posterior` is returned to the member with `alpha` and `beta` exposed
(`behavioral.ts:122-131`). Since `alpha = prior.alpha + successes` and the member knows their own
successes and failures, `prior.alpha` and `prior.beta` are exactly recoverable, and
`prior.alpha/(prior.alpha+prior.beta)` is exactly `m`, the **unweighted mean of the peer rates**.
`peerPrior`'s `minPeople` is 3.

**Concrete failing input** — a four-person club, viewer `M`, peers `A`, `B`, `C`:

```
A = 8/2  (0.80)   known to M
B = 5/5  (0.50)   known to M
C = 1/9  (0.10)   PRIVATE
M's own record: 3/1

API returns to M: { alpha: 3.713167795334838, beta: 1.8150489089541002, prior_source: "peer" }
M computes:  m = (3.713168 - 3) / ((3.713168 - 3) + (1.815049 - 1)) = 0.466666666667
             C = 3m - 0.80 - 0.50 = 0.100000000000       <-- exact, to 12 decimals
```

`docs/11` §6 states the rule as *"a student should never learn something about our model of them from
someone else"*, and §7 forbids friendship-strength numbers and individual scores reaching anyone but
the subject. A signal that is not shown to anyone but is arithmetically derivable by any peer fails
that test. The same small-cell problem applies to `peerZ` (`minPeers = 4`, `signals.ts:491`): with
exactly four qualifying peers, `z` discloses their mean and sd.

**Suggested fix.** Do not return `alpha`/`beta` to the member — `mean`, `lo`, `hi`, `width`,
`shrinkage` and `n` are what the fact sheet needs, and none of them invert cleanly. Raise
`minPeople`/`minPeers` to a real small-cell threshold (10 is the usual floor for this kind of
disclosure control), and add noise or bucket `peer_z` before display.

---

## MINOR

### m1. `informationRatio` reports the best possible signal as "unknown"

**`web/lib/cec/behavioral.ts:289`**: `return sd < 1e-9 ? null : m / sd;`

A signal whose IC is *identical in every window* is the ideal case, and it is stored as `ir = null`,
indistinguishable from "not enough windows to compute". A signal that is pure noise gets a real
number.

```js
informationRatio([1, 1, 1])          // -> null   (three perfect windows)
informationRatio([0.01, -0.4, 0.5])  // -> 0.081  (three noise windows)
informationRatio([0.4, 0.4, 0.4])    // -> null
```

With walk-forward windows filtered to `w.length >= 5` (`signals.ts:574`) and a small club, ICs of
exactly ±1 in every window are entirely plausible, so this fires on real data. `tests/behavioral.mjs:124`
enshrines the behaviour, so it is deliberate — but it conflates "infinitely consistent" with
"unknown" in a field the officer fact sheet reads as a trust score.

**Suggested fix.** Return a capped value (e.g. `Math.sign(m) * 99`) when `sd` underflows and `|m| > 0`,
and keep `null` only for `m === 0`; or return `{ ir, degenerate: true }`.

### m2. `ranks()` / `pearson()` have no non-finite guard, so a single NaN produces a confident IC

**`web/lib/cec/behavioral.ts:233-262`.** `peerZ` (:183) and `informationRatio` (:283) both filter with
`Number.isFinite`; the IC path does not. `Array.prototype.sort` with a NaN comparator is unspecified,
and the result is a plausible-looking number rather than `null`:

```js
informationCoefficient([1, 2, NaN, 4], [1, 2, 3, 4])  // -> 1     (expected null)
informationCoefficient([1, 2, 3, 4], [1, null, 3, 4]) // -> 0.8   (expected null)
signalVerdict(100, informationCoefficient([1,2,NaN,4],[1,2,3,4]))  // -> "strong"
```

Reachable via the latency signals: `x = median(r.values)` (`signals.ts:562`) where values come from
`hoursBetween(b.created_at, resolved)` (`signals.ts:336`), and `work_blockers.created_at` /
`resolved_at` are free-form `TEXT` — an unparseable stamp yields `NaN` with no complaint. (The
outcome side is safe: SQLite rejects `NaN` against `value REAL NOT NULL`.) `peerZ(NaN, peers)` has the
same shape and returns `NaN` rather than `null`.

**Suggested fix.** Drop non-finite pairs (or return `null`) at the top of `informationCoefficient`,
and guard `value` in `peerZ`.

### m3. `betacf` silently returns an unconverged value

**`web/lib/cec/behavioral.ts:42, 59-61`.** The Lentz loop runs at most `MAXIT = 300` and, when the
tolerance is not reached, simply falls out of the loop and returns `h`. No flag, no `NaN`, no throw.

```
betaCdf(0.5, a, a) vs scipy.special.betainc:
  a = 1e5   ->  0.4999999996827207   abs err 3.2e-10
  a = 1e6   ->  0.4999996184837494   abs err 3.8e-07
  a = 3e6   ->  0.4998034427151739   abs err 2.0e-04
  a = 1e7   ->  0.4905840063125578   abs err 9.4e-03
  a = 3e7   ->  0.4278712640570238   abs err 7.2e-02
```

Unreachable for this product (α+β ≈ 2×10⁶ needs two million observations on one signal), so this is
minor — but it is the answer to "is there a branch where it silently returns garbage?" Yes, and it
degrades smoothly enough that nothing would notice.

**Suggested fix.** Raise `MAXIT`, and either throw or return `NaN` when the loop exits without
`|del − 1| < EPS`.

### m4. No domain guard on `a`/`b` in `lgamma` / `betaCdf` / `betaQuantile`

`lgamma(0) === Infinity`, `lgamma(-1) === NaN`, `betaCdf(0.5, -1, 1) === NaN`. `betaQuantile` then
compares `NaN < p`, which is always `false`, so `hi` is halved every iteration and the function
returns ≈0 for both the 2.5% and the 97.5% quantile — a posterior with `lo = hi = 0` and
`width = 0`, i.e. *complete certainty*, from garbage input. No current caller can produce
`a <= 0` (M8's `conc >= 0.5` and `0 < m < 1` guarantee positivity), so this is latent.

**Suggested fix.** `if (!(a > 0) || !(b > 0)) return NaN;` at the top of `betaCdf`, and let
`betaQuantile` propagate it.

### m5. A cap of 0 produces an empty `binding` and an explanation that blames the wrong thing

**`web/lib/cec/scheduler.ts:55`** with **`flow.ts:29`**: `net.edge(n, sink, 0, "cap:p")` returns early
because `cap <= 0`, so the panelist node has no edge to the sink at all and no labelled edge crosses
the cut.

```js
computeFeasibility({ panelSize:1, candidates:["a"], panelists:[{id:"p",cap:0}],
                     candidateSlots:{a:["s"]}, panelistSlots:{p:["s"]} })
// binding: []
// explanation: "Both caps and availability are binding. Adding one interviewer with broad
//               availability helps more than raising an existing cap."
```

Raising `p`'s cap from 0 to 1 is precisely what fixes it, and the message says the opposite. In
30,000 random instances, 7,489 infeasible ones returned an empty `binding` (most are the legitimate
no-overlap case, which the explanation handles correctly; the cap-0 case is the one that misleads).

**Suggested fix.** Emit the sink edge with capacity 0 (drop the `cap <= 0` early return in `edge()`,
or special-case it) so a zero cap appears in the cut; or add an explicit zero-cap branch to the
explanation.

### m6. `feedback_response`'s `||` expression contains a provably dead clause

**`web/lib/cec/signals.ts:346-353`.** `&&` binds tighter than `||`, so the expression is
`(A∧B∧C∧D∧E) ∨ (A∧B∧C∧D∧F)` = `A∧B∧C∧D∧(E∨F)` where

```
E = ageDays(e.occurred_at, r.occurred_at) === 0     // i.e. max(0, Δ/DAY) === 0, i.e. Δ <= 0
F = Date.parse(r.occurred_at) - Date.parse(e.occurred_at) <= 14 * DAY
```

`E ⟹ F` for every input (`Δ <= 0 ⟹ Δ <= 14·DAY`), so `E∨F ≡ F` and the first disjunct is
**entirely redundant**. The behaviour matches the declared definition — verified:

```
review 2026-01-01 + revision 10 days later  -> success
review 2026-02-01 + revision 40 days later  -> failure
review 2026-03-01 + no revision             -> failure
review 2026-04-01 + revision exactly 14 days -> success
computeRaw(...).feedback_response = { successes: 2, failures: 2 }   // correct
```

So this is **not** a live bug — but the clause reads as though a same-day rule was intended, the
duplicated five-term conjunction is a refactoring hazard, and `ageDays`'s `Math.max(0, …)` clamp is
exactly the kind of thing that makes such a clause fire unexpectedly if the surrounding comparison
ever changes. Delete the first disjunct and extract the predicate.

### m7. `feedback_response` and `handoff_completion` match on `object_id` without `object_type`

**`web/lib/cec/signals.ts:346-352` and `:386-388`.** A `REVIEW` on an `event` and a `REVISE` on a
`task` that share an `object_id` are paired:

```
REVIEW  object_type='event' object_id='SHARED'  2026-05-01
REVISE  object_type='task'  object_id='SHARED'  2026-05-02
-> feedback_response gains a spurious success (verified: 2/2 became 3/2)
```

Object ids are `randomUUID()` in practice, so collisions are effectively impossible today — but the
predicate is wrong and costs one `&&` to fix.

### m8. `initiation_rate`'s denominator counts anything you were the subject of

**`web/lib/cec/signals.ts:373-380`** with `mine` at **:275** (`subject_id === userId || actor_id === userId`).
An episode where an officer merely assigned you a task counts as an "episode you participated in"
and therefore as a failed initiation. `docs/15` §4.2 specifies
`InitiationRate = self-initiated / episodes with initiation opportunity`, which is not the same set.
Also, a blank `episode_id` becomes a pseudo-episode and adds a spurious failure
(`{successes:0, failures:2}` in the repro when two non-episode events were added); the
`episode_id REFERENCES episodes(id)` FK makes this unreachable in production today.

### m9. `betaQuantile`'s 1e-12 break makes tiny quantiles relatively meaningless

**`web/lib/cec/behavioral.ts:86`.** Absolute error is under 1e-6 across all 432 parameter
combinations tested, but for degenerate priors the true quantile is denormal and the returned value
is the bisection floor:

```
betaQuantile(0.025, 0.001, 1)  ->  4.547e-13     scipy: 0
```

Harmless for display (both round to 0%), but do not use the return value in a log or a ratio.

### m10. Duplicate candidate ids silently corrupt the feasibility graph

**`web/lib/cec/scheduler.ts:44-49`.** `candNode` is a `Map` keyed by id, so a repeated candidate
overwrites the entry and orphans a node:

```js
computeFeasibility({ panelSize:1, candidates:["a","a"], panelists:[{id:"p",cap:5}],
                     candidateSlots:{a:["s"]}, panelistSlots:{p:["s"]} })
// demand 2, schedulable 1, short 1, stranded []   <-- short > 0 with nothing stranded
```

`interview_candidates` has `PRIMARY KEY(round_id,candidate_id)` so this cannot happen from the
database. Worth a cheap `new Set(...)` guard at the top of the function anyway.
(Similarly, `Math.max(1, input.panelSize)` does not round, so a non-integer `panel_size` would put
fractional capacities into Dinic; the column is `INTEGER NOT NULL`, so also unreachable.)

---

## Verified correct

These were attacked and held up. Listing them so the next reviewer does not re-litigate them.

**Numerics (`behavioral.ts`)**

- `lgamma` — matches `scipy.special.gammaln` to ≤2.3e-15 relative across x ∈ {1e-8 … 1e8}, including
  the reflection branch below 0.5. The Lanczos coefficient loop (`i < g + 2`, 9 coefficients) is right.
- `betaCdf` — **1,872 combinations** (a, b ∈ {1e-3 … 1e5}, x ∈ {1e-12 … 1−1e-8}) compared against
  `scipy.special.betainc`: **zero cases with absolute error above 1e-8**, zero non-finite results,
  zero results outside [0, 1]. The NR continued-fraction setup, the `x < (a+1)/(a+b+2)` branch
  switch, and the symmetry `I_x(a,b) = 1 − I_{1−x}(b,a)` are all correct. (See m3 for the
  a+b ≳ 2×10⁶ convergence limit.)
- `betaQuantile` — 432 combinations against `scipy.special.betaincinv`: **zero cases above 1e-6
  absolute error**. Monotone bisection, so no convergence branch to get wrong. (See m9 for relative
  error on denormal quantiles.)
- `ranks()` handles ties correctly with **average ranks** (`(i+j)/2 + 1`, 1-based). `informationCoefficient`
  matches `scipy.stats.spearmanr` to ≤1.1e-16 on seven datasets including heavy ties, `n = 3`,
  reversed order, and mid-rank blocks.
- `pearson` guards zero variance correctly: constant signal → `null`, constant outcome → `null`
  (scipy returns `nan` with a `ConstantInputWarning`; `null` is the better answer). `n < 3` → `null`.
- `peerPrior` never returns `alpha <= 0` or `beta <= 0` or a non-finite value — **200,000 random
  groups**, and `betaPosterior` on every result was finite with `lo <= hi`. The degenerate branches
  are all correct: all-zero successes → weak, all-100% → weak, one person → weak, group with fewer
  than `minPeople` non-empty records → weak, `betweenVar >= maxVar` → weak. The moment identity
  `α+β = m(1−m)/v − 1` is the right one. (The unidentified-variance branch is M8.)
- `recencyWeight` / `ewma` / `momentum` are correct as written; the `Math.max(0, deltaDays)` clamp is
  what makes C1 and M6 dangerous, but the functions themselves do what they say.

**Flow and min-cut (`flow.ts`, `scheduler.ts`)**

- **The min-cut extraction is correct.** Across 30,000 random instances, `sum(binding[].cap)` equalled
  the max-flow value in **every single case** — the max-flow/min-cut theorem holds exactly, so
  `cut()` is neither over- nor under-reporting the cut, and unlabelled candidate→seat edges never
  cross it in practice. The concern that `cut()` drops unlabelled crossing edges does not materialise.
- **Cut edges do name the right constraint.** Hand-checked on: caps-only binding, availability-only
  binding, and a genuine both-bind instance (p1 cap 1 across two slots + p2 cap 5 at one slot, three
  candidates → `binding = [cap:p1, slot:p2:s0]`, explanation "Both caps and availability are
  binding"), plus a case where a nominally large cap is masked by slot scarcity (6 candidates,
  p1 cap 5 over 3 slots → correctly blames availability, since raising the cap genuinely would not help).
- **`schedulable` is a valid upper bound for all k.** `floor(seats/k) >= m*` always, since any
  assignment of m* candidates induces a feasible flow of m*·k. (It is not *tight* for k>1 — see M5.)
- **`computeAssignment` respects every hard constraint.** 6,000 random instances with conflicts,
  zero caps, and `panelSize` 1–3: **zero** double-bookings of an interviewer in a slot, **zero** cap
  violations, **zero** conflicted pairs assigned, **zero** panelists assigned outside their declared
  availability, and **zero** partially-filled panels (a placed candidate always gets exactly `k`).
  The output is always a legal schedule; it is just not always a maximal one (M4).
- Dinic itself (`bfs`/`dfs`/`maxflow`/`reachable`) is a correct textbook implementation: reverse-edge
  indices, per-phase `iter` reset, level-graph admissibility check, and the self-loop/zero-cap
  rejection in `edge()` are all right.

**Point-in-time correctness (`signals.ts`)**

- `loadEvents` (`:242`) filters `observed_at<=?` and `activity_events` is append-only (enforced by the
  `activity_no_update` / `activity_no_delete` triggers), so everything derived from `evs` — 
  `commitment_follow_through`, `deadline_adherence`, `feedback_response`, `help_response`,
  `initiation_rate`, `handoff_completion`, the `taskDue` map and the `disputed` set — is genuinely
  as-of-safe.
- **The `work_blockers` guard is correct.** `signals.ts:326` re-checks `b.resolved_at <= asOf`
  independently of the `created_at<=?` filter, so a blocker resolved after `asOf` is treated as
  unresolved. Verified: a blocker created 2026-01-01 and resolved 2026-06-01 produces an empty
  `resolution_latency_hours` at `asOf = 2026-02-01` and a populated one at `asOf = 2026-12-01`.
  This is the pattern C1 and C2 should have followed.
- The disputed-task exclusion (`:271-274`, `:285`) matches the existing evidence policy at
  `evidence.ts:584` (`event_type === 'evidence.correction' && object_type === 'task'`) and correctly
  removes the task from both `commitment_follow_through` and `deadline_adherence`.
- `offer()` **is** idempotent on the pending path — repeated `offer()` with no `response` returns the
  same row id and the partial unique index backs it up. Only the accepted-in-the-same-breath path
  is broken (M1).
- `expireStale` correctly distinguishes silence from decline and gives it its own state, as `docs/15`
  requires. (It shares C1's `observed_at` problem, but the state machine is right.)

**Mirror test (`docs/11`)**

- The API surface is correctly gated: `behaviorState` calls `member(u)` and computes signals for
  `u.id` only; `runRegistry` and `registryLatest` call `officer(u)` and return aggregate rows
  (`signal`, `ic`, `ir`, `pairs`, `windows`, `verdict`) with **no per-person number and no subject
  ids**. Nothing in `signals.ts` exports an individual score to an officer or an administrator, and
  nothing computes anything on the do-not-compute list. The one failure is the arithmetic inversion
  in M9, which is a disclosure-control problem rather than an access-control one.

---

## Reproduction

Scripts under the session scratchpad, all run with:

```
cd "/Users/ajaysharma/club crm/web" && node --experimental-strip-types --import ./tests/ts-resolve-register.mjs <script>
```

| script | covers |
|---|---|
| `atk-sched.mjs` | C3, M5, greedy invariants |
| `atk-greedy.mjs`, `atk2.mjs` | M4 (worst-case ratio, replicated gadget), m5, m10 |
| `atk-cut.mjs` | min-cut theorem check, `stranded` mismatch rate, `betacf` stress (m3) |
| `atk-beh.mjs` + scipy | `lgamma` / `betaCdf` / `betaQuantile` / Spearman verification |
| `atk-peer.mjs` | M8, m1, m2 |
| `atk-leak.mjs` | C1, C2, M1, M2, M3 |
| `atk-sig2.mjs` | M6, m6, m7, m8, dispute exclusion |
| `atk-reg.mjs` | M7, m2 |
| `atk-mirror.mjs` | M9 |

The existing suites (`tests/scheduler.mjs` 40 assertions, `tests/behavioral.mjs` 50 assertions) both
pass against the current code. None of them covers: a stranded candidate that *competes* for
capacity (C3), a mutated row read at a historical `asOf` (C1, C2), a tie in the greedy's
most-constrained pick (M4), a peer group whose between-person variance is unidentified (M8), or
repeated outcomes for one subject (M7).
