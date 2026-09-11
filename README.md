# Club OS

A free operating system for college clubs: the roster, the money, and the memory, in one place, owned by the club.

This repository contains the Club OS frontend, the connected Cornell Entrepreneurship
Club pilot, its Python quant engine, and the product research and specifications.

**Start here: [docs/00-README.md](docs/00-README.md)**

**Run the product: [CEC setup](README-CEC.md) · [Connected frontend](web/README.md)**

## Layout

- **`docs/`** — twelve synthesis documents: strategy, product spec, data architecture, the quant engine, workspace, design system, economics, chat and community, the record (the spine document), the talent verification market, and the cross-club graph.
- **`research/`** — twenty-four raw research reports behind those documents, plus working notes.
- **`web/`** — Next.js frontend and authenticated CEC API, with events, recruitment,
  tasks, chat, scheduling, weekly updates, CRM and the evidence record.
- **`services/quant/`** — quant service, event ingestion and forecasting tools.

## Status

CEC is connected at `/clubs/cec`; Home, Inbox, Discover, Join and You use its account
and club data. Other club designs are labeled demos. The pilot requires persistent
Node/SQLite storage and Python; live Google, Slack, Canvas and university sign-in
integrations still need configuration. See the CEC setup guide for current limits.
