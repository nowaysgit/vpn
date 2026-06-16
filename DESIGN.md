# Design System

> Inspired by **Airbnb** (structure, typography rhythm, component states, layering, spacing) with the **Spotify Green** primary accent.
> All UI is implemented via **shadcn-vue**.
> CSS tokens live in `apps/frontend/src/assets/css/tailwind.css` — `@layer base` (CSS variables) + `@theme inline` (Tailwind mappings).

---

## 1. Visual Theme & Atmosphere

The interface feels like an editorial admin panel that happens to be an app — clean canvases (Canvas White on light, Near Black on dark) give way to data, agents, and content cards, and the chrome itself recedes so the working surfaces can breathe. The signature **Spotify Green** (`#1ed760`) is used sparingly but unmistakably: primary CTA, active tab indicator, "Run / Resume" controls, success affirmations, the occasional metric emphasis. Everything else is a disciplined grayscale, with **Ink Black** (`#222222`) carrying almost every line of text in light mode and **Pure White** (`#ffffff`) doing the same job in dark mode.

What makes the system feel coherent is how much *faith* it places in content. Cards (jobs, agents, knowledge entries, deploy runs) are displayed at hero scale with edge-to-edge radius treatment. Section switching uses a tab strip with a 2px green underline. This is the rare admin product where the UI-as-frame disappears — buttons, inputs, and chrome stay quiet so that lists, tables, and live streams do the talking.

The newest surface is the **Live Run** product line — same chrome, but richer card density, more streaming events, and a center-anchored job panel with sticky right-rail status. Detail pages (jobs, agents, schedules) follow a tight template: full-bleed header → overlapping rounded action card (sticky on scroll) → metadata grid → live event stream → related entries → audit log → footer disclosures. The rhythm is consistent whether you're inspecting a job or editing an agent.

**Key Characteristics:**
- Spotify Green (`#1ed760`) as a single-accent brand color, used only for primary CTAs and the active-tab indicator
- Full-bleed card surfaces with gentle corner rounding (12–20px) as the primary visual vocabulary
- Tab strips paired with flat typography — the system trusts type to do the navigational work
- Circular `50%` icon buttons (back arrow, share, stop, carousel arrows) scattered throughout
- `Manrope` carries every label, from 11px micro to 28px section heading — a single-family system
- Status-tier color coding: Success Green (running / passed), Warning Amber (paused / rate-limited), Error Red (failed / cancelled), Info Blue (informational links)
- "Run health" lockup — centered giant rate/duration number between two simple SVG laurel marks for top-performing agents
- Sticky action panel with a status → controls → next-action stack, pinned to the right rail on desktop, transforming to a bottom-anchored "Run" bar on mobile
- Sticky bottom mobile navigation (Home / Tasks / Settings) with an active-state Green tint
- Dark mode is first-class: every token has a dark equivalent, and the dark surface palette converges on `#0a0f0c → #11171a`

---

## 2. Color Palette & Roles

All colors are consumed via CSS variables (HSL format) defined in `tailwind.css`. **Never hardcode hex values in components.**

### Primary
- **Spotify Green** (`#1ed760`): The brand's signature accent. CSS variable `--primary`. Used for: primary "Run" button, search submit button, active tab underline, status-success fill, value emphasis. The single highest-visibility color on every page.

### Secondary & Accent
- **Deep Green** (`#1db954`): A more saturated variant. CSS variable `--primary-strong`. Used for pressed/active button states and gradient terminal stops.
- **Tier Emerald** (`#047857`): CSS variable `--tier-pro`. The brand color for the Pro tier — used for premium-only UI labels and badges.
- **Tier Forest** (`#064e3b`): CSS variable `--tier-elite`. The brand color for the Elite tier — used for the deepest tier-only chrome.
- **Info Blue** (`#3b82f6`): CSS variable `--text-legal`. Used for legal/informational links (terms, privacy, disclosures) — the only non-monochrome link color in the system.

