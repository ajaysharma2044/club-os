# Club OS — Design System

*Draft v0.1. Full research and sourcing in `/research/17-design-craft.md`. The color values below were computed, not estimated: OKLCH to sRGB with gamut clipping, and WCAG contrast math run in Python.*

---

## 1. What we are avoiding, named precisely

You cannot avoid looking generated unless you can name the tells. Here they are.

### Visual tells

| Tell | Why it happens | What it signals |
|---|---|---|
| The sparkle glyph | It is the AI shorthand | The product is about the model, not the job |
| Violet-to-blue gradient | It is the framework's path of least resistance | Nobody chose a brand color |
| Glassmorphism over a blurred blob | One blur plus one radial gradient reads as "designed" | Depth used as decoration, not hierarchy |
| Inter at 400 and 600, nothing else | The default | No typographic voice |
| Untouched component-library tokens | Init the CLI, accept zinc, ship | The whole app is a demo |
| Emoji as navigation icons | No icon budget | Amateur, and it breaks across platforms and screen readers |
| One rounded value on everything | A single radius token with no scale | Radii stop meaning anything |
| Shadows at every level | A large shadow on cards, inputs, and rows alike | No elevation model |
| Marketing layout inside the product | A centered narrow column and a hero headline on a settings page | The designer never used the product daily |
| Stock 3D isometric illustration | Free asset packs | Nothing depicted is real |
| Cream and orange with a serif headline | The 2026 house style of LLM wrappers | You look like every other one |
| Everything fades and slides in on scroll | Animation library defaults | Slow, and hostile to repeat users |
| Copy shaped like filler | Generated headline priors | No one wrote this |

### The structural tells, which matter more

These are what a daily user feels even when they cannot name it.

- **Spacing inconsistent between sibling components.** A card at 24px next to a card at 16px next to a list at 12px. The eye reads sloppiness before the brain names it.
- **Density calibrated for a landing page, not a workspace.** Generated product UI carries roughly twice the whitespace an operator wants. Linear's own redesign went the other direction, explicitly increasing density of navigation.
- **No empty states, or cheerful fake ones.**
- **No focus-visible styling, no keyboard path, no labels on icon buttons.**
- **No optimistic UI.** Every action round-trips with a spinner.
- **Font weight changing on hover**, causing a one-pixel layout shift.
- **Proportional numerals in money columns**, so the digits jitter as values change.

### The trap has already moved

The most useful single data point from the research: an August 2026 Hacker News thread asking how to tell a site was vibe-coded lists, verbatim, **"Inter/Roboto/Geist as the default 'tasteful' font,"** with the observation that every model reasons itself into the same choices.

Geist is disqualified twice over. It is on that list, and its own README names Inter, Suisse, and Diatype as its influences. **Escaping Inter by adopting Geist is the same tell, one hop later.**

### The deeper diagnosis

AI-default design and committee design converge on identical output for the same reason: **both optimize for not being wrong rather than for being specific.** Being small is our only real advantage here, and specificity is how we spend it.

---

## 2. Typography

### Faces

| Role | Face | License | Notes |
|---|---|---|---|
| UI and body | **Instrument Sans** | SIL Open Font License, self-hosted | Narrower than Inter, roughly 5% more density. Variable width axis. Ships tabular figures. |
| Display and editorial | **Instrument Serif** | SIL OFL | Club name on club home, marketing, one-line empty states. **Never in chrome.** Single weight forces hierarchy by size. |
| Long-form reading | **Newsreader** | SIL OFL | Club posts, minutes, constitutions. Has an optical-size axis. |
| Numerals, IDs, code | **Commit Mono** | SIL OFL, commercial use permitted | Smart kerning keeps it grid-true in tables while reading like a proportional face. Ligatures off. |

**Explicitly rejected: Inter, Geist, Roboto, Figtree, Poppins, DM Sans.**

### Scale

Twelve sizes. Only these exist.

