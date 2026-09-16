# Club OS — System design

Status: proposed design direction, recorded 2026-09-15. This document captures the
current product discussion; it does not claim that every contract below is implemented.
See [MVP system scope](24-mvp-system.md) for the proposed first release.

## 1. Purpose and scope

Club OS is a free operating system for student organizations. Useful weekly workflows
produce a permissioned record of decisions, responsibilities, work and outcomes.
That record can later support organizational intelligence and economic opportunities.

The operating product must earn usage before the graph, models or marketplaces can
provide an advantage. The long-term commercial hypothesis is that employers, sponsors,
vendors, national organizations and potentially universities pay for services while
clubs and students remain free. Buyer selection and pricing are unresolved hypotheses.

The central operational chain is:

Meeting → confirmed decision → accepted task → work/artifact → verified outcome.

The system must distinguish observed facts, human-confirmed statements, AI suggestions,
statistical estimates, predictions and unknowns. Private communications are not a
general-purpose analytical input. External evidence sharing requires specific permission.

### Relationship to older documents

The repository mixes early strategy, proposed architectures and executable code.
For implementation status, use code and README-CEC.md. This document and doc 24 express
the current discussion's proposed design and MVP scope. They do not silently implement
or approve older ideas about hidden profiles, message metadata analytics, universal
administrator access or a particular database vendor. University commercialization
remains an option in the supplied vision, despite older strategy excluding it.

## 2. Domain boundaries

Start with a modular monolith. Separate ownership and interfaces inside the application
before introducing distributed services.

| Domain | Owns | Boundary |
|---|---|---|
| Identity and access | Accounts, memberships, time-bounded roles, grants | All domains check server-side authorization |
| Operations | Tasks, projects, events, attendance, money register, assets | Authoritative workflow transitions |
| Communications | Messages, meeting source material, delivery | Participant access; no private-message analytical pipeline |
| Evidence | Confirmed decisions, contributions, artifacts, corrections | Provenance and purpose-bound visibility |
| Intelligence | Features, forecasts, recommendations, evaluations | Authorized inputs, versions, uncertainty and feedback |
| Opportunities | Offers, exposures, responses, outcomes | Sharing and introductions explicitly authorized |

An employer surface eventually consumes a specifically shared evidence projection;
it does not query underlying club records. Headquarters and university relationships
do not inherently grant access to a club's records.

## 3. Identity, organization ownership and access

Separate a person's account from membership and role. The eventual model must support
one person holding different roles in different clubs and terms. Do not infer access
from an email domain or organization hierarchy alone.

Each protected object needs an owning organization, visibility policy and authorized
operations. External sharing needs a recipient, purpose, permitted fields, expiry where
appropriate, and revocation. Check these rules on reads, writes, exports and job execution.

Role transfer must preserve club-owned records while removing former officers' authority.
Audit sensitive permission changes without putting private communications in analytics.
The current single-CEC user-role model is not a multi-tenant permission system.

## 4. Records, state and history

Use mutable operational state for current screens and append-only domain history where
accountability, corrections or replay require it. Full event sourcing is not a prerequisite.

Define a versioned event envelope with:

- Stable event ID, schema version, event type and owning club.
- Actor, subject and object identifiers where applicable.
- Occurrence time and server-recorded observation time.
- Source and source revision, idempotency key, and provenance pointers.
- Minimal permitted payload and applicable purpose/access classification.
- Correction linkage and reason when replacing a previous claim.

Validate domain payloads rather than accepting arbitrary metadata into the evidence graph.
Preserve the distinction between missing attendance and confirmed absence. A suggested
assignment is not accepted responsibility; a submitted artifact is not an approved outcome.

Normal corrections append history. Retention and erasure requirements can remove data;
append-only semantics must not become an excuse to retain personal data indefinitely.

## 5. Transactions and asynchronous work

The critical path is:

User/integration → authentication and validation → domain transaction → operational state
and durable outbox → worker → authorized evidence/derived views → user-facing actions.

Commit state changes and their outbox entries together. Deliver asynchronously with
at-least-once semantics and idempotent consumers. Track attempts, next retry time and
terminal failures; make failures inspectable. External delivery cannot be assumed to
support exactly-once execution, so reconcile ambiguous results where needed.

Notification, integration and derived-computation failures must not lose the original
task or event. Display stale/unavailable intelligence honestly. Jobs recheck current
permissions before using records or delivering sensitive content.

The existing quant subprocess/outbox is a starting point. The documented implementation
retries after mutations and manually; a durable autonomous worker still needs verification
and implementation for unattended delivery.

## 6. Integrations and AI extraction

For each connector, specify authoritative fields, external IDs, revisions, initial import,
incremental synchronization, deletions, conflicts, token renewal and revoked permissions.
Report configuration, connection, last successful synchronization and freshness separately.

For meeting intelligence, explicitly separate recording consent, source access, extraction,
review and confirmation. For example, “Maya could contact sponsors” produces a suggested
task, not an assigned commitment. Preserve evidence pointers and allow correction.
Confirming a decision does not grant permission to expose its entire source transcript.

Begin with links and reviewed manual input where that completes the workflow. Add a live
connector only when it removes demonstrated recurring work and its failure modes are owned.

## 7. Intelligence lifecycle

Every model needs a decision it supports, permitted inputs, target outcome, minimum data,
cold-start behavior, version, uncertainty, evaluation procedure and an accountable user.
Do not make core operations depend on a predictive service being available.

Keep recommendation creation, exposure, acceptance, execution and outcome separate.
Likewise track opportunities offered, seen, accepted and completed: absence of an offer
is not rejection. Record intervention provenance before making causal claims.

Historical evaluation must use only information available at its cutoff. Show unknowns
and weak evidence explicitly. Personal evidence exports contain consented episodes and
artifacts, not employability scores. Existing factors remain experimental until validated.

## 8. Privacy through the data lifecycle

Track dependencies from sources to summaries, features, indexes, caches and predictions.
Revocation must immediately block further unauthorized access and processing; cleanup
then removes or invalidates affected derived data under a documented retention policy.

Define export, correction, deletion and backup-expiry behavior before collecting new
classes of personal data. Restores must reapply deletion/revocation records before serving
traffic. Do not promise that already downloaded external copies can be recalled.

Keep operational logs free of passwords, tokens, message bodies and unnecessary personal
content. Measure service health without building a private communications graph.

## 9. Runtime and scaling

The current code is Next.js/TypeScript, SQLite and a Python quant companion, packaged for
a single server with persistent storage. Start there for a single-club pilot. Do not run
multiple independent application replicas against separate local database files.

Before real use: verify migrations, coordinated backup/restore, health checks, error
reporting, job recovery, capacity bounds, HTTPS and secret handling. Define recovery and
performance targets against a stated pilot load and verify them in deployment.

Move storage or split services when demonstrated needs require it: shared multi-club
tenancy, concurrent workloads, independent scaling or stronger isolation. A graph-shaped
domain can initially be represented with relational records and links; a graph database,
warehouse, vector store, streaming platform and microservices are not initial requirements.

## 10. Decisions to settle before expansion

1. The role/object/action permission matrix, including officer succession.
2. Workflow transitions and the event/provenance contract.
3. Source ownership, connector retry and revocation behavior.
4. Data retention, erasure and derived-data invalidation.
5. Reliability targets, restore procedure and support ownership.
6. Model evaluation and action feedback before consequential recommendations.

These contracts are more urgent than expanding the feature catalog.