### Surface & Background
- **Canvas White** (`#ffffff`): The default page background in light mode. Every card, every container, every detail page starts here.
- **Soft Cloud** (`#f7f7f7`): Subtle subsurface tint used on footer backgrounds, table-view wrappers, and "everything else" sections that want to step back from the primary white.
- **Hairline Gray** (`#dddddd`): Ubiquitous 1px border color — separates cards, list rows, panels, footer columns. The workhorse of the layout system.
- **Near Black** (`#0a0f0c`): The default page background in dark mode — slightly green-tinted near-black so the brand subtly tints every surface.
- **Dark Surface** (`#11171a`): Cards/containers in dark mode.
- **Dark Hairline** (`#22272a`): 1px borders in dark mode.

### Neutrals & Text
- **Ink Black** (`#222222`): CSS variable `--foreground` (light). The system's near-black. Every heading, every body paragraph, every nav label, every metric. Used for ~90% of all text on a light page.
- **Charcoal** (`#3f3f3f`): CSS variable `--text-focused`. Used in focused-state input text and one-step-down emphasis copy.
- **Ash Gray** (`#6a6a6a`): CSS variable `--muted-foreground` (light). Secondary labels, "Active jobs" subtitle copy under counts, muted footer links.
- **Mute Gray** (`#929292`): CSS variable `--text-disabled`. Disabled buttons and low-priority metadata.
- **Stone Gray** (`#c1c1c1`): Tertiary dividers, icon strokes, placeholder avatars.
- **Pure White** (`#ffffff`): `--foreground` in dark mode; primary text on dark surfaces.
- **Silver** (`#b3b3b3`): `--muted-foreground` in dark mode; secondary text on dark surfaces.

### Semantic
- **Success Green** (`#16a34a`): Status pill / icon for completed jobs, passed CI, healthy services. Distinct from the brand `--primary` so success doesn't compete with CTAs.
- **Warning Amber** (`#f59e0b`): Paused jobs, rate-limited providers, stale data.
- **Error Red** (`#c13515`): CSS variable `--destructive`. Form validation errors, failed jobs, destructive-action warnings.
- **Deep Error** (`#b32505`): Pressed/active variants of error states.
- **Info Blue** (`#3b82f6`): Informational badges, legal links.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): Disabled material-style labels.

### Gradient System

Gradients are reserved for the **branded moment** — the wordmark, the hero card-of-the-day, the empty-state illustration backdrop. They are never applied as a generic page background, and never decorate text. Three gradients are sanctioned:

```css
/* Brand gradient — green sweep, the canonical wordmark fill */
--gradient-brand: linear-gradient(90deg, #1ed760 0%, #1db954 50%, #047857 100%);

/* Tier gradient — emerald → teal, used for Pro/Elite badges and section highlights */
--gradient-tier: linear-gradient(135deg, #1db954 0%, #0d9488 50%, #0e7490 100%);

/* Atmosphere gradient — mint → green → forest, used on dashboard hero panels and empty states */
--gradient-atmosphere: linear-gradient(180deg, #6ee7b7 0%, #1ed760 45%, #064e3b 100%);
```

Companion solo greens that compose with the brand without competing:

| Token | Hex | Pairs With | Use |
|-------|-----|------------|-----|
| Mint | `#6ee7b7` | gradient stops, hover halos | Soft success tint, hover overlays on green buttons |
| Teal | `#0d9488` | tier badges, secondary CTAs | A cool-green sibling for non-primary "go" actions |
| Forest | `#064e3b` | dark mode chrome, deep states | The terminal stop in atmosphere gradients; dark-mode "active" pill |
| Cyan | `#0e7490` | charts, data series | Secondary data-series color in analytics (sits alongside green without clashing) |
| Lime | `#a3e635` | rare highlight, achievement burst | Reserved for celebration moments (job completed under SLA, perfect run) |

Use any of these at most **once per viewport**; the system's discipline depends on green staying scarce.

---

## 3. Typography Rules

### Font Family
- **Manrope** (primary and only): The project's variable-weight sans-serif that carries the entire system. Loaded from Google Fonts. Fallbacks (in order): `-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.

Weights observed in tokens: 400, 500, 600, 700, 800. The system's "body" weight is **500**, which gives every block of text a subtle extra density that reads as confident and deliberate.

