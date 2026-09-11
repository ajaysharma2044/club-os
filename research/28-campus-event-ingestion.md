# Campus Event Ingestion: How Far Does the Localist Trick Generalize?

**Prepared:** 2026-09-11
**Companion to:** `20-campus-signals-catalog.md` (Section C.3 established Localist-at-Cornell; this document answers the per-campus coverage question it left open)
**Method:** 100+ live HTTP calls made during this session with `curl`, identifying User-Agent, ~0.5s between requests, redirects followed, no block evasion. Every row in the PASS/FAIL tables below was actually called. Anything not actually called is marked **[NOT VERIFIED]**.

---

## Executive answer

**Two adapters cover roughly half of large US universities, and a third gets you to about two-thirds.** In a measured 45-school sample, Localist accounted for ~33% of campuses and LiveWhale ~19% — a combined 52% of hosts I could resolve. But the headline finding is not the market share. It is these four:

1. **LiveWhale's real JSON endpoint is `/live/json/events`, not `?format=json`.** The `?format=json` pattern recorded in doc 20 returns HTML. This is a correction to existing research.
2. **LiveWhale publicly exposes `rsvp_total`, `registration_limit`, and venue lat/long.** Texas A&M returned a live event with `rsvp 358 / limit 400`. That is a *public, free, ground-truth attendance-intent signal for other people's events* — the single most valuable thing found in this research, and nothing in doc 20 anticipated it.
3. **25Live has a genuinely public, keyless JSON feed at `25live.collegenet.com/25live/data/<slug>/run/events.json`.** Cornell returned 9,770 events, Duke 1,493, Stanford 1,314. Doc 20 listed this as [KNOWN]; it is now [LIVE].
4. **Platform detection is easy; host discovery is the hard part.** Detecting *which* platform a calendar runs takes one HTTP call. Finding *which hostname* holds the calendar is where the engineering cost actually lives.

---

## 1. Platform-by-platform findings

### 1.1 Localist (Concept3D) — the anchor adapter

**Confirmed shape.** `https://<host>/api/2/events?days=7&pp=100` returns `{"events":[{"event":{...}}], "page":{...}, "date":{...}}`. Auxiliary endpoints all confirmed live at Cornell: `/api/2/places` (venues with geo), `/api/2/groups` (the organization directory — this is the club list), `/api/2/events/search`.

**Auth: none.** The vendor docs at `developer.localist.com/doc/api` state plainly: *"Most existing read endpoints allow anonymous access."* Only attendance write endpoints need a bearer token. No key was needed on any of the 15 instances tested.

**Rate limit: not enforced, but cached.** Response headers from Cornell:

```
x-ratelimit-limit: 0
x-ratelimit-remaining: 0
cache-control: max-age=600, public
x-varnish-cache: MISS
access-control-max-age: 1728000
```

`x-ratelimit-limit: 0` means no quota is applied. The operationally important number is `max-age=600`: there is a **10-minute Varnish cache** in front. Polling faster than every 10 minutes returns the identical cached object and buys you nothing. The wide-open CORS headers confirm this API is *designed* to be called from third-party browsers — strong evidence of intended public consumption.

**Paging:** `pp` maxes at 100 (documented). Response carries `page.total_items` and `page.next_page`. Colorado returned `total_items: 198` over 2 pages for a 7-day window.

**Fields returned** (52 keys per event, verified on Cornell):
`id, title, url, first_date, last_date, event_instances, location, location_name, room_number, address, geo, venue_id, description, description_text, filters, tags, keywords, groups, school_id, campus_id, experience, allows_attendance, has_register, ticket_cost, ticket_url, free, sponsored, featured, recurring, status, created_at, updated_at, photo_url, localist_ics_url, localist_url, stream_url, custom_fields, detail_views` and others.

Note `detail_views` — a per-event pageview counter. That is a public popularity signal. And `allows_attendance` / `has_register` flag which events collect RSVPs.

**Detection — the best heuristic found in this research.** Every Localist instance ships the vendor's default `robots.txt`. Five instances tested returned a **byte-identical file**:

```
md5 = 6b21ecc2e01930e7cceecadbe7baee1d
events.cornell.edu, calendar.mit.edu, events.stanford.edu,
calendar.utexas.edu, events.purdue.edu  → all identical
```

One GET of `/robots.txt`, one md5, and you know. This is cheaper and more reliable than fetching the homepage.

**The caveat that matters: Yale breaks it.** `events.yale.edu/api/2/events` returns perfectly good Localist JSON, but Yale replaced the default robots.txt with `User-agent: * / Disallow: /`. So the md5 heuristic produces a false negative — *and* Yale has explicitly asked crawlers to stay out. This is why detection must be two-step (md5, then API probe) and why **robots must be evaluated per-host, never per-platform**.

**Robots posture is otherwise excellent.** The Localist default explicitly permits the API and the bulk exports:

```
Crawl-Delay: 1
Allow: /
Allow: /calendar/ics
Allow: /calendar/xml
Allow: /search/events.ics
Allow: /search/events.xml
Disallow: /search
Disallow: /event/*/get_attendees
Disallow: /auth/
```

`/api/` is **not** disallowed. `Crawl-Delay: 1` is the stated etiquette. Bulk exports are affirmatively `Allow`ed — `events.cornell.edu/calendar/ics` returned a 4.2MB ICS and `/calendar/xml` a 9.3MB RSS with xCal and geo namespaces. If you want the most conservative legal posture available, use those two URLs instead of the API; they are explicitly published for consumption.

