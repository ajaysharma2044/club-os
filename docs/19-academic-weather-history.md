# 19 — The academic layer, weather, and the historical timeline

*Companion to [18 — Campus Context Engine](18-campus-context-engine.md). Eighteen
established the fourth layer and its regimes. This one fills it in: every class
on campus and how hard it is, the weather, and the point-in-time machinery that
lets a 2019 event be scored against 2019.*

---

## The sentence this is all for

> "Forty people came. The programming chair underperformed."

Six months later, that is all the spreadsheet holds. What it does not hold:

> Forty people came, on a Tuesday two days before the first prelim block, at
> 11am when a third of the relevant majors were in lecture, in freezing rain
> 18°F below normal for the date, against fifty other things on the campus
> calendar. The context-conditional expectation was thirty-one.

The programming chair did fine. Everything in this document exists to be able
to say the second sentence instead of the first.

```
Outcome = f(Person, Team, Club, CampusContext, AcademicLoad, Weather)

BehaviouralAlpha = Actual − Expected(given all of it)
```

---

## 1. What is computed, and what kind of thing each one is

The single most important distinction in this layer, and the one most likely to
be lost in a hand-off:

| | What it is | Where it comes from | Failure if confused |
|---|---|---|---|
| **Meeting patterns** | **Fact** | Published roster | none — it is what it is |
| **Structural difficulty** | **Stated prior** | Catalogue structure | presented as a measurement, students argue with a number nobody fitted |
| **Empirical difficulty** | **Estimate, shrunk** | Observed behaviour + prior | reported before it is identified, and one unreliable person becomes "a hard course" |
| **Assessment pressure** | **Stated model** | Academic calendar | double-counted against the regime multiplier |
| **Climate normals** | **Estimate** | 12 years of observations | computed from four days and called "normal" |
| **Weather factor** | **Stated prior, bounded** | Forecast | allowed to explain away bad execution |

Every function in `lib/cec/academic.ts` and `lib/cec/weather.ts` declares which
it is in its return value — `source: "structural_prior"` vs `"shrunk_estimate"`,
`basis`, `confidence`. That is not decoration. A reader who forgets which kind
of thing they are holding will over-read it, and the model has no way to stop
them except by saying so every single time.

---

## 2. When is the campus in class

`meetingHeatmap()` builds a 7×24 grid of credit-weighted scheduled instruction
from published meeting patterns. Each meeting contributes to every hour it
overlaps, proportional to how much of the hour it occupies, times credits.

**Why credits and not students.** Per-section enrolment is not published
anywhere. Credits are a stated proxy for student-hours — a 4-credit lecture is
a larger claim on time than a 1-credit lab — and the grid carries a `basis`
string saying exactly that, because the number *looks* like a share of students
and is not one.

Run against the real FA26 roster (199 courses, CS/MATH/ECON):

```
       8am  9am  10am 11am 12pm 1pm  2pm  3pm  4pm  5pm  6pm  7pm  8pm
Mon    .37  .86  .95  .61  .59  .66  .65  .69  .23  .09  .09  .15  .22
Tue    .13  .45  .86  .69  .74  .70  .81  .76  .13  .00  .04  .04  .03
Wed    .42  .86  .90  .57  .48  .62  .59  .56  .19  .03  .04  .18  .25
Thu    .17  .50  1.0  .73  .69  .68  .81  .77  .12  .00  .00  .00  .00
Fri    .39  .92  .80  .36  .37  .59  .48  .43  .16  .00  .00  .00  .00
```

The shape is recognisably Cornell: teaching peaks late morning, tails off hard
after 4pm, and Thursday 10am is the single busiest hour of the week.

**What the real data corrected.** The first version of the test asserted that
7pm was "nearly free of teaching." It is not — evening seminars put it at about
a quarter of peak. The assertion was wrong, not the model. This is the value of
testing against a captured live payload rather than a hand-written fixture that
agrees with whatever you already believed.

`meetingHeatmap(courses, { subjects: [...] })` restricts to the departments a
club actually draws from. A business club's members are not in organic
chemistry labs, and averaging over the whole catalogue washes out the signal.

---

## 3. How hard is a course

### 3a. The structural prior — usable on day one

The empirical estimate below needs many distinct people across many distinct
courses. One club will not have that for years. So difficulty starts from facts
the registrar already publishes:

| Term | Weight | Reasoning |
|---|---|---|
| course level | `(level − 2) × 0.25` | strongest published signal, centred on the modal 2000-level |
| prereq depth | `min(n, 5) × 0.12` | how many courses stand behind this one; capped because "or equivalent" prose inflates the count |
| credits | `(credits − 3) × 0.15` | above the 3-credit default |
| extra components | `0.15` each | a required LAB or DIS is contact hours and graded work |
| S/U only | `−0.4` | materially less grade pressure |
| graduate level | `+0.4` | a step up for an undergraduate |

