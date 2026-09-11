# The Campus Signals Catalog
## An exhaustive, practical inventory of data sources about US college campuses and student behavior

**Prepared:** 2026-09-10
**For:** A free "operating system" for college clubs with a quant engine underneath
**Thesis:** The founder's model — winter inbound flights to Minneapolis predict restaurant demand, so you target pizza ads at arriving travelers — generalizes to campus. A campus is a closed, highly-instrumented, calendar-driven population whose behavior is *unusually* predictable from exogenous signals. The academic calendar alone explains more variance in student behavior than almost any signal in consumer analytics. Our job is to assemble the library.

---

## How to read this catalog

Every row carries a **verification status**:

| Mark | Meaning |
|---|---|
| **[LIVE]** | I called the actual endpoint during this research and got real data back. Response excerpt confirmed. |
| **[DOC]** | I fetched the official documentation page and confirmed the terms described. |
| **[KNOWN]** | Well-established from prior knowledge; endpoint not exercised in this session (often because the host blocks datacenter IPs). Treat as high-confidence but re-verify before building. |
| **[UNVERIFIED]** | Reported but not confirmed here. Pricing especially — vendor pricing changes constantly and most "contact sales" vendors do not publish. Do not put these in a budget without a quote. |

**Priority** is scored P0 (wire up now, high value / low cost), P1 (quarter 1-2), P2 (nice to have / later), P3 (probably never, listed for completeness).

A note on honesty about cost: many commercial vendors in sections F and G do not publish pricing. Where I could not verify a dollar figure I say so rather than inventing one. Several widely-cited figures for Placer.ai, CoStar, and Lightcast circulate in blog posts; I have flagged them as unverified because I could not confirm them against a primary source in this session.

---

# SECTION A — Official government and institutional data

This is the bedrock layer. It is free, it is authoritative, it is slow, and it tells you the *size and shape* of every market you will ever sell into. It does not tell you what happened this week. Use it for denominators, priors, and targeting — never for nowcasting.

## A.1 The core federal datasets

| Signal | Source | Access method + URL | Cost | Cadence | Granularity | Legal | Predicts | Pri |
|---|---|---|---|---|---|---|---|---|
| Institution size, enrollment by level/race/gender, completions **by major (CIP code)**, finance, staff, admissions, price | **IPEDS** **[DOC]** | Bulk CSV + Access DB, "Complete Data Files" — https://nces.ed.gov/ipeds/use-the-data. Data from 1980-81 forward. No official REST API. | Free | Annual; provisional then revised. Fall collection → release the following autumn. ~12-20mo lag | Per-institution (~6,000 Title IV institutions), by year | US Gov public domain. No restrictions. | Total addressable club market per campus; **completions by CIP = the single best free proxy for "how many pre-med / CS / finance students exist here"** = club category sizing | **P0** |
| Same universe, friendlier | **College Scorecard API** **[LIVE]** | `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=KEY&...`. Confirmed working with `DEMO_KEY`. Returns e.g. `{"school.name":"University of Maryland Global Campus","latest.student.size":49664,"id":163204}` | Free; api.data.gov key free, 1,000 req/hr | Annual (draws on IPEDS + FSA + earnings) | Per-institution; `id` = IPEDS UNITID (the join key for everything) | Public domain | Institution size, demographics, earnings, share of degrees by field, Pell share → club program-market fit and sponsor willingness-to-pay | **P0** |
| Full bulk of the above | College Scorecard data files **[DOC]** | https://collegescorecard.ed.gov/data — "Most Recent Institution-Level Data" CSV, plus field-of-study file | Free | Annual | Institution and **institution × field of study** | Public domain | Field-of-study file gives earnings by major per school — a sponsor-targeting goldmine | **P0** |
| Student population by geography | **Census ACS** **[LIVE, key required]** | `https://api.census.gov/data/2023/acs/acs5?get=NAME,B14001_008E&for=tract:*&in=state:24` — returned "Missing Key" page, confirming endpoint live; free key at https://api.census.gov/data/key_signup.html | Free | Annual (5-yr ACS); ~Dec release | **Census tract** — finer than campus | Public domain | Table B14001 = enrollment in college/grad school. Tract-level student density → off-campus housing ad targeting, "where do students actually live" | P1 |
| Local labor market | **BLS** **[KNOWN]** | Public Data API v2, https://api.bls.gov/publicAPI/v2/timeseries/data/. Free registered key = 500 queries/day, 20 yrs/series | Free | Monthly, ~3wk lag | Metro (MSA) / county (QCEW) | Public domain | Local unemployment → part-time job availability → student discretionary time and money. Weak but cheap. | P2 |
| Campus crime, by campus, by year | **Clery Act / Campus Safety and Security** **[LIVE - site confirmed]** | https://ope.ed.gov/campussafety/ — custom data tool + full-year bulk downloads | Free | Annual, ~10mo lag | Per-campus, per-offense, on/off-campus split | Public domain | Weak direct value. Useful as a "night event safety" covariate and for late-night programming advice. Handle with care in product copy. | P3 |
| Loan/grant volumes, enrollment by school | **Federal Student Aid Data Center** **[KNOWN]** | https://studentaid.gov/data-center/student/title-iv — quarterly XLS | Free | Quarterly | Per-institution (OPEID) | Public domain | Pell/loan share → price sensitivity → what a club can charge for dues, what ticket prices clear | P2 |
| Institution-reported detail beyond IPEDS | **Common Data Set (CDS)** **[KNOWN]** | No central repository. Per-institution PDF/XLSX, usually at `<school>.edu/institutional-research/common-data-set`. Must be discovered and scraped per school | Free | Annual | Per-institution | Published by the school; factual data, not copyrightable (Feist). PDFs are fine to parse. | CDS Section F = **student life**: % living on campus, % in fraternities/sororities, and a *list of activities offered*. Section B = enrollment by class year. This is the closest thing to a national "Greek life penetration" dataset. | **P0** |
| Enrollment trend nowcast | **NSC Research Center** **[DOC]** | https://nscresearchcenter.org/current-term-enrollment-estimates/ — free dashboards + PDF + data appendices. Covers institutions representing **97% of Title IV enrollment** | Free | **Twice yearly (Jan and May)**, plus "Stay Informed" series | National, **state**, sector, by major field, age, race | Free to download; cite NSC | Directional enrollment momentum by state and field — leading indicator for whether a campus's club market is growing or shrinking | P1 |
| Everything a school knows about itself | **University fact books / Institutional Research portals** **[KNOWN]** | Per-school. Search `site:<school>.edu "fact book" OR "institutional research"`. Many publish enrollment **by major, by year** — far more granular than IPEDS completions | Free | Annual, sometimes each census date | Per-major, per-college, per-class-year | Published public data | **The highest-resolution free club-market-sizing input that exists.** "How many junior finance majors are at this school" is a directly answerable question at most large publics. | **P0** |

**Practical note on IPEDS:** there is no official API, which trips people up. The workable pattern is: download Complete Data Files once, load to Postgres/DuckDB keyed on `UNITID`, refresh annually. `UNITID` is also the College Scorecard `id`, so the two join for free. Third-party wrappers exist (the `IPEDS` R package, `ipeds` on PyPI) but they are unmaintained enough that you should own the ingest.

**The join key problem.** You will spend real engineering time on entity resolution: IPEDS UNITID ↔ OPEID ↔ athletics team ID ↔ the school's own subdomain ↔ the Localist instance ↔ the subreddit. Build this crosswalk table on day one and treat it as a core asset. Nothing else composes without it.

---

# SECTION B — Academic calendars and course data

This is the highest-value exogenous layer for our specific product, and it is dramatically under-exploited. The academic calendar is the campus's heartbeat. If you know a school's exam week, you know when club attendance collapses. If you know live seat counts in ECON 101, you know how many sophomores are about to care about a finance club.

## B.1 Academic calendars

| Signal | Source | Access | Cost | Cadence | Granularity | Legal | Predicts | Pri |
|---|---|---|---|---|---|---|---|---|
| Term start/end, add-drop, reading days, **finals week**, breaks, commencement, move-in | University academic calendar **[KNOWN]** | Per-school HTML; a large minority publish `.ics`. Often at `registrar.<school>.edu/calendar`. Localist instances expose calendar events via API (see C.3) | Free | Published 1-2 yrs ahead, revised rarely | Per-school, per-date | Factual dates, not copyrightable. Scraping public HTML with no login = low risk (see Legal). | **The single strongest attendance predictor we will have.** Finals week = attendance floor. Week 2-3 = club fair peak. Break = zero. | **P0** |

Build this as a curated, human-QA'd table, not a scraper you trust blindly. For 200 target schools that is maybe two weeks of work and it will outperform any ML model you build in year one. Store: `school_id, term, first_day, last_day, add_drop_end, reading_start, finals_start, finals_end, break_start, break_end, commencement, move_in`.

## B.2 Open course APIs — verified inventory