| Token | px | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `text-hero` | 40 | 500 | 1.10 | −0.02em | The one number that matters |
| `text-display` | 30 | 500 | 1.15 | −0.02em | Club name, marketing H1 |
| `text-title-1` | 22 | 550 | 1.25 | −0.015em | Page title |
| `text-title-2` | 18 | 550 | 1.30 | −0.01em | Section header, modal title |
| `text-title-3` | 15 | 600 | 1.35 | −0.005em | Card header |
| `text-body` | 14 | 400 | 1.50 | 0 | Default UI text |
| `text-body-strong` | 14 | 550 | 1.50 | 0 | Selected row, unread |
| `text-reading` | 16 | 400 | 1.65 | 0 | Posts, long form, max 68 characters |
| `text-label` | 13 | 500 | 1.40 | 0 | Form labels, buttons, tabs |
| `text-caption` | 12 | 450 | 1.40 | +0.005em | Metadata, timestamps |
| `text-micro` | 11 | 550 | 1.30 | +0.02em | Badges, table column headers |
| `text-mono` | 13 | 400 | 1.45 | 0 | Codes, IDs |

Minimum weight 400. Headings live at 500 to 600, never heavier. Every mobile input is at least 16px so iOS does not zoom. Tabular numerals applied globally to tables and anything marked numeric.

---

## 3. Color

Twelve-step ramps in OKLCH with hex fallbacks. Neutral hue 75 is warm paper, not gray. Accent hue 250 is cobalt.

### Light mode

| Step | Job | Neutral | Accent |
|---|---|---|---|
| 1 | App background | `#FEFDFC` | `#FCFDFF` |
| 2 | Subtle background | `#FAF8F7` | `#F4F9FF` |
| 3 | Component background | `#F2F1EE` | `#E7F3FF` |
| 4 | Hover | `#ECE9E7` | `#DBECFF` |
| 5 | Active | `#E4E1DE` | `#CDE5FE` |
| 6 | Subtle border | `#DBD8D5` | `#BCDDFF` |
| 7 | Border | `#CFCDC9` | `#A8D2FD` |
| 8 | Strong border | `#BEBBB6` | `#89C0F9` |
| 9 | Solid / control border | `#8F8C87` | `#3190E6` |
| 10 | Solid hover | `#83807B` | `#2A84D4` |
| 11 | Low-contrast text | `#6B6865` | `#1F6CB0` |
| 12 | High-contrast text | `#2D2A26` | `#052C4E` |

### Dark mode, designed separately rather than inverted

| Step | Neutral | Accent |
|---|---|---|
| 1 | `#12110F` | `#0B1219` |
| 2 | `#181715` | `#0D1824` |
| 3 | `#23211F` | `#09223A` |
| 4 | `#2B2927` | `#042B4D` |
| 5 | `#33312E` | `#01335C` |
| 6 | `#3D3B37` | `#023C6B` |
| 7 | `#4B4845` | `#024A83` |
| 8 | `#625F5B` | `#0162A9` |
| 9 | `#83807B` | `#2183D8` |
| 10 | `#938F8A` | `#2493F2` |
| 11 | `#B3B1AD` | `#6EB6FF` |
| 12 | `#F1F0EE` | `#E6F2FF` |

**The brand solid is constant across modes:** `oklch(0.62 0.155 250)`, which is `#2F8ADC`. It never shifts between themes.

**Dark-mode hover goes lighter, not darker.** There is nowhere darker to go against a dark ground, which is why accent-10 in dark is lighter than accent-9. Hardcoding "hover equals darken 10%" breaks in dark mode.

### Contrast decisions the math forced

| Pair | Ratio | Decision |
|---|---|---|
| White on accent-9 | 3.35 | **Fails.** Accent-9 is a fill or ring, never a button with a white label. |
| White on accent-11 | 5.48 | **This is the primary button fill.** |
| Neutral-7 vs neutral-1 | 1.56 | Decorative separators only. Fails the non-text contrast requirement. |
| Neutral-9 vs neutral-1 | 3.30 | **Input and control borders must be step 9, not 7.** |
| Neutral-11 on neutral-1 | 5.45 | Body text, passes AA |
| Neutral-12 on neutral-1 | 14.05 | Headings |

Those two bolded rows are exactly the kind of thing that separates a computed system from a plausible-looking one.

### Club identity colors

