# Club OS — Agentic coding loop

## Recommended initial setup

One agent owns one bounded task: define → implement → verify → review → repair → deliver.
The user supplies priorities and product decisions; the agent carries implementation and
routine fixes through to a tested, reviewable result. Start each Codex coding task in the
club-os repository so its AGENTS.md is discovered.

AGENTS.md provides repository context, commands and review rules. Codex supports loading
these instructions by directory; see the [official documentation](https://developers.openai.com/codex/guides/agents-md/).
The workflow below is our project convention, not an automatically running agent service.

## Each iteration

1. Select one MVP acceptance gap from doc 24. Write a small task using docs/tasks/TEMPLATE.md
   for substantial changes; a brief in-chat contract is enough for a small fix.
2. Inspect the implementation and baseline. Preserve unrelated work. Use a separate branch
   for a reviewable change when committing; use separate worktrees for concurrent authors.
3. Implement a complete user-visible slice and focused regression coverage.
4. Run targeted checks while iterating. Run the full gate for runtime/dependency/CI changes.
5. Inspect the diff against the original acceptance criteria and AGENTS.md review rules.
   A separate read-only reviewer is a useful later option when delegation is requested;
   self-review remains explicitly labeled until then.
6. Fix concrete findings and rerun the affected checks. Stop repeating an identical failing
   command without new evidence; diagnose or record the missing external dependency.
7. Report the behavior, test evidence and remaining limitations. The script passing is
   necessary evidence, not proof that every product requirement has been satisfied.

The user decides when to publish or merge unless already authorized. No unattended loop,
remote auto-merge, external messaging or paid API integration is installed by this setup.

## Commands

From repository root, after `npm --prefix web ci`:

```sh
npm --prefix web run check:fast
npm --prefix web run check
```

Fast: TypeScript, all existing pure-domain suites, Python unit tests.
Full: fast checks plus API/page tests, signal integration tests and production build.
Both fail at the first failed step and save logs plus result.json under work/verification/.
If a process is interrupted, a report still marked running is incomplete, not a pass.

Use Node 22 (minimum 22.13) and Python 3.12 to match CI. Newer local runtimes may produce
different warnings or results; the report records Node's version. The runner does not
install dependencies, call an LLM, commit changes or access production data.

Full checks must not run alongside this checkout's development preview: Next build shares
web/.next. Stop that preview first, then restart afterward. API tests use ports 3100 and
3111 and temporary synthetic databases. Run one gate at a time per checkout. Next may
regenerate next-env.d.ts; inspect generated diffs before staging.

CI uses the same full command. Tests alone do not configure GitHub required checks or
enable hosted Codex review. Those remote settings remain a separate setup step.

## Definition of done

- Acceptance criteria are demonstrated, including relevant negative/failure cases.
- Relevant checks pass; UI changes have browser evidence in addition to HTTP checks.
- The final diff has been reviewed and actionable findings resolved.
- Permissions, provenance, privacy and persistence invariants are preserved.
- Documentation reflects changed behavior; unrelated work and secrets are absent from
  the deliverable; publication status is explicit.

## First tasks

1. Establish the baseline gate and record failures without hiding them (this setup).
2. Exercise the existing weekly workflow and turn observed failures into small tasks.
3. Implement the first confirmed launch blocker: account recovery, role handoff or
   reliable notification delivery, ordered by the pilot's actual needs.

Scale to multiple implementation agents only after tasks have independent boundaries
and the check suite reliably catches regressions. Add unattended execution only with
explicit task selection, stopping conditions, budgets and a delivery policy.