I probed these live. Results:

| School | Endpoint | Status | Key? | Seat counts? | Notes |
|---|---|---|---|---|---|
| **Maryland** | `https://api.umd.io/v1/courses/sections` | **[LIVE]** | **No** | **Yes** | Returned `"seats":"35","open_seats":"0","waitlist":"0"` plus meeting days/times/building/instructor. Also `/majors/list` **[LIVE]**, `/bus/routes` **[LIVE]**, `/professors`, `/map`. Docs: https://beta.umd.io **[DOC]** — "GETful API", open source, no key mentioned. **The gold standard.** |
| **Illinois (UIUC)** | `https://courses.illinois.edu/cisapp/explorer/schedule/2026/fall.xml` | **[LIVE]** | No | Yes (in section detail) | Returned Fall 2026 term XML with subject list and hrefs. Fully navigable REST-over-XML tree: year → term → subject → course → section. |
| **Stanford** | `https://explorecourses.stanford.edu/search?q=CS106A&view=xml` | **[LIVE]** | No | Partial | Returned 2026-2027 course XML with title, description, cross-lists. `view=xml` is the documented machine format. |
| **Purdue** | `https://api.purdue.io/odata/Subjects` | **[LIVE]** | No | Yes | OData v4. Returned a valid OData error on `$top=3` (server caps `$top`), which confirms the service is up and speaking OData. Full entity model: Subjects, Courses, Classes, Sections, Meetings. |
| **Berkeley** | Berkeleytime `api.berkeleytime.com` | **[not live]** | — | — | Returned 404 + Cloudflare challenge. Berkeley's own SIS API (`api-central.berkeley.edu`) requires registration. Berkeleytime is a student project; treat as unstable. |
| **Rutgers** | `https://sis.rutgers.edu/soc/api/courses.json` | **[not live]** | No | Yes | My parameter combination returned a Tomcat error — the endpoint exists but my `semester` code was wrong. **[KNOWN]** the pattern `?subject=198&semester=92026&campus=NB&level=U` works with correct codes. Worth 20 minutes to get right. |
| **MIT** | `https://api-catalog.mit.edu` | **[not live]** | — | — | No response. MIT's catalog data is more commonly obtained from the Course Catalog scrape or the `mitpe`/Hydrant student projects. |
| **Michigan, Texas A&M, Harvard** | — | **[UNVERIFIED]** | Yes | Varies | Michigan's Academic Roster API and Harvard's Course Catalog API both exist but sit behind free developer registration (api.umich.edu, portal.apis.huit.harvard.edu). Register rather than scrape. |
| **Aggregators** | Coursicle, Nubb, Classie-Evals | **[KNOWN]** | — | — | Coursicle covers ~1,500 schools but has no public API and its ToS forbids scraping. Useful as a *coverage map* of which schools expose data, not as a source. |

**What course data buys us, concretely:**

1. **Enrollment by course = revealed interest.** 900 students in Intro to Entrepreneurship is a direct measurement of the addressable market for an entrepreneurship club — better than any survey.
2. **Live seat counts as a time series.** Poll `open_seats` daily during registration. The *fill rate curve* of a course tells you registration-period intensity and which majors are growing. This is a genuinely novel signal and almost nobody is collecting it.
3. **Meeting times = the campus's aggregate free-time map.** Aggregate all section meeting times for a school and you can compute, for any hour of any weekday, roughly what fraction of students are in class. **This directly answers "when should this club hold its meeting?"** — arguably our single most useful product recommendation, and it is computable from free data.
4. **Exam schedules = attendance suppressors.** Final and midterm exam schedules are published separately by most registrars.
5. **Building/room codes** join to campus geography for "how far is this event from where people already are".

The #3 use case deserves emphasis. A club officer asking "what night should we meet?" is the most common question in the product. Answering it from a real aggregate class-schedule heatmap — rather than a guess — is a feature no competitor has, built entirely on free data.

---

# SECTION C — Campus operations and occupancy

This is the layer that tells you what is happening on campus *right now*. Coverage is uneven and the work is per-campus, but where it exists it is very high-frequency and free.

## C.1 Recreation and library occupancy