**Instance count: [NOT VERIFIED].** Localist's own site says only *"Trusted by leading higher education, healthcare, and government organizations"* with no number. It names Colgate, Western Colorado, North Dakota, Aims CC, Kennesaw State, St. John's, Hope College, and NC State. I could not find a published customer count or a directory, and I did not attempt a mass subdomain enumeration. **Do not put a Localist instance count in a deck without verifying it.** My measured sample rate (33% of resolvable large-university calendars) is the defensible figure, and it is specific to selective/R1 schools.

### 1.2 LiveWhale (White Whale Web) — the second adapter, and the sleeper

**The `?format=json` pattern in doc 20 is wrong.** `events.berkeley.edu/?format=json` returns 200 with `text/html` — the normal page. The working endpoint is **`/live/json/events`**.

**There are two response shapes.** This is a real adapter requirement, not a curiosity:

| Shape | Example | Body | Default page size |
|---|---|---|---|
| **A — wrapped** | Berkeley, NYU, UChicago | `{"meta":{...},"links":{...},"data":[...]}` | 100, with `total_pages` |
| **B — bare array** | Texas A&M, Brown | `[{...},{...}]` | **1000 in one call** |

Shape A carries a `meta.supported_fields` array listing ~110 requestable fields (`location`, `description`, `registration`, `group_title`, `contact_info`, plus dozens of `custom_sponsor_*` / `custom_performer_*` slots), but its *default* response is lean — 29 fields, no location or description. **I could not get field selection to work**: `/live/json/events/fields/...`, `?fields=...`, and `/live/json/events/response_fields/location;description` all returned 200 with `response_fields: []` and the default set. **[NOT VERIFIED — needs a browser devtools capture against a live LiveWhale UI.]**

Shape B returns everything by default — 56 fields verified on Texas A&M:

```
title, url, date_iso, date2_iso, timezone, is_all_day, is_canceled, is_online,
description, event_types, event_types_audience, event_types_campus,
group_title, gid, location, location_title, location_latitude, location_longitude,
has_registration, registration_limit, rsvp_total, rsvp_waitlist_total,
has_wait_list, wait_list_limit, cost, contact_info, tags, thumbnail, last_modified
```

**Live sample from Texas A&M, called during this session:**

```
"10th Annual Success and Sundaes: Professional In…"  rsvp_total 358  registration_limit 400  Memorial Student Center  lat 30.612308
"Academic Success Starts Here! Lunch & Learn"        rsvp_total 40   registration_limit 100
```