OpenType features: `salt` (stylistic alternates) is enabled on numerals, giving the compact metrics on the dashboard a slightly tighter, monospaced feel. `cv11` (slashed zero) is enabled on tabular contexts (job IDs, durations, counters).

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Section Heading | 28px / 1.75rem | 700 | 1.43 | 0 | "Все агенты", "Активные задания" — page-level headings |
| Subsection Heading | 22px / 1.38rem | 500 | 1.18 | -0.44px | "Конфигурация моделей", "История запусков" — content dividers |
| Card Title | 21px / 1.31rem | 700 | 1.43 | 0 | Detail panel headings, card lead titles |
| Listing Title | 20px / 1.25rem | 600 | 1.20 | -0.18px | Job names, agent names on detail pages |
| Subtitle Bold | 16px / 1.00rem | 600 | 1.25 | 0 | Author / owner / pipeline name |
| Body Medium | 16px / 1.00rem | 500 | 1.25 | 0 | Primary body copy on detail pages |
| Button Large | 16px / 1.00rem | 500 | 1.25 | 0 | "Запустить", "Сохранить" |
| Button Default | 14px / 0.88rem | 500 | 1.29 | 0 | Standard button labels |
| Link | 14px / 0.88rem | 500 | 1.43 | 0 | Nav links, footer links |
| Caption Medium | 14px / 0.88rem | 500 | 1.29 | 0 | Metadata, subtitle lines ("Cottage rentals" equivalents like "Active 3m ago") |
| Caption Bold | 14px / 0.88rem | 600 | 1.43 | 0 | `salt` enabled — numeric stats, small-text emphasis |
| Caption Small | 13px / 0.81rem | 400 | 1.23 | 0 | Timestamps, micro-metadata |
| Micro Default | 12px / 0.75rem | 400 | 1.33 | 0 | Footer disclaimers, legal micro-copy |
| Micro Bold | 12px / 0.75rem | 700 | 1.33 | 0 | "NEW" pill labels |
| Badge Uppercase | 11px / 0.69rem | 600 | 1.18 | 0 | Compact category/status badges |
| Superscript | 8px / 0.50rem | 700 | 1.25 | 0.32px | Uppercase — numeric footnotes, decimal tails |

### Principles
- **One family, many weights.** Manrope handles everything from 8px legal to 28px page headings — the visual identity comes from the family itself, not from typeface mixing.
- **500 is the new 400.** The system's "regular" weight is 500, giving every paragraph a slightly more confident texture than the web default.
- **Negative tracking on display type only.** Headings 20px+ compress tracking by -0.18 to -0.44px to feel chiseled; body sizes stay at 0 tracking for readability.
- **Tight line-heights for headlines, generous for body.** Display type runs at 1.18–1.25 (tight); body and caption open up to 1.43 for long-form comfort.
- **No all-caps except at 8px.** The only uppercase transform in the system is the 8px superscript and the 11px Badge Uppercase — everywhere else, sentence case with subtle weight shifts does the work.

### Note on Font Substitutes
Manrope is open-source (Google Fonts) and the canonical face for this system. If for any reason it fails to load, the documented fallback chain (`-apple-system, system-ui`) renders acceptably on macOS/iOS where `system-ui` resolves to San Francisco, which has similar proportions.

---

## 4. Component Stylings

### Buttons

**Primary CTA** ("Запустить", "Сохранить", "Применить")
- Background: Spotify Green `hsl(var(--primary))`
- Text: black or white (`hsl(var(--primary-foreground))`), Manrope 500, 16px
- Padding: ~14px vertical, 24px horizontal
- Radius: 8px (rectangular) or 50% (circular icon variant)
- Border: none
- Active/pressed: `transform: scale(0.97)` plus a 2px Ink Black focus ring at `0 0 0 2px`

**Secondary Button** ("Отменить", outlined tertiary actions)
- Background: `hsl(var(--background))`
- Text: Ink Black / Pure White, Manrope 500, 14–16px
- Padding: 10px 16px
- Radius: 20px (pill) or 8px (rectangular)
- Border: 1px solid `hsl(var(--border))`

**Icon-Only Circular Button** (back arrow, share, stop, carousel controls)
- Background: `hsl(var(--muted))` or transparent with 1px translucent border
- Icon: foreground stroke, 16–20px
- Size: 32–44px diameter
- Radius: 50%
- Active/pressed: `transform: scale(0.97)`; subtle 4px white ring `0 0 0 4px hsl(var(--background))` to separate from colorful surfaces

