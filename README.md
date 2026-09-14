# Club OS

**A free operating system for college clubs — the roster, the money, and the memory, in one place, owned by the club.**

Every year a club's institutional knowledge graduates. The bank login lives in a
senior's notes app, the Instagram password is in a group chat from two years ago,
the domain is registered to someone who left, and the only person who knew how the
conference actually ran is gone. Meanwhile the work students genuinely did — running
a 240-person event, closing a sponsor, shipping a product — evaporates into a résumé
line nobody can verify.

Club OS is the attempt to fix both ends of that at once.

---

## The thesis

Most club software is a directory or a form builder. It stores *records*. It does not
understand *what happened*, *what people were dealing with at the time*, or *what
anyone actually did*.

Club OS models four things together:

```
Outcome = f( Person, Team, Club, CampusContext )
```

The fourth term is the one nobody has. A club's turnout is not decided only by the
club: it is decided by what else is on the campus calendar that night, whether a
third of the relevant majors are in a lecture at that hour, how close the prelim
block is, and whether it is 38°F and raining.

Without that term, the model blames officers for the weather:

> "Forty people came. The programming chair underperformed."

With it:

> "Forty people came, on a Tuesday two days before the first prelim block, at 11am
> when a third of the relevant majors were in lecture, in freezing rain 18°F below
> normal, against fifty other things on the campus calendar. The context-conditional
> expectation was thirty-one."

The programming chair did fine. Everything in this repository exists to be able to
say the second sentence instead of the first.

---

## What actually works today

This section is deliberately separated from the next one. **The product's own rule is
that it never fabricates connected status**, and that rule applies to its README.

The Cornell Entrepreneurship Club pilot runs at `/clubs/cec` on a single Node + SQLite
server, and these workflows are real, authenticated, and tested end to end:

| | |
|---|---|
| **Membership** | one-step invite-code join, applications, private review, acceptance |
| **Events** | drafts, publication, capacity-aware RSVP and waitlist, ICS feeds |
| **Attendance** | rotating HMAC check-in codes, sign-in windows, integrity checks |
| **Work** | tasks with owner/due/origin, accept → submit → approve, blockers |
| **Recruitment** | interview rounds scheduled by max-flow, with the binding constraint named |
| **Coffee chats** | slots, transactional booking, overlap detection |
| **Money** | a transaction register and budget state |
| **Continuity** | an asset register — who holds the domain, the bank login, the Instagram |
| **The record** | append-only evidence with provenance, corrections and point-in-time replay |
| **Messaging** | DMs, group threads, mentions, unread — walled off from all analytics |
| **Home** | "Up next" — what needs *you*, in time order, with actions inline |

### What is NOT connected

Google, Slack, Discord, Canvas, Cornell SSO, email delivery, Stripe and GroupMe all
have a complete framework — declared scopes, OAuth + PKCE, encrypted token storage,
an honest status surface — and **none of them are connected**, because connecting them
requires accounts, API keys and consent screens that only a human can create. The
interface says "not configured" and never pretends otherwise.