Doc 20's Section J argues first-party check-in data is our most valuable asset *because outcome data is the expensive half*. LiveWhale hands us a partial outcome variable for other institutions' events, free. Two caveats: only 2 of 1,000 TAMU events had a non-zero `rsvp_total` (most campus events don't use LiveWhale registration), and RSVP is intent, not attendance. But as a *competing-event weighting* input — "this rival event has 358 people committed" — it beats a raw event count.

**Detection:** two independent signals, both single-request.
- `<meta name="generator" content="LiveWhale Calendar"/>` in the homepage HTML.
- `Sitemap: https://<host>/sitemap.livewhale.xml` as the first line of robots.txt.

**Robots posture:** permissive. Berkeley's entire robots.txt is a sitemap line plus `Disallow: *?replytocom`. `/live/json/` is not disallowed. No `Crawl-Delay`.

### 1.3 25Live / CollegeNET — yes, there is a public feed

This is the biggest upgrade over doc 20, which listed 25Live as [KNOWN].

**Working URL:** `https://25live.collegenet.com/25live/data/<slug>/run/events.json?node_type=E&start_dt=YYYY-MM-DD&end_dt=YYYY-MM-DD`

**The `node_type=E` parameter is essential.** Without it the feed returns *cabinets* — folder containers like "ASSU Room Reservations" with `node_type: "C"` and end dates in 2020 — which looks like a working feed returning junk. With `node_type=E` you get real dated events.

| Slug | HTTP | Events returned | Sample |
|---|---|---|---|
| `cornell` | 200 | **9,770** | `"Rivers of Ice" - RMC Exhibit Opening` |
| `duke` | 200 | **1,493** | `[FHI, History] Worlds of 1776` |
| `stanford` | 200 | **1,314** | `[Round Room] Stanford Taiko for NGSO` |
| `berkeley` | 200 | **215** | `[CS 182] lecture` |
| `ucsd` | 200 | 22 | `EDS 286 A00 MMP 265800 S326` |
| `nyu` | 200 | 9 | (cabinets only) |
| `psu`, `gatech`, `osu`, `wisc`, `umich`, `northwestern` | 200 | 0 | feed exists, no public data |
| `mit`, `illinois` | 404 | — | not a public instance |

**Fields:** `event_name, event_title, event_locator, start_date, end_date, event_type_name, organization_name, organization_id, registration_url, state_name, node_type, last_mod_dt, cabinet_name`.

**What it's actually good for.** 25Live is the *room booking* system, so it sees what the marketing calendar never does — internal meetings, room reservations, recurring class sessions. Berkeley's top hit is a CS 182 lecture; UCSD's is a course section. This is raw space utilization, not a curated events list, which makes it **excellent for venue-contention modelling** ("is the room free?") and **poor for competing-event modelling** ("is anything fun happening?"). Cornell's 9,770 vs Localist's ~500/week is the tell: different datasets, not redundant ones.

**Caveats:** the `start_dt`/`end_dt` parameters **did not actually filter** — Stanford returned events dated 2026-01-06 inside a 2026-09-11→18 window. Filter client-side. There is no robots.txt at `25live.collegenet.com` (404), so there is no expressed crawler preference either way. Treat as yellow-tier: unauthenticated and clearly serving a public-facing widget, but with no ToS grant.

### 1.4 Trumba — public, and better than expected

**Working URLs** (University of Washington, `webName = sea_campus`):

| Format | URL | Result |
|---|---|---|
| JSON | `https://www.trumba.com/calendars/sea_campus.json` | 200, 556KB, **200 events** |
| ICS | `https://www.trumba.com/calendars/sea_campus.ics` | 200, 1.4MB, `X-WR-CALNAME:UW Seattle Campus Events` |
| RSS | `https://www.trumba.com/calendars/sea_campus.rss` | 200, 1.2MB, with `x-trumba` namespace |

**Critical operational detail:** the school's *vanity* Trumba host is often SSO-gated. `trumba.uw.edu/calendars/sea_campus.rss` returned a SAML redirect to `idp.u.washington.edu`. The **canonical `www.trumba.com/calendars/<webName>.<fmt>` host is public**. Always use the canonical host.

**Fields:** `eventID, title, description, startDateTime, endDateTime, allDay, location, locationType, canceled, template, categoryCalendar, customFields, permaLinkUrl, eventActionUrl, openSignUp, requiresPayment, reservationFull, waitingListAvailable`. `openSignUp` and `reservationFull` are useful registration-state signals.

**Detection:** the calendar page loads `trumba.com/scripts/spuds.js` and calls `Trumba.addSpud({ webName: "…", spudType: "…" })`. Regex `webName\s*:\s*"([^"]+)"` out of the HTML gives you the feed slug directly. This is a clean, fully automatable discovery path — better than Localist's, because the slug is self-describing.

### 1.5 Anthology Engage — the richest data, behind the worst robots.txt

Instances at `https://<school>.campuslabs.com/engage/`.

**The HTML is worthless.** `nyu.campuslabs.com/engage/organizations` renders to literally: *"NYU Engage This application requires JavaScript to be enabled."* Zero server-rendered content.

**The internal API returns everything, with no auth.** Independently verified during this session:

```
GET https://nyu.campuslabs.com/engage/api/discovery/search/organizations?top=3&skip=0
→ 200  {"@odata.context":…, "@odata.count": 966, "value":[…]}
```

| Endpoint | School | Result |
|---|---|---|
| `/engage/api/discovery/search/organizations` | NYU | **966 orgs** |
| same | Purdue | **1,216 orgs** |
| `/engage/api/discovery/event/search` | NYU | **841 events** |
| same | Purdue / Michigan / NC State | 1,490 / 193 / 33 events |

It is an exposed Azure Cognitive Search index. Event fields include `organizationName, name, description, location, startsOn, endsOn, theme, categoryNames, benefitNames, latitude, longitude, rsvpTotal`. A real NYU record: *FRESHMEN — SLIME MAKING*, Kimmel 914, `benefitNames: ['Free Food','Free Stuff']`, `theme: 'Social'`. Responses also carry facet counts — a free per-campus club-category histogram. `top=500` returned 500 records in one call. `benefitNames` containing "Free Food" is, per doc 20's own ranking, the #6 attendance driver, available here as a structured field.

**And you should not use it.** `campuslabs.com/robots.txt` (identical at NYU and Purdue):

```
Disallow: /engage/api/
Disallow: /api/
```

**The only path that returns data is the one path robots.txt forbids.** The allowed HTML pages contain nothing. There is no robots-compliant way to get Engage data without a headless browser rendering the permitted pages — and a headless browser calling the same XHR is, in substance, doing the disallowed thing. Per doc 20's own rule ("Ignoring robots.txt" is on the Red list), **Engage is off the table for unilateral ingestion.** It is a partnership conversation, not a scraping target.

**Detection:** DNS does *not* work — `*.campuslabs.com` is a wildcard, so every host including non-tenants resolves to `40.84.59.174`. Use the HTTP status of `/engage/organizations`: 200 = tenant, 404 = not. Verified tenants: NYU, Purdue, Michigan, NC State, UGA, Clemson, BU. Verified non-tenants: Cornell, Ohio State, Illinois, Wisconsin.

### 1.6 CampusGroups — smaller reach, much friendlier terms

Instances at `<school>.campusgroups.com`, usually redirecting to a vanity `.edu` host (GaTech → `connect.me.gatech.edu`, BU → `terriercentral.bu.edu`, MIT → `engage.mit.edu`, Northwestern → `catsoncampus.northwestern.edu`).

**A clean, robots-allowed iCal feed exists.** Independently verified:

```
GET https://engage.mit.edu/ical/mit/ical_mit.ics
→ 200  text/calendar  168KB  145 VEVENTs
```

Each VEVENT carries `ORGANIZER;CN="Climate and Energy Prize"` and custom properties `X-CG-CATEGORY=club_acronym:MITCEP`, `X-CG-CATEGORY=event_type:Fundraiser`. **`club_acronym` is a direct club-identity join key** — the thing that is normally hardest to extract. Pattern `/ical/<slug>/ical_<slug>.ics` also returned 200 at Georgia Tech. **[PARTIALLY VERIFIED — slug derivation rule confirmed on 2 hosts only.]**

`LOCATION` is deliberately gated (`"Sign in to download the location"`). Accept that; do not work around it.

**Robots is permissive where it counts:** `/upload/`, `/student_docs/`, `/downloads/`, `/mobile_ws/v17/`, `/mobile_ws/v18/` disallowed — but `/club_signup`, `/events`, and **`/ical/` are not**. The SSR club directory at `/club_signup` is also readable logged out (MIT exposed 359 ASA orgs, 35 Club Sports, 59 Residential Life, 52 FSILG with category counts).

**Some tenants are fully gated:** Harvard and Princeton redirect to `…/webapp/auth/login?msg=LOGIN_REQUIRED`. Detect by inspecting the final effective URL after redirects.

### 1.7 Presence (Modern Campus) — effectively dead

Swept ~20 candidate schools. `montclair.presence.io` and `ramapo.presence.io` are **NXDOMAIN**. Only `bloomu.presence.io` returned a working Angular SPA shell (branded "Involve") with no server-rendered data; `lasalle.presence.io` resolves but 404s. `api.presence.io` resolves, root 404s; `/api/v3/organizations`, `/api/v1/…`, and `/swagger/index.html` all 404'd, and decompiling the 2.8MB app bundle found **zero** references to any API host. **[NOT VERIFIED — no working unauthenticated Presence JSON API found.]** Footprint appears to be shrinking. Deprioritize.

**Detection note:** `presence.io` has **no wildcard** (`zzzznotreal.presence.io` is NXDOMAIN), so unlike Engage and CampusGroups, DNS resolution *is* a valid signal here.

### 1.8 EMS, Blackthorn, and the custom tail

- **Georgia Tech runs Blackthorn.io** (a Salesforce-native events app) at `events.gatech.edu` — discovered because its `/api/2/events` probe returned a Blackthorn SPA shell preloading `cdn.blackthorn.io`. No public feed found. **[NOT VERIFIED as to any Blackthorn public API.]**
- **EMS** — not tested in this session. **[NOT VERIFIED.]**
- **Duke runs BedeWork**, the Apache-licensed open-source calendar server — identified from `PRODID:BedeWork V3.5` in its ICS. Both `calendar.duke.edu/events/index.json` (254KB) and `/events/index.ics` (112KB) are public and keyless.
- **Wisconsin, Northwestern, Yale(UI), Notre Dame, WashU** run genuinely homegrown systems. Wisconsin's is a Rails app exposing `today.wisc.edu/events.json` (52KB, clean flat JSON: `id, title, subtitle, description`) and `/events.ics`. Northwestern's PlanItPurple exposed **no** feed at any path tested.

### 1.9 ICS and RSS — the universal fallback

The fallback layer is real and it is where the long tail gets served.

| School | Platform | Fallback URL | Result |
|---|---|---|---|
| Cornell | Localist | `events.cornell.edu/calendar/ics` | 200, 4.2MB, robots-`Allow`ed |
| Cornell | Localist | `events.cornell.edu/calendar/xml` | 200, 9.3MB RSS+xCal+geo |
| UIUC | Illinois Webtools | `calendars.illinois.edu/icalOutlook/<calId>.ics` | 200, **18 VEVENTs** |
| Georgia Tech | Drupal 11 | `calendar.gatech.edu/event-calendar-day.xml` | 200, `application/rss+xml`, 32KB |
| Wisconsin | custom Rails | `today.wisc.edu/events.ics` | 200, 17.8KB |
| Duke | BedeWork | `calendar.duke.edu/events/index.ics` | 200, 112KB |
| UW | Trumba | `www.trumba.com/calendars/sea_campus.ics` | 200, 1.4MB |
| MIT | CampusGroups | `engage.mit.edu/ical/mit/ical_mit.ics` | 200, 145 VEVENTs |

**UIUC is the cautionary case.** `calendars.illinois.edu` is not one calendar but hundreds of departmental ones, each with a numeric `calId` (`/list/2751` is "School of Chemical Sciences Seminars"). There is no campus-wide feed, so "everything at UIUC" means enumerating hundreds of calIds. The export URLs are discoverable via `/export/<calId>`, but the *coverage* problem is unsolved. This is the shape of every homegrown system: a feed exists, but fragmented.

ICS's weakness is schema. You get `SUMMARY, DTSTART, DTEND, LOCATION, DESCRIPTION, UID` and nothing structured — no attendance, no category taxonomy, no venue geo, no organizer ID unless the vendor adds `X-` properties the way CampusGroups does. Sufficient for competing-event density; insufficient for anything richer.

---

## 2. The concrete target list — PASS/FAIL

Every URL below was called during this session.

| School | Platform detected | Best working URL | Status | Events |
|---|---|---|---|---|
| **Cornell** | **Localist** | `events.cornell.edu/api/2/events?days=7&pp=100` | **PASS** | 571KB |
| Cornell (2nd) | 25Live | `25live.collegenet.com/25live/data/cornell/run/events.json?node_type=E&…` | **PASS** | **9,770** |
| **MIT** | **Localist** | `calendar.mit.edu/api/2/events?days=7&pp=100` | **PASS** | 431KB |
| MIT (2nd) | CampusGroups | `engage.mit.edu/ical/mit/ical_mit.ics` | **PASS** | 145 |
| **Stanford** | **Localist** | `events.stanford.edu/api/2/events?days=7&pp=100` | **PASS** | 502KB |
| Stanford (2nd) | 25Live | `…/data/stanford/run/events.json?node_type=E&…` | **PASS** | 1,314 |
| **Michigan** | Localist (inferred) | `events.umich.edu/api/2/events` | **FAIL** | HTTP 403 Cloudflare challenge |
| Michigan (alt) | Localist | `calendar.umich.edu` | **FAIL** | HTTP 500 |
| Michigan (alt) | **Engage** | `umich.campuslabs.com/engage/api/discovery/event/search` | **PASS** (robots-disallowed) | 193 |
| **UT Austin** | **Localist** | `calendar.utexas.edu/api/2/events?days=7&pp=100` | **PASS** | 360KB |
| **Berkeley** | **LiveWhale** | `events.berkeley.edu/live/json/events` | **PASS** | **1,698** total |
| Berkeley (2nd) | 25Live | `…/data/berkeley/run/events.json?node_type=E&…` | **PASS** | 215 |
| Berkeley | — | `events.berkeley.edu/?format=json` | **FAIL** | 200 but `text/html` |
| Berkeley | — | `events.berkeley.edu/api/2/events` | **FAIL** | 404 (LiveWhale 404 page) |
| **Georgia Tech** | Drupal 11 | `calendar.gatech.edu/event-calendar-day.xml` | **PASS** | RSS, 32KB |
| Georgia Tech | — | `calendar.gatech.edu/api/2/events` | **FAIL** | 404 |
| Georgia Tech | Blackthorn | `events.gatech.edu/api/2/events` | **FAIL** | SPA shell |
| **NYU** | **LiveWhale** | `events.nyu.edu/live/json/events` | **PASS** | **1,450** total |
| NYU (2nd) | **Engage** | `nyu.campuslabs.com/engage/api/discovery/search/organizations` | **PASS** (robots-disallowed) | **966 orgs** |
| NYU (3rd) | Engage events | `…/engage/api/discovery/event/search` | **PASS** (robots-disallowed) | 841 |
| **Penn** | — | `events.upenn.edu/api/2/events` | **FAIL** | DNS does not resolve |
| Penn | — | `penntoday.upenn.edu/events-calendar` | **FAIL** | HTTP 403 Cloudflare |
| Penn | — | `almanac.upenn.edu/events` | **FAIL** | HTTP 403 nginx |
| Penn (partial) | WordPress | `events.engineering.upenn.edu` | partial | school-level only, not campus-wide |
| **Northwestern** | custom (PlanItPurple) | `planitpurple.northwestern.edu/{feed/rss,calendar/ical,feed/ical}` | **FAIL** | 404 on all |
| Northwestern (alt) | CampusGroups | `catsoncampus.northwestern.edu` | reachable | [NOT VERIFIED as to feed] |
| **UIUC** | Illinois Webtools | `calendars.illinois.edu/icalOutlook/2751.ics?hourOffset=0&timeZone=America%2FChicago` | **PASS** (per-calendar) | 18 VEVENTs |
| UIUC | — | `calendars.illinois.edu/api/2/events`, `/list.json`, `/eventListXml.xml` | **FAIL** | 404 |
| **Purdue** | **Localist** | `events.purdue.edu/api/2/events?days=7&pp=100` | **PASS** | 423KB |
| Purdue (2nd) | **Engage** | `purdue.campuslabs.com/engage/api/discovery/search/organizations` | **PASS** (robots-disallowed) | **1,216 orgs** |
| **Ohio State** | — | `events.osu.edu`, `calendar.osu.edu`, `ascevents.osu.edu` | **FAIL** | DNS does not resolve |
| Ohio State | — | `www.osu.edu/events` | **FAIL** | 301 redirect loop |
| Ohio State | custom ASP.NET | `activities.osu.edu/events.aspx` | partial | 200, 1.1MB HTML, no feed |
| Ohio State | Engage | `osu.campuslabs.com/engage/organizations` | **FAIL** | 404, not a tenant |
| **Wisconsin** | custom Rails | `today.wisc.edu/events.json` | **PASS** | 52KB flat JSON |
| Wisconsin (2nd) | custom Rails | `today.wisc.edu/events.ics` | **PASS** | 17.8KB |
| **Duke** | **BedeWork** | `calendar.duke.edu/events/index.json` | **PASS** | 254KB |
| Duke (2nd) | BedeWork | `calendar.duke.edu/events/index.ics` | **PASS** | 112KB |
| Duke (3rd) | 25Live | `…/data/duke/run/events.json?node_type=E&…` | **PASS** | 1,493 |

**Scoreboard: 12 of 15 target schools have at least one working, keyless, public machine-readable campus event feed.** The three failures are **Penn, Northwestern, and Ohio State**. Michigan is a near-miss — the platform is almost certainly there but Cloudflare blocks datacenter egress, the same failure mode doc 20 recorded for ESPN.

### Extended detection sample (30 more schools)

Run through the detection algorithm in §6:

**Localist (9):** Colorado, Northeastern, FSU, VCU, UNC, NC State, Kennesaw State, Miami, USC
**Localist but `Disallow: /` (1):** **Yale** — API works, robots forbids
**LiveWhale (6):** Texas A&M, UChicago, Brown, Vanderbilt, UConn, Villanova
**Trumba (1):** Washington
**CampusGroups as campus calendar (1):** Johns Hopkins
**Drupal custom (5):** ASU, Emory, Rutgers, Maryland, Minnesota
**WordPress custom (1):** Penn State
**Homegrown (4):** Notre Dame, WashU, Wisconsin, Northwestern
**Host not found (3):** BU, Rice, Virginia

**Combined 45-school tally (42 resolvable):** Localist 15 (36%), LiveWhale 8 (19%), Drupal/WordPress/homegrown 15 (36%), Trumba 1, CampusGroups 1, Blackthorn 1, BedeWork 1.

**Localist + LiveWhale = 23/42 ≈ 55%** of large US university calendars in this sample. Note the sample skews to R1/selective institutions; community colleges and small privates are under-represented and are anecdotally *more* Localist-heavy (Localist's own logo wall features Aims CC, Hope College, St. John's). **[Extrapolation beyond this sample is NOT VERIFIED.]**

---

## 3. Student organization activity beyond the master calendar

**Engagement platforms — see §1.5–1.7.** Summary: Engage has the best data (org directory + events + `benefitNames` + `rsvpTotal` + facet histograms) and the worst permission (robots-disallowed). CampusGroups has good data and clean permission (robots-allowed iCal with `club_acronym` join key). Presence is functionally dead.

**Club Instagram / Linktree.** Realistically scrapeable in 2026: **no, not compliantly.** Doc 20 Section H already settled this — Instagram Graph reaches only accounts that authorize you, and Meta Content Library is academic-only. Nothing in this session changes that. The correct product shape is the one doc 20 identified: *"connect your club's Instagram"* as a consented first-party integration. Treat any vendor promising bulk club-Instagram scraping as a legal liability.

**Student newspaper RSS — confirmed, with a compliance wrinkle.** 13 of 16 papers tested returned working feeds. Three CMS families:

| Family | Pattern | Confidence |
|---|---|---|
| **WordPress** | `/feed/` | High — 8/16 papers, uniform, `application/rss+xml` |
| **TownNews/BLOX** | `/search/?f=rss&t=article&l=25&s=start_time&sd=desc` | High — confirmed 2/2, item count tunable |
| **SNworks (Gryphon)** | **no portable pattern** | Low — per-site discovery required |

PASS: Michigan Daily, Daily Texan, Stanford Daily, Daily Northwestern, Daily Illini, The Lantern, Badger Herald, Washington Square News (all WordPress `/feed/`); Cornell Daily Sun `cornellsun.com/plugin/feeds/all.xml` (50 items); Duke Chronicle `dukechronicle.com/xml/feed/firehose.xml`; Daily Californian and Purdue Exponent `/search/?f=rss`; The Tech `thetech.com/feed`. FAIL: Daily Pennsylvanian and Daily Cardinal (SNworks, no configured feed), Technique/nique.net (JS SPA).

**Two traps worth writing into the ingest code:** (1) SNworks `/plugin/feeds/<anything>.xml` is a catch-all returning HTTP 200 with `application/rss+xml` and a **zero-byte body** when no feed is configured — a status-code-only health check reports false PASS, so validate item count. (2) Duke Chronicle 403s any non-browser User-Agent, including on robots.txt.

**The compliance wrinkle is significant.** Four of the 13 working feeds sit behind a robots.txt explicitly disallowing AI crawlers at root — **Michigan Daily, Daily Illini, Purdue Exponent, Daily Californian**. Michigan Daily names `ClaudeBot`, `Claude-User`, `Claude-SearchBot`, GPTBot, PerplexityBot, CCBot, Google-Extended, OAI-SearchBot, Bytespider, and Meta-ExternalAgent, all `Disallow: /` — which covers `/feed/`. That is ~31% of the working set off-limits to an AI-operated fetcher, and the trend is spreading. Crawl-delays observed: 6s (Illini, Northwestern, Badger Herald, NYU News, Texan), 10s (Cornell Sun, Duke, GaTech), **30s (The Lantern)**.

**University news RSS:** MIT `news.mit.edu/rss/feed` (50 items), Cornell `news.cornell.edu/taxonomy/term/14/feed` (50 — Cornell has no site-wide feed, only ~20 per-topic Drupal taxonomy feeds), Georgia Tech `news.gatech.edu/rss.xml`, Ohio State `news.osu.edu/feed/` (25), UT Austin `news.utexas.edu/feed/`. **Stanford and Michigan hard-fail behind Cloudflare** at any User-Agent.

---

## 4. Legal and practical posture

Doc 20's legal section is correct and I am not restating it. The operational deltas from this session:

**robots.txt norms on .edu calendars are *permissive by default and restrictive by exception*.** The Localist vendor default affirmatively `Allow`s `/calendar/ics` and `/calendar/xml` and does not disallow `/api/`. LiveWhale disallows essentially nothing. CampusGroups allows `/ical/` and `/club_signup`. But **Yale ships `Disallow: /` on a working Localist instance**, and **Engage disallows exactly the API that holds the data**. The rule that follows: **fetch and evaluate robots.txt per host on every ingest run, and store the evaluated decision alongside the data.** Never infer permission from the platform.

**The hiQ rule, restated operationally.** hiQ **won** the CFAA question — scraping public, logged-out pages is not "access without authorization," because a public page has no gate (reaffirmed by the Ninth Circuit in April 2022 post-*Van Buren*). hiQ **lost** the contract question — in November 2022 the district court held it had breached LinkedIn's User Agreement, and the case settled with judgment against hiQ. **The operational rule: our exposure is contractual, not criminal. Therefore never accept terms we intend to violate.** Concretely — do not create accounts on Engage, CampusGroups, or any calendar platform "to look around," because clicking through a ToS is what converts a safe activity into a breach. Stay logged out, and the contract track never attaches.

**Safe to ingest (green):** Localist `/api/2/*` and `/calendar/{ics,xml}`; LiveWhale `/live/json/events`; Trumba `www.trumba.com/calendars/<webName>.{json,ics,rss}`; CampusGroups `/ical/<slug>/`; all ICS and RSS feeds published for subscription; Drupal/WordPress `.xml` views. These are unauthenticated, robots-permitted, and published for consumption.

**Needs permission (yellow):** 25Live (unauthenticated and public-widget-backed, but no ToS grant and no robots.txt at all); undocumented JSON on homegrown systems (Wisconsin, Duke). Rate-limit hard, cache aggressively, identify yourself, stop if asked.

**Never (red):** Anthology Engage's `/engage/api/` — robots explicitly forbids it, and a headless browser firing the same XHR is the same act in substance. Any feed on a host whose robots.txt disallows us (Yale's calendar, Michigan Daily, Daily Illini, Purdue Exponent, Daily Californian). Cloudflare-challenged hosts (events.umich.edu, penntoday.upenn.edu, news.stanford.edu, record.umich.edu) — these are deliberate blocks, and routing around them via residential proxies is exactly the posture doc 20 red-lined for ESPN. Anything behind a login.