**Disabled Button**
- Background: `hsl(var(--muted))`
- Text: Stone Gray
- Opacity: 0.5

**Pill Tab Button** (segmented "Чат / Пайплайн" pickers)
- Background: transparent
- Text: foreground, Manrope 500, 16px
- Padding: 8px 14px
- Active state: 2px Spotify Green underline beneath the label

### Cards & Containers

**List Card** (jobs grid, agents grid, knowledge entries)
- Background: `hsl(var(--card))`
- Radius: 14px on the card, content sits flush with the radius
- Padding: 16px
- Shadow: none in light mode — separation comes from whitespace and the 1px hairline; subtle elevation in dark mode (see §6)
- Metadata pattern: title on line 1 (16px 600), subtitle on line 2 (14px 500 muted), status row on line 3, action row at the bottom

**Detail Page Action Panel** (sticky right rail on job/agent pages)
- Background: `hsl(var(--card))`
- Radius: 14–20px
- Border: 1px solid `hsl(var(--border))`
- Shadow: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — the system's signature stacked three-layer subtle elevation
- Padding: 24px
- Width: ~370px, pinned 120–140px below the viewport top
- Content: status headline → action stack → primary CTA → "Не будет применено пока не подтвердите" footnote

**Inline Row Card** (table-like list rows on knowledge / tasks pages)
- Background: `hsl(var(--card))`
- Border: 1px solid `hsl(var(--border))` at the row level (not per item)
- Padding: 16px vertical per row
- Icon + label pattern: 24px outline icon on the left, 16px 500-weight label on the right, optional trailing meta chip

**Comment / Review Card** (job comments, audit entries)
- Background: `hsl(var(--card))`, no border
- Padding: 0 (relies on grid gaps)
- Content: 40px circular avatar + 16px 600-weight name + 14px 400 muted timestamp on one row, then 14px 500 body paragraph below

### Inputs & Forms

**Search Bar** (primary header)
- Background: `hsl(var(--background))`
- Border: 1px solid `hsl(var(--border))`
- Radius: 32px (full pill)
- Shadow: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — subtle floating feel
- Submit: Spotify Green circular icon button at the right edge, 40px diameter

**Text Input** (generic forms)
- Background: `hsl(var(--background))`
- Border: 1px solid `hsl(var(--input))`
- Radius: 8px
- Padding: 14px 16px
- Focus: border switches to `hsl(var(--ring))`, adds `0 0 0 2px` ring of the same color
- Error: border switches to `hsl(var(--destructive))`, helper text uses same color

**Date Picker**
- Calendar grid: 7-column layout, circular `50%` day cells 40–44px wide
- Selected range: foreground background with inverted numerals
- Start/end anchors: larger filled circles; middle dates use `hsl(var(--accent))` tint

### Navigation

**Top Nav (Desktop)**
- Height: ~80px
- Background: `hsl(var(--background))`
- Left: workspace logo lockup in Spotify Green
- Center: tab strip (Главная / Задачи / Агенты / Настройки) with 16px 500 labels; active tab has a 2px Spotify Green underline
- Right: a primary CTA, then a 32px circular notification bell, then a 36px avatar menu
- Border-bottom: 1px solid `hsl(var(--border))`

**Side Nav (Desktop alternative — current implementation)**
- Width: 232px (collapsible)
- Background: `hsl(var(--sidebar))`
- Section groups (Core / Execution / Agents / System) with 11px uppercase 600 group headers
- Items: 14px 500 with leading 16px icon; active item has a 4px-wide Spotify Green left edge bar and a `hsl(var(--accent))` background tint
- Indicator dots (job/notification/server) sit at the trailing edge as 6px circles in semantic color

**Top Nav (Mobile)**
- Single-row search pill occupies full width
- Below: tab strip persists — labels shrink to 14px 500
- Bottom-fixed tab bar: Home / Tasks / Settings — 24px icons above 12px labels

**Listing Detail Secondary Nav**
- Sticky horizontal scroll of anchor links (Overview / Logs / Comments / History) appears on scroll past the hero
- Height: 56px
- Border-bottom: 1px solid `hsl(var(--border))`

### Image / Avatar Treatment