Canvas lets users pick any card color, which produces random contrast. Ours is a **fixed set of 12 hues at identical lightness and chroma**, so every club color carries the same weight and the same white-text behavior. Users pick a *name*, not a swatch: Ember, Clay, Amber, Moss, Spruce, Teal, Cobalt, Iris, Plum, Rose, Slate, Sand.

**Club color is used for a 3px left edge, a 20px avatar chip, a calendar dot, and a tint background. Never a button fill, never carrying small white text.**

---

## 4. Space, radius, elevation, motion

**Spacing** is a 4pt base, named rather than numbered by pixel: 0, 2, 4, 8, 12, 16, 24, 32, 48, 64.

**Radius** is five values, each with a job. Not everything is heavily rounded.

| Token | px | Use |
|---|---|---|
| `radius-xs` | 3 | Badges, checkboxes, chips |
| `radius-sm` | 6 | Buttons, inputs, selects, menu items |
| `radius-md` | 10 | Cards, popovers, list containers |
| `radius-lg` | 14 | Modals, sheets |
| `radius-full` | — | Avatars, pills, toggle knobs only |

Nested-radius law: inner equals outer minus padding.

**Elevation** is three levels with two-layer shadows in light mode, and **background lightness instead of shadow in dark mode**. A black shadow on a dark surface is invisible. The default for a card is `elev-0`, which is a 1px border and no shadow at all.

As elevation rises, offset and blur grow, negative spread grows to stop sideways bleed, and opacity climbs. A scale that only scales blur looks fake.

**Prefer an inset box-shadow to a border on interactive elements.** Box-shadows do not participate in layout, so adding a ring on hover or focus never reflows.

**Motion**

| Token | Value | Use |
|---|---|---|
| `dur-instant` | 0ms | **Keyboard-initiated actions**, theme switch |
| `dur-micro` | 70ms | Checkbox, toggle, tap feedback |
| `dur-fast` | 120ms | Hover, focus |
| `dur-enter` | 180ms | Menu, popover, toast entering |
| `dur-exit` | 120ms | The same elements leaving |
| `dur-slow` | 240ms | Modal, sheet, panel entering |

**Exits run about a third faster than enters.** Enter decelerates, leave accelerates.

Four rules that carry most of the feel:

1. Animate transform and opacity only. Everything else triggers layout and paint.
2. **Use transitions, not keyframes, for anything reversible.** A transition can be interrupted and smoothly retarget mid-flight. A keyframe animation cannot. That is the actual mechanism behind "interruptible."
3. Anything that moves or resizes may overshoot slightly. Anything that fades or recolors must be critically damped. **A bouncing opacity looks broken.**
4. Beware the doom flicker: a hover-translate moves the element out from under the cursor, which un-hovers it. Keep the button stationary and translate an inner element.

**Focus ring:** 2px indicator with a 2px gap, at 3.30:1. A soft glow does not satisfy the requirement.

---

## 5. Icons

Base set is **Phosphor Regular at 16px**, which is designed on a 16px grid and holds up in 32px rows. Stroke weight is never mixed on one screen.

**Sixteen domain icons get hand-drawn**, because they are the product's fingerprint and must not come from a library:

Club · Officer transition · Roster · Dues · Reimbursement · Budget line · Receipt · Room booking · Tabling shift · Interest form · Activities fair · Attendance check-in · Semester · Constitution · Advisor · Event RSVP

Emoji are banned in navigation, buttons, and labels. They are fine in user-authored chat content and reactions.

---

## 6. Density

One density per surface, chosen here, never user-toggled in v1.

| Surface | Row height | Font |
|---|---|---|
| Chat messages | auto | body |
| Feed | auto | body |
| Event list | 48 | body |
| Roster | 40 | body |
| Tasks | 36 | body |
| Ledger | 32 | body, tabular |
| Admin tables | 32 | caption, tabular |

Max content width 1280px for app shells, 68 characters for prose. Sidebar 240px, collapsible to 56px.

---

## 7. The money and quant surfaces

This is the surface most likely to become a Bloomberg terminal, so it gets explicit rules.

### What a member sees