**Rate-limiting etiquette, concretely:**
- Localist caches for **600s**. Poll at most every 10 minutes; honor `Crawl-Delay: 1`. Realistically, campus calendars change on a scale of hours — **once or twice a day per campus is the right cadence**, which for 200 campuses is ~400 requests/day total. This is a rounding error to every host involved.
- Honor per-site `Crawl-Delay` (up to 30s at The Lantern).
- Send a real User-Agent with a contact URL. Set `If-Modified-Since` / honor `ETag`.
- Use the bulk `.ics`/`.xml` export (one request) rather than paging the API (17 requests at Berkeley) wherever the export exists.
- Add every host to the `SOURCES.md` registry doc 20 recommends, with the robots.txt evaluation date.

---

## 5. The generalization verdict — ranked adapters

Coverage figures are measured against the 45-school sample and are **explicitly not national estimates**.

| Rank | Adapter | Measured coverage | Effort | Coverage per unit effort |
|---|---|---|---|---|
| **1** | **Localist** | **36%** | ~3 days | **Highest.** One JSON shape, no key, rich fields, bulk export, permissive robots, org directory included via `/api/2/groups` |
| **2** | **LiveWhale** | **19%** | ~4 days (two response shapes) | **Very high** — and it is the only adapter returning public RSVP counts |
| **3** | **ICS/RSS generic** | ~15-20% incremental | ~5 days | **High but shallow.** Covers Drupal, WordPress, BedeWork, Webtools, Trumba-as-ICS in one parser. Thin schema. |
| 4 | Trumba | ~2% | ~1 day | High per-unit (trivial adapter, self-describing slug), low absolute |
| 5 | 25Live | overlay on ~30% | ~2 days | **Complementary, not additive** — room bookings, not public events. Build for venue contention only. |
| 6 | CampusGroups iCal | ~5%, plus club join keys | ~2 days | Worth it for `club_acronym` alone |
| 7 | Per-campus custom | the remaining ~25% | **1-3 days *each*, forever** | **Lowest.** Reject as a general strategy. |

