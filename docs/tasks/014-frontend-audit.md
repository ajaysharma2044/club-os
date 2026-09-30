# Task: Audit deployed frontend workflows and edge cases

Status: done (audit delivered; remediation remains open)

## Problem and acceptance criteria

Assess frontend completeness after the Supabase deployment. Produce prioritized, concrete findings with source references, reproduction evidence, remedies, and explicit coverage limits. Protect real club records and document the outcome.

## Scope

Broad review of workspace lifecycle, messaging, integrations, search, responsive behavior, role boundaries, and hosted capability gaps. Targeted browser/API tests use synthetic records in a separate PostgreSQL schema. Fixes and deployment are excluded.

## Implementation and verification

- Report: [Frontend audit](../34-frontend-audit.md), findings F01–F12.
- 18 role/endpoint probes; populated messaging and Up next both reproduced HTTP 500. Actual unread query reproduced PostgreSQL error 42P18.
- Browser samples at 320/390/768/1440px; exact routes and gaps are recorded in the report.
- Synthetic server stopped and schema absence verified. Generated configuration restored.
- Documentation-only change; no full application gate rerun. Diff whitespace/link review performed.

## Review and completion

Self-review, without an independent agent. Audit acceptance criteria met; findings remain unfixed. No commit, push, or deployment performed. Start remediation with F01/F02/F06 and complete the remaining browser coverage before a launch-readiness claim.