- **Primary aspect ratios**: 1:1 for avatars, 16:9 for hero illustrations on dashboard, 4:3 for knowledge thumbnails
- **Radius**: 14px on grid images, 20px on detail-page hero frames, `50%` on avatars
- **Lazy loading**: heavy use of `loading="lazy"` with blurred placeholder previews
- **Carousel**: circular 32px arrow buttons overlay the image, centered vertically; dot indicators sit 12px above the bottom edge

### Signature Components

**Run Health Lockup** (featured on top-of-list agent / job cards)
- Centered metric (rate, runs/day, p99) rendered at 44–56px 700-weight
- Two minimal SVG laurel marks flanking left and right at ~48px tall
- Below: `RUN HEALTH` label at 12px 700 uppercase with `0.32px` tracking, and a short sub-label at 14px 500 muted
- Full-width block, no container border — sits directly on canvas

**Tab Strip** (top of every section surface)
- Three to five equal-width tabs with 16px 500 labels
- Active tab: 2px Spotify Green underline beneath the label
- Optional 12px 700 white "NEW" pill on dark navy background floating top-right of new sections

**Inspiration Grid** (dashboard "Что сделать дальше")
- 6-column grid of suggestion links on desktop, 2-column on mobile
- Each cell: 16px 600 title on line 1, 14px 500 muted subtitle on line 2
- No images — text-only grid
- Tabbed above by category (Tasks / Agents / Knowledge); active tab has 2px green underline and weight shift

**Run Sticky Card** (job detail pages)
- Stays fixed 120px below viewport top on desktop as the user scrolls past the hero
- Collapses to a full-width bottom bar on mobile with a status label and a Spotify Green action pill
- Always shows: status headline → next-action stack → primary CTA → audit footnote

**Agent Owner Card** (agent detail pages)
- Full-width rounded container with a 3:2 cover gradient (`--gradient-atmosphere`) at top
- Owner avatar (circular, 56px) overlapping the bottom edge of the cover by 50%
- Below overlap: owner name at 16px 700, role / tenure at 14px 500 muted, small Spotify Green "Open chat" pill button
- Used as the transition between comments and the metadata block

**"Things to know" Strip** (job/agent detail pages)
- 3-column grid of policy blocks (Run policy, Permissions, Cancellation policy)
- Each column: icon at the top, 16px 600 heading, 14px 500 muted body, "Show more" link in foreground underline
- Separator: 1px hairline top and bottom borders on the overall strip

---

## 5. Layout Principles

### Spacing System
- **Base unit**: 8px
- **Scale**: 2, 3, 4, 5.5, 6, 8, 10, 11, 12, 15, 16, 18.5, 22, 24, 32px — fine-grained with a handful of off-grid values used for pixel-perfect icon alignment
- **Section padding**: ~48–64px top/bottom on desktop, 24–32px on mobile
- **Card internal padding**: 24px on action panels and large cards, 16px on list rows, 12px on grid-card metadata
- **Gutter between cards**: 24px desktop, 16px mobile
- **Between stacked text rows**: 4–8px (very tight — reinforces the "dense information" feel of an admin app)

### Grid & Container
- **Max content width**: 1760–1920px on ultra-wide; 1280px on most detail pages
- **Dashboard grid**: 6 columns at ≥1760px, 5 at ≥1440px, 4 at ≥1128px, 3 at ≥800px, 2 at ≥550px, 1 below
- **Detail page**: 2-column asymmetric — main content ~58%, sticky action panel ~36% on the right, ~6% gutter
- **Footer**: 3-column Support / Workspace / Resources

### Whitespace Philosophy
This is a dense admin product but never cramped. Whitespace is used to *group* — list cards have 24px of gutter so each card reads as a distinct object, but the metadata under each card uses 4–8px gaps so the title/subtitle/status feels like a single unit. The detail-page action panel has 24px internal padding, but rows within (status, action stack, CTA) are stacked at 12px — the boundary between the card and the page does more separation work than the content within.

### Border Radius Scale
| Radius | Use |
|--------|-----|
| 4px | Inline anchor tags, tag chips |
| 8px | Text buttons, dropdowns, small utility buttons, inputs |
| 14px | List card surfaces, generic content containers, badges |
| 20px | Primary rounded buttons (pill shape), large images, action panel |
| 32px | Search bar pill, extra-large containers |
| 50% | All circular icon buttons, all avatars, status dots — the system's signature round geometry |