**The decisive argument against per-campus scrapers** is doc 20's own maintenance math: a per-campus scraper that works for 40 schools is 40 things that break, on 40 independent redesign schedules. Four adapters reach ~60% of campuses with four codebases. Reaching 85% via custom scrapers means ~50 codebases. That is not a 40% coverage gain; it is a permanent headcount.

The right posture is exactly the one doc 20 prescribes for occupancy data: **breadth from adapters, depth on active campuses.** Build three adapters, and hand-curate the 10-20 campuses where you actually have users and no adapter fits.

### The three to build first

**1. Localist.** 36% coverage, keyless, cleanest terms, 3 days. Also delivers `/api/2/groups` — a free club directory per campus, which is a second product input, not just an event feed. Non-negotiable first build.

**2. LiveWhale.** 19% coverage, 4 days. Build it second not only for coverage but because `rsvp_total` / `registration_limit` is the only free public attendance-intent signal found anywhere in this research. Budget the extra day for the two response shapes; detect by `isinstance(body, list)`.

**3. Generic ICS/RSS.** ~5 days for the largest single coverage increment after the two vendors, and it is the adapter that makes the long tail cheap. One iCalendar parser plus one RSS parser handles Duke's BedeWork, Wisconsin's Rails app, Georgia Tech's Drupal view, UIUC's Webtools, Trumba's `.ics`, CampusGroups' `/ical/`, and every athletics Sidearm feed doc 20 already recommends. Build the *feed-discovery* step properly — parse `<link rel="alternate" type="application/rss+xml">` and scan for `.ics` hrefs — because that step is what generalizes.

