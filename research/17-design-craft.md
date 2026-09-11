# 17 — Design Craft: How to Build Software That Reads as Handmade

*Research compiled 2026-09-10. Every claim is linked to a primary source. Section 9 is a directly implementable design system spec.*

---

## 0. The thesis in one paragraph

"AI slop" is not a style. It is the **absence of decisions**. Every visual tell people recognize as machine-made — the violet-to-blue gradient, the untouched shadcn defaults, the emoji standing in for an icon set, `rounded-2xl` on a table row — is a place where a default was accepted instead of chosen. Craft, conversely, is legible as *evidence of choice*: a type scale with odd numbers in it because someone measured; a 13px row height because 14 wrapped at the third column; a focus ring that is 2px and offset 2px because 1px disappeared on a Retina display at 90% zoom. Jim Nielsen puts the mechanism precisely: "Systems prescribe rules because they are the easiest attributes to document, enforce, and automate," and so "consistency for the group becomes a ceiling on individual excellence" ([Consistency, But in Excellence Not Appearance](https://blog.jim-nielsen.com/2026/a-consistency-of-excellence/)). Our job is to build a system tight enough that an engineer never has to invent a value, and loose enough that the ten surfaces students actually touch every day are each individually excellent.

---

## 1. Diagnosing "AI slop" precisely

### 1.1 Where the word comes from

"Slop" entered the vocabulary in May 2024 via a post by @deepfates and Simon Willison's amplification of it: *"'slop' is going in the dictionary as the term for unwanted AI generated content."* Willison's criteria are the useful part — content is slop when it is **mindlessly generated, thrust on someone who didn't ask for it, and unreviewed before being shared** ([simonwillison.net](https://simonwillison.net/2024/May/8/slop/)). Transposed to interface design, the third criterion is the operative one. Slop UI is UI nobody looked at a second time.

### 1.2 The 2025–2026 visual tells

Jim Nielsen catalogued the emerging "AI aesthetic" in July 2026 ([The AI Aesthetic](https://blog.jim-nielsen.com/2026/ai-aesthetic/)). His list, plus what is observable across the generated-app long tail:

| Tell | Why it happens | What it signals to a user |
|---|---|---|
| ✨ sparkle icon | Nielsen: seeing ✨ "now it means AI" | The product is about the model, not the job |
| Violet→blue or indigo→fuchsia gradient | Tailwind's `from-violet-500 to-blue-500` is the path of least resistance | Nobody chose a brand color |
| Glassmorphism cards over a blurred blob | One `backdrop-blur` + one radial gradient = "designed" | Depth used decoratively, not to encode hierarchy |
| Inter at 400/600, nothing else | The framework default | No typographic voice |
| **Geist**, as the "tasteful" escape from Inter | It is the new default | Same tell, one hop later — see §1.5 |
| Untouched shadcn/ui tokens | `npx shadcn init`, accept zinc, `--radius: 0.5rem`, ship | The whole app is a demo |
| Emoji as iconography (📊 💰 🎉 in nav) | No icon budget | Amateur; also breaks across platforms and screen readers |
| `rounded-2xl` on everything | One radius token applied without a scale | Radii stop meaning anything |
| Drop shadows at every level | `shadow-lg` on cards, inputs, rows | No elevation model |
| Marketing-page layout inside the product | Centered `max-w-4xl`, huge vertical rhythm, hero headline on a *settings* page | The designer never used the product daily |
| Stock 3D isometric illustration / gradient mesh blob | Free asset packs | Nothing depicted is real |
| Beige/cream + orange + serif headline | Nielsen names this exact combo as the 2026 AI-app house style | You look like every LLM wrapper |
| Shimmer/streaming text for non-AI loading | Copied from chat UIs | Fake sophistication |
| Tiny thin 1px-stroke icons in a desktop app | Nielsen: AI desktop apps use icons "notably smaller" than native ones | Visual discord with the OS |
| Over-animation: everything fades+slides in on scroll | `framer-motion` `whileInView` defaults | Slow; hostile to repeat users |
| Copy shaped like lorem ipsum ("Streamline your workflow", "Everything you need, nothing you don't") | Generated headline priors | No one wrote this |

### 1.3 The structural tells (harder to see, more damning)

These matter more than the color choices, because they are what a *daily* user feels:

- **Spacing that is inconsistent between sibling components.** A card with `p-6` next to a card with `p-4` next to a list with `py-3`. The eye reads it as sloppiness before the brain names it.
- **Density calibrated for a landing page, not a workspace.** Generated product UI almost always has ~2× the whitespace a real operator wants. Linear's own redesign went the other way: they "adjusted the sidebar, tabs, headers, and panels to reduce visual noise" in order to increase "hierarchy and **density** of navigation elements" ([Linear: How we redesigned the Linear UI](https://linear.app/blog/how-we-redesigned-the-linear-ui)).
- **No empty states, or cheerful fake ones.** Rauno Freiberg's guideline: "Empty states should prompt to create a new item, with optional templates" ([Web Interface Guidelines](https://github.com/raunofreiberg/interfaces)).
- **No focus-visible styling**, no keyboard path, no `aria-label` on icon buttons.
- **Optimistic UI absent.** Every action round-trips with a spinner. Rauno again: "Optimistically update data locally and roll back on server error."
- **Font weight changes on hover**, causing a 1px layout shift — Rauno: "Font weight should not change on hover or selected state to prevent layout shift."
- **Tabular numerals never applied**, so money columns jitter. Rauno: "Where available, tabular figures should be applied with `font-variant-numeric: tabular-nums`."

### 1.4 The deeper diagnosis: committee-shaped and default-shaped look identical

Nielsen's essay on logo homogeneity argues that corporate sameness comes from risk aversion — "there's tremendous pressure to look legitimate by conforming to established visual language" — and that individuals and small teams keep "authentic visual languages reflecting their values," because nobody sands the edges off ([Visual Design Homogeneity at Scale](https://blog.jim-nielsen.com/2025/visual-design-homogeneity-at-scale/)). AI-default design and committee design converge on the same output for the same reason: **both optimize for not being wrong rather than for being specific.** Our advantage is that we are small and can be specific.

And on why craft is worth the cost at all, Nielsen's "Craft and Satisfaction": *"An obsession with the details of what goes in drives your satisfaction of what comes out"* — and craftspeople "care, we notice, we get joy from the aesthetics of the craft" even when others won't see the details ([link](https://blog.jim-nielsen.com/2025/craft-and-satisfaction/)). Students will not consciously see the 2px focus offset. They will feel the aggregate.

### 1.5 The typeface trap has already moved

The most useful single data point in this whole research pass comes from an August 2026 Hacker News thread, "Ask HN: How can you tell a site/app is vibe coded?" One commenter's list of tells includes, verbatim: **"Inter/Roboto/Geist as the default 'tasteful' font,"** with the observation that "every llm 'reasons' themselves into using the same choices so the sites all look the same" ([HN 49294522](https://news.ycombinator.com/item?id=49294522)).

**Geist is already inside the slop set.** Picking Geist to escape Inter escapes nothing. And Geist's own README concedes the lineage — it names its influences as *"Inter, Univers, SF Mono, SF Pro, Suisse International, ABC Diatype Mono, and ABC Diatype"* ([github.com/vercel/geist-font](https://github.com/vercel/geist-font)). It is a remix of exactly the set of faces that constitute the default look.

Inter itself was engineered as a synthesis, not a voice: Rasmus Andersson built it after Figma's month-long search for a Roboto replacement failed, and its x-height is **exactly 3/4 of cap height**, a ratio taken from Roboto, San Francisco and Helvetica ([The birth of Inter](https://www.figma.com/blog/the-birth-of-inter/)).

One useful corollary: **"Inter Display" is not a separate family — it is `opsz` 32.** Inter's variable axes are `opsz` **14–32** and `wght` 100–900. Most teams who ship Inter never touch the optical-size axis, and therefore render the 14pt *text* design at 48px headline sizes. That is a large part of why default-Inter headlines look inert — and it is a one-line fix (`font-optical-sizing: auto`) that almost nobody applies.

### 1.6 The single best anti-slop heuristic

**If a value in your CSS is the framework's default, you must be able to say why you kept it.** Keep `zinc`? Fine — but say why zinc and not a warm gray. Keep `0.5rem` radius? Fine — but then no other radius may appear without a reason. The audit is: grep the codebase for raw hex, raw px, and Tailwind arbitrary values; every hit is an undecided decision.

---

## 2. What "crafted" software actually does differently

### 2.1 Linear — the most-copied and least-understood reference

Linear's own writeup of its UI redesign is the single most useful primary source we have, because it names mechanisms rather than adjectives ([linear.app/blog/how-we-redesigned-the-linear-ui](https://linear.app/blog/how-we-redesigned-the-linear-ui)):

- **Color is generated, not picked.** They moved from HSL to **LCH** because it is perceptually uniform across hues, and collapsed the theme definition from **98 variables per theme down to three inputs**: a base color, an accent color, and a contrast value. Everything else is derived. This is why Linear can ship an automatic high-contrast theme, and why their themes never have one hue that reads heavier than the others.
- **They deliberately drained chroma.** They "limited how much chrome was used in the calculations applied to our color system" to get a neutral, timeless look. The lesson: *saturation is the first thing to cut when you want to look expensive.*
- **Text contrast was raised** — darker text and neutral icons in light mode, lighter in dark mode.
- **Typography is two optical sizes of one family**: Inter Display for headings ("to add more expression to our headings while maintaining their readability"), Inter for body. Note what this is *not*: Inter at one optical size everywhere, which is the slop pattern. The craft is in using the *display* cut where it belongs.
- **Density is a goal, not a side effect.** They rebuilt sidebar/tabs/headers "to reduce visual noise, maintain visual alignment" and explicitly to increase "hierarchy and density of navigation elements."
- **Optical alignment is manual.** They describe meticulously aligning "labels, icons, and buttons vertically and horizontally in the sidebar and tabs," calling it "a challenge given the amount of UI elements we have on this tiny surface." Nobody automates this. It is the work.

Linear frames its whole methodology around "a lost art of building true quality software" ([Linear Method](https://linear.app/method)). Brand constants: **Mercury White `#F4F5F8`**, **Nordic Gray `#222326`**, and the spacing instruction "Make them big or make them small, but give them room to breathe" ([linear.app/brand](https://linear.app/brand)).

**The 2026 refresh** ([Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)) went further in exactly the direction we should go:

- **They moved off cool neutrals toward warm ones.** "The old palette was a cool, blue-ish hue, and the aim was to inch toward a warmer gray that still feels crisp, but less saturated." (Our neutral ramp in §9.2 is warm for the same reason.)
- **They built a custom color picker** to tune hue/chroma/lightness per token. Tooling is a design deliverable.
- **Density went up again**: smaller text in tabs and sidebar, "a more compact layout overall, with smaller icon-only pills."
- **Fewer and smaller icons**, and they deleted "unnecessary visual treatments like colored team icon backgrounds."
- **Borders softened**: "Rounding out their edges and softening the contrast," with fewer separators overall.
- The governing line, which should be on our wall: **"Structure should be felt not seen."** And: **"Surface exactly what you need, when you need it."**

Their StyleX migration ([Styling Linear for the future](https://linear.app/now/styling-linear-for-the-future-stylex)) is the engineering half: **1,000+ PRs over six months**, measured at **~20–35% less main-thread CPU on view-heavy pages (~30% faster on mid-tier machines)**, and — notably — themes are *still* algorithmically generated, deriving **100+ LCH color variables from a base color plus an accent**. Lint rules enforce that colors, typography, shadows and animations may only come from tokens.

Karri Saarinen's framing of the AI-era risk is the thesis of this whole document ([Output isn't design](https://linear.app/now/output-isn-t-design)): AI tools "generate plausible outputs quickly, but they do not necessarily help you understand the underlying problem," producing products that "feel brittle, poorly integrated, and full of decisions that were never fully worked through." **"The risk is mistaking generated form for solved problems."**

### 2.2 Rauno Freiberg's Web Interface Guidelines — the checklist

Rauno (Vercel) maintains the closest thing the industry has to a craft checklist ([interfaces.rauno.me](https://interfaces.rauno.me/), [source](https://github.com/raunofreiberg/interfaces)). The rules we should adopt wholesale:

**Typography**
- `-webkit-font-smoothing: antialiased` and `text-rendering: optimizeLegibility`
- "Fonts should be subset based on the content, alphabet or relevant language(s)"
- "Font weight should not change on hover or selected state to prevent layout shift"
- **"Font weights below 400 should not be used"**
- "Medium sized headings generally look best with a font weight between 500-600"
- `font-variant-numeric: tabular-nums` wherever numbers align
- `-webkit-text-size-adjust: 100%` to stop iOS landscape resizing

**Motion**
- **"Animation duration should not be more than 200ms for interactions to feel immediate"**
- Scale values proportional to trigger size, not extreme ranges
- "Switching themes should not trigger transitions and animations on elements"
- "Looping animations should pause when not visible on the screen"
- Frequent, low-novelty actions get *no* animation

**Interactivity**
- "Clicking the input label should focus the input field"
- "Inputs should be wrapped with a `<form>` to submit by pressing Enter"
- "Toggles should immediately take effect, not require confirmation"
- "Buttons should be disabled after submission to avoid duplicate network requests"
- "Interactive elements should disable `user-select` for inner content"
- "Decorative elements (glows, gradients) should disable `pointer-events`"
- **"Interactive elements in a vertical or horizontal list should have no dead areas between each element, instead, increase their `padding`"** — this one alone separates crafted lists from generated ones
- Input icons absolutely positioned over the field with padding, not siblings next to it

**Touch**
- `@media (hover: hover)` so hover states don't stick on touch
- **Input font-size ≥ 16px** or iOS zooms the page
- No autofocus on touch devices
- `-webkit-tap-highlight-color: rgba(0,0,0,0)`

**Accessibility**
- **"Box shadow should be used for focus rings, not outline"**
- "Disabled buttons should not have tooltips, they are not accessible"
- Sequential lists navigable with ↑ ↓ and deletable with ⌘⌫
- "Dropdown menus should trigger on `mousedown`, not `click`"
- Icon-only controls require explicit `aria-label`
- SVG favicon with an embedded `<style>` that follows the system theme
- Gradient text must unset the gradient on `::selection`

**Design**
- "Optimistically update data locally and roll back on server error"
- "Empty states should prompt to create a new item, with optional templates"
- Style `::selection`
- Show feedback near its trigger point

**Performance**
- Large `blur()` / `backdrop-filter` values are slow
- Scaling/blurring filled rectangles causes banding — use radial gradients
- Bypass React's render lifecycle with refs for real-time DOM values

### 2.3 Emil Kowalski on motion

From "Great Animations" ([emilkowal.ski/ui/great-animations](https://emilkowal.ski/ui/great-animations)) — seven tests an animation must pass:

1. **Natural** — springs, because instant state changes "make the experience feel artificial."
2. **Fast** — `ease-out`, "usually shorter than 300ms."
3. **Purposeful** — and critically, **"never animate keyboard initiated actions"**, because power users hit them hundreds of times a day.
4. **Performant** — animate only `transform` and `opacity` (composite-only); use CSS or WAAPI so it survives main-thread jank.
5. **Interruptible** — the user must be able to reverse mid-flight.
6. **Accessible** — `prefers-reduced-motion`.
7. **Right** — requires iteration and fresh eyes.

### 2.4 Vercel's Geist — the scale structure worth stealing

Geist ([vercel.com/geist/introduction](https://vercel.com/geist/introduction), [colors](https://vercel.com/geist/colors)) ships 10 color scales (`backgrounds`, `gray`, `gray-alpha`, `blue`, `red`, `amber`, `green`, `teal`, `purple`, `pink`), each with **10 steps, 100–1000**, and each step has an assigned *job*:

| Steps | Job |
|---|---|
| 100–300 | Background: default, hover, active |
| 400–600 | Border: default, hover, active |
| 700–800 | High-contrast (solid) backgrounds |
| 900–1000 | Text and icons |

Plus a separate two-value `backgrounds` scale (Background 1 = default surface, Background 2 = subtle differentiation). They serve P3 on supported displays. Geist also treats **grid** as brand: "a core part of the Vercel aesthetic." The transferable idea: **a color step is a role, not a shade.** You never pick "gray-400 because it looks right"; you pick it because it is the default border.

### 2.5 The deliberately-plain school (37signals)

Worth holding as a counterweight to Linear-worship. DHH on Fizzy, their open-source Kanban: *"good ideas can grow cumbersome and unwieldy surprisingly quickly. Fizzy is a fresh reset of an old idea"* ([world.hey.com/dhh](https://world.hey.com/dhh/fizzy-is-our-fun-modern-take-on-kanban-and-we-made-it-open-source-54ac41b6)). Campfire/ONCE ([once.com](https://once.com/campfire)) is deliberately unfashionable: big hit targets, plain type, almost no animation, near-zero chrome. The craft signal there is *restraint and speed*, not polish. For a club OS used by 19-year-olds on mid-range Androids on campus wifi, this school matters as much as Linear's.

### 2.6 Icon strategy, empirically

- **Lucide** — 1600+ icons, ISC license ([lucide.dev/guide](https://lucide.dev/guide/)). Excellent, and *instantly recognizable as a default*. Using it untouched is a slop tell.
- **Phosphor** — "1,248 icons and counting" in **6 weights** (Thin, Light, Regular, Bold, Fill, Duotone), "Designed at 16 × 16px to read well small and scale up big," MIT ([github.com/phosphor-icons/homepage](https://github.com/phosphor-icons/homepage)). The 16px design grid is the important detail: it means Phosphor holds up in a dense 20–24px row, which Lucide's 24px grid does not always do.
- **Radix Icons** — 15×15 grid, very restrained, small set.
- **SF Symbols** — Apple-licensed, only usable in Apple platform apps.

The crafted move is: **pick one base set, then hand-draw the 12–20 icons that are specific to your domain** (a club, a budget line, a reimbursement, a room booking, an officer transition). Those are the icons users see most, and they are the ones that can't be generic.

---

## 3. Canvas specifically: what to borrow, what to fix

### 3.1 What Canvas actually is, visually

Canvas is the reference the founder named, so be precise about *why* it works. Canvas's calm comes from four things, none of which are exciting:

1. **A thin, permanent global rail** — Account, Dashboard, Courses, Calendar, Inbox, History, Help — that never changes and never scrolls. Everything else lives inside a course. See track 01 for the full IA. The result: a student who learns one course knows all five.
2. **One space type with one identical tool palette.** Canvas has exactly one container (Course) and one sub-container (Group), and both expose the same menu. Uniformity, not richness, is the feature.

**The production grid** (from `canvas-lms/app/stylesheets/base/_variables.scss`, AGPL source):

| Region | Width |
|---|---|
| Global icon rail | **84px** (104px when the OpenDyslexic option is on; 54px minimized) |
| Course nav | **175px** |
| Content | min 510px, **max 1100px** |
| Right sidebar ("To Do") | **286px** |
| Base spacing unit `$ic-sp` | **12px** |
| Base radius | **6px** |
| Dashboard card | **262px** wide, 146px color header band, 4px radius |
| Breadcrumbs | 72px tall |

Global nav order is fixed: logo → Account → Admin → Dashboard → Courses → Calendar → Inbox → History → LTI tools → Help, preceded by a `#content` skip link and labelled `aria-label="Global Navigation"`.

One production smell worth knowing about, because it is exactly the kind of thing that accumulates: `_variables.scss` carries `$h1: 23px; $h2: 14px; $h3: 19px` under a comment reading "Legacy variables. Discontinue to use these." **H2 is smaller than H3 and smaller than body text**, and has been shipping for a decade. Dead tokens don't die; they get used.
3. **Almost no color.** Color in Canvas is used for exactly one job — *identity* (the per-course card color, which propagates to that course's calendar events). Chrome is gray. This is the single most valuable thing to steal.
4. **Left-aligned, top-anchored, non-centered layouts.** Canvas never centers product content in a 900px column the way a marketing template does.

### 3.2 InstUI (Instructure UI)

Instructure open-sources its design system as **Instructure UI / InstUI** ([github.com/instructure/instructure-ui](https://github.com/instructure/instructure-ui), default branch `master`). Values below are read from the shipped source, not the docs site.

**The classic palette** (`ui-theme-tokens/src/canvas/colors.ts`): brand/link/**electric `#0374B5`**, shamrock `#0B874B`, barney `#BF32A4`, crimson `#E0061F`, fire `#FC5E13`, licorice `#2D3B45`, oxford `#394B58`, ash `#6B7780`, slate `#8B969E`, tiara `#C7CDD1`, porcelain `#F5F5F5`. Note that **every neutral is blue-tinted** (`#334451`, never `#333333`) — that is a large part of the calm.

**Typography** (`legacySharedThemeTokens/typography.ts`): `LatoWeb, Lato, "Helvetica Neue", Helvetica, Arial` — **Lato confirmed**. Sizes: `xSmall 12 · small 14 · medium 16 · large 22 · xLarge 28 · xxLarge 38px`. Weights: **300 / 400 / 700 only.** `lineHeight 1.5`, condensed 1.25, fit 1.125.

**Spacing**: `xxxSmall 2 · xxSmall 6 · xSmall 8 · small 12 · mediumSmall 16 · medium 24 · large 36 · xLarge 48 · xxLarge 60px` — note this is **not a clean 8pt grid** (2/6/8/12/16/24/36/48/60). A newer parallel set fixes it.

**Borders**: `radiusSmall 2 · radiusMedium 4 · radiusLarge 8px`. **Eight pixels is the maximum radius in the entire legacy system**, which alone accounts for much of the administrative feel. **Shadows**: exactly three (`depth1/2/3`), all two-layer, e.g. `depth1: 0 1px 2px rgba(0,0,0,.2), 0 1px 3px rgba(0,0,0,.1)`.

**The high-contrast mechanism is genuinely clever and we should steal it.** Both `canvas` and `canvas-high-contrast` build an identical token object with identical *key names*; only the value each key points to changes — and **the key name encodes both**: `blue4570` means "blue45 normally, blue70 in high contrast." `grey4570`, `blue5782`, `grey1214` likewise. Both themes then run the same mapper to produce `surfacePagePrimary`, `textBody`, `textLink`, `lineStroke`. **Zero component code branches on theme.** The canvas theme's own `description` field states: "This theme meets WCAG 2.1 AA rules for color contrast." High contrast also collapses `ash`/`slate`/`tiara` all to `#556572` and turns `porcelain` pure white — the strategy is *kill the mid-greys*.

**The most important finding: Instructure is already moving off this.** InstUI 11.7 ships new `light`/`dark` themes (Tokens Studio generated) in which:

- The brand color moves **from blue to navy** — `brandPrimary = navy170 #1D354F`, and the global nav background goes **white** (it was dark grey).
- **The default typeface is no longer Lato.** `fontFamily.heading = "Inclusive Sans"`, `fontFamily.base = "Atkinson Hyperlegible Next"` — the latter is the Braille Institute's low-vision face. A legacy `legacyCanvas` theme preserves Lato.
- **Weights 500 and 600 arrive** (`interactive: 500`, `heading.base: 600`), ending the 300/400/700 straitjacket.
- **Radii grow dramatically**: `xs 2 · sm 4 · md 8 · lg 12 · xl 16 · xxl 24 · full`, with `interactive.base = 12px`.
- Shadows become **navy-tinted rather than black**: `elevation1 = 0 1px 2px rgba(35,68,101,.15), 0 2px 4px 1px rgba(35,68,101,.1)`.

Two consequences for us: (1) **do not design against the Canvas people remember** — design against where it is going; (2) a legibility-first typeface choice and a *warmer, larger-radius, more-weighted* system is exactly the direction the category's incumbent is heading under regulatory pressure. We should get there first and do it better.

**Caveat:** InstUI currently ships **two-and-a-half token systems simultaneously** (legacy named, contrast-numbered, Tokens Studio), and the `light` theme's own description admits "Pre v11_7 components will fall back to the canvas theme!" Visual drift during migration is guaranteed. **Our lesson: one token system, migrated atomically.**

### 3.3 What to borrow and what to improve

| Canvas does | Borrow? | Our version |
|---|---|---|
| Persistent thin global rail, fixed item set | **Borrow verbatim** | Home · Clubs · Calendar · Inbox · Money · Search |
| One space type, identical tool palette | **Borrow** | One `Club` space; same 6 tabs in every club |
| Color reserved for identity only | **Borrow and tighten** | 12 perceptually-normalized club hues (§9.3) instead of a free color picker |
| Per-course card color → calendar color propagation | **Borrow** | Club hue propagates to calendar, feed, chat, ledger |
| High-contrast theme as a user setting | **Borrow** | Generated, not hand-built |
| Card dashboard as default landing | **Improve** | Cards are low-information. Default to an agenda/feed; cards become a secondary view |
| Right-hand "To Do / Coming Up / Recent Feedback" sidebar | **Improve** | Same idea, but one hero number ("3 things need you today") above it |
| Lato at default weights | **Replace** | See §9.1 |
| Dated iconography, inconsistent sub-apps | **Replace** | One icon set + hand-drawn domain icons |
| Notification preference *matrix* (event × channel × frequency) | **Improve** | Matrix is correct for admins, hostile for freshmen. Three presets + "Advanced" disclosure |
| Deep nesting to reach anything | **Replace** | ⌘K palette reaches any object in ≤2 keystrokes |

### 3.4 The institutional-software trap

**Blackboard Learn Ultra**, from Anthology's own documentation: course nav is a tab strip (Content, Calendar, Announcements, Discussions, Gradebook, Messages, Analytics, Groups, Achievements); content supports "up to three levels of hierarchy for content nesting"; and selecting an item means "the content slides out in a panel on top of the Course Content page" ([help.anthology.com](https://help.anthology.com/blackboard/instructor/en/getting-started/navigate-inside-a-course.html)). **That is the core problem stated by the vendor: stacked slide-over panels over a three-deep tree.** Depth is expressed as occlusion, so you lose your place, and the back affordance is "close the panel" rather than a breadcrumb. Canvas's flat left rail — one click to any tool — is genuinely better here, whatever its aesthetics.

Practitioner sentiment (Hacker News, the one crowd source reachable this session): "Blackboard is a horrible app. UI wise it's like 1999" ([HN](https://news.ycombinator.com/item?id=3121287)); "I use Blackboard as professor a lot… technically it's poorly done and annoying" ([HN](https://news.ycombinator.com/item?id=3014625)); "Banner (and Ellucian) is my trigger word" ([HN](https://news.ycombinator.com/item?id=20550891)); on Workday Student, "Students aren't employees, why are we trying to fit them into the same mold as an employee?" ([HN](https://news.ycombinator.com/item?id=46258834)). *This skews developer, not student — flagged.*

**The decisive finding is Workday.** Workday's design system (confusingly also named Canvas — `@workday/canvas-tokens-web`) is *modern and well-built*: a 0.25rem base unit, full `blueberry` / `licorice` / `soap` / `cinnamon` ramps, a shape scale from half to round, font sizes 0.625–6.5rem, and a variable brand face. **Workday Student still feels institutional despite good tokens.** That isolates the actual mechanism. The trap is not the palette. It is:

1. **Density as a proxy for power.** These are transactional systems whose users are *staff paid to be there*, so every screen is optimized for task completion per pixel and every table gets every column.
2. **Table-of-tables.** Data models surface directly as nested grids. Hierarchy comes from borders, not from space or type.
3. **Modal and panel hell** — Ultra's stacked slide-overs, PeopleSoft Classic-in-an-iframe inside Fluid, Banner 9's Oracle-Forms-shaped pages in HTML. Each is a subsystem preserving an older interaction grammar.
4. **Inconsistent subsystems.** One student journey crosses the SIS, LMS, payment processor, ID system and housing portal — five vendors, five type scales, five blues. No amount of per-vendor polish fixes the seam.
5. **No visual hierarchy budget.** At 12–13px type with 1.2 line-height there is no room to make anything bigger, so emphasis falls to bold + color + borders, which saturates immediately.
6. **Configurability defeats design.** Canvas's `--ic-brand-*` Theme Editor exists so institutions can override the palette — which means the system must survive arbitrary client colors, so it can never commit to any.

The trap is that these products are *dense* and people conclude density is the problem. It is not. Linear and Superhuman are denser than Blackboard and feel great. The problem is **density without a hierarchy budget**. Density is only hostile when everything on screen has the same visual weight.

**Direct implication for us:** we are a single product, not five vendors; we can commit to one palette because we are not white-labeled; and our users are students who are *not* paid to be there. Those three facts are the entire license to design differently.

### 3.5 Education UIs that feel good

**Duolingo** — extracted from production CSS and the font binaries themselves, so these are real:

- **Type is bespoke.** "Duolingo Sans" is a variable face (`wght` 100–900) by **Bézier**, licensed "custom-designed exclusively for Duolingo, Inc." Headlines use **Feather Bold** by **Fontsmith** (designer Krista Radoeva). **The old `din-round` is gone.** A nice detail: for Russian/Ukrainian/Vietnamese UI they alias the `feather` family to Duolingo Sans weight 900, because Feather lacks those scripts.
- **Body text is 20px at weight 500** (`body: 1.25rem/1.75rem 500`) — enormous and semi-bold by web standards. Every button label is **uppercase 700 with 0.04em tracking**.
- **The 3D button, exactly.** The visible face is a `::before` pseudo-element, and the "lip" is a **zero-blur box-shadow** colored via `currentColor`:
  ```css
  --lip-width: 4px; --border-radius: 12px; --height: 50px;
  border-width: 0 0 var(--lip-width);          /* reserves the lip in layout */
  &::before { inset: 0; background: var(--bg); color: var(--border-color);
              box-shadow: 0 var(--lip-width) 0; }   /* the hard bottom edge */
  &:active { transform: translateY(var(--lip-width)) translateZ(0); }
  &:active::before { box-shadow: none; }            /* squash */
  &:hover { filter: brightness(1.1); }              /* hover = filter, not a 2nd token */
  ```
- **Palette pairs every face color with a darker sibling for its lip**: owl `#58cc02` → tree-frog `#58a700`; macaw `#1cb0f6` → whale `#1899d6`; fox `#ff9600` → fox-shadow `#cd7900`. Every color is exposed to CSS as an **RGB triplet** (`rgb(var(--color-owl))`) so alpha compositing needs no second token.

Three transferable moves: **body weight 500 not 400**, **hover via `filter: brightness()` rather than a second color token**, and **a hard-edge lip instead of a blur shadow**. The last one is the cheapest high-craft move available to us — it is tactile, costs one box-shadow, and is unmistakably ours.

**Khan Academy** (Wonder Blocks, [github.com/Khan/wonder-blocks](https://github.com/Khan/wonder-blocks)) — note that **Khan and Canvas independently both landed on Lato**, which tells you what "educational default" meant in the 2010s. Their neutrals are **alpha fades of `offBlack`** (`offBlack64/50/32/16/8`), which keeps them harmonious over any ground — a genuinely good idea. Radii are deliberately specified **in px, not rem**, with the comment "to ensure the corner radius is consistent across different root font sizes." And they are mid-migration to a new "Thunder Blocks" theme: **Plus Jakarta Sans with weights 300/500/600/700/900**, and a comment reading `medium: 500, // 'regular' in OG` — **they moved default body weight up a notch, exactly like Duolingo.**

**Brilliant** — built on Panda CSS with custom type from **Contrast Foundry** (CoFo Brilliant, CoFo Robert, CoFo Semi Mono). Radius vocabulary runs `sm .125 → 3xl 2rem → full` — far deeper than InstUI's three values. Warm neutral `oat-50 #f5f3f1`.

**Quizlet** — type is **HurmeGeo Sans No2** (Hurme Design); brand indigo is `--twilight-blue: #4255FF`. [Full token set unverified.]

**The shared lesson, now with evidence:** every education product that feels good has (a) **a typeface nobody else has**, (b) **body text heavier and larger than the web default**, and (c) **one non-neutral commitment**, with everything else plain. Canvas has none of the three. That is the entire gap.

---

## 4. Typography

### 4.1 Why Inter reads as "default"

Inter is excellent and free, which is exactly the problem: it is the default in Tailwind templates, shadcn scaffolds, Figma community files, and most AI-generated code. At 400/600 with default tracking, Inter is now the visual equivalent of Helvetica in 1985 — correct, and invisible as a choice. Linear still uses it, but note *how*: **Inter Display for headings and Inter for body**, i.e. two optical sizes, which is a typographic decision ([Linear](https://linear.app/blog/how-we-redesigned-the-linear-ui)). Using one cut everywhere is not.

### 4.2 Candidates

All axis ranges below were read from the font metadata, not from marketing pages.

| Face | License | Verified axes | Why it has character | Risk |
|---|---|---|---|---|
| **Instrument Sans** | SIL OFL ([repo](https://github.com/Instrument/instrument-sans)) | **wght 400–700, wdth 75–100, ital 0–100** | Narrow-capable grotesk, tall x-height; **12 stylistic sets** (alternate `a y K R M G J`, alternate ampersands); ships both proportional and tabular figures. The `wdth` axis gives a genuinely dense label cut Inter cannot do | No weights below 400 (fine — we ban those anyway) |
| **Archivo** | SIL OFL ([repo](https://github.com/Omnibus-Type/Archivo)) | **wdth 62–125, wght 100–900** | The widest free two-axis system available. Wide display headings at 125, condensed data labels at 75, from one family. Late-19th-c. grotesque bones | Grotesk-generic at default width |
| **Bricolage Grotesque** | SIL OFL ([repo](https://github.com/ateliertriay/bricolage)) | **opsz 12–96, wdth 75–100, wght 200–800** | **A real optical-size axis with exaggerated ink traps at small sizes.** Has opinions at display sizes and normalizes into legibility at text sizes — precisely the anti-Inter behavior | Strong voice; may fight an institutional read |
| **Public Sans** | SIL OFL (USWDS) | wght 100–900 | Libre Franklin fork; **non-rounded vertices**, tailed `l`, tabular numerals. Civic and American-gothic rather than Swiss | **Repo states it is "not being actively developed or maintained"**; the dedicated site now redirects away |
| **Schibsted Grotesk** | SIL OFL | **wght 400–900** + variable italic | Scandinavian news-grotesque, warmer than Inter; the 400 floor is a deliberate editorial decision | Less battle-tested |
| **IBM Plex Sans** | SIL OFL ([ibm.com/plex](https://www.ibm.com/plex/)) | wght [ranges unverified] | Flared terminals, unmistakable `a`/`g`; reads engineered | Strongly "IBM" |
| **Geist Sans** | SIL OFL | wght only, **no `opsz`** | — | **Already a slop tell (§1.5); its own README names Inter/Suisse/Diatype as influences.** Avoid as primary |
| **Figtree / Hanken Grotesk / Onest** | SIL OFL | wght 300–900 / 100–900 | Warm, safe | Figtree is approaching default status; Onest reads close to Inter |
| **Switzer / General Sans / Satoshi** | **ITF Free Font License — not OFL** | — | Closest free analogues to Suisse Int'l / Untitled Sans | **Licence unverified — the Fontshare site is a client-rendered SPA and could not be read.** Before shipping, a human must confirm in a browser: (1) commercial use, (2) self-hosting the woff2 on our origin, (3) **whether the files may be committed to a repo or bundled in an npm package.** Point 3 is where teams get caught |
| **ABC Diatype, Söhne, Suisse Int'l, Untitled Sans** | Commercial | Diatype: 7 widths × 8 weights | The "expensive" look | **No pricing verified — every foundry page routed to a gated checkout. Do not budget from memory.** One useful datum: Suisse Int'l grants a *lifelong* licence with **no limits on domains or pageviews**, unlike the metered model most foundries use |

**Serif, for editorial moments only.** Verified axes: **Instrument Serif** (OFL, **static, weight 400 only, Regular + Italic** — which is a feature: it forces hierarchy by size, not weight), **Newsreader** (Production Type, OFL, **opsz 6–72**, wght 200–800 — the widest optical range here), **Source Serif 4** (Adobe, OFL, **opsz 8–60**, wght 200–900), **Literata** (TypeTogether, OFL, **opsz 7–72**), **Fraunces** (OFL, **opsz 9–144, wght 100–900, SOFT 0–100, WONK 0–1**). ⚠️ Fraunces' *defaults* are opsz 144 / wght 900 / max soft / wonky — drop it in naively and you get maximum weirdness. Set the axes explicitly; its wonk auto-disables at ≤18px.

**Mono, for numbers and identifiers.**
- **Commit Mono** ([commitmono.com](https://commitmono.com/)) — SIL OFL, free for commercial use. Built on Jasper Morrison's *Super Normal* premise ("Special is generally less useful than normal"). Its distinguishing feature is **smart kerning**: it shifts a narrow letter sitting between wide ones closer *without changing advance widths*, so it stays grid-true for tables but reads like a proportional face. Functional ligatures (`!=` → `≠`) ship **off by default**; decorative ones are excluded. ⚠️ Customizer settings are **not** retained in the variable format — if we use the customizer we must ship statics.
- **JetBrains Mono** — typeface OFL-1.1, source Apache-2.0; wght 100–800. **x-height is maximized**, so it reads larger at the same px than other monos. `JetBrains Mono NL` is the no-ligature build.
- **Martian Mono** (Evil Martians, OFL) — **wdth 75–112.5, wght 100–800**, and a genuinely useful UI property: vertical metrics give **equal space above cap height and below baseline**, so it centers cleanly in buttons and fields with no optical nudging.
- **Geist Mono** — OFL, carries `zero` and `tnum`, but inherits Geist's slop adjacency.
- **Berkeley Mono** — paid, non-OFL. **The product page returned HTTP 403; web-embedding rights and pricing are unverified. Do not assume webfont embedding is included.**

### 4.3 Technical requirements (non-negotiable)

- **Tabular numerals everywhere a number can align**: `font-variant-numeric: tabular-nums lining-nums;` — ledgers, budgets, attendance counts, timestamps, vote tallies, and **anything that changes in place** (otherwise digits jitter on re-render).
- **⚠️ Use `font-variant-*`, never `font-feature-settings`, where an equivalent exists.** `font-feature-settings` is **not additive and does not compose**: setting `font-feature-settings: "tnum"` on a child *replaces the parent's entire feature string*, silently killing `liga`, `kern`, and `calt`. This is the single most common typographic bug in design systems. Reserve `font-feature-settings` for things with no `font-variant` equivalent — stylistic sets (`ss01`) and character variants (`cv01`) — and if you must set both in one rule, reset with `font-feature-settings: normal`.
- **Slashed zero** via `font-variant-numeric: slashed-zero`, and **only** on IDs, join codes and mono contexts — **never on prices**, where a slashed zero reads as an error.
- **Turn on `font-optical-sizing: auto`** globally if the face has an `opsz` axis. ⚠️ Setting `font-variation-settings: "wght" 500` manually **disables automatic optical sizing** in some engines — a very common silent bug. Set weight via `font-weight`, not `font-variation-settings`.
- **`GRAD` (grade), where available, is the right axis for hover and dark-mode weight compensation** — it changes apparent weight *without changing advance widths*, so text does not reflow.
- **Self-host woff2.** No Google Fonts CDN — it is a third-party request, a privacy question for a .edu deployment, and a render-blocking dependency.
- **Subset to `latin` + `latin-ext`**, plus a separate subset for the numerals-only display face if used.
- **`font-display`** — the four modes, per [web.dev font best practices](https://web.dev/articles/font-best-practices):

  | Value | Block period | Swap period |
  |---|---|---|
  | `block` | 2–3 s | infinite |
  | `swap` | 0 ms | infinite |
  | `fallback` | 100 ms | 3 s |
  | `optional` | 100 ms | none |

  **Our choice: `swap` for the UI face (with metric-matched fallbacks, below) and `optional` for the display serif.** A missed editorial serif on first paint costs nothing; a missed UI face costs everything.
- **WOFF2 only** — ~30% better compression than WOFF via Brotli, universal support.
- **Budget:** an unsubsetted variable Latin face runs ~45–70 KB (Geist's variable woff2 is 69,760 bytes; Untitled Sans' variable roman is 43 KB). **Subsetting to `U+0000-00FF, U+2000-206F, U+2212` typically cuts a Latin variable face to 20–35 KB.** Preload exactly one file; never preload italic or the display serif.
- **Preload** exactly the two files above the fold (400 and 500 weights of the variable body font).
- **Metric-match the fallback** to kill CLS:
  ```css
  @font-face { font-family: "AppSans Fallback"; src: local("Arial");
    size-adjust: 97%; ascent-override: 94%; descent-override: 24%; line-gap-override: 0%; }
  ```
  (Values must be measured against the chosen face — this is what `next/font` automates.)
- **`-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;`** ([Rauno](https://github.com/raunofreiberg/interfaces)).
- **Never a weight below 400.** Never change weight on hover.

---

## 5. Color

### 5.1 Why OKLCH

OKLCH (L = perceptual lightness 0–1, C = chroma ~0–0.37, H = hue 0–360) is perceptually uniform: equal L means equal apparent lightness *across hues*, which HSL badly fails at (HSL yellow at 50% lightness is far brighter than HSL blue at 50%). See Evil Martians' canonical explainer, [OKLCH in CSS](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl), and the picker at [oklch.com](https://oklch.com/). Practical consequences:

- You can generate an entire themed palette from a hue list by holding L and C constant — which is exactly what makes our 12 club colors safe (§9.3).
- Chroma must be **gamut-clipped**: not every (L, C, H) exists in sRGB. Reduce C until it fits (the script used to generate §9 does exactly this).
- P3 displays can carry more chroma; serve `@media (color-gamut: p3)` overrides only for accents, never for text.

Tailwind v4 ships its default palette in OKLCH ([tailwindcss.com/docs/colors](https://tailwindcss.com/docs/colors)), and Linear derives its whole theme in LCH from three variables ([Linear](https://linear.app/blog/how-we-redesigned-the-linear-ui)).

### 5.2 Radix's step semantics — the structure we adopt

Radix Colors' 12-step scale assigns each step a **job**, not a shade ([radix-ui.com/colors](https://www.radix-ui.com/colors), [understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)):

| Step | Job |
|---|---|
| 1 | App background |
| 2 | Subtle background |
| 3 | Component background |
| 4 | Component hover |
| 5 | Component active/selected |
| 6 | **Subtle borders on components that are NOT interactive** — separators, dividers |
| 7 | **Subtle borders on INTERACTIVE components** — input borders, focus rings |
| 8 | **Stronger** borders on interactive components; hovered borders |
| 9 | **Solid background — "the purest step, mixed with the least white or black."** This is where the brand color goes |
| 10 | Hovered solid background |
| 11 | Low-contrast text (accessible body/secondary) |
| 12 | High-contrast text |

Note the distinction people routinely collapse: **6 = non-interactive border, 7 = interactive border, 8 = strong/hovered border.** And **step 9 is defined by *purity*, not by lightness** — it is the only step not derived from the ramp, which is exactly why it is the step you hand your brand color to.

**Dark mode is not an inversion, and Radix's own source proves it.** Reading `slate`/`slateDark` and `blue`/`blueDark` from the Radix source:

| Step | `blue` (light) | `blueDark` | What inversion would give |
|---|---|---|---|
| 1 | `#fbfdff` | `#0d1520` | `#040200` |
| **9** | **`#0090ff`** | **`#0090ff`** | `#ff6f00` — a different brand |
| 11 | `#0d74ce` | `#70b8ff` | — |
| 12 | `#113264` | `#c2e6ff` | — |

**Step 9 is byte-identical in light and dark, while 11 and 12 are completely redesigned.** That is the methodology in one table: *hold the brand solid constant, rebuild everything around it.* Likewise `slateDark1` is `#111113` (not `#000`) and `slateDark12` is `#edeef0` (not `#fff`). Even the alpha scales are hue-tuned — `slateA1` is `#00005503`, a tinted near-navy at 3%, not neutral black.

Radix also warns explicitly **against saturated grays for app backgrounds, especially in dark mode**, and states the scales "are not intended to be customised" — add scales alongside rather than editing theirs. Their text colors are validated with **APCA**, not WCAG 2.

Geist encodes the same idea in 10 steps with an explicit role map (100–300 backgrounds, 400–600 borders, 700–800 solid, 900–1000 text; [vercel.com/geist/colors](https://vercel.com/geist/colors)). We adopt the Radix 12-step semantics and generate both modes from OKLCH.

**Tailwind v4's palette corroborates the numbers.** Its defaults are authored in OKLCH, and the structure is worth reading: lightness descends 98.4 → 96.8 → 92.9 → 86.9 → **70.4** → 55.4 → 44.6 → 37.2 → 27.9 → 20.8 → 12.9%, with a deliberate jump from 300 to 400 that separates a "light UI" band from a "text/solid" band. Tinted neutrals never exceed **C ≈ 0.05** (`slate-500` is `oklch(55.4% 0.046 257.417)`), `neutral` is pure achromatic, and **the darkest neutrals bottom out at L 12.9–14.5%, not 0** — Tailwind and Radix landed independently in the same place.

**Practical chroma ceilings:** neutrals ≤ 0.02; tinted neutrals 0.02–0.05; UI accents 0.10–0.20. Above C ≈ 0.25 you are at or past the sRGB edge for most hues and **will** clip — and note that while the CSS spec *requires* gamut mapping by chroma reduction (which preserves hue), Evil Martians report that **Chrome and Safari currently use fast RGB clipping, which visibly shifts hue** ([OKLCH in CSS](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)). Author conservatively in sRGB and step chroma up explicitly for P3:

```css
.accent { background: oklch(0.62 0.155 250); }
@media (color-gamut: p3) { .accent { background: oklch(0.62 0.19 250); } }
```

The other unlock is **relative color syntax**, which replaces an entire hand-tuned hover palette with one line that behaves identically across hues because L is perceptual:

```css
.button:hover { background: oklch(from var(--accent) calc(l - 0.06) c h); }
```

### 5.3 Dark mode that isn't an inversion

Rules, all of which our §9 ramp obeys:

- **Never `#000` and never `#fff` text.** Our dark app background is `oklch(0.178 …)` = `#12110F`; our dark high-contrast text is `#F1F0EE` at **16.57:1** — plenty, without the halation of pure white on pure black.
- **Elevation is lightness, not shadow.** In dark mode a raised surface gets a *lighter* background (step 2 → 3 → 4); shadows are nearly invisible on dark and should be replaced with a 1px step-6 top highlight.
- **Reduce chroma in dark backgrounds, increase it in dark text.** Our accent text token in dark is `#6EB6FF` (C 0.128) while the dark accent *background* sits at C 0.055–0.098.
- **Semantic hues shift.** Danger at `#D15C53` works as a light-mode solid; as dark-mode *text* it must move to `#FE968B` to reach 8.94:1.
- **Theme switches must not animate.** Rauno: "Switching themes should not trigger transitions and animations on elements."

### 5.4 APCA vs WCAG 2

WCAG 2.x contrast ratio is a luminance-ratio formula that models perceived readability poorly. APCA's own documentation is blunt about it ([git.apcacontrast.com](https://git.apcacontrast.com/documentation/WhyAPCA)): the ratio **"far overstates contrast for dark colors,"** so **"4.5:1 can be functionally unreadable when a color is near black,"** and — decisively for us — **"WCAG 2.x contrast cannot be used for guidance designing 'dark mode.'"** It also "ignores spatial frequency," applying one flat ratio regardless of size or weight, which is why thin light-gray type can pass and still be invisible. They claim **86% of websites fail WCAG 2 contrast**, some genuinely and some because of "the incorrect math of WCAG 2 contrast" itself.

**APCA** returns a *signed* **Lc** from 0 to ±106 — negative means light-on-dark, positive means dark-on-light. Polarity matters, which is precisely what WCAG 2's polarity-blind ratio cannot express. The thresholds:

| Lc | Requirement |
|---|---|
| **90** | Preferred for fluent body text, ≥14px @ 400 |
| **75** | **Minimum for body text** — at 18px / 400 |
| **60** | Minimum for non-body content text — 24px normal or 16px bold |
| **45** | Minimum for headlines — 36px normal or 24px bold; detailed pictograms |
| **30** | Absolute floor — placeholders, disabled elements |
| **15** | Minimum for non-text elements; below this is effectively invisible |

APCA came out of the Visual Contrast group of Silver/WCAG 3 but **remains a draft, not a ratified standard.** 

**Our policy: design to APCA, verify against WCAG 2.1/2.2 AA.** The two mostly agree in light mode; where they disagree is dark mode, and APCA is right there. But WCAG 2.1 AA is what the ADA Title II rule references and what a procurement audit will run, so it remains the shippable floor.

**The positional trick that makes this tractable.** Stripe's accessible-color-systems work ([stripe.com/blog/accessible-color-systems](https://stripe.com/blog/accessible-color-systems)) — the intellectual ancestor of both Radix Colors and Huetone — moved to CIELAB because "the way HSL calculates lightness is flawed," and landed on an operating rule worth stealing verbatim: **any two colors in the system pass small-text contrast if they are at least 5 levels apart on the scale, 4 levels for icons.** That converts contrast checking from a per-pair audit into a positional rule an engineer can hold in their head. Radix does the same thing structurally: *step 11 or 12 on step 1 or 2 is correct by construction.*

**Tools.** [Leonardo](https://leonardocolor.io/) (Adobe) generates swatches **from target contrast ratios rather than from hand-picked hex** — accessibility is an input, not an audit; it takes key colors, target ratios, and a declared background, and exports CSS custom properties and W3C design tokens (`@adobe/leonardo-contrast-colors`). [Huetone](https://huetone.ardov.me/) is a manual ramp editor with live APCA feedback.

---

## 6. Information density, and "calm surface, deep machine"

### 6.1 The core problem

A freshman opening the app should see **one number and one action**. A treasurer three weeks before a budget deadline should be able to see 400 rows, filter by vendor, and export. These are the same screen. The resolution is not a "simple mode / advanced mode" toggle (nobody finds it) — it is **layering**:

| Layer | Who reaches it | Mechanism |
|---|---|---|
| 0 — Headline | Everyone, always | One hero metric + one CTA, above the fold |
| 1 — Overview | Anyone scrolling | 3–5 supporting numbers with sparklines |
| 2 — Detail | Anyone clicking a number | Row-level table, sorted, paginated/virtualized |
| 3 — Power | Officers, keyboard | ⌘K, filters, saved views, bulk select, export |
| 4 — Raw | Admins/quant | API, CSV, query builder |

Each layer is reachable by *clicking the thing you're curious about*, never by finding a settings switch.

**Two hard constraints from NN/g's progressive disclosure research** ([nngroup.com](https://www.nngroup.com/articles/progressive-disclosure/)):

1. **Never more than two disclosure levels on one screen.** "Designs that go beyond 2 disclosure levels typically have low usability." Our five layers above are five *surfaces*, not five nested accordions — each click is a navigation to a new view, not another expander. On any single view, at most one thing expands.
2. **The split must be right.** You must "disclose everything that users frequently need up front, so that they have to progress to the secondary display only on rare occasions." If officers routinely click through, we split wrong, and a dense single view would have been better.

The justification for density itself is NN/g's own heuristic #8, which is precisely worded and worth memorizing ([10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)): **"Every extra unit of information in an interface competes with the relevant units."** That is not "use less information." It is "remove *irrelevant* information." Heuristic #7 is the charter for the power layer: "Shortcuts — hidden from novice users — may speed up the interaction for the expert user so that the design can cater to both inexperienced and experienced users."

**The command palette is how the two are reconciled.** Maggie Appleton's analysis ([Command K Bars](https://maggieappleton.com/command-bar)) makes the key point: GUI affordances "use up the precious commodity of screen space," and **fuzzy search is the enabling technology, not the keyboard shortcut** — users only need an approximate name. Her most implementable observation, drawn from Linear: **show each command's keyboard shortcut inline in the palette results.** That is how the calm surface teaches the deep machine. The palette must also be a *universal search* over content (clubs, people, events, transactions), not only a command launcher.

### 6.2 Density rules that keep dense from becoming Blackboard

1. **One typographic hierarchy per screen, maximum three levels.** Size and weight carry it; color does not.
2. **Hierarchy before decoration.** If you need a border to separate two things, you have not made them different enough in weight/spacing.
3. **Row height is a token, not a guess.** Dense list = 32px, default = 40px, comfortable = 48px. One of the three per surface, never mixed.
4. **No dead zones.** Rauno's rule: list items expand their padding to touch, so there is no un-clickable gutter.
5. **Numbers right-aligned and tabular; labels left-aligned.**
6. **Gridlines are step-6 at 1px, or absent.** Zebra striping is banned (it is noise; use hover instead).
7. **Whitespace is spent on *groups*, not on *items*.** 24–32px between sections; 4–8px inside a row.

### 6.3 Dashboards done well

- **Stripe Dashboard** ([docs.stripe.com/dashboard](https://docs.stripe.com/dashboard)) — three mechanics to copy outright. (a) **Press `?` anywhere for the keyboard shortcut list** — one keystroke is the entire discoverability hatch for the power layer. (b) A **Shortcuts** section in the sidebar that "displays your pinned and most recently visited pages… you can pin it" — adaptive nav that costs the user nothing, since recency is free and pinning is one deliberate act. (c) Secondary products live behind a **"More"** disclosure. And the escape ladder is complete: one page → filters → CSV → **Sigma**, "an interactive SQL environment." Nobody is capped.
- **Plausible** ([plausible.io/simple-web-analytics](https://plausible.io/simple-web-analytics)) — the purest statement of the one-page doctrine: "Get all the important stats on one single page. No training necessary… No menus to dig through. No custom reports to build." The metric set is deliberately bounded. Worth stealing separately: they **publicly concede where the competitor wins** (deep attribution modeling, SQL-scale reporting). Naming what you are bad at is a trust mechanism.
- **Vercel Web Analytics** ([vercel.com/docs/analytics](https://vercel.com/docs/analytics)) — two top-level tabs, one timeframe dropdown, then "panels," each showing a **truncated top-N list with a "View All"**. That is progressive disclosure applied to breakdowns, and it is trivially cheap to build.
- **Linear Insights** — charts are monochrome + one accent; the value is in the grouping controls, not the chart chrome. [unverified — not fetchable without auth]
- **Bloomberg Terminal** — the counter-example. It optimizes entirely for expert efficiency with essentially no progressive disclosure, which is a *legitimate* choice when users are homogeneous, trained, paid to learn, and in the product eight hours a day. **A club OS has none of those properties.** Density is not the problem; a missing layer 0 is.

### 6.4 Making charts feel crafted

**Choosing the mark.** Route every chart request through the **FT Visual Vocabulary's nine categories** before picking a form ([github.com/Financial-Times/chart-doctor](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary)): deviation, correlation, ranking, distribution, change over time, part-to-whole, magnitude, spatial, flow.

**What the eye can actually decode.** NN/g's preattentive-attributes guidance is the hard constraint ([nngroup.com](https://www.nngroup.com/articles/dashboards-preattentive/)): the preattentive features are **length, area, angle, 2D position, and color**, but **only length and 2D position communicate quantity accurately.** Area and angle do not. Therefore:

- **Bar, line, dot. That is the menu.** No pie, no donut, no gauge, no treemap — they encode quantity as angle or area. Datawrapper reaches the same verdict in "[Turning donuts into bars](https://www.datawrapper.de/blog/fix-my-chart-donuts-into-bars)."
- **Never 3D** — it "distorts preattentive features."
- **Never encode a quantity in color.** Color is for categorical grouping, reinforced by shape or proximity.

**Never dual-axis** ([Datawrapper](https://www.datawrapper.de/blog/dual-axis-charts-guide)): "The scales of dual axis charts are arbitrary and can therefore (deliberately) mislead readers," and a 2011 study found superimposed charts "performed poorly both in terms of accuracy and time." Use side-by-side charts, index both series to 100, or move the second variable to the x-axis in a connected scatterplot. The only legitimate second axis is an alternative *scale for the same data* (°F alongside °C).

**Color** ([Datawrapper's color guide](https://www.datawrapper.de/blog/colorguide) and [ten rules for beautiful colors](https://www.datawrapper.de/blog/beautifulcolors)):

- **Grey is the most important color.** De-emphasize everything that isn't the argument; spend color only on the data you're making a point about.
- **Give categorical hues different lightnesses so the palette works in greyscale.** (Our §9.4 ramp staggers L from 0.46 to 0.72 for exactly this.)
- **Don't dance all over the color wheel** — stay in neighboring hues; favor an orange/red + blue pair, which is both versatile and colorblind-safe.
- **Avoid pure hues** — sit 5–10° off the exact 60/120/180/240/300 positions.
- **Push greens under 60° (yellow-tinted) or over 160° (blue-tinted);** avoid pure forest green.
- **Desaturate bright colors.** Darker colors tolerate more saturation; lighter ones need less.
- **Backgrounds: under 7% saturation on light, under 20% saturation and 10–25% lightness on dark.**
- **Colorblindness is not an edge case:** "8% of European men and 0.5% of European women" have some red/green colorweakness — "in an audience of 500 people, roughly 24 may struggle" ([Datawrapper](https://www.datawrapper.de/blog/colorblindness-part1)). The consequence that matters most: **red loses its danger signal.** Every error state carries an icon and a word, never color alone. Red/green/brown are indistinguishable at matched brightness; pink/turquoise/grey converge; purple vs blue is unreliable.

**Text on charts** ([Datawrapper](https://www.datawrapper.de/blog/text-in-data-visualizations)):

- **Kill the legend; label directly.** "Place the words that explain your chart elements as close to those elements as possible." Biggest single comprehension win available.
- **Titles state the finding, not the variable** — "conversational, not technical," as if "explaining to a friend."
- **Exactly two text hierarchy levels.** Their concrete spec: **12px grey and 14px near-black.**
- **Never rotate axis labels.** Rephrase or change the chart type.
- **No centered text.** Left or right align only.
- **Abbreviate 20k / 20m**, never a "in thousands" multiplier note. Repeat units in axis labels *and* tooltips. Tooltips carry the category: "3.4% unemployed", not "3.4%".
- **Annotate.** One sentence on the chart ("Spring activities fair — 62 signups") is worth more than the axis.

**Structure.** Start bars at zero (lines need not). Horizontal gridlines only, step-6, behind the marks [gridline specifics are our synthesis — the dedicated Datawrapper post was unreachable]. **Small multiples beat one multi-series chart as soon as you have >3 series.** Sparklines are typography: inline, ~80×20px, no axes, one dot on the last value.

**Substrate.** Grammar-of-graphics libraries ([Vega-Lite](https://vega.github.io/vega-lite/), [Observable Plot](https://observablehq.com/plot/)) are the right foundation, and Vega-Lite names why: the compiler "automatically produces visualization components including axes, legends, and scales" from "carefully designed rules." **Good defaults are the product.** Build our chart layer so a careless caller still gets a defensible chart.

*Note on Tufte: the data-ink ratio, chartjunk, small multiples and sparklines are in the books, not on [edwardtufte.com](https://www.edwardtufte.com/) — cite the books with page numbers, not the site. The Datawrapper and NN/g rules above operationally reproduce most of his program anyway.*

### 6.5 How the quant/finance surfaces should look

This is the surface most likely to become a Bloomberg terminal, so it gets explicit rules.

**The freshman view (layer 0–1).** A member opening *Money* sees exactly this:

```
Your club has $1,240 left this semester.
────────────────────────────────────────
Spent        $2,760   ▁▂▃▅▆▇   68% of budget
Owed to you  $42      (1 reimbursement, filed 3 days ago)
Next deadline  Oct 14 — SGA budget request
```

One sentence, three rows, one sparkline. No table. No pie chart. **The hero number is the only 32px+ type on the screen.**

**The officer/treasurer view (layer 2–3).** Clicking any number opens the ledger:

| Rule | Spec |
|---|---|
| Numerals | `font-variant-numeric: tabular-nums lining-nums`, right-aligned, mono only for IDs |
| Currency | Symbol in step-11 (secondary), digits in step-12; cents in the same size, never superscripted |
| Negative amounts | Prefix `−` (U+2212, not hyphen) **and** danger-11 color — never color alone (1.4.1 Use of Color) |
| Row height | 32px dense; virtualized past 100 rows |
| Column widths | Fixed for amounts/dates; flexible only for description |
| Totals | Sticky footer row, 1px step-8 top border, weight 600 |
| Sorting | Every column; arrow indicator, never a color change |
| Sparklines | One per budget category, 80×20, in a fixed-width column |
| Deltas | `+12%` / `−4%` with an arrow glyph and a tabular-num width so columns don't jitter |
| Empty ledger | "No transactions yet. Add the first one, or import a CSV from your bank." + two buttons |
| Precision | Money always 2 decimals; percentages 0 or 1 decimal, never 4 |
| Drill-down | Click a row → side panel with receipt image, approver, audit trail. **Never a modal.** |

**Small multiples for the semester view.** Twelve 120×60 charts — one per budget category — on a shared y-axis, sorted by spend. An officer sees "Food is the problem" in under a second; that is a thing no table does.

**Progressive disclosure of the machine.** All the heavy machinery (forecasts, burn-rate projections, per-event ROI, benchmark comparisons against similar clubs) lives behind a single `Analyze` affordance on the officer view and is *off* by default. The rule: **no student should ever see a model output they did not ask for.**

---

## 7. Trust and authenticity

### 7.1 What earns credibility with students

- **Real names, real numbers, real screenshots.** Marketing that shows "Berkeley Chess Club · 240 members · $3,100 budget" with permission beats any illustration. If we can't show real clubs yet, show *our own* club's real data and say so.
- **Photography over illustration, and only if it's real.** Stock 3D isometric people are the single loudest slop signal. If we can't shoot real students, use no imagery at all — type and data are enough.
- **Human artifacts.** A hand-drawn icon for "reimbursement." A changelog written in first person. A founder's name on the About page. A support address that's a person.
**Empty states have three jobs**, and a good one does all three ([NN/g](https://www.nngroup.com/articles/empty-state-interface-design/)): (1) communicate system status — "There are no records to display for the selected date range," and **never claim "no records" while still loading**; (2) provide a learning cue — "Star your favorites to list them here"; (3) enable direct action — a button that starts the task. Don't leave the space blank; don't give vague instructions with no path to completion.

**Error messages** ([NN/g guidelines](https://www.nngroup.com/articles/error-message-guidelines/)):
- Describe the issue concisely *and* offer a remedy. Never "An error occurred."
- **Avoid blaming words — "invalid," "illegal."** State the requirement instead.
- **"Avoid humor since it can become stale if users encounter the error frequently."** This is the precise boundary on a playful voice: jokes belong in first-run and empty states, never in repeated errors.
- **Place the message next to its source.** Don't fire it while the user is still exploring.
- **Redundant coding**: bold + high contrast + color *plus* an icon — because red carries no danger signal for ~8% of men.

**No dark patterns.** Harry Brignull's taxonomy names 18 ([deceptive.design/types](https://www.deceptive.design/types)). The five live risks for a club product, quoted: **fake urgency** ("pressured… because they are presented with a fake time limitation") on event RSVPs; **fake social proof** on member counts; **nagging** ("persistently interrupted by requests to do something else that may not be in their best interests") on notification prompts; **preselection** of email opt-ins at signup; and **confirmshaming** ("emotionally manipulated into doing something that they would not otherwise have done") on unsubscribe. Put these five in the design review checklist. Students are the most dark-pattern-literate cohort alive; one fake countdown costs you the campus.
- **Free means free, said plainly**, with the business model stated on the pricing page. Track 02 shows the incumbents are opaque, contract-gated, and distrusted — transparency is a wedge.

### 7.2 Comparables

- **Coursicle** ([coursicle.com](https://www.coursicle.com/), [/about](https://www.coursicle.com/about/)) — the most instructive comparable. "All your academics, all in one place." **Over 2 million students.** Their differentiator is *explicitly a design critique of the incumbents* — they attack "websites designed in the 90s," which is exactly the wedge available to us against Engage/CampusGroups/Presence. Note what they do **not** have: **zero testimonials, zero reviews, zero stock photos.** Social proof is entirely the roster of supported schools. And they state values openly — mental health, equal pay including "the newest hire right out of school," profit-sharing **rather than outside investment**. With this audience, saying you're not VC-funded is a trust move. They also ship an honest friction: a "Request your school" form rather than pretending universal coverage.
- **Fizz** ([fizz.social](https://www.fizz.social/)) — "The Gen Z Social App," **750+ colleges**, social proof again a university roster. Worth noting: the homepage *rhetorically* emphasizes authenticity but **makes no explicit verification claim**. .edu verification is implied, not stated. **We can beat them by stating the mechanism plainly.**
- **Handshake** ([joinhandshake.com](https://joinhandshake.com/)) — now positioned around AI work. Social proof is scale ("1M+ companies"), not testimonials, with concrete wage figures on the homepage. Three audiences (students / employers / career centers) get three separate paths — a structure we'll need too (students / officers / student affairs).
- **CampusGroups / Engage / Presence** — the incumbents. All three were unfetchable this session, so no first-hand design characterization [unverified]. Per track 02, the recurring documented complaint is that the student layer is an afterthought behind an admin configuration layer, and students "default to group chats and Instagram stories instead."

**Gap flag:** we have **no verified research** on what Gen Z students specifically find authentic vs. cringe — the search budget was exhausted before Edelman/Pew could be reached. Everything in §7.1 is reasoned from product evidence, not from audience research. **Recommend a dedicated follow-up pass** targeting the Edelman Trust Barometer, Pew's teens & tech series, and Morning Consult's Gen Z brand tracking before any brand-voice decisions are locked.

### 7.3 Copy voice (with real style-guide grounding)

Grounded in [GOV.UK content design](https://www.gov.uk/guidance/content-design/writing-for-gov-uk), [Shopify Polaris voice and tone](https://polaris.shopify.com/content/voice-and-tone), and the [Mailchimp style guide](https://styleguide.mailchimp.com/voice-and-tone/):

| Rule | Bad | Good |
|---|---|---|
| Say what happens, not what could | "Manage your organization's presence" | "Post to your club's feed" |
| Second person, active voice | "Members may be added by officers" | "Add members" |
| Front-load the verb in buttons | "Submit" | "Send invite" · "Approve $42" |
| No exclamation marks in product UI | "Welcome!!" | "Welcome back, Priya" |
| Numbers as numerals | "three events" | "3 events" |
| Errors name the fix | "Invalid input" | "That email isn't a .edu address" |
| Never blame the user | "You entered the wrong code" | "That code didn't work — codes expire after 10 minutes" |
| No jargon the user didn't choose | "Engagement funnel" | "Who showed up" |
| Sentence case everywhere | "Create New Event" | "Create event" |
| Don't be a mascot | "Oopsie! Something went wrong 🙈" | "That didn't save. Try again?" |

**Two testable numbers, not opinions.** Shopify's content guidance sets a hard target — **"Aim for a United States grade 7 reading level"** ([shopify.dev](https://shopify.dev/docs/apps/design/content)) — which means we can run Flesch-Kincaid in CI. And their second rule is equally mechanical: **one term per concept.** "Eliminate synonyms (e.g., don't alternate between 'upload image' and 'add photos')." Keep a lexicon file; lint against it. Their button rule: "Start with a strong verb that describes the action."

**Mailchimp's banned-word list is the most directly copyable artifact in this research** ([styleguide.mailchimp.com/word-list](https://styleguide.mailchimp.com/word-list/)). Explicitly banned: corporate buzzwords (**"leverage, incentivize, funnel, thought leader"**), startup-slang job titles (**"ninja, rockstar, wizard"**), hustle-speak (**"crushing it, killing it"**), ageist descriptors, and harmful legacy technical terms (**"blacklist, whitelist, grandfathered, master/slave"**, and "deaf/blind" as metaphors). Their four voice attributes are plainspoken, genuine, translators, dry humor — with the honest caveat: "don't go out of your way to make a joke — **forced humor can be worse than none at all**."

**Voice in one line:** *the smartest officer in the club, explaining it to you in the hallway.* Direct, unhurried, never cute, never corporate.

*[GOV.UK's content design principles and their "words to avoid" list are real but were unverifiable this session — every URL now redirects into a multi-page hub that returns only navigation. The commonly-cited "reading age 9" figure is unconfirmed.]*

---

## 8. Craft mechanics an engineer implements

| Concern | Rule |
|---|---|
| **Token layers** | `--color-blue-9` (primitive) → `--bg-accent-solid` (semantic) → `--button-primary-bg` (component). Components reference **semantic only**. Primitives never appear in component CSS. Follow the [W3C Design Tokens format](https://tr.designtokens.org/format/) so the source of truth is JSON, not CSS. |
| **Nested radii** | `inner = outer − padding`. A 12px card with 8px padding holds a 4px inner element. Anything else looks wrong and nobody can say why. |
| **Hairlines at 2×/3×** | `1px` CSS borders are fine; for true hairlines use `box-shadow: 0 0 0 0.5px var(--border)` guarded by `@media (min-resolution: 2dppx)`, or a `transform: scaleY(0.5)` pseudo-element. Never `opacity` on a 1px border — it produces a different color than the token. |
| **Focus rings** | `box-shadow`, not `outline` (Rauno) — it follows `border-radius`. Spec: `0 0 0 2px var(--bg-base), 0 0 0 4px var(--ring)`. Apply on `:focus-visible` only. Ring color must hit ≥3:1 vs adjacent (ours: 3.30:1). |
| **Hit targets** | **WCAG 2.2 SC 2.5.8 (AA): 24×24 CSS px minimum** — verified. The **spacing exception** is the one that makes dense toolbars legal: draw a 24px-diameter circle centered on each undersized target; it passes if that circle doesn't intersect any adjacent target or its circle. So **a 16×16 icon button is conformant if neighbors are ≥24px apart center-to-center** — you need 24px of *pitch*, not 24px of target. Apple's 44×44pt and Material's 48dp are ergonomic targets, not the legal floor [both unverified from primary source this session — their docs are JS-rendered and unfetchable]. Expand with padding or a `::before` overlay, never by growing the visual element. |
| **Login** | **WCAG 2.2 SC 3.3.8 (AA)** forbids a cognitive-function test in auth unless an alternative exists — and names the two satisfying mechanisms: **password-manager entry and copy-paste**. Concretely: **never block paste on password or OTP fields**, never break `autocomplete="current-password"` / `one-time-code`, and **a puzzle CAPTCHA in the login flow is a conformance failure.** |
| **Reflow** | **SC 1.4.10**: usable at **320 CSS px** wide, which is a 1280px window at 400% zoom. Data tables are explicitly exempted and may scroll horizontally — **the surrounding chrome is not.** |
| **Keyboard** | ⌘K global palette ([cmdk](https://cmdk.paco.me/) by Paco Coursey) reaching every object and action; `j/k` or ↑↓ in every list; `⌘⌫` to delete; `?` opens the shortcut sheet; Esc always closes the topmost layer. Follow [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/) for combobox/menu/dialog/listbox — do not invent. |
| **Dropdowns** | Open on `mousedown`, not `click`. Submenus need a prediction cone so diagonal travel doesn't close them. |
| **Virtualization** | Any list that can exceed ~200 rows (chat, ledger, roster, feed) uses [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction) (headless, uniform-ish rows) or [react-virtuoso](https://github.com/petyosi/react-virtuoso) (variable heights, sticky group headers, and a purpose-built Message List with the imperative scroll-anchoring API chat needs). **The chat bug to avoid, stated in TanStack's own docs:** "For prepend stability, use a stable `getItemKey` based on each item's persistent id. Index keys cannot distinguish prepends from appends after items shift." Also memoize `getItemKey`, and subtract `options.scrollMargin` in your transform whenever a header sits above the scroller. |
| **Token architecture** | Author tokens as JSON in the [W3C Design Tokens format](https://www.designtokens.org/TR/drafts/format/) — a token is any object with `$value`; a group is any object without one; **`$type` is declared or inherited, never inferred from the value**. Steal two enforcement ideas: Adobe Spectrum marks every raw palette entry **`"private": true`** in the data itself, so primitives are structurally not-for-direct-use; and GitHub Primer ships a **`org.primer.llm`** extension per token carrying `usage` and a plain-English `rules` string ("Do NOT use for emphasis or highlighting") — a machine-readable usage contract, which matters when AI agents write UI code against your system. |
| **Optimistic UI** | Every mutation a student initiates (send message, RSVP, check off a task, react) applies locally first and rolls back with a toast on failure (Rauno). |
| **Skeleton vs spinner** | Per NN/g's verified thresholds — **0.1s** = "reacting instantaneously," **1.0s** = flow of thought preserved, **10s** = attention limit ([response times](https://www.nngroup.com/articles/response-times-3-important-limits/)) — and their skeleton guidance ([skeleton screens](https://www.nngroup.com/articles/skeleton-screens/)): **under 1s show nothing** (indicators "may feel disruptive"); **1–10s** use a skeleton for a structural/page load or an inline spinner for a single module; **over 10s** use a determinate progress bar. **The skeleton must mirror the real layout — same block count, heights, positions.** NN/g explicitly rejects frame-display skeletons (header/footer with a blank middle): they "do not give users any sense that the page is gradually transitioning into its final format." Gate any spinner behind a ~300ms delay so it never flashes. |
| **Toasts + undo** | Destructive actions are **not** confirmed with a dialog; they execute immediately and offer **Undo** in a toast. Only irreversible, money-moving, or multi-person-affecting actions get a typed confirmation. **Undo must be a real server-side soft-delete or a pre-commit delay, not a UI affordance.** Sonner's shipped constants are a good default set: **lifetime 4000ms, 3 visible toasts, width 356px, gap 14px, viewport offset 24px desktop / 16px mobile, swipe threshold 45px OR velocity > 0.11** (distance *or* flick), unmount 200ms ([sonner](https://sonner.emilkowal.ski/)). Toast containers need `role="status"` / `aria-live="polite"` for success and `role="alert"` / `assertive` for errors — and because a 4s auto-dismissing Undo is not realistically keyboard-reachable, **pair it with a global ⌘Z that does the same thing.** |
| **Presence** | **Presence is ephemeral and must never live in the CRDT document.** Yjs's awareness protocol is the right model: a shared `Map<clientID, state>` where each client owns one entry and **a client whose state hasn't refreshed in 30 seconds is dropped locally** ([y-protocols](https://github.com/yjs/y-protocols)). Render cursors off the `change` event, heartbeats off `update`. Enforce identity server-side with `modifyAwarenessUpdate` — never trust a client-claimed identity in presence. Avatars capped at 5 + "+N"; typing indicators debounce at 2s; never animate presence changes. |
| **Command palette** | Copy cmdk's ARIA structure exactly ([cmdk](https://github.com/pacocoursey/cmdk)): input is `role="combobox"` with `aria-autocomplete="list"`, `aria-controls`, and **`aria-activedescendant`**; list is `role="listbox"`; items are `role="option"`. **Focus never leaves the input** — that is why it uses `aria-activedescendant` rather than roving tabindex, and also why it must call `item.scrollIntoView({block:'nearest'})` manually. Use **roving tabindex** instead for toolbars, tab lists and trees, where real DOM focus gives you free scrolling and `:focus-visible`. |
| **Motion** | ≤200ms for interaction feedback (Rauno); ≤300ms for layout transitions (Emil Kowalski); `transform`/`opacity` only; `ease-out` entering, `ease-in` leaving; interruptible; **no animation on keyboard-initiated actions**; full `prefers-reduced-motion: reduce` path that keeps opacity changes and drops movement. |
| **Elevation** | Two-layer shadows (a tight 1px contact shadow + a wide soft ambient one), max 3 levels, and in dark mode elevation is expressed as background lightness, not shadow. |
| **Accessibility floor** | WCAG 2.1 AA: 1.4.3 contrast 4.5:1 text / 3:1 large, 1.4.11 non-text 3:1, 1.4.10 reflow at 320px, 2.1.1 keyboard, 2.4.7 focus visible, 1.4.1 never color alone. Plus WCAG 2.2: 2.4.11 focus not obscured, 2.5.8 target size, 3.3.8 accessible authentication. |
| **Legal deadline** | See §8.1 below — **the commonly-cited dates were extended in April 2026.** |

### 8.1 The ADA Title II deadline, corrected

The 2024 final rule (published **April 24, 2024**, 89 FR 31320, [FR 2024-07758](https://www.federalregister.gov/documents/2024/04/24/2024-07758/nondiscrimination-on-the-basis-of-disability-accessibility-of-web-information-and-services-of-state)) adopted **WCAG 2.1 Level AA** — specifically the static [5 June 2018 W3C Recommendation](https://www.w3.org/TR/2018/REC-WCAG21-20180605/) — for web content **and mobile apps**, at 28 CFR 35.200(b).

**On April 20, 2026, DOJ published an Interim Final Rule extending both compliance dates by one year** (91 FR 20902, [FR 2026-07663](https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web)). Verbatim: "The compliance date for State and local government entities with a total population of 50,000 or more is extended from April 24, 2026, to **April 26, 2027**. The compliance date for public entities with a total population of less than 50,000, or any special district government, is extended from April 26, 2027, to **April 26, 2028**."

| Entity | Deadline |
|---|---|
| State/local government, population **50,000+** | **April 26, 2027** |
| State/local government, population **under 50,000** | **April 26, 2028** |
| **Special district governments** (any size) | **April 26, 2028** |

Public universities and community colleges are Title II public entities and inherit their parent jurisdiction's population bucket, so **most public four-years land on April 26, 2027** — roughly 19 months from today. A community college organized as a special district gets 2028.

Three things that matter for planning, from the IFR text itself:
- **The technical standard did not change** — "The amendments do not alter any other provisions of the 2024 final rule." Still WCAG 2.1 AA, still the 2018 snapshot.
- **The extension is not a holiday** — "Regardless of the compliance dates, covered entities have an ongoing obligation to ensure that their services, programs, and activities offered using web content and mobile apps are accessible."
- DOJ "plans to engage in future rulemaking processes related to the substantive requirements," but "fully anticipates implementing the regulation at the new deadline" absent an NPRM.

**Vendor baseline is already higher than the law.** Instructure's Trust Center states its product VPATs were refreshed as of **July 7, 2025** to **WCAG 2.2 AA** — one version beyond what Title II requires ([trust.instructure.com](https://trust.instructure.com/d/canvas-lms-vpat/vjkWM6)) [the ACR PDF itself is gated; per-criterion language unverified].

**Our posture: build to WCAG 2.2 AA, produce a VPAT before the first public-university pilot, and treat April 26, 2027 as the date procurement will ask about.** A VPAT is a sales prerequisite in this category, not a nice-to-have.

---

## 9. Our design system, specified

> Everything below is implementable as-is. All hex values were computed from the stated OKLCH coordinates with sRGB gamut clipping; all contrast ratios are computed WCAG 2.x values.

### 9.1 Type

**Faces**

| Role | Face | License | Axes | Notes |
|---|---|---|---|---|
| UI / body | **Instrument Sans** | SIL OFL — self-host | wght 400–700, **wdth 75–100**, ital | Narrower than Inter → ~5% more density; 12 stylistic sets; ships tabular figures. Use `wdth 88` for dense table labels, `100` everywhere else |
| Alternate if we want more range | **Archivo** | SIL OFL | **wdth 62–125**, wght 100–900 | Swap only `--font-sans`; the scale below is unchanged |
| Fallback (metric-matched) | `-apple-system, "Segoe UI", Arial` | — | — | With `size-adjust` / `ascent-override` — see §4.3 |
| Display / editorial | **Instrument Serif** | SIL OFL | **static, 400 only** | Club name on club home, marketing, one-line empty states. **Never in chrome.** Single weight forces hierarchy by size |
| Long-form reading | **Newsreader** | SIL OFL | **opsz 6–72**, wght 200–800 | Club posts, minutes, constitutions |
| Numerals, IDs, code | **Commit Mono** | SIL OFL, commercial use OK | statics (customizer output) | **Smart kerning** keeps it grid-true for tables while reading like a proportional face. Ligatures off by default |
| Paid upgrade path | ABC Diatype or Söhne | Commercial — **pricing unverified** | — | Swap `--font-sans` only |

**Explicitly rejected: Inter, Geist, Roboto, Figtree, Poppins, DM Sans** — all are named or effectively default in the 2026 slop set (§1.5). Geist in particular is disqualified twice over: it is on the HN "vibe coded" tell list, and its own README names Inter/Suisse/Diatype as its influences.

**Scale** (base 16px; rem values assume `html{font-size:16px}`)

| Token | px / rem | Weight | Line-height | Tracking | Use |
|---|---|---|---|---|---|
| `text-hero` | 40 / 2.5 | 500 | 1.10 | −0.02em | The one number that matters |
| `text-display` | 30 / 1.875 | 500 | 1.15 | −0.02em | Club name, marketing H1 |
| `text-title-1` | 22 / 1.375 | 550 | 1.25 | −0.015em | Page title |
| `text-title-2` | 18 / 1.125 | 550 | 1.30 | −0.01em | Section header, modal title |
| `text-title-3` | 15 / 0.9375 | 600 | 1.35 | −0.005em | Card header, table group header |
| `text-body` | 14 / 0.875 | 400 | 1.50 | 0 | Default UI text, list rows |
| `text-body-strong` | 14 / 0.875 | 550 | 1.50 | 0 | Selected row, unread, emphasis |
| `text-reading` | 16 / 1 | 400 | 1.65 | 0 | Posts, long-form (max 68ch) |
| `text-label` | 13 / 0.8125 | 500 | 1.40 | 0 | Form labels, buttons, tabs |
| `text-caption` | 12 / 0.75 | 450 | 1.40 | +0.005em | Metadata, timestamps, helper |
| `text-micro` | 11 / 0.6875 | 550 | 1.30 | +0.02em | Badges, table column headers (uppercase) |
| `text-mono` | 13 / 0.8125 | 400 | 1.45 | 0 | Codes, IDs |

**Rules.** Only these 12 sizes exist. Minimum weight 400. Headings live at 500–600, never 700+ except `text-micro`. Every input on mobile is ≥16px (iOS zoom). Reading measure capped at 68ch. Tabular numerals applied globally to `table, .num, [data-numeric]`.

### 9.2 Color — neutrals and accent

**Light mode** (neutral hue 75 = warm paper; accent hue 250 = cobalt)

| Step | Job | Neutral `oklch` | Neutral hex | Accent `oklch` | Accent hex |
|---|---|---|---|---|---|
| 1 | App bg | `0.994 0.0015 75` | `#FEFDFC` | `0.994 0.003 250` | `#FCFDFF` |
| 2 | Subtle bg | `0.981 0.0025 75` | `#FAF8F7` | `0.981 0.009 250` | `#F4F9FF` |
| 3 | Component bg | `0.958 0.0035 75` | `#F2F1EE` | `0.958 0.021 250` | `#E7F3FF` |
| 4 | Hover | `0.936 0.0045 75` | `#ECE9E7` | `0.936 0.032 250` | `#DBECFF` |
| 5 | Active | `0.912 0.005 75` | `#E4E1DE` | `0.912 0.043 250` | `#CDE5FE` |
| 6 | Subtle border | `0.884 0.0055 75` | `#DBD8D5` | `0.884 0.059 250` | `#BCDDFF` |
| 7 | Border | `0.848 0.006 75` | `#CFCDC9` | `0.848 0.075 250` | `#A8D2FD` |
| 8 | Strong border | `0.792 0.007 75` | `#BEBBB6` | `0.792 0.100 250` | `#89C0F9` |
| 9 | Solid / control border | `0.640 0.0075 75` | `#8F8C87` | `0.640 0.155 250` | `#3190E6` |
| 10 | Solid hover | `0.600 0.0075 75` | `#83807B` | `0.600 0.148 250` | `#2A84D4` |
| 11 | Low-contrast text | `0.520 0.006 75` | `#6B6865` | `0.520 0.130 250` | `#1F6CB0` |
| 12 | High-contrast text | `0.286 0.008 75` | `#2D2A26` | `0.286 0.075 250` | `#052C4E` |

**Dark mode** (separately designed, not inverted)

| Step | Neutral `oklch` | Neutral hex | Accent `oklch` | Accent hex |
|---|---|---|---|---|
| 1 | `0.178 0.0035 75` | `#12110F` | `0.178 0.018 250` | `#0B1219` |
| 2 | `0.205 0.004 75` | `#181715` | `0.205 0.028 250` | `#0D1824` |
| 3 | `0.248 0.005 75` | `#23211F` | `0.248 0.055 250` | `#09223A` |
| 4 | `0.283 0.0055 75` | `#2B2927` | `0.283 0.075 250` | `#042B4D` |
| 5 | `0.315 0.006 75` | `#33312E` | `0.315 0.088 250` | `#01335C` |
| 6 | `0.352 0.0065 75` | `#3D3B37` | `0.352 0.098 250` | `#023C6B` |
| 7 | `0.404 0.007 75` | `#4B4845` | `0.404 0.113 250` | `#024A83` |
| 8 | `0.487 0.008 75` | `#625F5B` | `0.487 0.137 250` | `#0162A9` |
| 9 | `0.600 0.008 75` | `#83807B` | `0.600 0.155 250` | `#2183D8` |
| 10 | `0.652 0.008 75` | `#938F8A` | `0.652 0.170 250` | `#2493F2` |
| 11 | `0.760 0.006 75` | `#B3B1AD` | `0.760 0.128 250` | `#6EB6FF` |
| 12 | `0.955 0.003 75` | `#F1F0EE` | `0.955 0.022 250` | `#E6F2FF` |

**The brand solid is held constant across modes.** Following Radix's methodology (where `blue9` is byte-identical in light and dark), our canonical brand solid is a single value used in both themes:

```css
--brand-solid: oklch(0.62 0.155 250);   /* #2F8ADC — identical in light and dark */
```

The step-9 rows in the two tables above are the *ramp's* step 9; `--brand-solid` is the token components actually reference for logo, brand marks, and the selected-state indicator. **It never shifts between themes.** Note also that **dark-mode hover on a solid goes lighter, not darker** (there is nowhere darker to go against a dark ground) — which is why accent-10 dark (`#2493F2`) is lighter than accent-9 dark, inverting the light-mode relationship. Hardcoding "hover = darken 10%" breaks in dark mode; Adobe Spectrum encodes the same inversion in its aliases (light steps 900→1000 on hover, dark steps 800→700).

**Verified contrast (WCAG 2.x), and the decisions that follow**

| Pair | Ratio | Decision |
|---|---|---|
| neutral-12 on neutral-1 (light) | **14.05** | Headings |
| neutral-11 on neutral-1 (light) | **5.45** | Body text ✓ AA |
| neutral-11 on neutral-3 (light) | **4.90** | Body on cards ✓ AA |
| White on accent-9 | **3.35** | ✗ **fails** for text — accent-9 is a *fill/ring*, never a button with white label |
| White on **accent-11** (`#1F6CB0`) | **5.48** | ✓ **This is the primary button fill.** |
| accent-11 as text on neutral-1 | **5.40** | Links ✓ AA |
| neutral-7 vs neutral-1 | 1.56 | Decorative separators only — **fails 1.4.11** |
| **neutral-9** vs neutral-1 | **3.30** | ✓ **Input/control borders must be step 9**, not 7 |
| accent-9 vs neutral-1 | **3.30** | ✓ Focus ring |
| neutral-12 on neutral-1 (dark) | **16.57** | Headings |
| neutral-11 on neutral-1 (dark) | **8.81** | Body ✓ |
| neutral-9 vs neutral-1 (dark) | **4.80** | Input borders (dark) ✓ |

**Semantic states**

| Token | Light solid (9) | Light text (11) | Light bg (3) | Dark solid (9) | Dark text (11) | Dark bg (3) | Text contrast |
|---|---|---|---|---|---|---|---|
| success (H 150) | `#2E9E52` | `#137738` | `#E3F6E6` | `#2E9E52` | `#6FD087` | `#132B19` | 5.55 / 9.93 |
| warning (H 85) | `#A87F09` | `#7E5E01` | `#F9EFDA` | `#A87F09` | `#E0AF3B` | `#2E2307` | 5.92 / 9.31 |
| danger (H 27) | `#D15C53` | `#A04038` | `#FFEBE8` | `#D15C53` | `#FE968B` | `#371B18` | 6.29 / 8.94 |
| info (H 250) | `#2F8ADC` | `#1666AA` | `#E5F2FF` | `#2F8ADC` | `#7DBDFE` | `#122639` | — |

### 9.3 Club identity colors (our improvement on Canvas)

Canvas lets users pick any card color, producing random contrast. Ours is a **fixed set of 12 hues at identical L and C**, so every club color has the same weight, the same white-text behavior, and the same tint. Users pick a *name*, not a swatch.

| Name | Hue | Light solid (L .58 C .13) | Dark solid (L .64 C .13) | Tint (L .955 C .030) |
|---|---|---|---|---|
| Ember | 30 | `#BB584A` | `#CF6B5B` | `#FFEBE7` |
| Clay | 55 | `#B3621E` | `#C77434` | `#FFECE0` |
| Amber | 85 | `#9A7405` | `#B08505` | `#F9EFDA` |
| Moss | 125 | `#698722` | `#7A9938` | `#EBF4DE` |
| Spruce | 158 | `#15915C` | `#33A36D` | `#E0F7E9` |
| Teal | 192 | `#0A8C89` | `#0BA19D` | `#DAF7F5` |
| Cobalt | 250 | `#347EC4` | `#4790D8` | `#E5F2FF` |
| Iris | 285 | `#736DC3` | `#857FD7` | `#EEEEFF` |
| Plum | 320 | `#9C5EAA` | `#AF70BD` | `#FAEAFD` |
| Rose | 5 | `#B85570` | `#CC6781` | `#FFEAEE` |
| Slate | 230 | `#0286B1` | `#0199CA` | `#DFF4FF` |
| Sand | 70 | `#A86B03` | `#BE7C1C` | `#FEEDDB` |

White text on these solids lands ~4.0–4.5:1 — acceptable for ≥18.66px/bold labels only. **Rule: club color is used for a 3px left edge, a 20px avatar chip, a calendar dot, and a tint background. It is never a button fill and never carries small white text.**

### 9.4 Data-visualization palette

**Categorical (fixed order, lightness-staggered so it survives grayscale and CVD):**

| # | Light | Dark |
|---|---|---|
| 1 | `#116BB5` | `#418AD1` |
| 2 | `#CD6151` | `#EB8373` |
| 3 | `#05896A` | `#05AB86` |
| 4 | `#854494` | `#A264B0` |
| 5 | `#CD9C1F` | `#EBBD57` |
| 6 | `#05A5B3` | `#15C8D7` |
| 7 | `#A07CDB` | `#BE9DF7` |
| 8 | `#23690D` | `#478638` |

**Sequential (cobalt, 6):** `#E3F0FF` `#B4D8FE` `#7DBDFE` `#4C9DEB` `#277BC6` `#025798`
**Diverging (danger ↔ spruce, 7):** `#B9463F` `#D47D73` `#EFBCB6` `#F5F3F0` `#ABD7BC` `#56AD7E` `#00814F`

Rule: **≤3 categorical colors on any chart a student sees.** More than 3 series ⇒ small multiples.

### 9.5 Spacing, radius, elevation, motion

**Spacing** — 4pt base, named (InstUI's naming discipline, our values):

| Token | px | Use |
|---|---|---|
| `space-0` | 0 | — |
| `space-1` | 2 | Icon optical nudges only |
| `space-2` | 4 | Inside a badge/chip |
| `space-3` | 8 | Icon↔label, inside a row |
| `space-4` | 12 | Control padding, tight card padding |
| `space-5` | 16 | Default card padding, list gutter |
| `space-6` | 24 | Between related blocks |
| `space-7` | 32 | Between sections |
| `space-8` | 48 | Between page regions |
| `space-9` | 64 | Page top padding, marketing only |

**Radius** — five values, each with a job. Not everything is `rounded-2xl`.

| Token | px | Use |
|---|---|---|
| `radius-xs` | 3 | Badges, checkboxes, tag chips |
| `radius-sm` | 6 | Buttons, inputs, selects, menu items |
| `radius-md` | 10 | Cards, popovers, list containers |
| `radius-lg` | 14 | Modals, sheets |
| `radius-full` | 9999 | Avatars, pills, toggle knobs **only** |

Nested-radius law: `inner = outer − padding`.

**Elevation** — three levels, two-layer shadows; dark mode uses background lightness instead.

| Token | Light shadow | Dark equivalent | Use |
|---|---|---|---|
| `elev-0` | none; `1px solid neutral-6` | `1px solid neutral-6` | Cards, table containers (**default**) |
| `elev-1` | `0 1px 2px oklch(0.286 0.008 75 / .06), 0 1px 1px oklch(0.286 0.008 75 / .04)` | bg step 3 + `1px solid neutral-7` | Dropdowns, popovers, hover-lift |
| `elev-2` | `0 8px 24px oklch(0.286 0.008 75 / .10), 0 2px 6px oklch(0.286 0.008 75 / .06)` | bg step 4 + `1px solid neutral-7` | Modals, command palette |
| `elev-3` | `0 16px 48px oklch(0.286 0.008 75 / .14), 0 4px 8px oklch(0.286 0.008 75 / .08)` | bg step 5 + `1px solid neutral-8` | Drag preview only |

**Why the alphas climb.** Read Polaris's shipped scale: `shadow-100: 0 1px 0 rgba(26,26,26,0.07)` → `shadow-600: 0 20px 20px -8px rgba(26,26,26,0.28)`. As elevation rises, **y-offset and blur grow, the negative spread grows to stop sideways bleed, and opacity climbs 0.07 → 0.28.** Higher things cast bigger *and darker* shadows. A scale that only scales blur looks fake.

**Dark mode needs a different shadow color and ~6× the alpha.** Primer's `shadow.inset` is `alpha 0.04` on a neutral-13 in light, flipping to `alpha 0.24` on neutral-0 in dark. A black shadow on a dark surface is invisible — which is why our dark column uses background lightness instead. **Pick one elevation model and stay in it:** tonal (Carbon's `background`/`layer-01/02/03`, M3's five `surface-container-*` steps) or shadow (Polaris, Primer). **Mixing them produces mud.** We use shadow in light, tonal in dark.

**Borders as shadows.** Prefer `box-shadow: inset 0 0 0 1px var(--border)` over `border` on interactive elements — Primer tokenizes exactly this with the description "Thin shadow used instead of a border to prevent layout shift." Box-shadows don't participate in layout, so adding a ring on hover or focus never reflows. For true hairlines at 2×/3×, Polaris ships a **0.66px** border token (`--p-border-width-0165`) alongside its 1px one; on a 3× display 0.66px ≈ 2 device pixels, and it rounds to 1px at 1×.

**Motion**

Calibrated against shipped systems: IBM Carbon's "productive" band is **70–240ms** (`fast-01 70 · fast-02 110 · moderate-01 150 · moderate-02 240`), and Atlassian ships **exit consistently faster than enter** (avatar enter 150 / exit 100; blanket enter 250 / exit 200).

| Token | Value | Use |
|---|---|---|
| `dur-instant` | **0ms** | **Keyboard-initiated actions**, theme switch |
| `dur-micro` | 70ms | Checkbox, toggle knob, tap feedback |
| `dur-fast` | 120ms | Hover, focus |
| `dur-enter` | 180ms | Menu/popover/toast entering |
| `dur-exit` | **120ms** | The same elements leaving — **exits are ~33% faster than enters** |
| `dur-slow` | 240ms | Modal, sheet, panel entering (exit 200ms) |
| `ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | **Entering** (decelerate) |
| `ease-in` | `cubic-bezier(0.6, 0, 0.8, 0.6)` | **Leaving** (accelerate) — Atlassian's exit curve |
| `ease-inout` | `cubic-bezier(0.65, 0, 0.35, 1)` | Moving/morphing on screen, not entering or exiting |
| `spring-press` | scale `0.98`, 70ms | Button `:active` |
| reduced motion | opacity-only; transitions and animations killed | `prefers-reduced-motion: reduce` |

**Rules.**
- Animate `transform` and `opacity` only — they are composite-only; `padding`/`margin`/`height` trigger layout and paint.
- **Use `transition`, not `@keyframes`, for anything reversible.** A CSS transition can be interrupted and smoothly retarget mid-flight; a keyframe animation cannot. This is the concrete mechanism behind "interruptible."
- **Spatial vs effects.** Anything that *moves or resizes* may overshoot slightly. Anything that *fades or recolors* must be critically damped — **a bouncing opacity looks broken**. (Material 3 Expressive encodes exactly this: spatial springs at damping 0.6–0.8, effects springs pinned at damping 1.0.)
- Use `will-change: transform` on elements that will actually move; remove it after. It also enables sub-pixel rendering.
- **Beware the "doom flicker"**: a hover-translate moves the element out from under the cursor, un-hovering it. **Separate trigger from effect** — keep the `<button>` stationary and translate an inner `<span>`.
- Asymmetric timing is legitimate and feels better: fast in on user action (~125ms), slower out (~300–450ms).

**Focus ring:** `box-shadow: 0 0 0 2px var(--bg-base), 0 0 0 4px var(--accent-9);` on `:focus-visible` — i.e. **2px indicator + 2px gap**, matching Adobe Spectrum's tokenized `focus-indicator-thickness: 2px` / `focus-indicator-gap: 2px`. WCAG 2.4.13 gives the only measurable spec: the indicator must be "at least as large as the area of a 2 CSS pixel thick perimeter" with ≥3:1 contrast between focused and unfocused states — and **a soft glow does not count**, since shadow/glow effects outside the component are explicitly excluded. Ours measures 3.30:1. Also set `scroll-margin-top` equal to the sticky header height on every focusable element, or we fail WCAG 2.2 SC 2.4.11 (Focus Not Obscured).

### 9.6 Icons

Base set: **Phosphor Regular at 16px** (designed on a 16px grid — holds up in 32px rows; MIT). Sizes: 16 (default), 20 (nav), 14 (inline with `text-caption`). Stroke weight never mixed on one screen.

**Hand-draw these 16 domain icons** — they are the product's fingerprint and must not come from a library: Club, Officer transition, Roster, Dues, Reimbursement, Budget line, Receipt, Room booking, Tabling shift, Interest form, Activities fair, Attendance check-in, Semester, Constitution, Advisor, Event RSVP.

Banned: emoji in navigation, buttons, or labels (emoji are fine in *user-authored* chat content and reactions). Banned: ✨ for anything.

### 9.7 Density

| Surface | Row height | Font | Padding |
|---|---|---|---|
| Chat messages | auto, 4px gap | `text-body` | `space-3` / `space-5` |
| Feed | auto, 16px gap | `text-body` | `space-5` |
| Event list | 48 | `text-body` | `space-4` |
| Roster / people | 40 | `text-body` | `space-4` |
| Tasks | 36 | `text-body` | `space-3` |
| Ledger / money | 32 | `text-body` tabular | `space-3` |
| Admin tables | 32 | `text-caption` tabular | `space-3` |

One density per surface, chosen here, never user-toggled in v1. Max content width: 1280px for app shells, 68ch for prose. Sidebar 240px, collapsible to 56px.

### 9.8 Component inventory (mapped to our surfaces)

| Surface | Components |
|---|---|
| **Shell** | GlobalRail (6 items), ClubSwitcher, CommandPalette (⌘K), Breadcrumb, ToastHost, PresenceStack, KeyboardSheet (`?`) |
| **Club home** | ClubHeader (hue edge + name in Instrument Serif), PinnedCard, UpcomingStrip, OfficerRow, JoinCTA, AboutPanel, MemberCount |
| **Feed** | PostComposer, PostCard, ReactionBar, ThreadPreview, Attachment, PollBlock, EmptyFeed |
| **Chat** | ChannelList, MessageList (reverse-virtualized), MessageRow, TypingIndicator, Composer (Enter=send), ThreadPanel, UnreadDivider, MentionAutocomplete |
| **Events** | EventCard, EventDetail, RSVPControl (3-state), CalendarMonth/Week/Agenda, CheckInScanner, AttendanceSheet, RoomBookingRow, RecurrenceEditor |
| **Projects/tasks** | BoardColumn, TaskRow, TaskDetailPanel, AssigneeAvatar, DueChip, FilterBar, SavedViewTabs, BulkActionBar |
| **Money** | HeroBalance, BudgetCategoryRow + Sparkline, LedgerTable (virtualized, tabular), TransactionPanel, ReceiptViewer, ReimbursementFlow, ApprovalQueue, DuesTracker, ExportMenu |
| **Profile** | AvatarUpload, EduVerifiedBadge, ClubMembershipList, InvolvementTimeline, NotificationPresets (+Advanced), PrivacyPanel |
| **Admin / quant** | MetricTile, SmallMultiplesGrid, CohortTable, FunnelStrip, DateRangePicker, SegmentBuilder, QueryPanel, ExportCSV |
| **Primitives** | Button (primary/secondary/ghost/danger × 3 sizes), Input, Select, Combobox, Checkbox, Radio, Switch, Textarea, Badge, Avatar, Tooltip, Popover, DropdownMenu, Dialog, Sheet, Tabs, Table, Skeleton, EmptyState, InlineAlert, Pagination, Spinner (last resort) |

### 9.9 Twenty things we never do

1. Never a violet→blue (or any two-hue) gradient in product chrome.
2. Never glassmorphism / `backdrop-filter` decoration; blur only for genuine overlay scrims.
3. Never ✨ or any emoji as an icon in navigation, buttons, labels, or empty states.
4. Never ship an untouched shadcn/Tailwind default token — every value must be one of ours.
5. Never more than one radius value inside a single component.
6. Never a shadow on a static card; `elev-0` (1px border) is the default.
7. Never a font weight below 400, and never change weight on hover or selection.
8. Never a proportional numeral in a column, a total, a delta, or a timestamp.
9. Never center product content in a narrow column; marketing layouts stay on marketing pages.
10. Never a hero section, big pull-quote, or oversized illustration inside the app.
11. Never stock 3D/isometric illustration or a gradient mesh blob. Real photos or nothing.
12. Never animate a keyboard-initiated action; never exceed 240ms; never animate on theme change.
13. Never a spinner where a layout-matched skeleton is possible.
14. Never a confirmation dialog for a reversible action — execute and offer Undo for 8s.
15. Never use color alone to convey state (negative numbers get a `−` glyph, errors get an icon).
16. Never a `:focus` style removed without a `:focus-visible` replacement; never `outline: none` alone.
17. Never an icon-only control without an `aria-label`; never a tooltip on a disabled button.
18. Never zebra striping, never vertical gridlines, never chart junk (3D, gradients, shadows on marks).
19. Never more than 3 categorical colors in a chart a non-officer sees; use small multiples instead.
20. Never copy that a human wouldn't say out loud: no "Oopsie", no "Streamline your workflow", no exclamation marks, no Title Case buttons, no blaming the user.

### 9.10 Implementation order

1. Tokens as JSON → CSS custom properties (both modes + high-contrast generated from three inputs, Linear-style).
2. Self-hosted subset fonts + metric-matched fallback; verify zero CLS.
3. Primitives (Button → Input → Table → Dialog) with focus rings and keyboard behavior built in from the first commit, not retrofitted.
4. ⌘K palette before the second page exists — it forces every object to have a canonical name and route.
5. Skeletons authored alongside each surface, from the same layout metrics.
6. Axe + keyboard-only + 320px-reflow checks in CI; produce a VPAT before the first public-university pilot.

---

## 10. What we could not verify

Honest accounting, so nobody builds on sand. Web search quota was exhausted early, so everything above came from direct fetches of known URLs; several domains were blocked outright.

| Claim | Status |
|---|---|
| ADA Title II deadlines | **Verified** — April 26 2027 / April 26 2028, per the April 20 2026 Interim Final Rule. The pre-extension dates are still circulating; do not use them |
| InstUI tokens, Canvas layout metrics, Duolingo type/palette/button CSS, Khan/Brilliant/Quizlet faces | **Verified from source code or font binaries** |
| Radix/Tailwind/Polaris/Primer/Spectrum/Carbon/M3 token values | **Verified from shipped source** |
| WCAG 2.1/2.2 criteria and APCA thresholds | **Verified from W3C and apcacontrast.com** |
| Our OKLCH palette and every contrast ratio in §9 | **Computed**, not estimated — script at `scratchpad/oklch.py` and `scratchpad/contrast.py` |
| Apple HIG (44×44pt, motion, Dynamic Type) | **Unverified** — developer.apple.com is JS-rendered and unfetchable |
| Material's 48dp touch target | **Unverified** — m2/m3.material.io unfetchable |
| Fontshare / ITF Free Font License terms | **Unverified — blocking.** A human must read the licence in a browser before we ship Switzer/General Sans/Satoshi, confirming commercial use, self-hosting, **and whether files may be committed to a repo or npm package** |
| Berkeley Mono pricing and web-embedding rights | **Unverified** — product page 403s |
| All commercial foundry pricing (Diatype, Söhne, Suisse, NHG) | **Unverified** — every page routes to a gated checkout. Do not budget from these |
| IBM Plex variable axis ranges | **Unverified** |
| **Gen Z authenticity research** | **Not obtained — the largest gap.** Edelman blocked, Pew 403, search quota gone. §7.1 is reasoned from product evidence, not audience research |
| Incumbent club-software UI (CampusGroups, Engage, Presence) | **Unverified** — all three unfetchable. No first-hand design characterization |
| Superhuman's "100ms" folklore | **Unverified** — the current site documents no latency benchmarks, shortcuts, or palette |
| GOV.UK style guide specifics | **Unverified** — URLs now redirect into a nav-only hub |
| Tufte's principles | **Not on his website** (catalog only). Cite the books with page numbers |
| r/college, r/Professors, EDUCAUSE critiques | **Unverified** — Reddit blocks automated fetching. The Blackboard/Banner quotes in §3.4 are from Hacker News and skew developer, not student |

**Recommended follow-up with fresh search budget:** Gen Z trust/authenticity research (Edelman, Pew, Morning Consult), the incumbent club-software UI landscape, and a browser pass on the Fontshare licence.
