# 26 — Campus type and color

*Visual brief, 2026-09-11. Not a strategy reopen. Users are club members and officers (18–24), demo Maya / Baja Racing treasurer, Northfield. Universities are not the customer. Front stays Canvas-shaped; type and color must stop reading as a dead LMS.*

---

## 0. What is already true

The product already stole the right **structure** from Canvas: 84px global rail, porcelain work area, six club tabs, club hue as identity only ([`research/01-canvas-lms.md`](01-canvas-lms.md), [`research/17-design-craft.md`](17-design-craft.md) §3). The current CSS then copied InstUI’s **classic palette and IBM Plex** on top of that structure.

That is why the live site feels like a quiet LMS. InstUI’s shipped tokens are brand/electric `#0374B5`, licorice `#2D3B45`, porcelain `#F5F5F5`, ash `#6B7780`, fire `#FC5E13` ([`research/17-design-craft.md`](17-design-craft.md) §3.2, sourced from Instructure UI `ui-theme-tokens`). Canvas body type is **Lato**, 14px, weights 300/400/700 ([Instructure Community](https://community.instructure.com/en/discussion/650695/is-there-a-difference-between-the-default-font-in-free-canvas-and-canvas-lms); [2016-12-10 release notes via Community](https://community.instructure.com/en/discussion/532204/what-is-the-default-font-in-the-wysiwyg-editor-in-canvas)). Students already report Canvas color changes making the product “hard to read again” ([Community thread](https://community.instructure.com/en/discussion/653205/the-coloring-was-changed-again-and-canvas-is-hard-to-read-again)).

IBM Plex is a legitimate screen family, but it is IBM’s voice. On this chrome it reads as institutional software for staff, not a club tool a first-year would open after GroupMe.

Rejected already, do not reopen: warm cream + serif “AI slop”; Slack-corporate chat; Codex dark-earth marketing skin ([`research/17-design-craft.md`](17-design-craft.md) §1.2; this brief).

---

## 1. Type — what the sources say

**Readability at 14px is a geometry problem, not a vibe.** Inter was built for UI and sets x-height at 3/4 of cap height, borrowed from Roboto / SF / Helvetica ([Figma, “The birth of Inter”](https://www.figma.com/blog/the-birth-of-inter/)). That is why it works at 12–14px — and why it is now the default. An August 2026 HN thread lists **“Inter / Roboto / Geist as the default tasteful font”** as a vibe-coded tell ([HN 49294522](https://news.ycombinator.com/item?id=49294522)). Geist’s own README names Inter among its influences ([github.com/vercel/geist-font](https://github.com/vercel/geist-font)). Our own craft doc already locked this: Geist is inside the slop set ([`research/17-design-craft.md`](17-design-craft.md) §1.5).

**DM Sans** is the usual “not Inter” recommendation for 12–14px UI: taller x-height than Lato or Open Sans, tabular figures, slightly warmer than Inter ([FontFYI, DM Sans guide](https://fontfyi.com/tr/blog/dm-sans-font-guide/)). It is a good font and a 2026 SaaS default ([SaaS typography guide, 2026](https://brand-generator.com/blog/typography-guide-saas)). Too close to “every new dashboard.”

**Figtree** (Erik Kennedy, Google Fonts, OFL) was drawn as a geometric for **web and mobile apps**: high x-height, monolinear, friendly `t/f/y`, **built-in tabular / monospace figures** for money columns ([designer notes](https://www.erikdkennedy.com/projects/figtree.html); [Google Fonts specimen](https://fonts.google.com/specimen/Figtree)). It is warmer than Inter, less corporate than Plex, and not Lato. That matches a treasurer reading a ledger at 14px on a phone between classes.

**Bricolage Grotesque** (Mathieu Triay; fork of Landes’ Mayenne Sans + Antique Olive + Stephenson Blake grotesques) is the one characterful face. Triay calls the stance **“restrained quirkiness”** — French width, British compression, optical-size axis so display energy can quiet down ([ateliertriay.github.io/bricolage](https://ateliertriay.github.io/bricolage/); [Web Designer Depot launch](https://webdesignerdepot.com/bricolage-grotesque-launches-to-the-public/)). Workshop letterforms fit Baja, SHPE, NSBE, APO: making, service, chapter rooms — not a procurement portal. Use it only on page titles (~22–26px). A 48px marketing hero is banned by this brief.

Serifs (Newsreader, Fraunces, Source Serif) are out: they are the cream + serif default. Inclusive Sans / Atkinson (where InstUI 11.7 is heading) would make us look like *next* Canvas, not unlike Canvas.

---

## 2. Color — alive on a work surface

**Canvas got one color job right and then used the wrong blue.** Steal: color marks *identity* (course/club), chrome stays quiet, left-aligned work area ([`research/17-design-craft.md`](17-design-craft.md) §3.1). Refuse: the dusty electric `#0374B5` and muddy licorice `#2D3B45` as *our* brand. Those hexes *are* the LMS.

**iMessage** puts life in one saturated bubble (`#007AFF` system blue) on a light field, not in the chrome ([Apple HIG via contrast writeup](https://digitalthriveai.com/en-au/resources/web-design/apple-messages-color-contrast/); common reconstruction RGB ~8, 127, 254). Steal the *job*: one clear send color. Refuse cloning Apple blue.

**GroupMe** (`#00AFF0` on Simple Icons, sourced from groupme.com) is the campus chat students already live in: bright, slightly cyan, almost no chrome. Steal list + bubble energy. Refuse making the whole OS cyan; `#00AFF0` on white is lively and weak on contrast.

**BeReal** is true-black `#000000`, SF Pro only, no brand accent — anti-Instagram as a philosophy ([BeReal DESIGN.md](https://github.com/Meliwat/awesome-ios-design-md/blob/main/design-md/social/bereal/DESIGN.md); [Davis et al., CSCW 2024](https://katiedavisresearch.com/wp-content/uploads/2026/02/2024.CSCW_.BeReal.pdf)). Steal restraint and authenticity. Refuse the black canvas and the Codex-adjacent nightclub. This product is a daytime record, not a disposable camera.

Gen Z “tactile maximalism” and neon-on-black writeups (electric purple, acid green) are for entertainment apps ([Aufait UX, 2026](https://www.aufaitux.com/blog/tactile-maximalism-gen-z-ui/)). Productivity surfaces that stay usable use **one clearer accent on a light field**, not a feed of gradients. Soft pastels belong to wellness apps, not a racing-team ledger.

**Accessibility is the constraint that kills neon.** WCAG 2.2 AA: normal text **4.5:1**, large text **3:1** ([Understanding 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)); UI boundaries that identify a control **3:1** ([Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)). Canvas’s own 2021 token update moved electric / ash / crimson / shamrock *specifically* for contrast ([instructure-ui commit a72237d](https://github.com/instructure/instructure-ui/commit/a72237dc213b86aa8f18da2618559ea4c118e1dd)). Measured on this brief’s candidates (relative-luminance, WCAG formula):

| Pair | Ratio | Notes |
|---|---|---|
| ink `#1A2330` on porcelain `#F0F3F8` | 14.2:1 | Body text |
| signal `#0C5FBF` / white | 6.2:1 | Links + primary button (AA) |
| pulse `#C2410C` / white | 5.2:1 | Rare live/urgent (AA) |
| Canvas electric `#0374B5` / white | 5.0:1 | Passes, duller |
| Canvas fire `#FC5E13` / white | 3.1:1 | Fails normal text |
| Canvas ash `#6B7780` on `#F5F5F5` | 4.2:1 | Fails AA |

So “more alive” here means **darker ink, a cleaner lake blue, and an orange that actually passes** — not brighter neon.

---

## 3. Steal vs refuse

| Source | Steal | Refuse |
|---|---|---|
| Canvas | 84px rail, six-tab club nav, porcelain work, club color = identity | Lato, InstUI electric/licorice/fire, 300-weight type, Theme-Editor gray |
| GroupMe | Simple lists, one bright accent, low chrome | Cyan fill, chat-app as the whole product |
| iMessage | One send color on a light field | Apple `#007AFF` clone, bubble-as-layout |
| BeReal | Honesty, no decorative gradient | True black, SF-only, anti-design as costume |
| Instagram / Discord neon | — | Gradients, nightclub, ML-shaped color |

---

## 4. Locked tokens — implement these, do not invent a second set

### Fonts (2)

| Role | Face | Use |
|---|---|---|
| **UI / body** | **Figtree** | 14px / 400–600. Tables use `tabular-nums` (Figtree’s built-in lining figures). |
| **Display** | **Bricolage Grotesque** | Page titles only (`h1`, `.text-title-1`), 22–26px, weight 600. Not a hero. |

Fallbacks: Figtree → Helvetica Neue / Arial. Bricolage → Figtree. Mono = system `ui-monospace` for rare code-ish labels; not a third webfont.

### Colors (6 named hex)

| Name | Hex | Job |
|---|---|---|
| **ink** | `#1A2330` | Body text. Cooler/darker than Canvas licorice. |
| **rail** | `#1C2B3A` | Global nav. Licorice-*ish* navy, not Codex brown. |
| **porcelain** | `#F0F3F8` | Work area. Cooler than dead `#F5F5F5`, not cream `#F4F1EA`. |
| **paper** | `#FFFFFF` | Cards, club rail, chat list. |
| **signal** | `#0C5FBF` | Links, focus, **one** primary button. Never a club fill. |
| **pulse** | `#C2410C` | Rare now/unread/overdue. Never the primary button. |

Derived only (not new brand colors): `oxford #2A3D50` rail hover; `ash #4F5C6A` secondary text (6.2:1 on porcelain); `tiara #C5CED8` hairlines; `navy #122033` skip-link / darkest fill. Club dots stay the existing 12 club hues. Shamrock / crimson stay ledger semantics.

CSS map (keep old names so components do not fork): `--ink`, `--licorice` = the **rail** color `#1C2B3A`, `--porcelain`, `--paper`, `--electric` = signal, `--fire` = pulse. Do not bind the rail color to `--rail` — that token is already the 84px column width.

### What this is not

Not a seventh club tab. Not Cards/List switchers. Not a landing hero. Not dark mode. Not cream serif. Not Geist. Not filling the primary button with Baja orange.