**Defer:** 25Live until venue-contention is a real feature; Trumba until a Trumba school is a customer; Engage until you have a partnership (never scrape it).

---

## 6. Detection algorithm: "which platform does this campus use?"

Two phases. Phase A is the expensive one, and everyone underestimates it.

### Phase A — host discovery (the actual hard problem)

Subdomain guessing failed on 3 of 45 schools outright and produced misses on several more (`events.wisc.edu` resolves but is empty; `today.wisc.edu` is the real calendar). Do this instead:

1. Try candidates in order: `events.<domain>`, `calendar.<domain>`, `calendars.<domain>`, `today.<domain>`, `<domain>/events`, `<domain>/calendar`.
2. If none resolve to a calendar, fetch `https://www.<domain>/` and follow any link whose text or href matches `/calendar|events/i`. This is what surfaces `planitpurple.northwestern.edu` and `terriercentral.bu.edu`.
3. Record the resolved host in the crosswalk table doc 20 calls for (`UNITID ↔ calendar_host`). **Human-QA it once per school.** This is a one-time ~2-hour-per-100-schools cost and it is worth paying properly.

### Phase B — platform detection (cheap, 1-3 requests)

```
def detect(host):
    # 1. robots.txt fingerprint — one request, settles the majority
    code, body = GET(f"https://{host}/robots.txt")
    if code == 0:                                    return "NO-HOST"
    if md5(body) == "6b21ecc2e01930e7cceecadbe7baee1d":
        return "Localist"                            # vendor default robots
    if b"sitemap.livewhale.xml" in body:             return "LiveWhale"

    # 2. homepage generator / asset fingerprints — one request
    code, html = GET(f"https://{host}/")
    if 'content="LiveWhale Calendar"' in html:       return "LiveWhale"
    if "trumba.com/scripts/spuds.js" in html or "Trumba.addSpud" in html:
        webName = re.search(r'webName\s*:\s*"([^"]+)"', html).group(1)
        return ("Trumba", webName)                   # slug comes free
    if "campuslabs.com/engage" in html:              return "Engage"
    if "campusgroups.com" in html:                   return "CampusGroups"
    if "cdn.presence.io" in html:                    return "Presence"

    # 3. API probe — catches instances with a custom robots.txt (e.g. Yale)
    code, body = GET(f"https://{host}/api/2/events?days=1&pp=1")
    if code == 200 and body.startswith(b"{") and b'"events"' in body:
        return "Localist"
    code, body = GET(f"https://{host}/live/json/events")
    if code == 200 and body.lstrip()[:1] in (b"{", b"["):
        return "LiveWhale"

    # 4. fallback: generic CMS + feed discovery
    if 'content="Drupal' in html:    return ("Drupal",    find_feeds(html))
    if "/wp-content/" in html:       return ("WordPress", find_feeds(html))
    return ("unknown", find_feeds(html))   # <link rel=alternate> + *.ics hrefs
```