---

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| 0 | No shadow | List cards, body content, text-only sections |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Active/pressed icon buttons (e.g., back, share) — subtle lift to indicate interaction |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Sticky action panel, modals, dropdown menus — the system's signature three-layer elevation |
| Focus Ring | `0 0 0 2px hsl(var(--ring))` | Active-state buttons, focused inputs |
| White Separator Ring | `0 0 0 4px hsl(var(--background))` | Circular buttons overlaid on photographs/gradient hero — a 4px background-color ring cleanly separates the button from colorful backgrounds |

Shadow philosophy: this system uses **stacked layered shadows** rather than a single drop. The three-layer panel shadow reads as one cohesive lift but is actually three separate shadows at different opacity/blur values — creating subtle anti-aliasing at the shadow's perimeter that feels premium without being heavy.

### Dark Mode Elevation
On dark surfaces, light shadows disappear. Use these instead:
- **Level 1 dark**: `rgba(0, 0, 0, 0.3) 0 8px 8px`
- **Level 2 dark**: `rgba(0, 0, 0, 0.5) 0 8px 24px`
- **Inset border (dark inputs)**: `inset 0 0 0 1px rgba(255, 255, 255, 0.06)`

### Decorative Depth
- **Gradient as depth**: the system relies on the three sanctioned gradients for hero panels and empty states; shadows and gradients otherwise stay scarce
- **Laurel mark lockup**: the Run Health award uses two SVG laurel illustrations that give the otherwise-flat metric number a ceremonial, trophy-like presence

---

## 7. Do's and Don'ts

### Do
- Reserve Spotify Green `#1ed760` for primary actions and the active-tab indicator — never dilute it with decorative uses.
- Use Ink Black `#222222` (light) / Pure White `#ffffff` (dark) for every text layer below the primary — this is the system's near-black/white, never pure `#000000`.
- Pair the tab strip with flat typography — don't mix illustration styles within a single surface.
- Stack three low-opacity shadows (~2%, 4%, 10%) on light mode to create the signature panel elevation.
- Use `hsl(var(--border))` 1px borders for every card-to-card and row-to-row divider.
- Treat the action panel as sticky on desktop, collapsing to a bottom-anchored CTA bar on mobile.
- Use 4–8px spacing within metadata groups and 24px between cards — information density is intentional.
- Apply gradients (`--gradient-brand`, `--gradient-tier`, `--gradient-atmosphere`) only in the three sanctioned places: wordmark, tier badges, hero/empty-state backdrops.
- Reach for the green companions (mint, teal, forest, cyan, lime) at most once per viewport.

### Don't
- Don't introduce secondary accent colors outside the green family + `--tier-*` palette.
- Don't place text inside hero gradients without a solid contrast layer — captions sit below or on a darkened band, never raw on the gradient.
- Don't use all-caps labels except the 8px Superscript and 11px Badge Uppercase roles.
- Don't round icon buttons to anything other than 50% — circular is the system's signature geometry.
- Don't add drop shadows to list cards in light mode — they sit on white canvas with no elevation.
- Don't paint surfaces with the brand gradient — gradients are reserved for hero/branded moments.
- Don't use the 400-regular font weight for body — Manrope's body weight is 500.
- Don't override Manrope with a different display face — the system is intentionally single-family.
- Don't hardcode hex values in components — always reference a CSS variable.

---

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Ultra-wide | ≥1760px | 6-column dashboard grid, 1760–1920px max content width |
| Desktop XL | 1440–1759px | 5-column grid, full nav visible, sticky right-rail action panel |
| Desktop | 1128–1439px | 4-column grid, sticky action panel persists |
| Laptop | 1024–1127px | 3–4 column grid, side nav remains expanded |
| Tablet | 800–1023px | 3-column grid, side nav collapses to icons |
| Small tablet | 550–799px | 2-column grid, action panel drops to full-width inline block |
| Mobile | 375–549px | 1-column stacked layout, bottom-fixed tab bar appears |
| Small mobile | <375px | Edge padding tightens to 16px; nav icons shrink to ~24px |

### Touch Targets
All interactive elements meet or exceed 44×44px. The circular icon button family is specifically sized 32–44px with 8–12px extended hit-area padding. The Spotify Green primary CTA is ~48px tall. Tab strip hit area is the full label rectangle (typically ~64×44px per tab).

