# Club OS frontend

The main Club OS layout is connected to the CEC backend. Run `npm ci` and
`CEC_ORIGIN=http://localhost:3000 npm run dev` from this directory.

## Connected screens

| Screen      | Route                  | Data and actions                                                                |
| ----------- | ---------------------- | ------------------------------------------------------------------------------- |
| Home        | `/`                    | Signed-in person's tasks, CEC membership/application, upcoming published events |
| CEC         | `/clubs/cec`           | Club overview and the existing officer tools                                    |
| Events      | `/clubs/cec/events`    | Create/publish events, RSVP, capacity/waitlist, attendance                      |
| Workspace   | `/clubs/cec/workspace` | Tasks, projects, linked documents, forms, learning, chat                        |
| People      | `/clubs/cec/people`    | Applications, coffee chats, private officer reviews, roster                     |
| Money       | `/clubs/cec/money`     | Finance records, contacts, sponsorship opportunities                            |
| Settings    | `/clubs/cec/settings`  | Account, sharing, export, sign out, connection status                           |
| Club record | `/clubs/cec/record`    | Evidence, provenance, corrections, outcomes, officer quant tools                |
| Inbox       | `/chat`                | CEC general/events/builders messages and scheduling proposals                   |
| You         | `/you`                 | Account plus weekly adaptive updates, personal timeline, calendar settings      |
| Discover    | `/discover`            | Published CEC events and explicitly shared projects                             |
| Join        | `/join`                | CEC account and recruitment entry point                                         |

The club's weekly updates, schedule, and shared directory are also available at
`/clubs/cec/intake`, `/clubs/cec/schedule`, and `/clubs/cec/directory`. Old `/cec/*`
links redirect into this layout. In-app search includes these destinations.

All connected identity and records come from `/api/cec/*`, with cookie sessions
and server-enforced roles. Home and the sidebar show personal task assignments;
the personal record shows the signed-in person's timeline. Private recruitment
reviews remain officer-only. Public profiles/projects require explicit sharing.
Refreshing the tab or completing an action refreshes account and club data;
the workspace also checks for new messages every 15 seconds while visible.

CEC is the only organization connected to this backend. Other club designs and
their local onboarding/chat examples remain labeled demonstrations. Their
browser-storage identities are not CEC accounts, and their slugs never select
CEC records.

## Runtime and verification

The backend uses Node 22+, SQLite, and the repository's Python quant worker.
Use the setup and bootstrap instructions in [README-CEC.md](../README-CEC.md). A durable
database and compatible server runtime are required for production; a frontend
deployment alone does not provision them. The Netlify configuration is retained,
but does not itself supply durable SQLite storage or a Python worker.

Google Docs links and calendar ICS export/subscriptions are available. Google
OAuth, Slack synchronization, Canvas, and university sign-in are still marked
unconfigured; they require their own authorized integration setup.

Run `node scripts/cec-test-server.mjs` to test API permissions/workflows and HTTP
page rendering/legacy redirects in an isolated temporary database. Run
`npm run build` for the production build. HTTP route checks do not substitute
for interactive browser testing.