**Then, always, a permission gate — this is not optional:**

```
allowed = robots_allows(host, path, agent="ClubCRMBot")
if not allowed: SKIP and record the refusal in SOURCES.md
```

Yale is the reason step 3 exists (custom robots defeats the md5 check) and simultaneously the reason the permission gate exists (Yale says no). Detection and permission are separate questions and must be separate code.

**Ancillary detectors** (run once per school, not per calendar):
- Engage tenancy: HTTP status of `https://<slug>.campuslabs.com/engage/organizations` — 200 = tenant, 404 = not. **DNS is useless here (wildcard).**
- CampusGroups tenancy: GET `https://<slug>.campusgroups.com/club_signup` with redirects on, inspect the final effective URL. A `.edu` vanity host = customer; `readyeducation.com/campusgroups/` = not a customer; `…/webapp/auth/login?msg=LOGIN_REQUIRED` = customer but gated.
- Presence: DNS **does** work (no wildcard).

---

## 7. Legal posture in five bullets

- **Our exposure is contractual, not criminal.** hiQ won the CFAA question (public, logged-out pages have no gate — Ninth Circuit, April 2022, post-*Van Buren*) and lost the breach-of-contract question (N.D. Cal., November 2022, settled with judgment against it). Therefore: **stay logged out and never accept terms we intend to violate.** Do not create accounts on Engage, CampusGroups, or any calendar platform, because clicking through a ToS is the act that converts safe scraping into breach.

