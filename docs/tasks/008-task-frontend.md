# Task: Make the pilot task handoff clear

Status: done

## Problem and acceptance criteria

Members must find open assignments, see revision feedback, submit work and recognize
when review is pending. Officers must isolate submissions needing review. Overdue work
must stay visible. Filters, empty states and narrow screens must remain usable.

## Design plan and review

Retain the established Cornell identity and existing typefaces. Palette: Cornell red
#b31b1b, ink #202322, white #ffffff, pale slate #f2f5f8, revision amber #a35021.
Left-aligned task queue: filter bar, title/status and assignee/deadline, latest feedback,
then expandable history. Actions sit beside the work on desktop and below on mobile.
Avoid adding another dashboard of count cards: counts belong to actual task filters.
Latest feedback is the visual emphasis; full history remains available on demand.

## Scope

Task workspace, personal Up next, invitation loading/error handling. No new provider,
permissions, schema migration or external deployment.

## Implementation and verification

Full gate passed all six steps: types, pure suites, Python, API/pages, signals,
and production build. Report: work/verification/2026-09-16T20-08-38.395Z-59536/result.json.
Up next suite: 42 assertions, including overdue retention and revision status.
Browser walkthrough on isolated work/pilot-ui/cec.sqlite: member acceptance,
empty filter, invalid empty submission, successful submission, officer review filter,
revision request, home overdue revision link, mobile resubmission at 390×844,
expanded retained history, approval and finished view. Verified officer invite shortcut
lands on the roster. Verified invalid invite, server-offline error and successful retry
when the isolated server resumed. Desktop and mobile screenshots inspected in browser.
Playwright CLI could not launch Chrome under the sandbox; used the available in-app
browser for the actual visual and interaction checks. Viewport override reset.
Normal preview restored on localhost:3000. git diff --check passed.

## Review and completion

Self-review found and fixed the inherited global .panel grid conflict within CEC,
which previously split content into unintended columns. Made Up next time formatting
consistent with the workspace's Eastern Time convention. Kept revision history durable
and existing server authorization intact. Earlier uncommitted work preserved.
No commit, push or deployment. Email verification and recovery remain separate work.