See [§ What this needs from a human](#what-this-needs-from-a-human).

---

## The intelligence layer

Built on top of the operational record, and the reason this is not a CRM.

**The Factor Registry** ([`web/lib/cec/factors.ts`](web/lib/cec/factors.ts)) — nothing
becomes a number this system will act on unless it declares a compute function, a
falsifiable hypothesis, the sources it depends on, a point-in-time contract, a privacy
class, a permitted-use list, a minimum sample size, and a plain-language explanation
aimed at the person it is about.

**Campus context** — the academic calendar and regimes, a credit-weighted teaching
heatmap built from the published course roster, assessment-pressure kernels, campus
event ingestion with permission gating, and weather. All point-in-time correct: Cornell
rosters go back to FA14, so a 2019 decision can be replayed against 2019's timetable
and 2019's weather.

**Planning** — capacity, staffing fit, and slot recommendation with intervals and named
drivers. Answers "when should we hold this?" with reasons, not an oracle.

**Skill evidence** — skills derived from real episodes, artifacts and outcomes, where
repeated evidence across teams and terms raises confidence and a single instance never
becomes a claim of proficiency.

**Sponsors and economics** — activation inventory, hard eligibility filters, multi-objective
ranking, fatigue caps, and a demand engine that models a 300-person conference's implied
need for catering and AV as an *inference*, never a booking.

---

## What this system refuses to do

Every row below is enforced in code and covered by a test. This list is the most
important thing in the repository.

| Layer | Refuses to |
|---|---|
| `factors.ts` | register a factor with no compute function, no falsifiable hypothesis, or no point-in-time statement |
| `factors.ts` | register **any** person-scoped factor exportable to an employer or a sponsor |
| `factor-store.ts` | hand a factor to a caller for a use it was never cleared for |
| `club-context.ts` | assume a normal week when no term is configured |
| `club-context.ts` | treat a missing roster as a clear hour, or a missing forecast as fair weather |
| `academic.ts` | report a course difficulty seen by fewer than three distinct people |
| `weather.ts` | move expected turnout by more than about 15% |
| `clubhealth.ts` | produce an index without eight comparable clubs |
| `exposure.ts` | infer a career interest from behaviour |
| `skills/profiles.ts` | emit any number about a person to an external audience |
| `messaging/` | let a private message reach the evidence, signal, factor or quant layers |
| `evidence.ts` | accept evidence observed before it happened |
| `db.ts` | open the record on ephemeral serverless storage |

Three of these deserve explanation.

**Evidence, never a score.** Employers and investors receive episodes, artifacts,
outcomes and context — *"led a 100-person event after a venue change three days before
launch and delivered on budget"*. They never receive a number about a student. This is
structural: `defineFactor` throws if a person-scoped factor declares `employer_evidence`.

**The mirror test.** If a signal cannot be shown to the person it is about, in plain
language, with a working off switch, it is not computed. No number about a person
renders in an officer's view unless the identical number renders in that person's own
view.

**The messaging wall.** Direct messages are the most tempting behavioural signal
imaginable, and they are walled off completely — not by policy but by a test that reads
the messaging source files and fails if they contain a call to `emit`, `recordEvidence`,
`writeFactorValue` or `audit`. The audit trail is excluded too: "who messaged whom,
when" is a complete social graph with an integrity story stapled to it.

---

## Repository layout

```
docs/          26 documents (23 numbered + 3 notes) — index at docs/00-README.md
research/      28 raw research reports behind them
web/           Next.js app, the CEC API, and lib/cec (56 modules, ~29k lines)
  lib/cec/       the record, quant, context, planning, skills, campaigns,
                 economics, messaging, integrations
  tests/         29 suites, run with node --experimental-strip-types
services/quant/  Python quant service with a closed emit schema
```

Key documents, in reading order:

- [`docs/09-the-record.md`](docs/09-the-record.md) — the spine. Six chains, provenance, ownership.
- [`docs/11-cross-club-graph.md`](docs/11-cross-club-graph.md) — person vs situation, and the binding do-not-compute list.
- [`docs/12-cec-field-evidence.md`](docs/12-cec-field-evidence.md) — real operator evidence from CEC's own chats.
- [`docs/18-campus-context-engine.md`](docs/18-campus-context-engine.md) — the fourth layer.
- [`docs/21-context-intelligence-system.md`](docs/21-context-intelligence-system.md) — how it all connects.
- [`docs/22-interface-research.md`](docs/22-interface-research.md) — why Canvas feels flat, mechanically, and what to build instead.

---

## Running it

```bash
npm --prefix web install
npm --prefix web run dev
```

Requires Node 22+ (for `node:sqlite`) and Python 3 for the quant service.

```bash
npm --prefix web test          # 29 suites: pure math, API, routes, signals
npm --prefix web run build     # production build
```

### Deployment

**It must run on a host with a persistent volume.** The entire backend is one SQLite
file. On Netlify, Vercel or Lambda every invocation gets a fresh filesystem, so the
database is created empty on each cold start and every signup silently vanishes.

`db.ts` now refuses to open on those hosts rather than losing data quietly. The
[`Dockerfile`](Dockerfile) at the repository root is the supported path: Node + Python
with `CEC_DATABASE` on a mounted `/data`.

---

## What this needs from a human

Nothing below can be done from code. Roughly in order of leverage:

1. **A domain the club controls.** Email delivery (any provider) is blocked on
   publishing DKIM/SPF/DMARC records, and Google's sensitive-scope verification needs a
   verified domain. This single item unblocks the most.
2. **Canvas and Cornell SSO** — both go through Cornell IT and take weeks, so they are
   worth starting first. SSO needs an institutional sponsor and a real privacy policy.
3. **Stripe** — needs a legal entity inside the university's student-org financial
   structure. Opening it in a student's name makes them personally liable.
4. **Google, Slack, Discord, GroupMe** — accounts, apps and consent screens.

`web/lib/cec/integrations/registry.ts` declares the exact scopes, environment variables
and setup steps for each, with a justification for every scope requested.

---

## Status, honestly

The operational product works. The intelligence layer is built, wired and tested — and
**no factor has been validated yet.** Every one is `status: "experimental"`.

The evaluation machinery is real: information coefficient, information ratio,
walk-forward validation, distinct-subject counting, point-in-time correctness. What
does not exist yet is the thing to evaluate against, because CEC has not run a term
through the system.

Until it has, this is a well-organised set of hypotheses with the apparatus to find out
whether they are true — and the registry says so on every one of them rather than
presenting a prior as a measurement.

That is the intended state. A system that already knew the answers would be lying.