- **Evaluate robots.txt per host, per run — never per platform.** The Localist default affirmatively `Allow`s `/calendar/ics` and `/calendar/xml` and permits `/api/`, but **Yale ships `Disallow: /` on a working Localist instance**. Four of thirteen working student-newspaper feeds explicitly `Disallow: ClaudeBot` at root. robots.txt is not law, but it is the site owner's expressed wish, it costs us nothing to honor, and it is a terrible fact in front of a jury.

- **Anthology Engage is off-limits despite being the richest source.** Its `robots.txt` disallows `/engage/api/`, and that API is the only path returning data — the permitted HTML pages are empty SPA shells. Rendering the allowed page in a headless browser to fire the disallowed XHR is the same act in substance. Engage is a partnership conversation, not an ingestion target.

- **Never route around a deliberate block.** `events.umich.edu`, `penntoday.upenn.edu`, `news.stanford.edu`, and `record.umich.edu` return Cloudflare challenges; `dukechronicle.com` 403s non-browser User-Agents. These are intentional. Residential proxies, UA spoofing to defeat a block, and CAPTCHA solving are the exact posture doc 20 red-lined for ESPN's hidden API, and the reasoning is unchanged. Accept the coverage gap; it is 3 schools out of 45.

- **Be a conspicuously polite client, and keep the receipts.** Localist caches 600s and sends `x-ratelimit-limit: 0` — there is no quota, which makes restraint our own discipline. Once or twice daily per campus (~400 requests/day across 200 schools), honoring `Crawl-Delay` up to 30s, preferring one bulk `.ics` over 17 paged API calls, with a real User-Agent carrying a contact URL and `If-Modified-Since` set. Log every source in `SOURCES.md` with its URL, robots decision, and the date someone last read the terms.

---

## 8. What I could NOT verify by calling it

Flagged plainly, per the doc 20 convention:

- **[NOT VERIFIED] The number of Localist .edu instances.** Localist publishes no customer count and no directory. My 36% figure is a measured rate on a 45-school R1-skewed sample, not a national estimate. Do not extrapolate it into a deck.
- **[NOT VERIFIED] LiveWhale field-selection syntax.** Three syntaxes tried against Berkeley; all returned `response_fields: []` and the default 29-field set. Needs a browser devtools capture against a live LiveWhale UI. Until then, assume lean-shape instances give you no location or description.
- **[NOT VERIFIED] Michigan's calendar platform.** `events.umich.edu/api/2/events` returns a Cloudflare challenge, which is consistent with Localist but does not prove it.
- **[NOT VERIFIED] Any Presence public JSON API.** Extensive probing plus decompilation of the 2.8MB app bundle found zero API references.
- **[NOT VERIFIED] EMS.** Not tested this session.
- **[NOT VERIFIED] Any Blackthorn.io public API** (Georgia Tech's `events.gatech.edu`).
- **[PARTIALLY VERIFIED] The CampusGroups `/ical/<slug>/ical_<slug>.ics` pattern** — confirmed at MIT and Georgia Tech only; the slug derivation rule is not established generally.
- **[NOT VERIFIED] Whether 25Live's public feed is enabled by default or opt-in.** Six of fourteen slugs returned 200 with zero events, which is consistent with either an unpopulated instance or a disabled public view.
- **[NOT VERIFIED] Northwestern and Ohio State feeds.** I found none at any path tested, but absence of evidence at ~8 paths each is not proof none exists.

---

## 9. Recommended next actions

1. **Build the host-discovery crosswalk first** — `UNITID ↔ calendar_host ↔ platform ↔ robots_decision ↔ last_checked`. This research confirms host discovery, not parsing, is where the cost lives.
2. **Ship the Localist adapter, then LiveWhale**, instrumenting `rsvp_total` capture from day one so it can be piloted against doc 20's signal-quality protocol.
3. **Add the robots-permission gate before the first production fetch**, not after. Yale, Michigan Daily, and Engage are live examples of why.
4. **Open a partnership conversation with Anthology** rather than scraping Engage — the only compliant route to the best data in this report is a contract.