**These are stated, not fitted.** There is nowhere near enough data to estimate
six coefficients, and pretending otherwise is exactly the overfitting docs/04
warns about. They are returned as **named components that sum to the total**, so
a student who disagrees can point at the term they disagree with rather than
arguing with one opaque number. The test asserts the components sum exactly —
no hidden term.

Validated against the real catalogue: mean structural difficulty rises
monotonically 1000 → 2000 → 4000 → 6000 level.

### 3b. The empirical estimate — the person/situation separation, again

This is the same cross-classified structure as [11](11-cross-club-graph.md) and
[17](17-two-layer-intelligence.md), applied to the academic half of a student's
life:

```
logit(showed) = θ_person − δ_course
```

A course effect is identifiable **only** because the same people take different
courses and the same courses contain different people. With one person per
course you cannot tell a hard course from an unreliable student — which is
precisely the confound this exists to remove. So:

- fewer than `minPeople` (default 3) distinct people → `identified: false`,
  `rawDelta: null`, and the value falls back **entirely** to the structural
  prior, with a reading that says why.
- otherwise the raw estimate is shrunk toward the prior by `n/(n+k)`, k = 20
  pseudo-observations. Four observations barely move off the catalogue; two
  hundred are essentially the data.

The test constructs three people of differing reliability across three courses
of differing difficulty and asserts the model recovers the *course* ordering
rather than blaming the least reliable person.

### 3c. Workload

`academicLoad()` separates two things that must not be blended:

- **contact hours** — a **fact**, read straight off meeting patterns. Parallel
  sections of the same component count once (twenty discussion sections are one
  choice for the student, not twenty classes).
- **independent hours** — a **model**: two hours per credit, scaled by
  difficulty, **bounded to [0.6, 1.8]** so one extreme delta cannot triple
  someone's estimated week.

Both are reported, and `basis` says the second is an estimate of *demand on
time*, not a measurement of effort.

---

## 4. Assessment pressure, and the double-count that nearly happened

`academicPressure()` sums Gaussian kernels over the academic calendar. Pressure
does not switch on when a prelim period opens — it builds for about a week
beforehand and releases fast afterwards, so the kernels are **asymmetric**
(rise σ=7d, fall σ=3d for prelims; 12d/3d for finals). Kernels combine as
`1 − Π(1−x)` so overlapping windows saturate toward 1 rather than summing past
it. A break caps pressure at 0.15 whatever is coming.

### The error worth writing down

`REGIME_TURNOUT.prelims = 0.75` was set **because prelim weeks have high
assessment pressure**. Multiplying that by an absolute pressure factor charges
the same effect twice and forecasts roughly half of what a prelim week really
produces — a bug that is invisible until the forecast is systematically wrong in
one regime.

The fix is `REGIME_BASELINE_PRESSURE`: the pressure each regime's multiplier
**already prices in**. The academic factor uses the **excess over that
baseline**:

```
excess         = pressure − REGIME_BASELINE_PRESSURE[regime]
pressureFactor = 1 − 0.6 × (excess > 0 ? excess : excess × 0.5)
```

So:

- an **ordinary prelim week** → factor exactly **1.0**. The regime already
  handled it. *(asserted to 1e-9 in the tests)*
- a **normal-term week under an unusual prelim cluster** → below 1. This is new
  information the regime alone cannot express, and it is the entire reason the
  layer earns its place.
- a **quieter-than-usual finals week** → above 1, but relief is weighted **half**
  and capped at 1.25, because good conditions do not fill a room the way bad
  ones empty it.

Class conflict is genuinely orthogonal — it is about that *hour*, not that
*week* — so it multiplies cleanly.

---

## 5. Weather

### The sources, and a licence that is a design constraint

| | Source | Cost | Key | Commercial |
|---|---|---|---|---|
| Forecast | **NWS** `api.weather.gov` | free | none | yes — US government, public domain |
| History | **NCEI** `ncei.noaa.gov/access/services/data/v1` | free | none | yes |
| ~~Rejected~~ | ~~Open-Meteo~~ | free | none | **no — non-commercial tier only** |

Open-Meteo is the obvious choice and is the wrong one. Its free tier is
non-commercial, and a free product for clubs that ever takes a dollar would be
in breach. The licence is a constraint on the design, not a footnote.

Both verified live. NCEI station `USC00304174` — "ITHACA CORNELL UNIV, NY US" —
returns daily summaries back decades with no key and **no token**.

### The effect is small, and the bound is the point

The whole factor is clamped to **[0.8, 1.03]**.