```
Your club has $1,240 left this semester.
────────────────────────────────────────
Spent          $2,760   ▁▂▃▅▆▇   68% of budget
Owed to you    $42      1 reimbursement, filed 3 days ago
Next deadline  Oct 14   SGA budget request
```

One sentence, three rows, one sparkline. No table, no pie chart. **The hero number is the only large type on the screen.**

### What a treasurer sees when they click a number

| Rule | Spec |
|---|---|
| Numerals | Tabular and lining, right-aligned. Mono only for IDs. |
| Currency | Symbol in step 11, digits in step 12. Cents at the same size, never superscripted. |
| Negatives | A true minus glyph **and** the danger color. Never color alone. |
| Totals | Sticky footer row, 1px top border, weight 600 |
| Sparklines | One per budget category, 80×20, fixed-width column |
| Deltas | Arrow glyph plus tabular width so columns do not jitter |
| Precision | Money always two decimals. Percentages zero or one. Never four. |
| Drill-down | Row opens a side panel with receipt, approver, audit trail. **Never a modal.** |

### Small multiples for the semester

Twelve small charts, one per budget category, on a shared y-axis, sorted by spend. An officer sees "food is the problem" in under a second. No table does that.

### Progressive disclosure of the machine

All the heavy machinery — forecasts, burn-rate projections, per-event ROI, benchmarks against similar clubs — lives behind a single **Analyze** affordance and is **off by default**.

**The rule: no student ever sees a model output they did not ask for.**

---

## 8. Twenty things we never do

1. Never a two-hue gradient in product chrome.
2. Never glassmorphism as decoration. Blur only for genuine overlay scrims.
3. Never emoji as an icon in navigation, buttons, labels, or empty states.
4. Never ship an untouched component-library default token.
5. Never more than one radius value inside a single component.
6. Never a shadow on a static card. A 1px border is the default.
7. Never a weight below 400, and never change weight on hover.
8. Never a proportional numeral in a column, total, delta, or timestamp.
9. Never center product content in a narrow column.
10. Never a hero section or oversized illustration inside the app.
11. Never stock 3D illustration or a gradient mesh. Real photos or nothing.
12. Never animate a keyboard-initiated action. Never exceed 240ms.
13. Never a spinner where a layout-matched skeleton is possible.
14. Never a confirmation dialog for a reversible action. Execute, then offer undo for eight seconds.
15. Never use color alone to convey state.
16. Never remove a focus style without a focus-visible replacement.
17. Never an icon-only control without a label. Never a tooltip on a disabled button.
18. Never zebra striping, vertical gridlines, or chart junk.
19. Never more than three categorical colors in a chart a non-officer sees.
20. Never copy a human would not say out loud. No "oopsie," no "streamline your workflow," no exclamation marks, no title-case buttons, no blaming the user.

---

## 9. Implementation order

1. Tokens as JSON, compiled to CSS custom properties for both modes plus high contrast, generated from three inputs.
2. Self-hosted subset fonts with a metric-matched fallback. Verify zero layout shift.
3. Primitives in order: Button, Input, Table, Dialog. **Focus rings and keyboard behavior built in from the first commit**, never retrofitted.
4. The command palette before the second page exists. It forces every object to have a canonical name and route.
5. Skeletons authored alongside each surface, from the same layout metrics.
6. Accessibility checks, keyboard-only passes, and 320px reflow in CI. Produce an accessibility conformance report before the first public-university pilot.

---

## 10. Two corrections worth knowing

**The accessibility deadline moved.** An interim final rule published 20 April 2026 pushed the Americans with Disabilities Act Title II web deadline to **26 April 2027** for populations of 50,000 and above, where most public universities land, and 2028 for smaller ones. It covers third-party tools that universities adopt.

**Canvas is moving off Lato.** Instructure is migrating to Inclusive Sans and Atkinson Hyperlegible, with navy branding and 12px radii. We should design against where Canvas is going, not where it has been.

---

## 11. One gap

There is **no verified Gen Z authenticity research** behind the copy-voice section. The sources were blocked during research, so section 7 of the underlying report reasons from product evidence rather than audience data. Worth a dedicated pass before brand voice is locked.