### Collapsing Strategy
- **Nav**: Side nav stays expanded on tablet and above; on mobile it slides into a sheet, and the indicators (jobs/server/notifications) move to a bottom-anchored tab bar.
- **Search bar**: Three-segment pill on desktop; collapses to a single-row "Поиск" pill on mobile, tapping which opens a full-screen search sheet.
- **Action panel**: Sticky right-rail on ≥1128px; inline within the main content column between 800–1127px; bottom-fixed CTA pill on <800px.
- **Listing grid**: Reflows 6 → 5 → 4 → 3 → 2 → 1 columns across breakpoints.
- **Detail-page hero**: Two-column hero (metadata + status panel) on desktop; stacks vertically on tablet and below.
- **Footer**: 3-column layout collapses to stacked single-column at <800px.

### Image Behavior
- `loading="lazy"` universal, with blurred preview thumbs served first
- No art-direction crops — the same image is scaled up/down across breakpoints
- Carousels auto-advance to maintain a consistent 4:3 ratio regardless of source aspect

---

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: "Spotify Green (#1ed760)"
- Page background: "Canvas White (#ffffff)" (light) / "Near Black (#0a0f0c)" (dark)
- Subsurface: "Soft Cloud (#f7f7f7)" (light) / "Dark Surface (#11171a)" (dark)
- Heading / body text: "Ink Black (#222222)" (light) / "Pure White (#ffffff)" (dark)
- Secondary text: "Ash Gray (#6a6a6a)" (light) / "Silver (#b3b3b3)" (dark)
- Border / divider: "Hairline Gray (#dddddd)" (light) / "Dark Hairline (#22272a)" (dark)
- Error: "Error Red (#c13515)"
- Info link: "Info Blue (#3b82f6)"
- Tier accents: "Tier Emerald (#047857)" / "Tier Forest (#064e3b)"

### Example Component Prompts
- "Create a primary Run button: Spotify Green (#1ed760) background, black Manrope 500-weight label at 16px, 14px × 24px padding, 8px border-radius, no shadow. On active/pressed add `transform: scale(0.97)` with a 2px Ink Black focus ring (`0 0 0 2px #222222`)."
- "Build a job card with a 14px border-radius, no container shadow on light mode; below the title stack three text rows with 4px gaps: agent name at 16px 600 Ink Black, last-run timestamp at 14px 500 Ash Gray (#6a6a6a), and status pill with `bg-success-soft text-success` for completed."
- "Design a sticky action panel: white background, 14px border-radius, 1px hairline border, 3-layer elevation shadow (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), 24px padding, 370px width, pinned 120px below viewport top on desktop. Contents: status headline, action stack, primary CTA, and a 12px Ash Gray `Подтверждение требуется` disclaimer."
- "Create a tab strip: three to five equal-width tabs with 16px 500 Ink Black labels; active tab gets a 2px Spotify Green underline; add a small 12px 700 white `NEW` pill on dark navy background to the top-right of new tabs."
- "Render the Run Health lockup: a centered metric number at 52px 700-weight Ink Black, flanked left and right by hand-drawn SVG laurel marks at ~48px tall; below, a 12px 700 uppercase `RUN HEALTH` label with 0.32px tracking; sub-label at 14px 500 Ash Gray; full-width block sitting directly on canvas with no container border."
- "Use `--gradient-atmosphere` (mint → green → forest, 180deg) as the backdrop on the empty-state illustration card; never paint a full-page background with it."

### Iteration Guide
When refining existing screens generated with this design system:
1. Focus on ONE component at a time.
2. Reference specific CSS variable names and hex codes from this document (e.g., "Ink Black `hsl(var(--foreground))`", not "dark gray").
3. Use natural language descriptions alongside measurements ("subtle three-layer elevation" rather than a long shadow string).
4. Describe the desired "feel" ("editorial, content-first" vs "dense utility").
5. Always default to Manrope 500-weight for body and 600–700 for emphasis — never 400.
6. Keep Spotify Green scarce — if more than one green-colored element appears per viewport, consider whether one should be neutralized.
7. Prefer the green family (mint, teal, forest, cyan, lime) over inventing new accents — they're pre-validated to coexist with the brand green.