An indoor event on a residential campus is simply not a twice-as-hard sell in
bad weather — people already live within a fifteen-minute walk and own coats. A
model free to claim more would happily explain away every badly-run event as a
rainy night, which is the exact opposite of what an attribution layer is for.
The test asserts that even absurd weather (−40°F apparent, certain snow) moves
expectation about as much as twenty competing events, not more.

Two terms, both about **the walk**:

- **comfort** — distance of *apparent* temperature (wind chill below 50°F, heat
  index above 80°F, both NWS formulae) outside a [50, 78]°F band, quadratic.
  35°F still and 35°F in a 20mph wind are not the same walk.
- **precipitation** — probability × penalty, snow weighted harder than rain
  because Ithaca has hills.

### Absolute conditions and anomaly are deliberately kept apart

What stops someone walking across campus is that it is **cold and raining** —
not that it is colder than the thirty-year mean. People own coats and are not
consulting climate normals. Charging both the absolute discomfort *and* the
anomaly would bill the same cold twice: the same error as §4, in a different
costume.

So `weatherAnomaly()` **does not feed the multiplier**. It exists for
**attribution** — to be able to tell an officer, six months later, that the
night their event drew forty was 18°F below normal with freezing rain. That is
the sentence the spreadsheet could never hold.

`climatology()` pools a ±7-day window across every year in the record and
**refuses to speak** below 15 observations — `normalHighF: null`, `sdHighF:
null`, and a reading saying why. A "normal" computed from four days is not a
normal, and it would make every anomaly downstream meaningless. Same rule as the
club-health index with no peer group.

The day-of-year window is **circular**, or every late-December normal silently
loses half its sample.

From 12 years of real Ithaca observations the seasonal ordering comes out
right — September > October > November > February, with a February normal high
below 40°F.

---

## 6. The historical timeline

Two records go back far enough to reconstruct the past:

- **Cornell rosters** — back to **FA14**. Every course, meeting pattern, credit
  and prerequisite as it actually was.
- **NCEI daily summaries** — decades.

`rosterAt(when, published)` returns the roster **in effect at that moment**,
never a future one. Scoring a 2019 event against the 2026 catalogue is the same
class of error as filtering a backtest on knowledge the model did not have at
the time: it looks fine, and it is fiction. `rosterAt("2013-…")` returns `null`
rather than the earliest available roster — before the record starts, the honest
answer is "we don't know."

This is [09 — the record](09-the-record.md)'s point-in-time discipline
(`occurred_at` vs `observed_at`) extended to the environment itself.

---

## 7. How it reaches the algorithms

```
campusState({ at, calendar, events, heatmap?, weather? })
  → { regime, termProgress, eventDensity,
      academicPressure | null, classIntensity | null,
      academic: AcademicFactor | null,
      weather:  WeatherFactor  | null }

behaviouralAlpha({ actual, baseline, state, competing })
  → expected = baseline
             × REGIME_TURNOUT[regime]     // coarse: what time of term it is
             × exp(−0.015 × competing)    // what else is on
             × academic.factor            // EXCESS load + who is in class
             × weather.factor             // bounded, about the walk
```

**Null, not a default.** Every academic and weather field reports `null` when
its input is missing. A campus whose roster we have not ingested gets an honest
gap, not a fabricated neutral — and the test asserts that such a state produces
*no weather term at all* in the explanation, not a neutral one that still shows
up.

**Every multiplier is named.** `Alpha.factors` itemises each one with its label
and value, and the tests assert they multiply out to the stated expectation
within rounding. An officer being told their event underperformed is entitled to
see exactly which conditions the model charged them for. Nothing hidden.

---

## 8. What this does not do, on purpose

- **No per-person academic surveillance.** Nothing here reads a transcript, a
  grade, or a GPA. Course *enrolment* is something a member may volunteer to get
  better scheduling; it is never inferred, scraped, or required.
- **No number beside a name.** Course difficulty is a property of a **course**.
  It never becomes a property of a person, and the do-not-compute list in
  [11](11-cross-club-graph.md) still binds.
- **The mirror test still applies.** Every reading in this layer is written to
  be shown to the person it concerns. "You were carrying about 52 hours a week
  that term" is a sentence a student can read, check, and disagree with.
- **No weather excuse-making.** The bound exists so the model cannot launder bad
  execution into bad conditions.

---

## 9. Test coverage

| Suite | Assertions | Fixture |
|---|---|---|
| `tests/academic.mjs` | 183 | `cornell-roster.json` — 199 real FA26 courses |
| `tests/weather.mjs` | 98 | `nws-hourly.json` (156 real periods) + `ncei-ithaca.json` (12 years) |

Both run against **captured live payloads**, not hand-written fixtures. The
difference is not cosmetic: the real roster is what corrected the 7pm
assumption in §2.
