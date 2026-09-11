# 09 — Integrations and the Technical Stack

*Research track for a free, central "operating system" for college clubs. Date: 2026-09-10. Sources are official API docs and pricing pages wherever possible; items I could not verify against a primary source are marked **[unverified]**.*

---

## 0. Executive framing

The product is a hub, not a silo. That has three consequences for the stack:

1. **Every integration is a distribution channel, not just a feature.** Clubs already live in GroupMe, Discord, Instagram, Google Calendar and the campus engagement platform. The hub wins by being the *system of record* that pushes into those channels, and by pulling rosters/events *out* of them.
2. **Universities are the gatekeepers for the most valuable integrations** (SSO, Google Workspace for Education tenants, M365 tenants, Canvas LTI, the campus engagement platform). These are admin-consent flows, not user-consent flows. Design for a "bottom-up first, top-down later" adoption path.
3. **Platform-side restrictions have tightened everywhere since 2024** (Slack non-Marketplace rate limits, Instagram Login migration, TikTok audit gating, LinkedIn's approved-users-only reads, Google Workspace Education under-18 defaults, Entra publisher verification). Budget engineering time for *app review*, not just code.

---

## 1. Integration inventory

### 1.1 Productivity suites and calendars

| Integration | Auth model | Limits / cost | What is possible | Gotchas |
|---|---|---|---|---|
| **Google Calendar API** | OAuth 2.0 (user consent) | 10,000 req/min per project; 600 req/min per user per project; 1M req/day free tier that "cannot be increased"; overage billing "planned … later in 2026" with 90 days' notice ([quota doc](https://developers.google.com/workspace/calendar/api/guides/quota)) | Two-way sync of club events to member calendars, push channels (watch) for changes, free/busy for scheduling | Google Workspace for Education admins gate third-party apps as *Trusted / Limited / Specific data / Blocked*; unconfigured apps are more restrictive for users under 18 by default ([admin doc](https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data)). Restricted scopes (Gmail, Drive full) need Google's security verification (CASA assessment, ~weeks and $). Calendar scopes are "sensitive" not "restricted" — cheaper review. |
| **Google Drive / Sheets / Forms** | OAuth 2.0 | Same Workspace admin gating | Drive: attach docs to a club space; Sheets: export rosters/budgets; Forms: no *write* of responses, but you can read responses via Forms API | Full Drive scope is *restricted* (CASA required). Use `drive.file` (per-file, non-restricted) and Drive Picker instead. Forms API cannot create advanced logic; build your own forms. |
| **Gmail** | OAuth 2.0 | Restricted scope | Send-as-club-account | Avoid. Use your own transactional email (Resend) and let officers CC their inbox. Gmail restricted scopes trigger the heaviest review. |
| **Microsoft Graph (Outlook calendar, Teams, OneDrive)** | OAuth 2.0 / OIDC, multi-tenant app registration | Global 130,000 req/10s per app; identity/directory token-bucket limits per app+tenant (3,500–8,000 resource units/10s); Teams presence 10,000/30s per app per tenant; SharePoint/OneDrive has separate throttling ([throttling doc](https://learn.microsoft.com/en-us/graph/throttling-limits)) | Calendar sync, Teams channel posts via bots/webhooks, OneDrive file links, directory lookups (with admin consent) | **Publisher verification** is effectively mandatory: since Nov 2020, with risk-based step-up consent enabled, users "can't consent to most newly registered multitenant apps that aren't publisher verified" beyond basic sign-in scopes. Requires a verified Microsoft AI Cloud Partner Program (formerly MPN) account and a DNS-verified publisher domain; free ([publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)). University tenants very commonly require admin consent for *any* Graph scope beyond `User.Read`. |
| **ICS feeds (calendar subscriptions)** | None (signed URL) | Free | Per-user and per-club subscribe-able feeds; works in Google, Outlook, Apple | Refresh cadence is client-controlled (Google can lag 12–24h). Still the single highest-leverage, zero-review calendar integration. Ship in v1. |

**Recommendation:** ICS feeds + Google Calendar (sensitive scopes only) in v1; Microsoft Graph calendar in v2 once you have a verified publisher domain and a few universities asking.

### 1.2 Chat platforms clubs already use

| Integration | Auth / distribution | Limits | Realistic scope | Gotchas |
|---|---|---|---|---|
| **Slack** | OAuth 2.0 v2, Events API or Socket Mode; Marketplace listing needs "at least 10 installations on active workspaces" throughout review as of July 2026 ([changelog](https://docs.slack.dev/changelog)) | Web API tiers 1–4 (1+/20+/50+/100+ req/min per method per workspace); `chat.postMessage` ~1 msg/sec/channel ([rate limits](https://docs.slack.dev/apis/web-api/rate-limits)) | Post announcements/events into a channel; slash command to RSVP; link-unfurl club URLs | Since **May 29, 2025**, newly created non-Marketplace apps face heavily restricted `conversations.history` / `conversations.replies` (widely reported as 1 req/min, 15 objects) — so *reading* Slack history is impractical unless you get Marketplace-listed. Design Slack as write-mostly + event-driven. Few clubs use Slack anyway; it's a v3 nicety. |
| **Discord** | Bot token + OAuth2 (`identify`, `guilds.join`, `role_connections.write`) | Global 50 req/s per bot; per-route buckets; 10,000 invalid requests/10 min triggers Cloudflare bans ([rate limits](https://docs.discord.com/developers/topics/rate-limits)) | **Linked Roles**: register metadata once (PUT role-connection metadata), user OAuths with `role_connections.write`, server admins gate a role on "is verified member of Club X" ([linked roles](https://docs.discord.com/developers/tutorials/configuring-app-metadata-for-linked-roles)). Also: mirror announcements, event → Discord Scheduled Event, RSVP reactions. | Bot verification is required to exceed 100 servers and privileged intents (Message Content, Guild Members) need approval **[unverified — page 403'd]**. Plan for verification early; it takes weeks. Linked Roles is the killer feature: it turns your roster into Discord permissions with zero moderation burden. |
| **GroupMe** | Personal access token in `X-Access-Token` header; bots register a callback URL ([API v3](https://dev.groupme.com/docs/v3)) | No documented rate limits; messages max 100/page; text ≤1,000 chars | Bots can *post* to a group; callback receives messages posted to that group; groups/members readable with the user's token | No official OAuth for third parties — the "token" is the user's own developer token. Bots are effectively write-only from a product standpoint. GroupMe is where most clubs actually are, so a "mirror announcements to GroupMe" bot is high-value but built on an under-supported API (Microsoft-owned, minimal investment). Treat as best-effort. |
| **WhatsApp Business Platform** | Meta Business verification + Cloud API | Per-message pricing since **July 1, 2025**; marketing templates always charged; utility/auth charged outside the 24h service window; free within Free Entry Point windows ([pricing](https://developers.facebook.com/docs/whatsapp/pricing)) | 1:1 notifications to opted-in members (event reminders) | Not a group-chat API; you cannot post into a member-created WhatsApp group. Template approval per message type. International students value it; treat as v3 notification channel, not chat. |

### 1.3 Social publishing

| Platform | What is possible (2025–26) | Limits | Gotchas |
|---|---|---|---|
| **Instagram** | Publish images (JPEG only), videos/Reels, Stories, carousels (≤10) to *professional* (business/creator) accounts via **Instagram Login** (`instagram_business_basic`, `instagram_business_content_publish`) or Facebook Login for Business ([content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)) | **100 API-published posts per 24h rolling window** per account (carousels count once) | Requires Advanced Access → Meta App Review with screencasts. Instagram Login (2024) removed the Facebook Page requirement, which is a big win for clubs. No shopping tags/filters. Reading comments/DMs needs further permissions and business verification. |
| **TikTok Content Posting API** | Direct post or upload of video (MP4/H.264) and photos; `video.publish` scope ([get started](https://developers.tiktok.com/doc/content-posting-api-get-started)) | Unaudited clients: "All content posted … will be restricted to private viewing mode" | You must pass a TikTok audit before posts are public. Low priority; v3. |
| **LinkedIn** | Posts API: `w_organization_social` (post as a company page where the member is admin) and `w_member_social` (post as the member). `r_member_social` (read member posts) is "restricted … available to approved users only" ([Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)) | Versioned API (`Linkedin-Version: YYYYMM`), 429 on abuse; versions sunset yearly | Requires Community Management API product access (application form). No feed reading, no connections. Realistic: "share this event to LinkedIn" as the officer, and post to the club's company page. Employer-recruiting features should *not* depend on LinkedIn data. |

### 1.4 Video and LMS

| Integration | Details |
|---|---|
| **Zoom** | OAuth (user-managed or account-level) and Server-to-Server OAuth. Rate limits are per *account*: Free accounts 4/2/1 req/s (light/medium/heavy) with daily caps (6,000/2,000/1,000); Pro 30/20/10 req/s and 30,000/day heavy; Business 80/60/40 req/s, 60,000/day ([rate limits](https://developers.zoom.us/docs/api/rate-limits/)). Meeting creation capped at 100/day/user. University Zoom tenants usually block unpublished Marketplace apps; you'll need a published app. Cloud recording + transcript webhooks are the hook for "meeting notes" AI. |
| **Canvas LMS — REST API** | Per-user OAuth2 tokens each with their own quota (leaky bucket; `X-Request-Cost`, `X-Rate-Limit-Remaining`; 403/429 on exhaustion) ([throttling](https://canvas.instructure.com/doc/api/file.throttling.html)). Developer keys must be enabled by the institution's Canvas admin. |
| **Canvas LMS — LTI 1.3 / LTI Advantage** | Configure as an LTI 1.3 tool via a Developer Key (JSON config). Placements include course, account, **global** and user navigation. Services: Names and Roles Provisioning (roster), Assignment & Grade, Deep Linking. Privacy level controls PII (public / name_only / email_only / anonymous); user ID always sent ([LTI dev key config](https://canvas.instructure.com/doc/api/file.lti_dev_key_config.html)). **What LTI unlocks:** a "Clubs" link in Canvas global navigation for every student (massive distribution), SSO-by-launch (the launch JWT is the identity), and a per-course roster for academic/honor societies. **What it costs:** an admin must install it (account-level); IMS/1EdTech certification is expected by many campuses; you're now a vendor subject to HECVAT/FERPA contracts. Instructor-level course installs can happen without the admin, which is a plausible wedge for academic clubs. Verdict: v2–v3 "top-down" play, not v1. |

### 1.5 University SSO and identity

| Option | Reality |
|---|---|
| **.edu email verification** | The v1 shortcut. Verify with magic link/OTP to a `.edu` address, map domain → institution, and trust it for membership eligibility. Gotchas: alumni keep `.edu` addresses; some schools use non-`.edu` domains; community colleges share domains across campuses. Maintain a domain→school table (seed from the Dept. of Education IPEDS list). |
| **Google SSO / Microsoft Entra SSO** | Most US campuses are either Google Workspace for Education or M365. "Sign in with Google" and "Sign in with Microsoft" with a domain hint give you verified institutional identity *without* SAML and without admin involvement (basic OIDC scopes are user-consentable, subject to the Education under-18 policy and Entra consent policies noted above). This covers the large majority of students. |
| **SAML / Shibboleth / InCommon** | InCommon Federation: **$700 one-time registration**; commercial *Sponsored Partners* pay **$2,500/yr (<$10M revenue)**, $6,000 (<$1B), $12,000 (≥$1B); base package includes one IdP and up to 50 SP IDs ([fees](https://incommon.org/federation/fees/)). You also need an InCommon *sponsor* (a member institution) **[unverified — join page did not load]**. Practically, InCommon matters for the ~600 R1/R2 schools using Shibboleth; you'll be asked to support Research & Scholarship attribute bundles and SIRTFI. Do it once you have a paying institutional customer. |
| **CAS** | Legacy but still common (e.g., Apereo CAS). Implement a generic CAS client behind a feature flag in v2; it's a few hundred lines. |
| **Vendor choice** | WorkOS: AuthKit free to 1M MAU; SSO/Directory Sync **$125 per connection/month** (1–15), sliding to $65 at 51–100 ([pricing](https://workos.com/pricing)). Clerk: free to 50k MRU; Pro $25/mo includes 1 enterprise SAML/OIDC connection, **$75/mo each additional** ([pricing](https://clerk.com/pricing)). Supabase Auth: 50k MAU free, Pro 100k then $0.00325/MAU; SAML 50 MAU included then $0.015/MAU ([pricing](https://supabase.com/pricing)). Per-connection pricing is the wrong shape for a free product that could plausibly reach hundreds of campuses — a $125/campus/month bill is a real cost line. Supabase's per-MAU SAML or a self-hosted SAML library (e.g., `@node-saml/passport-saml` / `samlify`) fits better. |

### 1.6 Campus systems (events, rooms, engagement platforms)

| System | Reality |
|---|---|
| **25Live (CollegeNET)**, **EMS (Accruent)**, **Ad Astra** | All three have institution-licensed web services / APIs; access is granted by the campus scheduling office, not by a student. 25Live Publisher exposes public event calendars as RSS/ICS feeds, which you can ingest with no permission **[unverified — KB host unreachable]**. Realistic plan: ingest public ICS/RSS calendars in v1; deep-link into the campus room-request form; pursue write APIs only with a top-down deal. |
| **Anthology Engage, CampusGroups (Ready Education), Presence (Modern Campus)** | These are the incumbents you are replacing. Public API pages were not reachable **[unverified]**; based on vendor behavior, expect: institution-admin-issued API keys, event/organization read endpoints, public event pages with ICS/RSS, and *no* sanctioned roster export for third parties. Practical importers: (a) public event calendar scrape/ICS, (b) CSV upload of rosters exported by officers (all three let officers export member lists), (c) "paste your org page URL" to pre-fill the club profile. Don't build on scraping authenticated pages — it violates their ToS and your university relationship. |

### 1.7 Events and ticketing

| Platform | Reality |
|---|---|
| **Eventbrite** | OAuth2 or private token; create events, tickets, orders, attendees, webhooks. The public event *search* endpoint was removed in 2019–2020; you can only list events for organizations the user owns **[unverified — docs page returned a JS shell]**. Use as an *export* target ("also sell on Eventbrite") in v3. |
| **Luma** | JSON API, calendar-scoped key in `x-luma-api-key`, **Luma Plus subscribers only**; manage events and guests; OpenAPI at `public-api.luma.com/openapi.json` ([docs](https://docs.luma.com/reference/getting-started-with-your-api)). Nice for tech clubs already on Luma; import/export in v2. |
| **Partiful** | No public API. Ignore. |

### 1.8 Payments and money

| Provider | Facts | Fit |
|---|---|---|
| **Stripe Connect** | Two models: *Stripe handles pricing* (connected accounts pay standard 2.9% + 30¢; platform pays nothing for account management/payouts) or *you handle pricing* (**$2/monthly active account**, **0.25% + 25¢ per payout**, 0.25% of volume for platform management; 1099 e-file $2.99). Instant Payouts 1% ([Connect pricing](https://stripe.com/connect/pricing)). | Best fit: each club = a Stripe Express connected account. KYC: Stripe collects the *representative's* identity (a student treasurer, 18+) plus the entity type. Most clubs are unincorporated associations without an EIN; Stripe allows "individual" or "non-profit" onboarding, but a treasurer onboarding as an *individual* creates personal tax exposure (1099-K at $600+ under current federal thresholds — check state rules). Mitigation: (1) let the *university* or an umbrella nonprofit be the connected account with clubs as sub-ledgers; (2) integrate a fiscal sponsor (HCB below). Stripe Issuing/Treasury are gated to approved platforms and add compliance obligations; not v1. |
| **Hack Club HCB** | Fiscal sponsorship (HCB is a 501(c)(3)) with cards, ACH, invoices, donations; used by many student orgs; commonly cited 7% fee on incoming revenue **[unverified — API docs page is a JS app; fee from general knowledge]**. Has a v3/v4 API (organizations, transactions, card charges, donations, invoices). | Strong option for clubs that need a *real* bank account and tax-exempt status without the university. A "connect HCB" read integration for budgets is a v2 differentiator. |
| **Venmo** | No public API for third-party payment acceptance; business profiles charge a per-transaction fee (commonly 1.9% + $0.10) **[unverified — help article not reachable]**; Venmo checkout is only available through PayPal/Braintree for online merchants. | Realistic: store the club's Venmo handle and deep-link (`venmo://paycharge?txn=pay&recipients=…&amount=…&note=…`), then reconcile manually or via CSV. Also PayPal Checkout with Venmo button (US mobile web). |
| **Zelle** | No API. Deep-link/QR to the treasurer's handle only. |
| **PayPal / Square** | Both have full APIs; Square's is friendlier for in-person (Terminal, Reader SDK). Use one processor (Stripe) in v1; add PayPal/Venmo *button* in v2 because students ask for it. |
| **Plaid** | Free "Limited Production" sandbox (200 calls per product), then self-serve pay-as-you-go ([pricing](https://plaid.com/pricing/)). | Useful for treasurer bank feeds → budget dashboards (Transactions product). v3. |

### 1.9 Docs, design, dev tools

| Tool | Facts |
|---|---|
| **Notion** | 180 req/min per integration on non-Business plans; 600/min on Business/Enterprise; 1,000 blocks / 500 KB per payload ([limits](https://developers.notion.com/reference/request-limits)). Public OAuth integrations exist. Two-way sync is painful; do "embed/link a Notion page" and "export minutes to Notion." |
| **Airtable** | REST API with PATs/OAuth; 5 req/s per base. Import a roster from Airtable is a 1-day feature. |
| **Canva Connect API** | OAuth; API groups: Designs, Assets, **Autofill** (data → brand template), Exports (async), Brand Templates, Folders, Comments, Analytics. Public integrations "must first be reviewed by Canva"; private integrations are Enterprise-only ([overview](https://www.canva.dev/docs/connect/), [index](https://www.canva.dev/docs/connect/llms.txt)). Autofill/Brand Templates historically require the *user* to be on Canva Enterprise **[unverified]** — so "generate a flyer from this event" via Canva works only for clubs with enterprise-licensed campus Canva. Fallback: your own templated flyer renderer (HTML→PNG) plus "Open in Canva" via Design Import. |
| **Figma** | REST API is read-mostly (files, images, comments). Not relevant to v1. |
| **GitHub** | OAuth/GitHub Apps. For CS clubs: link org, show repos, "verify contributor" for Linked Roles. Cheap, v2. |

### 1.10 Messaging infrastructure

| Channel | Facts |
|---|---|
| **Email — Resend** | Free 3,000/mo (100/day); Pro $20/mo for 50k; overage $0.90/1k; dedicated IP $30/mo on Scale ([pricing](https://resend.com/pricing)). Mailchimp/SendGrid are overkill for a v1; Resend + React Email is the small-team default. Deliverability to `.edu` inboxes (Proofpoint/Mimecast in front of M365 and Google) requires DMARC alignment from day one. |
| **SMS — Twilio** | Every application-to-person US SMS requires **A2P 10DLC brand + campaign registration**; unregistered traffic is surcharged and filtered; throughput is trust-score based (sole prop ~3,000 segments/day; low-volume standard ~6,000/day) ([10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)). Registration takes days to weeks. SMS is a v2 opt-in reminder channel, not a chat transport. |
| **Push — Expo** | Expo's push service abstracts APNs/FCM behind Expo push tokens ([overview](https://docs.expo.dev/push-notifications/overview/)); free. Go direct to APNs/FCM only if you need silent/background pushes at scale or want to avoid a dependency. |
| **Web push (PWA on iOS)** | Supported since iOS 16.4 **only when the web app is added to the Home Screen** ([Apple doc](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). This is the main reason a PWA-only strategy fails for a chat/notifications product on campus. |

### 1.11 Wallet passes, QR, NFC

- **Apple Wallet**: `.pkpass` signed with a Pass Type ID certificate; pass types include event ticket, generic, store card; updates via APNs + a pass web service; NFC-enabled passes are restricted (Apple must grant NFC entitlement) ([walletpasses](https://developer.apple.com/documentation/walletpasses)). Membership card = generic pass; event ticket = event ticket pass with a QR barcode.
- **Google Wallet**: Class + Object model; save via signed JWT link; **publishing access must be requested** before production; Smart Tap (NFC) supported ([generic passes](https://developers.google.com/wallet/generic)). No per-pass fee.
- **QR check-in**: v1. Rotating signed QR (HMAC over user id + event id + time bucket) scanned by an officer's phone; works offline with a short grace window.
- **NFC**: Apple NFC pass entitlement is hard to get; Android Smart Tap needs merchant setup. Defer to v3 or never; QR covers 99% of the value.

### 1.12 Apple Sign-in requirement

App Store Guideline 4.8: if you offer third-party/social login (Google, Microsoft…) you must also offer a login that limits data to name/email, allows email hiding, and doesn't collect interaction data for ads — i.e., Sign in with Apple or an equivalent. **Exception:** apps that require users to sign in with an "education, enterprise, or business" institutional account are exempt ([guidelines](https://developer.apple.com/app-store/review/guidelines/)). Since students sign in with campus Google/Microsoft accounts, you likely qualify — but adding Sign in with Apple is cheap insurance and avoids an argument with review. Guideline 5.1.1(v) also requires in-app **account deletion**.

---

## 2. Chat architecture: build vs buy

### 2.1 Pricing at scale

| Option | 10k MAU | 100k MAU | 1M MAU | Notes |
|---|---|---|---|---|
| **Stream Chat** | Start $399/mo annual (10k MAU, 500 concurrent) ([pricing](https://getstream.io/chat/pricing/)) | ~$399 + 90k × $0.09 ≈ **$8.5k/mo** (before negotiating) | Enterprise (custom); list-price math is ~$90k/mo | $100/mo Maker credit for <5 people & <$10k rev. Best SDKs (React, RN, Expo). AI moderation is enterprise add-on. |
| **Sendbird** | Starter 5k MAU $349/mo; Pro 5k MAU $499/mo; overage above ([pricing](https://sendbird.com/pricing/chat)) | Enterprise territory (~$10k+/mo) | Enterprise | Pro includes moderation dashboard, image moderation; Enterprise adds Hive integration. |
| **Ably (Pub/Sub + Ably Chat)** | Free 6M msgs/mo, 200 connections; Standard $29/mo + $2.50/M messages + $1/M connection-minutes ([pricing](https://ably.com/pricing)) | Consumption-based; a campus chat at 100k MAU sending ~30M msgs/mo ≈ $75 messages + connection-minutes (likely $200–800) | Pro $399/mo base + usage | Transport only; you own storage, threads, read receipts, search, moderation. |
| **Supabase Realtime** | Free: 200 peak connections, 2M msgs/mo. Pro $25/mo: 500 connections then $10/1,000; 5M msgs then $2.50/M ([pricing](https://supabase.com/pricing)) | Connections dominate: 5k concurrent ≈ $45/mo extra | 50k concurrent ≈ $500/mo | Cheap, but Postgres changes → realtime fan-out is not a chat engine; you build everything. |
| **Convex** | Free/Starter: 1M function calls, 0.5 GB DB; Pro $25/dev/mo, 25M calls, 50 GB DB, $2/M extra calls ([pricing](https://www.convex.dev/pricing)) | Reactive queries are the chat model; cost is function calls + DB bandwidth. 100k MAU chat at ~50 calls/user/day ≈ 150M calls ≈ $250–$300/mo over the plan | ~$2.5k–3k/mo at 1M MAU on list price (function calls), plus storage | Subscriptions push updates to every open query automatically; no separate WebSocket layer. |
| **Zulip (self-hosted)** | Free, Apache-2.0, "all features"; mobile push relay free for eligible academic/non-profit communities, else Basic $3.50/user/mo ([plans](https://zulip.com/plans/)) | Infra only (~$200–600/mo) | Infra (multi-node Postgres + RabbitMQ + Redis) | Topic-threading is *ideal* for clubs (one channel per club, one topic per event). But it is a Django/Python monolith with its own auth, UI, and mobile apps — you'd be embedding or forking, not extending. |
| **Mattermost / Rocket.Chat** | Free editions exist but are now positioned as "limited-use evaluation" (Mattermost Entry) or "Starter" with seat caps; paid tiers are contact-sales ([Mattermost](https://mattermost.com/pricing/), [Rocket.Chat](https://www.rocket.chat/pricing)) | — | — | Both have moved features behind commercial licenses over 2023–2026. Forking is a license-and-community risk. |
| **Matrix/Synapse, Revolt, Centrifugo, Phoenix Channels, Socket.IO** | Free / self-host | Infra | Infra | Matrix is federated and heavy (Synapse is Python; Conduit/Dendrite lighter). Centrifugo is an excellent pure transport (Go) if you avoid Convex. Phoenix Channels = Elixir; great tech, wrong language for a TS team. |

### 2.2 Moderation tooling and legal obligations

- **OpenAI Moderation endpoint** is free, multimodal (`omni-moderation-latest`), 13 categories incl. `sexual/minors`, `self-harm/*`, `harassment/threatening` ([docs](https://developers.openai.com/api/docs/guides/moderation)). Use it as the default text+image classifier even though Claude is your generation provider; it's free and purpose-built.
- **Hive**: text $0.50/1k, visual $3.00/1k, audio $0.03/min; CSAM detection via Thorn (contact sales) ([pricing](https://thehive.ai/pricing)). Use for image hash-matching once you have UGC images at scale.
- **Perspective API** (Jigsaw) is free for toxicity scoring but text-only and English-centric; fine as a secondary signal.
- **CSAM reporting (18 U.S.C. § 2258A)**: as a provider of an electronic communication service you **must** report apparent CSAM to NCMEC's CyberTipline "as soon as reasonably possible"; the 2024 REPORT Act extended preservation to **1 year**; first-violation penalties up to $600,000 (platforms <100M MAU) ([statute](https://www.law.cornell.edu/uscode/text/18/2258A)). Register with NCMEC's CyberTipline before launch; wire Hive/PhotoDNA-style hash matching before allowing image DMs.
- **Hazing**: the federal Stop Campus Hazing Act (Dec 2024) requires *institutions* to report hazing in Clery statistics; it does not obligate you, but universities will ask whether your platform preserves evidence and supports reporting. Provide an in-app report flow that routes to the club advisor/student affairs.
- **Title IX**: you are not a recipient of federal funds, so Title IX does not bind you directly, but universities' Title IX offices routinely subpoena or request DMs. Build: legal-hold flag per user/conversation, exportable transcripts, retention policy (e.g., DMs 1 year unless held), and a documented law-enforcement/institution request process. Do *not* promise end-to-end encryption for DMs in v1; it conflicts with CSAM and hazing obligations and with App Store 1.2's filtering requirement.
- **App Store 1.2** requires filtering, reporting, blocking, and published contact info for any UGC app; "random/anonymous chat" is grounds for removal ([guidelines](https://developer.apple.com/app-store/review/guidelines/)). Never ship anonymous DMs.

### 2.3 The call

**Build chat on your own reactive backend (Convex) rather than buying Stream/Sendbird, and rather than forking an open-source chat server.** Reasons: (1) chat is the *core* of the product, not a bolt-on — channels are club spaces, threads are events, messages carry RSVPs, polls, forms and payments as first-class blocks, which no vendor SDK models; (2) at 100k–1M MAU, vendor list prices ($8k–90k/mo) kill a free product, while a reactive DB scales on function calls; (3) open-source servers bring their own auth, identity and UI worlds that fight your hub. Borrow **Zulip's topic-per-thread model** as the UX pattern (channel = club, topic = event/initiative), and use Stream's free Maker tier only if you need a stopgap demo.

The one honest counter-argument: Stream's Expo/React SDKs would save 6–10 engineer-weeks of message list, offline, attachments, typing, and reactions work. If the team is two people and a 6-week chat build is the difference between shipping and not, take the Maker credit for v0 and plan the migration.

---

## 3. App stack for a small team (web + iOS + Android, one codebase)

### 3.1 Client

| Choice | Assessment |
|---|---|
| **Expo (React Native) + Expo Router, with web via React Native Web** *or* **Expo mobile + Next.js web sharing packages** | Expo is the default for a TS team in 2026: EAS Build free tier (15 iOS + 15 Android builds/mo, low-priority queue), Starter $19/mo, Production $199/mo with 50k EAS Update MAU ([pricing](https://expo.dev/pricing)). Expo Router gives file-based routing across native and web. A Next.js web app is still better for SEO-facing public pages (club directories, event pages, recruiting). **Recommendation:** monorepo — `apps/mobile` (Expo), `apps/web` (Next.js), `packages/ui`, `packages/api-client`. Share logic, not pixels. |
| **Flutter** | Excellent, but the team gives up TypeScript end-to-end, Convex's TS-native client, and the React ecosystem for web. Only pick it if the founders already know Dart. |
| **Native Swift/Kotlin** | Two codebases; no. |
| **PWA-only** | Rejected for a chat product on campus because iOS web push requires Home Screen install and badging is limited (see 1.10). Ship the PWA *as well* (Next.js web app with a manifest) for the "I don't want another app" segment. |

### 3.2 Backend and data

| Choice | Assessment |
|---|---|
| **Convex** | Reactive DB + serverless functions + file storage + scheduler + cron + text/vector search, TS end-to-end with generated types; subscriptions are the chat transport. Pricing above; the Starter tier is generous enough for a pilot campus. Risks: single-vendor lock-in (open-source backend exists and can be self-hosted, but you'd lose the hosted ops); document-model DB means the "rich data graph" needs discipline (explicit edge tables, indexes); no native SAML. |
| **Supabase** | Postgres, Auth (50k MAU free; SAML per-MAU), Realtime, Storage, Edge Functions. The "rich data graph" and analytics story is better on real Postgres (pgvector, graph-ish CTEs, PostHog/warehouse exports). Realtime is not a chat engine, so you'd add Centrifugo/Ably or build on Postgres LISTEN/NOTIFY. |
| **Firebase** | Mature, but Firestore's query model and pricing (per-document reads) are hostile to feed/graph queries; Google Sign-in is slick. Not recommended in 2026 for a TS-first team. |
| **Custom Postgres + Hasura/tRPC** | Maximum control, maximum ops. Good v3 migration target if Convex's document model becomes the bottleneck for analytics/recommendations. |
| **Recommendation** | **Convex for the transactional/reactive core (chat, events, RSVPs, roles) + a nightly export to Postgres/ClickHouse (or PostHog warehouse) for the data graph, recommendations, and ads reporting.** This gets you reactive chat and a real analytical store without building two live systems. |

### 3.3 Supporting services

| Concern | Pick | Why |
|---|---|---|
| Auth / SSO | **Convex Auth or Clerk for v1** (Google + Microsoft OIDC + magic link + Apple); self-hosted SAML module in v2; WorkOS only if a university insists on SCIM | Per-connection SSO pricing ($75–125/campus/mo) is wrong for a free product with many campuses. |
| API layer | Convex functions (typed) for the app; **tRPC only if you keep a Node backend for integrations**; a public REST + webhooks surface (OpenAPI) for third parties | Third parties need REST, not tRPC. |
| ORM | Not needed with Convex; **Drizzle** for the Postgres analytics store | Drizzle is lighter than Prisma and SQL-transparent. |
| Workflows | **Inngest** (free 50k executions/mo, 5 concurrent; Pro from $99/mo for 1M) ([pricing](https://www.inngest.com/pricing)) or Convex's built-in scheduler/workflow component | Temporal is over-powered for a two-person team; use Inngest for integration syncs, retries, and fan-out; Convex scheduler for in-app timers. |
| Hosting | **Vercel** (Next.js) + Convex cloud; Cloudflare Workers for edge webhooks/ICS feeds; Fly.io/Railway only for stateful helpers (e.g., a Centrifugo node if you ever need it) | Minimize ops. |
| Email | **Resend** + React Email | See 1.10. |
| Analytics / product | **PostHog** (free 1M events/mo) | Also the event warehouse for the recommendation feed in v1. |
| Errors | **Sentry** (free dev tier; Expo integration) | — |
| Mobile CI/CD | **Expo EAS** Starter → Production | — |

### 3.4 Fork an open-source base or go greenfield?

| Base | Verdict |
|---|---|
| Rocket.Chat / Mattermost | No — license drift toward commercial tiers, heavy stacks (Meteor/Go), and their identity/permission models fight a club hub. |
| Zulip | No as a base; **yes as a design reference** (topics, digests, "recent conversations"). |
| Discourse | Great for async forums, but Ruby, and forums are not the core UX for students in 2026. |
| Twenty CRM | Interesting for the employer-recruiting CRM, but its data model is B2B sales; not worth the coupling. |
| Cal.com | Consider *embedding* (hosted) for officer office-hours booking rather than forking. |
| Formbricks | Solid open-source forms/surveys (AGPL); you could self-host it for v1 forms and embed — but a club-forms builder is a small feature and its data should live in your graph. Build it. |
| Documenso | Only if e-signatures (constitution amendments, waivers) become a real need; embed later. |
| Lago | Billing for *your* SaaS tiers, not club dues. Not needed while free. |
| **Verdict** | **Greenfield on Convex + Expo + Next.js.** Every fork candidate solves a slice while imposing an architecture. The hub's value is the shared data graph; forks fragment it. |

---

## 4. Being an integration hub

### 4.1 Patterns

1. **Webhooks out, first.** Every domain event (`event.created`, `rsvp.changed`, `member.joined`, `payment.succeeded`, `form.submitted`) is published to a signed webhook (HMAC-SHA256, replay-protected, with a retry schedule). This is how Zapier/Make/n8n users integrate without you writing anything.
2. **Triggers & actions à la Zapier.** Publish a Zapier integration (their platform is free for developers) exposing the same events plus actions (`create_event`, `send_announcement`, `add_member`). Same for Make. This is cheap distribution to the long tail of campus IT.
3. **Inbound "connectors" you own** (Google/Microsoft calendar, Discord, GroupMe, Instagram, Zoom). These need OAuth token vaults, refresh, and per-club config UIs.
4. **App marketplace / SDK (v3).** Model it like Slack (OAuth scopes + event subscriptions + Block Kit-style surfaces), Discord (bots + slash commands + Linked Roles), Notion (public OAuth integrations rate-limited per integration), and Canvas LTI (launch-based, institution-installed). Shopify's split of *public apps* (reviewed, multi-store) vs *custom apps* (single org, no review, no billing) ([distribution](https://shopify.dev/docs/apps/launch/distribution)) is the right shape: "campus apps" (installed by a university admin) vs "club apps" (installed by an officer for one club).

### 4.2 Unified APIs

| Vendor | Facts | Fit |
|---|---|---|
| **Nango** | Open-source, self-hostable; free 10 connections; $50/mo + **$0.29/connection/mo** + compute; 900+ APIs, pre-built syncs ([pricing](https://nango.dev/pricing)) | **Yes.** Use Nango for OAuth token management + syncs for the long tail (Notion, Airtable, HubSpot, Zoom, LinkedIn, Slack). It removes the token-vault problem and gives you a UI for connection debugging. |
| **Merge.dev** | Free for 3 linked accounts; $650/mo for 10, $65/account after; categories: HRIS, ATS, Accounting, CRM, File Storage, Ticketing ([pricing](https://www.merge.dev/pricing)) | Only for the employer-recruiting side (ATS push of candidates to Greenhouse/Lever) in v3. Its per-account pricing is wrong for club-scale. |
| **Composio / Paragon** | Composio is agent-tool-oriented (good for the AI officer assistant); Paragon is embedded-iPaaS with per-connection pricing similar to WorkOS. | Composio for AI tool-calling breadth in v2; skip Paragon. |

### 4.3 MCP as an integration surface

The MCP spec (current revision **2026-07-28**) defines JSON-RPC hosts/clients/servers with tools, resources, prompts, client-side elicitation, plus opt-in extensions for **Tasks** (long-running async), **Skills over MCP**, and **MCP Apps** (inline UI) ([spec](https://modelcontextprotocol.io/specification/latest)). Claude, ChatGPT, Cursor, and most agent frameworks are MCP clients. Two moves:

- **Ship an MCP server for the hub** (`list_my_clubs`, `create_event`, `draft_announcement`, `get_budget`, `export_roster`) with OAuth. Officers using Claude/ChatGPT can then run their club from their assistant; universities' AI pilots (many campuses now license Claude/ChatGPT Edu) can point at it. This is cheaper than a marketplace and is the 2026 "integration surface" story.
- **Consume MCP servers** in your officer assistant: Google Calendar, Canva, Notion, GitHub and Zoom all ship or have community MCP servers, and Nango exposes its integrations as MCP tools. Your agent gets breadth without bespoke code.

---

## 5. AI layer (Claude as provider)

Relevant Claude platform capabilities, at a high level (see the `claude-api` skill for current model IDs/pricing): tool use with strict schemas and parallel calls, the Files API and PDF/document input with citations, **prompt caching** (cache stable system prompts/tool lists; verify with `cache_read_input_tokens`), the **Message Batches API** (async, 50% cheaper) for nightly jobs, structured outputs via `output_config.format`, an MCP connector for server-side tool access, and server-side web search/fetch. Use Sonnet-tier for interactive drafting and Haiku-tier or Batches for bulk tagging.

| Feature | Value | Realism | Mechanics |
|---|---|---|---|
| Auto-draft announcements / event descriptions | High (officers hate writing) | v1 | Prompt-cached club style guide + past posts; structured output for title/body/CTA; one-click send to channels. |
| Meeting notes from Zoom | High for e-boards | v2 | Zoom cloud recording transcript webhook → Claude summary with action items → posts to the e-board channel; store as searchable doc. |
| Budget request generation | Medium-high (SGA funding forms are a chore) | v2 | Past spend (Stripe/HCB/CSV) + the university's funding rubric (PDF via Files API) → draft request; human edits. |
| Flyer generation | Medium | v2 (own renderer), v3 (Canva Autofill where licensed) | Claude writes copy + picks a template; HTML→PNG; optional Canva export. |
| "Ask the club" over docs | High for onboarding new members | v2 | RAG over club docs/messages with citations; Convex vector search + Claude with document citations. Respect channel permissions at retrieval time. |
| Agentic officer assistant | High, but risky | v3 | Tool Runner over your MCP server tools; every side-effecting tool (send, charge, publish) requires an explicit confirmation step. Batch API for weekly digests. |
| Auto-tagging skills/interests | Medium; feeds recommendations | v1 (cheap) | Batch classify club descriptions/events into a controlled taxonomy nightly; store on the graph. |
| Moderation triage | High (legal) | v1 | OpenAI Moderation/Hive for classification; Claude only for explaining flags to moderators. |

Guardrails: never let the model see DMs for features other than moderation without user consent; log every tool call; give universities a "no AI on our data" tenant switch — it will come up in security reviews.

---

## 6. Mobile distribution realities

- **UGC (Guideline 1.2):** filtering, reporting with timely response, blocking, and published contact info are mandatory; anonymous/random chat is removal-grade ([guidelines](https://developer.apple.com/app-store/review/guidelines/)). Build report/block into v1 DMs and channels; add a 24-hour moderation SLA on reports.
- **Payments (3.1.3(e)):** physical goods and services consumed outside the app — event tickets, real-world club memberships/dues — **must not** use in-app purchase; use Stripe/Apple Pay ([guidelines](https://developer.apple.com/app-store/review/guidelines/)). Confirmed. Keep any *digital* perk (e.g., a paid "pro officer" tier) out of the app or use IAP for it.
- **Login (4.8):** Sign in with Apple or equivalent required when offering social login, with an institutional-credential exemption; add Apple anyway. **Account deletion (5.1.1(v))** is mandatory in-app.
- **Age rating (2.3.6):** answer honestly; a chat/UGC app with unrestricted web access typically lands at 12+ or 17+. Apple's 2025 age-rating revamp added 13+/16+/18+ tiers; UGC and messaging questions drive the rating — expect 13+ minimum, and 17+ if you allow unfiltered links.
- **Google Play:** parallel UGC policy, plus Data Safety form and (for social apps) a moderation policy on file.
- **PWA:** ship as a companion, not the primary channel (push limitations above).

---

## 7. Security and compliance baseline

| Topic | Baseline |
|---|---|
| **SOC 2** | Type I ~3–4 months after launch via Vanta/Drata; Type II 6–12 months later. Universities rarely require SOC 2 for free, student-adopted tools, but they *will* when procurement/SSO/LTI enter the picture. Budget ~$15–30k/year all-in. |
| **FERPA** | Student-entered club data is not an "education record" held by the institution — until the institution provisions rosters or installs you via LTI. At that point you need a "school official" contract: perform an institutional function, be under the institution's **direct control**, use PII only for the disclosed purpose, and meet the annual-notice criteria ([ED FAQ](https://studentprivacy.ed.gov/frequently-asked-questions)). Directory information (name, email, activity participation) can be shared without consent only under the school's directory policy and opt-outs. Keep a template DPA ready. |
| **HECVAT** | The EDUCAUSE/Internet2/REN-ISAC Higher Education Community Vendor Assessment Toolkit (current major version 4; Lite and Full variants) is the de facto security questionnaire; completed HECVATs are shared via the Community Broker Index **[unverified — EDUCAUSE page 403'd]**. Fill the Lite version early; it doubles as your security policy skeleton. |
| **Accessibility (WCAG 2.1 AA; ADA Title II)** | DOJ's Title II rule sets WCAG 2.1 AA for state/local governments including public universities, and it explicitly covers third-party content and tools the entity provides or makes available (calendars, payment platforms, message boards — user posts excepted). **Deadline update:** an Interim Final Rule (April 20, 2026) moved compliance to **April 26, 2027** for entities ≥50,000 population and **April 26, 2028** for smaller ([ADA.gov](https://www.ada.gov/resources/2024-03-08-web-rule/)). Implication: any public university that *adopts* or links to you must be able to show WCAG 2.1 AA conformance. Build accessible from day one (React Native Accessibility API, semantic web, VPAT/ACR template). |
| **COPPA / minors** | Some first-years are 17. Do not collect DOB unnecessarily; set 16+ or 17+ age gate and note that Google Workspace for Education under-18 policies may block your OAuth app for those users. |
| **Data residency** | US-only hosting is fine for US campuses; add EU region only when an EU university asks (Convex and Vercel both support region selection). |
| **CSAM / abuse** | NCMEC registration, 1-year preservation, hash matching before image DMs (Section 2.2). |
| **Security questionnaire hygiene** | SSO everywhere internally, MFA, least-privilege Convex functions, audit log table, encryption at rest (default), secrets in the platform vault, quarterly access reviews, and a published vulnerability disclosure policy. |

---

## 8. Recommended stack and integration roadmap

### 8.1 Opinionated v1 stack

| Layer | Choice | Reasoning |
|---|---|---|
| Language | **TypeScript everywhere** | One team, one type system, generated Convex types flow to both clients. |
| Mobile | **Expo (SDK current) + Expo Router**, EAS Starter → Production | Best RN DX; OTA updates; free/cheap builds. |
| Web | **Next.js on Vercel** | SEO for public club/event/recruiting pages; shares `packages/*` with mobile. |
| Backend/DB/realtime | **Convex** | Reactive queries make chat, RSVPs and feeds "just update"; scheduler/cron/file storage/vector search built in; usage-based pricing that survives 1M MAU on a free product. |
| Analytics store | **Postgres (Neon/Supabase) + Drizzle**, nightly Convex export; **PostHog** for product events | Real SQL for the data graph, recommendations, ads reporting, and university dashboards. |
| Auth | **Google + Microsoft OIDC + magic-link .edu + Sign in with Apple** via Convex Auth or Clerk (Clerk if you want the UI kit) | Covers ~all students without SAML; Apple satisfies 4.8. |
| Workflows/integrations | **Inngest** + **Nango** (self-hosted or PAYG) | Durable retries and OAuth vault without building either. |
| Email / SMS / push | **Resend** / Twilio (later, after 10DLC) / Expo Push | Cheapest credible options. |
| Payments | **Stripe Connect (Express)**; Venmo/Zelle deep links | Only processor with per-club sub-accounts and a real onboarding flow. |
| Moderation | OpenAI Moderation (free) + Hive for images when UGC images ship; NCMEC registration | Legal baseline. |
| AI | Claude (Sonnet-tier interactive, Haiku/Batch for bulk), prompt caching, Files API, MCP server | See Section 5. |
| Observability | Sentry + PostHog + Convex logs | — |

### 8.2 Tiered integration roadmap

**v1 — must ship (first campus pilot)**
- ICS feeds (per user, per club) and "Add to Google/Apple/Outlook calendar" links
- Google Calendar two-way sync (sensitive scopes only), Google Sign-in, Microsoft Sign-in, Sign in with Apple, .edu magic link
- Stripe Connect Express for dues/tickets; Venmo/Zelle deep links + manual reconciliation
- QR check-in (rotating signed codes), Apple/Google Wallet event tickets (generic + event passes)
- Discord: announcement mirror + **Linked Roles**
- GroupMe: announcement mirror bot
- Instagram: "post this event" (image + caption) via Instagram Login, after Meta App Review
- Resend transactional email with DMARC; Expo push
- CSV importers (rosters from Engage/CampusGroups/Presence exports, Google Sheets)
- Public event/club calendar ingestion from campus RSS/ICS (25Live Publisher, Localist, engagement-platform feeds)
- Webhooks out + Zapier integration (cheap, enormous leverage)
- AI: announcement drafting; nightly auto-tagging; moderation triage

**v2 — once 3–5 campuses are live**
- Microsoft Graph calendar + Teams posts (needs publisher verification and admin consent playbook)
- Zoom (published Marketplace app) → recording/transcript → AI meeting notes
- Self-hosted SAML/Shibboleth + CAS modules; InCommon registration when the first R1 asks
- HCB read integration (budgets), PayPal/Venmo checkout button, Plaid bank feeds for treasurers
- Luma import/export; Notion/Airtable/GitHub links via Nango
- SMS reminders after 10DLC registration
- Public REST API + OAuth for third parties; MCP server for officers' AI assistants
- AI: "ask the club" RAG, budget-request drafts, own flyer renderer, LinkedIn share-as-officer

**v3 — top-down / platform**
- Canvas LTI 1.3 global-navigation tool with NRPS rosters (with FERPA school-official DPA + HECVAT + VPAT in hand)
- Campus room-booking (25Live/EMS/Astra) write APIs under institutional contracts
- App marketplace (campus apps vs club apps), Slack Marketplace listing, TikTok (post-audit), Canva Autofill for enterprise-licensed campuses
- Merge.dev ATS push for employer recruiting; WhatsApp utility notifications; NFC passes if Apple grants entitlement
- Agentic officer assistant with confirmation gates

### 8.3 Chat build-vs-buy call

**Build on Convex.** Chat is the product's spine; RSVP, polls, forms, payments and events must be native message blocks, and vendor pricing ($8k+/mo at 100k MAU, six figures at 1M) is incompatible with "free." Copy Zulip's channel/topic threading. If a two-person team can't afford six weeks, use Stream's Maker credit for a demo and migrate before the second campus.

### 8.4 SSO strategy

1. **v1:** Google and Microsoft OIDC with domain-hinted sign-in plus `.edu` magic link; Sign in with Apple. Zero admin involvement; covers most students. Maintain a domain→institution table and handle under-18 Google Education blocks with the magic-link fallback.
2. **v2:** Add a generic SAML SP (self-hosted library) and CAS. Register a publisher domain and Microsoft publisher verification now; write the "how to admin-consent our app" one-pager for campus IT.
3. **v3:** Join InCommon ($700 + $2,500/yr at your revenue level) when an R1 with Shibboleth signs; support R&S attributes and SIRTFI. Reserve WorkOS/Clerk enterprise connections for one-off campuses that demand SCIM, since per-connection fees don't scale to hundreds of schools.

---

### Source list (primary)

Google Calendar quota — https://developers.google.com/workspace/calendar/api/guides/quota · Google Workspace app access — https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data · Microsoft Graph throttling — https://learn.microsoft.com/en-us/graph/throttling-limits · Entra publisher verification — https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview · Slack changelog — https://docs.slack.dev/changelog · Slack rate limits — https://docs.slack.dev/apis/web-api/rate-limits · Discord linked roles — https://docs.discord.com/developers/tutorials/configuring-app-metadata-for-linked-roles · Discord rate limits — https://docs.discord.com/developers/topics/rate-limits · GroupMe API — https://dev.groupme.com/docs/v3 · WhatsApp pricing — https://developers.facebook.com/docs/whatsapp/pricing · Instagram publishing — https://developers.facebook.com/docs/instagram-platform/content-publishing · TikTok posting — https://developers.tiktok.com/doc/content-posting-api-get-started · LinkedIn Posts API — https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api · Zoom rate limits — https://developers.zoom.us/docs/api/rate-limits/ · Canvas LTI config — https://canvas.instructure.com/doc/api/file.lti_dev_key_config.html · Canvas throttling — https://canvas.instructure.com/doc/api/file.throttling.html · InCommon fees — https://incommon.org/federation/fees/ · Luma API — https://docs.luma.com/reference/getting-started-with-your-api · Stripe Connect pricing — https://stripe.com/connect/pricing · Plaid pricing — https://plaid.com/pricing/ · Notion limits — https://developers.notion.com/reference/request-limits · Canva Connect — https://www.canva.dev/docs/connect/ and https://www.canva.dev/docs/connect/llms.txt · Twilio 10DLC — https://www.twilio.com/docs/messaging/compliance/a2p-10dlc · Resend pricing — https://resend.com/pricing · Expo push — https://docs.expo.dev/push-notifications/overview/ · Expo pricing — https://expo.dev/pricing · Apple web push — https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers · Apple Wallet — https://developer.apple.com/documentation/walletpasses · Google Wallet — https://developers.google.com/wallet/generic · App Store guidelines — https://developer.apple.com/app-store/review/guidelines/ · Stream pricing — https://getstream.io/chat/pricing/ · Sendbird pricing — https://sendbird.com/pricing/chat · Ably pricing — https://ably.com/pricing · Supabase pricing — https://supabase.com/pricing · Convex pricing — https://www.convex.dev/pricing · Zulip plans — https://zulip.com/plans/ · Mattermost pricing — https://mattermost.com/pricing/ · Rocket.Chat pricing — https://www.rocket.chat/pricing · WorkOS pricing — https://workos.com/pricing · Clerk pricing — https://clerk.com/pricing · Inngest pricing — https://www.inngest.com/pricing · Nango pricing — https://nango.dev/pricing · Merge pricing — https://www.merge.dev/pricing · MCP spec — https://modelcontextprotocol.io/specification/latest · Shopify distribution — https://shopify.dev/docs/apps/launch/distribution · OpenAI moderation — https://developers.openai.com/api/docs/guides/moderation · Hive pricing — https://thehive.ai/pricing · 18 U.S.C. § 2258A — https://www.law.cornell.edu/uscode/text/18/2258A · FERPA FAQ — https://studentprivacy.ed.gov/frequently-asked-questions · ADA Title II rule — https://www.ada.gov/resources/2024-03-08-web-rule/