| Signal | Source | Access | Cost | Cadence | Legal | Predicts | Pri |
|---|---|---|---|---|---|---|---|
| Live gym/rec headcount | **Connect2Concepts** **[site LIVE, endpoint UNVERIFIED]** | connect2concepts.com is live (Squarespace marketing site confirmed). The widget pattern many schools embed is `https://connect2concepts.com/connect2/?facility=<id>&type=circle&key=<uuid>` returning an HTML fragment with a live count. Each school's `key` is visible in the page source of the school's own "gym busyness" page. | Free (piggybacking the school's public widget) | **~Every 15-60 min** | The key is embedded in public HTML on a public page with no login. Low risk, but it is an undocumented endpoint — be a polite client (cache, low rate, identify yourself). Do not evade rate limits. | **The best free real-time "how alive is campus right now" proxy that exists.** Gym occupancy is a clean daily/weekly rhythm; deviations flag break weeks, weather events, game days, and exam crunch. | **P0** |
| Library seat/floor occupancy | Waitz / Occuspace, SpaceIQ, home-grown **[KNOWN]** | Occuspace powers "Waitz" at many campuses; a public JSON endpoint backs the public dashboard. Some schools (e.g. NC State) publish an official library occupancy API. | Free where public | 5-15 min | Same posture as above | Study intensity → inverse of social availability. Rises sharply in exam weeks — a direct, measured confirmation of the calendar-derived suppressor. | P1 |

Both of these are "scrape your own campus's public dashboard" signals. They do not scale to 3,000 schools cheaply, but they scale beautifully to the 20-50 campuses where we actually have users. That is the right shape for us: **depth on active campuses, breadth from federal data.**

## C.2 Dining

| Signal | Source | Access | Cost | Cadence | Legal | Predicts | Pri |
|---|---|---|---|---|---|---|---|
| Dining hall hours and menus | **Nutrislice** **[LIVE]** | `https://<school>.api.nutrislice.com/menu/api/schools/` returned real JSON including full weekly operating hours (`mon_start":"07:00:00","mon_end":"21:00:00"`). Menus at `/menu/api/weeks/school/<slug>/menu-type/<lunch|dinner>/YYYY/MM/DD/` (my slug guess 404'd — enumerate slugs from the `/schools/` call first). | Free | Menus weekly; hours per-term | Undocumented but unauthenticated public API serving a public-facing menu site. Low risk. | **Dining hours are a hard constraint on event scheduling** — you cannot schedule a 6pm meeting against the dinner rush and expect turnout. Menu quality (chicken tenders night) is a real, measurable attendance covariate at some schools. Free-food events are the #1 club attendance driver; knowing when dining is *closed* tells you when free pizza is most valuable. | **P0** |
| Same, other vendors | CBORD **NetNutrition**, Bite (Sodexo), Dine On Campus (Aramark), Chartwells **[KNOWN]** | NetNutrition has a semi-consistent POST-based endpoint set; Dine On Campus exposes `api.dineoncampus.com`. All unauthenticated. | Free | Weekly | Same | Same | P1 |

## C.3 Campus events, rooms, and transit

| Signal | Source | Access | Cost | Cadence | Legal | Predicts | Pri |
|---|---|---|---|---|---|---|---|
| **The public campus events calendar** | **Localist (Concept3D)** **[LIVE]** | `https://<calendar-host>/api/2/events?days=7&pp=100`. **Confirmed live at Cornell**: `https://events.cornell.edu/api/2/events` returned full event JSON — id, title, url, first_date/last_date, location, room_number, status, `experience:"inperson"`, `allows_attendance`, recurrence, school_id. Also `/api/2/places`, `/api/2/groups`, `/api/2/events/search`. | **Free, no key** for the public read API | Continuous; events appear as posted | Per-event, per-venue, with lat/long on places | Public read API the vendor documents (developer.localist.com). Reasonable use. | **This is the competitive map.** Every event on campus, including every other club's event. Predicts: calendar congestion (is our event competing with 40 others?), the campus event supply curve by weekday, venue capacity utilization, and seasonality. | **P0** |
| Same, other platforms | **LiveWhale** **[LIVE, different platform]** | Discovered during probing: Georgetown's `guevents.georgetown.edu` returns a **LiveWhale Calendar** page, not Localist — `"generator":"LiveWhale Calendar"`. LiveWhale exposes `?format=json` on most views. | Free | Continuous | Per-event | Public | Same as above | P1 |
| Room bookings / space | **25Live (CollegeNET)**, EMS **[KNOWN]** | 25Live publishes public feeds at `25live.collegenet.com/25live/data/<school>/run/...` (XML/JSON) where the school enables public access. EMS has public "browse events" pages. | Free where public | Continuous | Per-room, per-hour | Public where exposed | **Room availability = event feasibility.** Also reveals total bookable capacity and when the good rooms go. | P1 |
| Campus shuttle real-time | **GTFS / GTFS-Realtime** **[partially LIVE]** | TransLoc (now Modaxo), **PassioGO** (`passiogo.com/mapGetData.php` — **[LIVE]**, returned a valid `[{error no systemsAndRoutes}]` for my bad system id, confirming the endpoint works), DoubleMap, Ride Systems. umd.io wraps UMD's shuttle: `/v1/bus/routes` **[LIVE]** returned 20+ named routes. Aggregators: Mobility Database (`api.mobilitydatabase.org`, free key), Transitland (`transit.land/api/v2` — **[LIVE]**, returned `{"error":"Unauthorized"}`, free key required). | Free | Static GTFS per-term; Realtime every 30s | Per-stop, per-vehicle | GTFS feeds are published for consumption; most carry open licenses | Route service hours bound when students can get to an off-campus event. Real-time vehicle density is a crude campus-activity proxy. Stop locations = where foot traffic concentrates. | P1 |
| Parking availability | Per-school / T2 / Passport **[KNOWN]** | Some schools publish live garage counts as JSON | Free | 1-5 min | Public | Commuter-student presence — genuinely useful at commuter-heavy schools where "is anyone on campus tonight" is the whole question | P2 |

**Localist is the most important discovery in this section.** It is used by a large share of R1 and mid-size universities, the API needs no key, and it gives us the *complete competitive event landscape* for a campus. A club deciding when to hold its GBM should be told "there are 14 other events that night, including a home basketball game — move to Thursday." That recommendation is buildable this week.

---

# SECTION D — Athletics and big events

Home football Saturdays restructure an entire campus week. This is a large, discrete, perfectly-known-in-advance shock.

| Signal | Source | Access | Cost | Cadence | Legal | Predicts | Pri |
|---|---|---|---|---|---|---|---|
| NCAA schedules, scores, teams | **ESPN "hidden" API** **[KNOWN — blocked from my IP]** | `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard` and `/teams`. My requests returned **HTTP 403 from Akamai** ("Access Denied"), which is ESPN's datacenter-IP block, not a dead endpoint. Widely used and documented by the community; works from residential/proxy egress. | Free, no key | Live during games; schedules posted months ahead | Per-game: teams, date/time, venue, home/away, status, attendance (post-game) | **Undocumented and unsupported.** No published ToS grant. ESPN actively blocks datacenter IPs, which is a technical barrier — routing around it (residential proxies) moves you toward the risky end of the legal spectrum. **Recommendation: do not build on this.** | Home game dates and kickoff times | P2 |
| Same, safely | **School athletics sites + NCAA.com** **[KNOWN]** | Nearly every athletics site runs Sidearm Sports or PrestoSports, both of which expose schedule JSON/XML and **ICS calendar feeds** on public pages. NCAA.com publishes schedules. | Free | Per-season, updated as scheduled | Per-game | Public ICS feeds are published *for subscription* — the cleanest legal posture available | **Use this instead of ESPN.** Same data, published for consumption. | **P0** |
| Paid, reliable, licensed | **Sportradar / SportsDataIO** **[UNVERIFIED pricing]** | sportradar.com/developers (free trial), sportsdata.io (free trial then paid tiers) | Trials free; production commonly low-four-figures/mo **[UNVERIFIED]** | Real-time | Per-game, per-play | Clean commercial license | Only worth it if game data becomes core. It won't be for us. | P3 |
| Historical home attendance | **NCAA official attendance reports** **[KNOWN]** | NCAA publishes annual football/basketball attendance PDFs/XLS by school | Free | Annual | Per-school, per-season average | Public | Magnitude of the game-day shock at *this* school. A 100k-seat stadium school has a categorically different Saturday than a 12k one. | P1 |
| Concerts, comedians, big touring events near campus | **Ticketmaster Discovery API** **[DOC]** | `https://app.ticketmaster.com/discovery/v2/events.json?apikey=KEY`. Confirmed live (returned a clean auth error without a key). Docs confirm: **"default quota is 5000 API calls per day and rate limitation of 5 requests per second"**, 230,000+ events, price ranges, venue geo, presales | **Free tier: 5,000 calls/day** | Continuous | Per-event with venue lat/long — filter by radius around campus | Partner API ToU applies; free tier is fine for our volume | Competing demand for a Friday night. A stadium show 2 miles from campus will gut a club event. | P1 |
| Same, broader | Bandsintown, Songkick, SeatGeek **[KNOWN]** | SeatGeek Platform API (free key); Songkick API (partner approval); Bandsintown (partner) | Free-ish | Continuous | Per-event | Varies | Coverage fill-in for smaller venues | P2 |
| Move-in, orientation, commencement, family weekend, homecoming | Registrar + student-affairs calendars **[KNOWN]** | Scrape/curate per school; often in the Localist feed | Free | Annual | Per-date | Public | **Move-in and orientation are the single biggest club-recruitment windows of the year.** Everything about our product's seasonality keys off these dates. | **P0** |

---

# SECTION E — Weather, environment, time

Cheap, universal, and genuinely predictive for outdoor and walk-to events. Do not overrate it — weather is a modest effect next to the calendar — but it is nearly free, so include it.

| Signal | Source | Access | Cost | Cadence | Granularity | Legal | Predicts | Pri |
|---|---|---|---|---|---|---|---|---|
| US forecast | **NWS / NOAA API** **[LIVE]** | `https://api.weather.gov/points/{lat},{lon}` → returns grid endpoints for `/forecast` and `/forecast/hourly`. Confirmed live (GeoJSON-LD returned). **Requires a `User-Agent` header identifying you** | **Free, no key, no limit published** | Hourly forecast, updated ~hourly | ~2.5km grid | **US Government public domain — no restrictions, commercial use fine** | Precip, temp, wind at event time | **P0** |
| Forecast + history, easier | **Open-Meteo** **[LIVE + DOC]** | Forecast: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&hourly=temperature_2m,precipitation_probability` **[LIVE]**. History: `https://archive-api.open-meteo.com/v1/archive?...&start_date=..&end_date=..` **[LIVE]** — returned real daily max temp and precip sums | **Free tier: 600/min, 5,000/hr, 10,000/day, 300k/month — BUT the free tier is explicitly NON-COMMERCIAL.** Commercial requires a paid plan (Standard 1M calls/mo, Professional 5M, Enterprise 50M+; **prices not published on the page — subscribe via Stripe to see them [UNVERIFIED]**). Historical/climate APIs require **Professional or higher** | Hourly | ~1-11km | **CC BY 4.0 — attribution required** | Same as NWS plus clean historical backfill for model training | **P0** (with the caveat below) |
| Historical station data | **Meteostat** **[KNOWN]** | Python library `meteostat` reading free bulk files from bulk.meteostat.net; also a RapidAPI JSON endpoint with a free tier | Free (bulk); RapidAPI tiers paid above free quota | Daily/hourly history | Per-station | CC BY-NC 4.0 on much of the data — **non-commercial**; check per-source | Model training backfill | P2 |
| Sunset/sunrise, daylight | **sunrise-sunset.org API** or compute locally **[KNOWN]** | Free API, or just use `astral`/`suncalc` locally — no network call needed | Free | N/A (deterministic) | Any lat/long | N/A | **Darkness is a real attendance suppressor for evening walk-to events.** The DST fall-back date is a genuine discontinuity in evening event attendance. Compute locally; it's free and exact. | P1 |
| Air quality | **AirNow API** (EPA) **[KNOWN]** | airnowapi.org, free key | Free | Hourly | Monitor/ZIP | Public domain | Wildfire smoke events cancel outdoor programming. Regionally important (West Coast autumn). | P2 |

> **Action item on Open-Meteo:** the free tier's non-commercial restriction is easy to miss and we would be in violation from day one. Two clean options: (a) use **NWS for all US forecasts** — public domain, no restrictions, no cost, and we are US-only anyway; (b) pay Open-Meteo for the convenience and the historical archive. **Recommendation: NWS for production forecasts, and buy one month of Open-Meteo Professional to bulk-download the historical archive for model training, then cancel.** That is fully compliant and costs almost nothing.

**On the research linking weather to attendance:** the effect is real but modest and highly conditional. The robust findings are (1) precipitation depresses attendance at outdoor/walk-to events substantially more than indoor ones; (2) temperature has an inverted-U relationship; (3) the *forecast* matters as much as the realized weather, because people decide in advance. That third point is important for us: we should feed the forecast as of the RSVP-decision moment, not the actual weather.

---

# SECTION F — Travel and mobility

## F.1 The Minneapolis-flights-to-pizza question, answered concretely

The founder's example is the right instinct, so it is worth being precise about which datasets would actually let you run it, and what it would cost. There are three tiers, and they differ by *latency* more than anything.

**Tier 1 — Free, but 4-6 months stale. Good for structure, useless for nowcasting.**
- **BTS T-100 Domestic Segment** **[site LIVE]** — https://www.transtats.bts.gov/DL_SelectFields.aspx (confirmed the download page loads). Every US carrier reports, per month, per origin-destination segment: passengers carried, seats, departures performed. Free bulk CSV/ZIP. **Lag: roughly 4-6 months.**
- **BTS DB1B** — a 10% sample of tickets with itinerary, fare, and coupon detail. Quarterly, ~6 month lag. Free.
- What this gives you: "In January, MSP receives ~X passengers/day from warm-weather origins, and that number is Y% above October." That is a **seasonal structural prior**, not a live signal. You could build a decent monthly baseline model of arrival volume. You could not target an ad at someone landing Tuesday.

**Tier 2 — Paid, near-real-time. This is the tier the example actually requires.**
- **FlightAware AeroAPI** **[DOC — pricing confirmed]**: Personal tier has **no minimum with a $5/month free allowance**, 10 result sets/min, current status only. **Standard is $100/month minimum**, 5 result sets/sec, historical data, flight alerting. **Premium is $1,000/month minimum** with Foresight predictive ETAs. Per-query costs run **$0.001 to $0.200 per result set, most common queries $0.005-$0.060**. Volume discounts start at 30% off usage above $1,000/mo.
  - Concretely: MSP handles roughly 400-500 daily arrivals. Polling arrivals for one airport, a few times an hour, sits comfortably inside the **$100/mo Standard tier**. That is the real price of "know who is landing in Minneapolis today."
- **Cirium, OAG** **[UNVERIFIED]**: enterprise schedule/status data. Both are "contact sales"; neither publishes pricing. Expect five figures annually. Overkill for us.
- **Amadeus Self-Service APIs** **[KNOWN]**: free test environment, pay-per-call in production. Notably includes *Flight Inspiration* and busiest-period endpoints — more useful for demand-trend than for live arrivals.

**Tier 3 — Ground truth on what the arrivals actually did. Expensive.**
- **Foot traffic panels**: Advan, Placer.ai, Veraset, Unacast. These are device-location panels that tell you visits to specific POIs (this pizza place, this stadium, this residence hall).
- **Placer.ai** **[UNVERIFIED pricing]**: no published pricing, "contact sales." Widely reported to be a five-figure annual commitment with seat-based licensing. There is a free tier with heavily limited functionality. **They are not startup-friendly on price.**
- **Dewey Data** **[DOC]**: https://www.deweydata.io — confirmed it resells **SafeGraph, Advan, Veraset, ATTOM** and 30+ providers, with **"academic-friendly pricing"** via **institutional subscriptions to 500+ universities**, managed through university libraries. **Critically: the site targets institutions, and I found no startup program or free tier.** For a company, this is not an academic back door — but if we have a university research partner, this is by far the cheapest legitimate route to foot-traffic data.
- **SafeGraph** — now effectively consolidated into the Advan/Dewey ecosystem for most buyers **[UNVERIFIED as to current corporate status]**.

**So: what does the Minneapolis example actually cost?** About **$100/month** (AeroAPI Standard) to know the arrivals in near-real-time, **free** to know the seasonal structure (T-100), and **five figures a year** to verify that those arrivals actually bought pizza. The honest lesson is that **the cheap part is the exogenous signal and the expensive part is the outcome data** — which is exactly why our own first-party outcome data (Section J) is the most valuable asset we will ever have. We get the expensive half for free because we own the conversion event.

## F.2 The campus translation

Airports matter to us mostly around **break travel**. The genuinely useful version of this for campus:

| Signal | Source | Access | Cost | Cadence | Predicts | Pri |
|---|---|---|---|---|---|---|
| Break-travel exodus timing | **TSA throughput** **[KNOWN]** | https://www.tsa.gov/travel/passenger-volumes — public HTML table, daily national checkpoint counts | Free | **Daily, ~1 day lag** | National only | National travel intensity. Confirms the Thanksgiving/spring-break exodus is underway. Crude but free and fast. | P2 |
| Airport-level arrivals/departures near campus | AeroAPI **[DOC]** | As above | $100/mo Standard | Real-time | Per-airport | When students physically leave and return. For schools with a big fly-in population, the Wednesday-before-Thanksgiving cliff is a real, measurable attendance event. | P2 |
| Intercity bus/rail | Amtrak (no official public API), FlixBus/Megabus **[KNOWN]** | Scrape or third-party | Free-ish | — | Regional break travel for drive/train schools | P3 |

**Honest assessment:** travel data is the least important section for us, despite being the founder's originating metaphor. The metaphor is right; the literal dataset is not the one we need. Our "flights" are the **academic calendar, the Localist event feed, and course registration** — those are the high-frequency exogenous signals that actually move campus behavior. I would spend zero dollars on travel data in year one.

---

# SECTION G — Local commerce and business

This is the **monetization-side** catalog. Clubs need sponsors; local businesses need students. This is where the ad product lives.

| Signal | Source | Access | Cost | Cadence | Legal | Predicts | Pri |
|---|---|---|---|---|---|---|---|
| Local businesses, categories, ratings, price tier, hours | **Yelp Fusion API** **[DOC — pricing page separate]** | https://docs.developer.yelp.com. Yelp moved to paid plans with a free trial; the getting-started page no longer lists a free daily quota. Pricing at https://business.yelp.com/data/products/fusion/ **[UNVERIFIED — could not confirm current figures]** | Free trial, then paid | Continuous | Per-business, geo radius | **Strict:** caching limits (generally no storing beyond a short window), display/attribution requirements, no building a competing directory | The sponsor universe near campus: who exists, category, price tier, popularity | P1 |
| Same | **Google Places API** **[DOC — pricing confirmed]** | https://developers.google.com/maps/billing-and-pricing/pricing. **Place Details (Essentials) from $5.00/1,000** declining to $0.38 at 5M+; **Nearby Search (Pro) $32.00/1,000** declining to $2.40; Text Search (Pro) same. Free usage allowances per SKU (e.g. 10,000 Autocomplete events/mo) | Pay-per-call as above | Continuous | Per-POI | **Caching heavily restricted** — Google's terms generally forbid storing Places content beyond 30 days and forbid using it to build a competing dataset | Same as Yelp, better coverage, worse terms | P1 |
| Same, permissive | **OpenStreetMap / Overpass API** **[KNOWN]** | Overpass QL at overpass-api.de; or Geofabrik regional extracts | **Free** | Continuous | Per-POI, global | **ODbL** — free to use commercially with attribution and share-alike on derived *databases* | **The only POI source with no caching restriction.** Lower quality and completeness than Google, but you own the copy. Good for "what is within 400m of this building." | **P0** |
| Business openings/closings | **City open data portals** **[KNOWN]** | Socrata/CKAN portals — most college towns have one (Ann Arbor, Madison, Boulder, Chapel Hill, Austin, Berkeley). Socrata pattern: `https://data.<city>.gov/resource/<id>.json` | Free | Daily-monthly | Per-license, address-level | Open data licenses, generally permissive | New business licenses = new sponsor prospects, with a date stamp. A restaurant that opened last month is *much* more likely to buy student marketing. | P1 |
| Student housing occupancy and lease-up | **RealPage, Yardi Matrix, CoStar** **[UNVERIFIED pricing]** | All "contact sales." RealPage publishes a monthly **student housing pre-lease** summary publicly in press releases/blog; Yardi Matrix publishes a free monthly **National Student Housing Report** PDF | Reports free; underlying data five-to-six figures **[UNVERIFIED]** | Monthly (pre-lease season Sep-Aug) | Per-market, per-property | Reports are published for citation | **This is the big ad market.** Student housing lease-up runs on a brutal annual cycle — properties start pre-leasing for next fall in *September*. A club audience is exactly who they want. Knowing a market's pre-lease pace tells you how desperate local properties are. | P1 |
| Apartment listings | Apartments.com/Zillow (no open API), Rentberry, Craigslist **[KNOWN]** | Scraping these is explicitly against ToS and actively defended | — | — | — | **Avoid.** Use the free Yardi/RealPage market reports instead. | P3 |
| Delivery demand | DoorDash/UberEats — no public API **[KNOWN]** | — | — | — | ToS-prohibited scraping | Skip | P3 |

**The commercial insight:** the free monthly Yardi Matrix and RealPage student-housing reports are genuinely valuable and cost nothing. They tell us, per market, how the pre-lease season is tracking. That is a direct read on ad-spend appetite from the single biggest category of student-targeted local advertiser.

---

# SECTION H — Social and attention data

Treat this section with discipline. It is the most tempting and the least reliable. Platform APIs have become expensive, restrictive, and prone to sudden rug-pulls. Build nothing load-bearing here.

| Platform | Access | Free tier | Paid | Cadence | Restrictions | Usable? | Pri |
|---|---|---|---|---|---|---|---|
| **Wikipedia pageviews** | **[LIVE]** `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{Article}/daily/YYYYMMDD/YYYYMMDD` — returned real daily counts for "University_of_Maryland,_College_Park" (~520/day) | **Unlimited, no key** | — | **Daily** | CC0 | **Yes — best free attention signal.** Per-school daily interest; spikes on news, admissions decisions, scandals, big games | **P0** |
| **GDELT 2.0** | **[LIVE + DOC]** `api.gdeltproject.org/api/v2/doc/doc` (returned 429 with a polite "one request every 5 seconds" notice — confirming it's live and free). Bulk raw CSV + **Google BigQuery**. Site states: **"The entire GDELT database is 100% free and open"** | **Free, no key.** Rate: ~1 req/5s on the API; unlimited via BigQuery (you pay Google for compute) | BigQuery compute only | **Every 15 minutes** | Free and open; huge (2.5TB/yr raw) | **Yes.** Global news mentions with tone/theme coding. Monitor mentions of each university. | **P0** |
| **Student newspaper RSS** | **[KNOWN]** Nearly every student paper runs WordPress or SNworks with `/feed/` or `/rss` | **Free** | — | Continuous | Public feeds published for syndication — the cleanest posture in this whole section | **Yes — the most underrated signal in the catalog.** Student papers cover club events, protests, administration decisions, and campus mood *at campus resolution* that nothing else matches. ~200 feeds is a weekend of work. | **P0** |
| **Google Trends** | **[UNVERIFIED]** Google announced an official Trends API in alpha (2025); access by application. `pytrends` remains the unofficial route and is fragile/rate-limited | Free | — | Daily; realtime for some | Unofficial scraping is ToS-adverse; the official API terms are what matter | **Partially.** Geographic granularity goes to **DMA/metro**, which for a college town is close to campus-level. Real value for "is interest in [club category] rising here." Treat pytrends as a research tool, not production. | P1 |
| **Reddit Data API** | **[UNVERIFIED — reddit.com blocked from my fetch tooling]** Known post-2023 structure: free tier for non-commercial/moderation use with ~100 queries/min per OAuth client; **commercial use requires a paid agreement** at a rate widely reported around **$0.24 per 1,000 API calls** | Limited free | Paid agreement required for commercial | Continuous | **Commercial use requires contacting Reddit.** Using free-tier credentials for a commercial product violates the Data API Terms. | **Risky.** Campus subreddits are the richest qualitative campus signal and the hardest to use legally. **Do not build on the free tier for a commercial product.** | P2 |
| **X / Twitter API** | **[UNVERIFIED — docs page confirmed pay-per-usage model but no figures]** docs.x.com states **"pay-per-usage pricing"** with credit-based billing and no subscriptions (a 2026 change from the old Free/Basic/Pro/Enterprise ladder) | Minimal | Credit-based | Continuous | Restrictive redistribution terms | **No.** Cost-to-value is poor for campus signal. Skip. | P3 |
| **TikTok Research API** | **[partially verified — page is JS-rendered]** developers.tiktok.com/products/research-api. **[KNOWN]** Eligibility is limited to **non-profit academic researchers** in the US and Europe; commercial use is not permitted | Free for qualified academics | N/A commercially | — | Academic-only | **No, not for us directly.** Possible via a university research partnership. | P3 |
| **Instagram Graph / Meta Content Library** | **[KNOWN]** Graph API only reaches accounts that authorize us (i.e. a club's own IG). Content Library is academic-only | Free for own-account | — | Continuous | Only own/authorized accounts | **Yes, but only as a club-owned integration** — "connect your club's Instagram" is a legitimate first-party feature and gives us real reach/engagement data with consent | P1 |
| **YouTube Data API v3** | **[DOC]** **10,000 units/day** default. Reads 1 unit, writes 50 units, search 100 units (docs list a separate 100 search.list allowance). Free; extra quota by application form | Free 10k units/day | Free on approval | Continuous | Standard | Marginal for us | P3 |
| **Discord** | **[KNOWN]** Bot in servers we're invited to | Free | — | Real-time | Own-server only | **Yes, and valuable** — many clubs *live* on Discord. "Invite our bot" gives consented message-volume signal. This is really a first-party signal (Section J). | P1 |
| **News APIs** | NewsAPI.org **[KNOWN]** — free tier is development-only (100 req/day, 24h delayed); paid from ~$449/mo **[UNVERIFIED]** | Dev only | Paid | Continuous | Free tier forbids production | Use GDELT instead — free and better | P3 |
| **App store ranks** | Sensor Tower, Appfigures **[UNVERIFIED]**; **data.ai was acquired by Sensor Tower (2024) and wound down as a separate product [KNOWN]** | Appfigures has a low-cost tier; Sensor Tower is enterprise | — | Daily | — | Only relevant for competitive monitoring | P3 |

---

# SECTION I — Employment and recruiting

Recruiting cycles are a powerful, sharply-timed, and badly-underused driver of club behavior. Pre-professional clubs (consulting, finance, PM, pre-law, pre-med) have activity curves driven almost entirely by employer timelines.

| Signal | Source | Access | Cost | Cadence | Legal | Predicts | Pri |
|---|---|---|---|---|---|---|---|
| Recruiting-cycle calendar | **Curated by us from public sources** **[KNOWN]** | Firms publish application open/close dates publicly. Investment-banking sophomore/junior programs, consulting deadlines, Big Tech intern cycles | Free (our labor) | Annual, shifts earlier each year | Per-industry, per-date | Public | **The best predictor of pre-professional club activity, period.** IB junior recruiting has crept into the *spring of sophomore year*; consulting runs Aug-Oct. Club GBM attendance for a finance club spikes 3-6 weeks before deadlines. | **P0** |
| Public labor-market analysis | **Indeed Hiring Lab** **[KNOWN]** | hiringlab.org — free posts plus **free downloadable index data on GitHub** (`hiring-lab/job_postings_tracker`) | **Free** | Weekly/monthly | National, sector, some metro | Open, cite it | Sector hiring momentum → how anxious students are → pre-professional club demand | P1 |
| Job postings, detailed | **Lightcast** (ex-Emsi Burning Glass), **Revelio Labs**, **LinkUp** **[UNVERIFIED pricing]** | All "contact sales" | Five-to-six figures annually **[UNVERIFIED]** | Daily-weekly | Occupation × metro | Commercial license | Better-resolution version of the above. Not worth it year one. | P3 |
| Visa filings | **H-1B LCA disclosure data, PERM** **[KNOWN]** | https://www.dol.gov/agencies/eta/foreign-labor/performance — free quarterly bulk XLSX | Free | Quarterly | Employer, worksite, wage, job title | Public domain | Which employers hire in this metro, at what wage, for what roles. **A free, surprisingly good list of local employers who hire new grads** — i.e. sponsor prospects and career-fair targets. | P2 |
| Layoffs | **layoffs.fyi** **[KNOWN]** | Public tracker; underlying Airtable | Free | Continuous | Company, date, count | Attribution | Sector shocks → shifts in which pre-professional clubs surge | P2 |
| Student-side benchmarks | **Handshake** / NACE **[KNOWN]** | Handshake publishes free public reports; NACE Job Outlook is partly paywalled | Free reports | Periodic | National | Cite | Benchmarks for internship-search timing | P2 |

---

# SECTION J — First-party endogenous signals

**This is our most valuable dataset and the only one no competitor can buy.** Everything above is available to anyone with a credit card. What follows is proprietary, real-time, and — critically — contains the *outcome variable*. The Minneapolis example is expensive precisely because the buyer has to purchase the outcome data; we generate ours for free.

Design principle: **instrument the funnel, not the features.** Every event below should carry `(user_id, club_id, school_id, event_id, timestamp, surface, session_id)` so that any signal can be cut by campus, club, category, and cohort.

| Event | What it directly measures | Leading indicator for | Latency | Notes |
|---|---|---|---|---|
| **RSVP created** | Stated intent | Attendance — but with a **large, club-specific no-show rate**. The RSVP→attendance ratio is itself the model's key learned parameter | Instant | Capture *time-to-event at RSVP*; early RSVPs convert much better than last-day ones |
| **RSVP cancelled / un-RSVP** | Decay of intent | Sharp negative signal; cluster cancellations = a competing event appeared | Instant | |
| **Check-in (QR/geo)** | **Ground truth attendance** | The label for every attendance model we build | Instant | **The single most important event in the product.** Without check-ins we have no supervised target. Make check-in frictionless and incentivized. |
| **No-show** (RSVP, no check-in) | Intent-action gap | Per-user flakiness score; per-club credibility; per-weather/per-calendar suppression effects | Post-event | Derived, not logged |
| **App open / session start** | Baseline engagement | Campus-level activity rhythm; our own "gym occupancy" | Instant | Aggregate by school → a clean daily/weekly seasonality baseline |
| **Club page view** | Browse-stage interest | Membership growth 1-3 weeks out; which categories are trending on this campus | Instant | Dwell time here is a strong interest signal |
| **Search query** | **Explicit unmet demand** | **Gaps in club supply — "what do students want that doesn't exist here?"** | Instant | Zero-result searches are a product goldmine: they name new clubs to seed and new sponsor categories |
| **Join / follow club** | Commitment | Lifetime engagement; club growth rate | Instant | |
| **Message sent / read receipt** | Internal club health | **Churn.** Message volume decay is the earliest reliable signal that a club is dying — typically visible 3-6 weeks before events stop | Instant | Aggregate counts only; do not analyze message content without explicit consent |
| **Notification sent / opened / dismissed** | Channel effectiveness | Optimal send time per campus per cohort; notification fatigue | Instant | Track dismiss and mute rates as the fatigue ceiling |
| **Link click (incl. ad click)** | Conversion intent | Ad performance; sponsor ROI | Instant | |
| **Form submission** (interest forms, applications) | High-intent conversion | Recruitment funnel yield | Instant | |
| **Payment event** (dues, tickets, merch) | **Revenue, willingness to pay** | Club financial health; price elasticity; sponsor value | Instant | The strongest single predictor of club survival |
| **Calendar sync connected** | Retention commitment | **Very strong retention predictor** — users who sync calendars retain far better | Instant | Also yields (with consent) the user's real availability |
| **Profile edit / interest tags** | Declared preferences | Cold-start recommendations | Instant | |
| **Invite sent / invite accepted** | Viral coefficient | Organic growth rate per campus; identifies connector-students | Instant | The invite graph is the most valuable structure in the dataset |
| **Officer transition / roster change** | Leadership turnover | **The #1 cause of club death is a bad officer handoff in May.** A spring leadership change with no accompanying activity is a red alert | Event-driven | Build an explicit "succession risk" score |
| **Event created / edited / cancelled** | Supply side | Campus event supply curve; our own competing-event density (a first-party mirror of Localist) | Instant | |
| **Dwell time on event page** | Consideration depth | Conversion to RSVP | Instant | |
| **Photo/recap upload post-event** | Club vitality | Social proof; next-event attendance | Instant | |

**Two derived first-party metrics worth building explicitly:**

1. **Club Health Score** — a composite of message-volume trend, event cadence, RSVP→check-in ratio, officer stability, and payment activity. This is the core of "club advice" and it is computable entirely from our own data.
2. **Campus Liveness Index** — aggregate app opens + event creation + RSVP velocity, normalized by enrollment. This is our own gym-occupancy signal, and once we have it on enough campuses it is a *sellable* dataset in its own right.

**Privacy posture, stated plainly.** Students are the users; many are 17-18 and some are minors. Log aggregate behavior, be explicit in the privacy policy, keep message *content* out of analytics, offer real opt-outs, and do not sell individual-level data. Beyond being right, this is also the commercially correct choice: aggregate campus-level insight is the sellable product, and individual-level student data is a liability with a low ceiling.

---

# SECTION K — Data commons and marketplaces

| Marketplace | What's there | Cost model | Startup-accessible? | Pri |
|---|---|---|---|---|
| **data.gov** **[KNOWN]** | Federal catalog — IPEDS, BTS, Census, DOL all discoverable here | Free | Yes | P1 |
| **City/county open data portals** **[KNOWN]** | Socrata (`data.<city>.gov/resource/<id>.json`) or CKAN. Most college towns have one: business licenses, permits, 311, crime, events, parking | Free | Yes — **underrated** | **P0** |
| **Google BigQuery public datasets** **[KNOWN]** | **GDELT**, Census, NOAA, Wikipedia pageviews — all hosted, queryable in SQL | Free data, pay ~$6.25/TB scanned | **Yes — best value in the whole section.** GDELT via BigQuery avoids the 2.5TB download entirely | **P0** |
| **AWS Data Exchange** **[KNOWN]** | Some free public datasets; mostly paid commercial listings | Per-product | Partially | P2 |
| **Snowflake Marketplace** **[KNOWN]** | Advan, Safegraph-lineage POI/foot-traffic listings; some free sample datasets | Per-product, needs Snowflake | Partially — free listings exist, foot-traffic ones don't | P2 |
| **Databricks Marketplace** **[KNOWN]** | Similar, smaller | Per-product | Partially | P3 |
| **Nasdaq Data Link** **[KNOWN]** | Financial/alt-data; free tier for some core datasets | Free tier + paid | Partially | P3 |
| **Kaggle / Hugging Face** **[KNOWN]** | Scraped college datasets, US college rankings, IPEDS extracts, course catalogs | Free | Yes — but **check provenance and license carefully**; much of it is re-uploaded scraped data with no clear rights | P2 |

---

# The legal picture: what a funded startup can safely do

This is not legal advice, and you should have counsel review the specific plan. But the landscape is clearer than most people think, and the practical rules are stable.

## What the cases actually hold

**Van Buren v. United States (2021)** **[DOC]** — The Supreme Court, 6-3 (Barrett, J.), held that a person "exceeds authorized access" under the CFAA only when they "access files or other information that is off-limits to them on a computer system that they otherwise have authorized access to." This is the **"gates-up-or-down"** rule: the question is whether a gate was closed to you, not whether you used what was behind an open gate for a bad purpose. The practical effect: **violating a terms-of-service policy is not, by itself, a federal crime.**

**hiQ Labs v. LinkedIn** **[DOC]** — The case everyone cites and most people get half-right. Full history: district court granted hiQ a preliminary injunction (2017); Ninth Circuit affirmed (Sept 2019); Supreme Court granted cert, vacated, and remanded in light of Van Buren (June 2021); **Ninth Circuit reaffirmed (April 2022)** — scraping *public* data does not trigger the CFAA's "without authorization" prong, because public data is not gated. **But in November 2022 the district court held that hiQ had breached LinkedIn's User Agreement**, and the case resolved by settlement with judgment against hiQ.

The correct takeaway is the two-track one: **hiQ won the CFAA question and lost the contract question.** Scraping public data is not computer crime. It can still be **breach of contract** if you agreed to terms that forbid it. This is *the* operative distinction for us.

**Meta v. Bright Data (N.D. Cal. 2024)** and **X Corp. v. Bright Data (2024)** **[KNOWN]** — Both reinforced the same line. In the Meta case the court found Bright Data was not bound by terms it had not accepted *while logged out*, and rejected the breach claim as to logged-out scraping. In the X case, the court was skeptical of using state-law contract claims to lock up public data, noting tension with federal copyright preemption and the public interest in open information. Both are defendant-favorable on **logged-out, public-page scraping**.

**Ryanair v. Booking.com (2024)** **[UNVERIFIED as to appeal status]** — The important counterweight. A Delaware jury found CFAA liability where the defendant accessed a **logged-in** area using accounts and got past technical barriers. This is the gate-down case. It shows the CFAA still has teeth when authentication is involved.

**Copyright** — *Feist* (1991) remains foundational: **facts are not copyrightable**, and neither is a "sweat of the brow" compilation lacking original selection/arrangement. Enrollment numbers, course times, exam dates, and event dates are facts. Copying a whole database's original arrangement, or verbatim descriptive prose, is different. The 2023-2026 AI training cases (*Thomson Reuters v. Ross*, *Bartz v. Anthropic*, *Kadrey v. Meta*) bear on training on expressive works; they are largely orthogonal to scraping factual campus data, but they confirm that **how you acquired the data** matters independently of what you do with it.

**robots.txt** — Not itself law. No US case has held that violating robots.txt is independently unlawful. But it is strong evidence of the site owner's expressed wishes, it is used against defendants rhetorically, and ignoring it is a bad fact in front of a jury. **Honor it.** It costs us essentially nothing.

## Privacy law that actually bites us

- **State comprehensive privacy laws** — By 2026 roughly twenty states have comprehensive privacy statutes in effect (CA, VA, CO, CT, UT, TX, OR, MT, FL, DE, IA, NE, NH, NJ, TN, MN, MD, IN, KY, RI among them) **[KNOWN]**. Common requirements: notice, access/deletion rights, opt-out of targeted advertising and "sale," and **heightened treatment of data from known minors**. **Maryland's is the strictest on data minimization and effectively bans selling sensitive data.** Since we operate nationally, build to the strictest standard rather than per-state.
- **Targeted advertising opt-out** — nearly all of these laws give consumers the right to opt out of targeted ads. Our ad product must have a working opt-out from day one, not as a retrofit.
- **Minors** — COPPA covers under-13 (not our population), but several state laws impose extra duties for **under-16 or under-18**, including opt-in consent for targeted advertising to known minors. **Some incoming freshmen are 17.** Do not serve behaviorally-targeted ads to users we know are under 18; use contextual targeting for that cohort.
- **FERPA** — Commonly misunderstood. FERPA binds *institutions*, not third-party apps that students sign up for voluntarily with their own data. We are not a FERPA-covered entity when a student creates an account on their own. **But** the moment we contract with a university and receive student records from the institution, we can become a "school official" with a legitimate educational interest — which brings real contractual duties on use, redisclosure, and destruction. Keep the consumer product and any institutional data-sharing agreements architecturally separate.
- **CIPA / session-replay claims** — California's wiretapping statute has been used aggressively against web tracking, session replay, and chat widgets. Be conservative with third-party trackers and get consent where required.

## The practical rules we should operate by

**Green — do it:**
- Official APIs, used within their documented terms and rate limits (umd.io, UIUC, Localist, NWS, Scorecard, Ticketmaster, Wikimedia, GDELT).
- Public-domain government bulk data (IPEDS, Census, BTS, DOL).
- Published feeds meant for consumption: RSS, ICS, GTFS.
- Public, logged-out HTML pages of factual information — academic calendars, fact books, CDS PDFs — fetched politely, honoring robots.txt, with a real User-Agent and contact address, at low rates, with caching.

**Yellow — proceed with care and counsel:**
- Undocumented-but-unauthenticated JSON endpoints backing public pages (Connect2Concepts, Nutrislice, some dining portals). Legally similar to public HTML, but there is no ToS grant. Rate-limit hard, cache aggressively, identify yourself, and be ready to stop if asked.
- Anything where we clicked through terms to get access.

**Red — do not:**
- Scraping behind a login, or using student credentials to reach gated data. This is the Ryanair fact pattern and the one real CFAA risk.
- Evading technical barriers: rotating residential proxies, solving CAPTCHAs, spoofing to bypass IP blocks. **This is why I recommend against ESPN's hidden API** — it is not the data that's the problem, it's that getting it requires routing around a deliberate block.
- Using a free/non-commercial API tier in a commercial product. **This applies to Open-Meteo's free tier and Reddit's free tier, both of which we would otherwise reach for.**
- Collecting personal data from social platforms about individual students without consent.
- Ignoring robots.txt.

**One organizational recommendation:** appoint a single owner for a `SOURCES.md` registry in the repo, where every ingested source has a row recording its URL, license/ToS link, rate limit, contact, and the date someone last read the terms. When you eventually raise a Series A, the diligence question "where did your data come from?" gets answered in one file instead of one panicked month.

---

# A signal quality framework

Before adding any source, score it on five axes. This is the discipline that keeps the catalog from becoming a junk drawer.

| Axis | Question | Scoring |
|---|---|---|
| **Latency** | How stale is it when we see it? | Real-time (min) = 5; daily = 4; weekly = 3; monthly = 2; annual = 1 |
| **Coverage** | What fraction of our active campuses does it exist for? | >90% = 5; 50-90% = 4; 20-50% = 3; <20% = 2; single-campus = 1 |
| **Cost** | Marginal annual cost at our scale | $0 = 5; <$1k = 4; <$10k = 3; <$50k = 2; more = 1 |
| **Stability** | Will it exist and be shaped the same in 12 months? | Gov't bulk = 5; documented vendor API = 4; open-source community API = 3; undocumented endpoint = 2; hostile scrape = 1 |
| **Predictive value** | Measured lift over baseline on a real target | Must be **measured**, never assumed |

**The critical rule: predictive value is the only axis you cannot estimate from a documentation page.** Everything else is knowable before you write code. So the workflow is: score the four cheap axes, filter, then *pilot* to measure the fifth.

## How to pilot a signal cheaply — a concrete protocol

1. **Define the target first.** For us it is almost always `attendance_rate = check_ins / rsvps` for an event, or `event_attendance` absolute. Nothing gets piloted without a named target.
2. **Build the baseline before the signal.** Baseline = club's own trailing average + day-of-week + weeks-into-term. This baseline is surprisingly strong and most candidate signals fail to beat it. Anyone proposing a new source must beat *this*, not beat zero.
3. **Backfill, don't wait.** Prefer sources with retrievable history (Open-Meteo archive, Localist past events, Wikipedia pageviews, athletics schedules) so you can evaluate on existing events in an afternoon instead of waiting a semester.
4. **Measure lift honestly.** Out-of-sample, blocked by *campus* (not random rows — random splits leak campus-level information and will flatter you badly). Report reduction in MAE against the baseline, plus a calibration plot.
5. **Set a kill threshold in advance.** E.g. "must reduce attendance MAE by ≥3% out-of-sample, or we drop it." Write it down before you look at the result.
6. **Then cost it.** A signal worth 1% lift is not worth a $30k contract and an ongoing maintenance burden. Multiply maintenance by the number of campuses — a per-campus scraper that works for 40 schools is 40 things that break.

**A prediction, to be tested rather than believed:** I expect the ranked lift order to be roughly (1) academic calendar phase, (2) competing-event density from Localist, (3) club's own trailing RSVP→attendance ratio, (4) day-of-week and time-of-day vs. the aggregate class-schedule heatmap, (5) home game / big campus event, (6) free food offered, (7) weather. I would be surprised if weather beat #4. Test it.

---

# (1) Day 1 free signal stack

Twenty sources, all free, all wireable immediately. Estimated effort: **4-6 engineer-weeks** to get all twenty flowing into a warehouse.

| # | Signal | Source | Endpoint | Verified | Effort |
|---|---|---|---|---|---|
| 1 | Institution universe + size + demographics | College Scorecard API | `api.data.gov/ed/collegescorecard/v1/schools` | **[LIVE]** | 1 day |
| 2 | Enrollment, completions **by major**, finance | IPEDS Complete Data Files | nces.ed.gov/ipeds/use-the-data | **[DOC]** | 3 days |
| 3 | **Academic calendars** (term, finals, breaks, move-in) | Curated per-school + ICS | registrar sites | **[KNOWN]** | 2 weeks (curation) |
| 4 | **Campus event landscape** | Localist API | `<host>/api/2/events?days=30&pp=100` | **[LIVE — Cornell]** | 3 days |
| 5 | Campus events (non-Localist) | LiveWhale `?format=json` | e.g. guevents.georgetown.edu | **[LIVE]** | 2 days |
| 6 | **Course sections, seats, meeting times** | umd.io | `api.umd.io/v1/courses/sections` | **[LIVE]** | 1 day |
| 7 | Same, second school | UIUC Course Explorer | `courses.illinois.edu/cisapp/explorer/schedule/2026/fall.xml` | **[LIVE]** | 2 days |
| 8 | Same, third school | Purdue.io OData | `api.purdue.io/odata/Courses` | **[LIVE]** | 2 days |
| 9 | Same, fourth school | Stanford ExploreCourses | `explorecourses.stanford.edu/search?...&view=xml` | **[LIVE]** | 2 days |
| 10 | **Weather forecast** | NWS/NOAA API | `api.weather.gov/points/{lat},{lon}` | **[LIVE]** | 1 day |
| 11 | **Historical weather** (model training) | Open-Meteo Archive | `archive-api.open-meteo.com/v1/archive` | **[LIVE]** | 1 day |
| 12 | Sunset / darkness / DST | Computed locally (`astral`) | no network | **[KNOWN]** | 2 hours |
| 13 | **Athletics schedules** | Sidearm/PrestoSports ICS + NCAA.com | per-school athletics sites | **[KNOWN]** | 1 week |
| 14 | Concerts / big local events | Ticketmaster Discovery | `app.ticketmaster.com/discovery/v2/events.json` (free key, **5,000 calls/day**) | **[DOC]** | 1 day |
| 15 | **Dining hours + menus** | Nutrislice | `<school>.api.nutrislice.com/menu/api/schools/` | **[LIVE]** | 2 days |
| 16 | **Campus liveness (gym occupancy)** | Connect2Concepts / Waitz public widgets | per-school | **[UNVERIFIED endpoint]** | 1 week |
| 17 | Campus transit | GTFS + GTFS-RT (PassioGO/TransLoc) + Mobility Database | `api.mobilitydatabase.org` (free key) | **[LIVE]** | 3 days |
| 18 | **Student newspaper coverage** | RSS feeds, ~200 papers | per-paper `/feed/` | **[KNOWN]** | 3 days |
| 19 | **News mentions per school** | GDELT 2.0 (via BigQuery) | `api.gdeltproject.org` / BQ `gdelt-bq.gdeltv2` | **[LIVE]** | 2 days |
| 20 | **Per-school attention** | Wikipedia Pageviews API | `wikimedia.org/api/rest_v1/metrics/pageviews/...` | **[LIVE]** | 4 hours |

*Plus, and above all: our own first-party event log (Section J). Ship check-ins before anything else in this table — without the label, none of the rest is supervised.*

**Bonus free-tier additions if capacity allows:** Census ACS tract-level student density (free key), city open-data business licenses, Yardi Matrix / RealPage free monthly student-housing reports, Indeed Hiring Lab GitHub data, DOL H-1B disclosure files, OpenStreetMap/Overpass POIs.

# (2) Year 1 paid stack

Deliberately small. The thesis of this report is that **the free layer plus our own first-party data is 90% of the value**, and that paid data should be bought only against a measured lift.

| Item | Vendor | Cost | Verified | Why |
|---|---|---|---|---|
| Weather (commercial-compliant historical) | Open-Meteo Professional | 1-2 months only, to bulk-pull the archive, then cancel. Price not published **[UNVERIFIED]**; budget **$500** | **[DOC]** | The free tier is **non-commercial** — this is a compliance purchase. Production forecasts stay on free NWS. |
| POI / local business data | Google Places API | **$5.00/1k** Place Details (Essentials); **$32.00/1k** Nearby/Text Search (Pro), with per-SKU free allowances. Budget **$3,000/yr** | **[DOC]** | Sponsor prospecting near campus. Mind the 30-day caching restriction. |
| Local business enrichment | Yelp Fusion | Paid plans, pricing not published **[UNVERIFIED]**. Budget **$3,000/yr** | **[DOC]** | Ratings/price tier that Google lacks. Optional — OSM + Places may suffice. |
| Reddit commercial license | Reddit | Widely reported ~**$0.24/1k calls** **[UNVERIFIED]**; requires a commercial agreement. Budget **$5,000/yr** | **[UNVERIFIED]** | Only if a pilot proves campus-subreddit signal beats the baseline. **Do not use the free tier commercially.** |
| Google Trends official API | Google | Application-based, alpha **[UNVERIFIED]** | **[UNVERIFIED]** | Metro-level category interest. Apply early; it's free or cheap if granted. |
| BigQuery compute | Google Cloud | ~$6.25/TB scanned. Budget **$2,000/yr** | **[KNOWN]** | GDELT at scale without a 2.5TB download. |
| Warehouse + orchestration | Postgres/DuckDB + Dagster/Airflow on modest cloud | **$6,000/yr** | — | The actual cost center. Data plumbing, not data. |
| **Contingency: foot traffic pilot** | Advan or Dewey (via a university research partner) | **$15,000-40,000 [UNVERIFIED]** | **[DOC]** | **Only if** we have a signed ad customer who needs attribution. Do not buy speculatively. |

**Realistic Year 1 data budget excluding the foot-traffic contingency: roughly $20,000.** That is a genuinely small number, and it is the right one. Almost everything that moves the needle for a college-club product is free; the scarce resource is engineering time and campus coverage, not licensed data.

**What I would explicitly NOT buy in year one:** Placer.ai, CoStar, RealPage or Yardi underlying data, Lightcast, Revelio, Sportradar, Cirium/OAG, NewsAPI, Sensor Tower, X/Twitter API. Every one is either enterprise-priced, duplicative of a free source, or solving a problem we do not yet have.

---

# (3) Three worked exogenous signal chains

## Chain 1 — "Move your GBM": exam calendar + competing events + weather → predicted attendance → reschedule recommendation

**The Minneapolis analogue:** inbound flights → predicted restaurant demand → targeted pizza ad. Here: calendar + competition + weather → predicted attendance → a scheduling recommendation.

**Inputs, all free:**
- Academic calendar → `weeks_into_term`, `days_to_first_final`, `is_reading_day`, `is_break` (curated, **[KNOWN]**)
- Aggregate class-meeting heatmap from the course API → `pct_students_in_class(dow, hour)` (**[LIVE]** via umd.io/UIUC/Purdue)
- Localist `/api/2/events` → `competing_events_within_2h(datetime)`, weighted by venue capacity (**[LIVE]**)
- Athletics ICS → `is_home_game`, `kickoff_time`, `stadium_capacity` (**[KNOWN]**)
- NWS `/forecast/hourly` → `precip_prob`, `temp_f`, `wind` at event hour (**[LIVE]**)
- Locally computed `is_after_sunset`
- Nutrislice → `dining_open_at_event_time` (**[LIVE]**)
- First-party → club's trailing RSVP→check-in ratio, roster size, last-3-event attendance

**Model:** gradient-boosted regressor on `check_ins`, trained on our own historical events, blocked by campus for validation. Baseline to beat: club trailing average × day-of-week factor.

**The product moment.** An officer picks Wednesday Nov 18, 7pm. We respond:

> "Heads up — Nov 18 is three days before finals start, there are 22 other events on campus that night, and it's forecast to rain. We predict **18 attendees (down from your usual 34)**. **Thursday Nov 5 at 7pm** looks much better — 6 competing events, clear weather, and it's before the pre-finals drop-off. Predicted: **41**."

That is the whole company in one interaction, and every input is free.

**Monetization:** the same prediction prices inventory. A sponsor paying for on-site presence at a predicted-41 event should pay more than at a predicted-18 event. We can price ad inventory on *predicted* rather than *historical* attendance, which is a genuine advantage over every campus-marketing incumbent.

## Chain 2 — Move-in + lease-up cycle → apartment ad demand

**The chain:** move-in dates and the student-housing pre-lease calendar jointly determine when off-campus housing advertisers are most desperate, and our audience is exactly their target.

**Inputs:**
- Registrar move-in/orientation dates per school (free, curated)
- IPEDS/CDS `% of students living on campus` → **the off-campus addressable population**, directly (free)
- Census ACS tract-level college-enrollment density → where off-campus students actually live (free)
- Yardi Matrix / RealPage free monthly student-housing pre-lease reports → market-level pre-lease %, rent growth (free)
- OSM/Places → purpose-built student housing properties within 2 miles of campus (free/cheap)
- First-party → first-year vs upperclass mix, app opens by cohort, search queries containing housing terms

**The insight that makes this work.** Student-housing pre-leasing runs a punishing annual cycle: properties begin pre-leasing for *next* fall in **September**, and a property behind its pre-lease pace by spring is in real trouble. The demand curve for student-housing advertising therefore peaks not at move-in but in **late September through February**, and peaks hardest in markets where pre-lease pace is lagging.

**The product:** sell a "Housing Season" ad package to properties near campuses where (a) our user base skews sophomore/junior — the cohort deciding where to live next year — and (b) the market's pre-lease pace is below prior year. We can identify (b) from a free monthly PDF. Pricing signal: a market lagging on pre-lease is a market whose properties will pay a premium.

**Zero-cost pilot:** cross-reference our sophomore/junior user counts per campus against the current free Yardi report, rank markets by lag, and cold-email the ten worst-performing properties near our top five campuses. If that converts, the signal is real and worth automating.

## Chain 3 — Recruiting calendar + club category → employer ad demand and club advice

**The chain:** employer recruiting deadlines drive pre-professional club activity on a 3-6 week lead, which drives both member demand and employer ad demand.

**Inputs:**
- Curated recruiting calendar: IB sophomore/junior deadlines, consulting Aug-Oct cycle, Big Tech intern openings, Big 4 timelines (free, curated)
- IPEDS completions by CIP + institutional fact books → count of finance/CS/consulting-track students per campus (free)
- College Scorecard field-of-study earnings → which majors at this school lead to high-paying outcomes (free)
- Indeed Hiring Lab weekly sector indices → is this sector hiring up or down (free, GitHub)
- DOL H-1B/PERM filings → which employers hire in this metro at what wage (free)
- GDELT + student newspaper RSS → local coverage of career fairs, recruiting news (free)
- First-party → **search queries** ("consulting", "case interview"), club page views by category, RSVP velocity for pre-professional clubs

**The mechanism.** Consulting applications close late September. Case-interview-prep demand spikes in **August and early September**, three to five weeks earlier. Our first-party search and page-view data will detect that spike *in real time*, and the curated recruiting calendar lets us anticipate it *before it happens*.

**Two products from one chain:**

1. **Club advice (free, drives retention):** "Case-prep searches on your campus are up 3x week-over-week and consulting deadlines are in 24 days. Clubs that ran a case workshop in this window last year saw 2.4x normal attendance. Here's a workshop template." This is the "OS for clubs" promise delivered with a quant engine behind it.

2. **Employer ads (revenue):** employers and test-prep/interview-prep companies pay a large premium for the 3-week pre-deadline window, targeted at campuses with a high count of relevant majors (IPEDS) and measured rising category interest (first-party search). We can prove both the audience size and the momentum — which is more than a campus flyer company can do.

**Why this is the highest-margin chain of the three:** the exogenous inputs are all free and mostly *curated once per year*, the first-party inputs we already generate, and the buyer (employer brand teams, prep companies) has the largest budget of any advertiser who wants a college-club audience.

---

## Closing note on sequencing

If I had to compress this entire catalog into one recommendation: **ship check-ins, curate 200 academic calendars, and wire up Localist.** Those three things — one first-party, one human-curated, one free API — will produce more predictive power than every paid vendor in sections F and G combined. Everything else in this document is an enhancement to that core.

The founder's flights-to-pizza instinct is correct, and the campus version of "inbound flights" is not flights at all. It is the academic calendar, the competing-events feed, and the class-schedule heatmap: three free, high-frequency, universally-available signals that almost nobody in the campus-software market is using.
