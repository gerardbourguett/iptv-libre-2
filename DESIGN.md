---
name: OpenTV
description: A familiar, warm dark-theme streaming app for your own IPTV playlist — rounded channel cards, a horizontally-scrollable category pill bar, and one committed violet accent.
colors:
  bg: "#121218"
  surface: "#1b1b25"
  surface-hover: "#24242f"
  card: "#1f1f2a"
  card-hover: "#272733"
  border: "#2b2b38"
  border-strong: "#3c3c4c"
  text: "#f5f5f8"
  text-secondary: "#a7a7b5"
  text-muted: "#8c8c98"
  accent: "#7c5cff"
  accent-strong: "#6c46f0"
  accent-text: "#a78bff"
  warning: "#fbbf24"
  danger: "#fb7185"
  focus: "#7c5cff"
  on-accent: "#ffffff"
typography:
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
  mono:
    fontFamily: "IBM Plex Mono, SFMono-Regular, Consolas, monospace"
rounded:
  sm: "10px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "14px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent-strong}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
---

# Design System: OpenTV

## Overview

**Creative North Star: "Familiar Streaming App"**

OpenTV replaces its prior broadcast-control-room identity ("MCR Video Wall" — bezels, tally lights, UMD nameplates, a patch-bay category rail) with the vocabulary every mainstream streaming/IPTV app already speaks: rounded, browsable channel cards on a warm dark ground, a horizontally-scrollable pill bar for category browsing, and one saturated, committed accent color that carries real visual weight instead of hiding in restraint. The structural proportions the previous system got right — a dominant video player above a compact, horizontally-scrolling strip of channel units — are kept unchanged; only the visual language around that structure is new.

**Key Characteristics:**
- Warm charcoal dark ground (`#121218`), not an ink-cold engineering black — a living-room-at-night surface
- One committed accent, Signal Violet (`--color-accent` `#7c5cff`), carrying real weight: primary buttons, the active category pill, the selected/live channel state, and focus rings — not a decorative sliver
- Rounded channel cards (16px radius) with a soft violet-tinted radial gradient behind each logo, since there is no real poster art to show
- A horizontally-scrollable category pill bar between the topbar and the player — no fixed-width sidebar, so category browsing can never overlap adjacent content at any window width
- Status is always a dot + an uppercase text label together, never color alone, carried over from the prior system's accessibility discipline
- Manrope is the only display/body voice; IBM Plex Mono is de-emphasized to genuinely mono-appropriate content only (the playlist URL)

## Colors

A warm near-black neutral scale with one committed saturated accent (violet) and two functional status hues that sit outside the accent's "one signal" role because they mean something specific (connecting / offline), not brand identity.

### Primary
- **Signal Violet** (`--color-accent` `#7c5cff`, deeper fill `--color-accent-strong` `#6c46f0`, light text tint `--color-accent-text` `#a78bff`, soft fill `--color-accent-soft`, glow `rgba(124,92,255,0.35)`): the single committed accent. Used on the primary submit button, the active category pill, the selected/live channel card's ring and glow, the "Live" status badge, and `:focus-visible` rings. Split into three steps for contrast reasons: `--color-accent-strong` is deliberately deeper so white label text sitting on a solid accent fill clears 4.5:1 (measured ≈5.6:1); `--color-accent` is the vivid identity hue used for rings/borders/glows/dots (graphical use, 3:1 floor); `--color-accent-text` is a lighter tint used wherever the hue itself needs to *be* legible text on a dark card/surface (measured ≈6.4:1 against the card background).

### Functional status (outside the one-accent rule)
- **Warning / Connecting** (`--color-warning` `#fbbf24`): the connecting-state dot and label.
- **Danger / Offline** (`--color-danger` `#fb7185`, soft fill `--color-danger-soft`): the offline-state dot/label and error banners/fields. Chosen as a rose, not a pure saturated red, so it never reads as a second brand accent competing with the violet, and specifically avoids landing on any well-known streaming competitor's exact red signature.

### Neutral (ground + surface steps)
- **Ground** (`--color-bg` `#121218`): the outermost app background and the category-pill-bar / metadata-strip background.
- **Surface** (`--color-surface` `#1b1b25`, hover `#24242f`): topbar, panels, category pills, input fields' surrounding chrome.
- **Card** (`--color-card` `#1f1f2a`, hover `#272733`): channel cards and the video player frame — the system's primary "content unit" surface.
- **Border** (`--color-border` `#2b2b38`) / **Border Strong** (`--color-border-strong` `#3c3c4c`): the default 1px hairline and its hover/emphasis step, applied globally via `*, *::before, *::after { border-color: var(--color-border); }`.
- **Text** (`--color-text` `#f5f5f8`): primary reading color. **Text Secondary** (`--color-text-secondary` `#a7a7b5`): labels, subtext. **Text Muted** (`--color-text-muted` `#8c8c98`): the most de-emphasized step (category names on cards, meta labels, timestamps) — measured ≥4.5:1 against both the ground and card backgrounds, the two surfaces it actually appears on.

### Named Rules
**The Committed Accent Rule.** `--color-accent` (in its strong/text/soft forms) is the one color the interface spends real weight on — buttons, active states, live/selected state, focus. It is not rationed to a single micro-signal the way the prior system's tally red was; "Committed" mode means it is allowed to carry real visual weight across the interface, as long as it stays the *only* competing hue doing so (warning/danger are functional, not decorative, and never used interchangeably with the accent).

**The Dot-Plus-Label Rule.** No status is ever conveyed by a dot color alone — every `.status-badge` pairs a colored dot with an uppercase text label in the same hue family, carried over unchanged from the prior system's accessibility discipline.

## Typography

**Body/UI Font:** Manrope, with `ui-sans-serif, system-ui, sans-serif` fallback — the only typographic voice in the system. The prior system's condensed uppercase display face (Big Shoulders) is dropped entirely; it belonged to a broadcast-console register this app no longer occupies. Headings use Manrope at heavier weights (700–800) rather than a separate display face.

**Mono Font:** IBM Plex Mono, with `SFMono-Regular, Consolas, monospace` fallback — kept, but deliberately narrowed to content that is genuinely monospace-appropriate: the playlist URL input/display (profile creation, and the topbar's Source stat). It is no longer used as a "technical flavor" voice for channel metadata, IDs, or timestamps — those now render in plain Manrope with `tabular-nums` where the value is numeric.

### Hierarchy
- **Heading** (700–800 Manrope, no uppercase transform, no letter-spacing trick): app wordmark, welcome-screen heading, panel section headers ("Channels").
- **Body** (400–600 Manrope): banner messages, welcome-screen copy, form helper text, channel card names.
- **Label** (600–700, 10–11px, uppercase, `letter-spacing: 0.06em–0.1em`, `--color-text-muted`): stat labels in the topbar, meta labels in the player footer, form field labels.
- **Mono** (`.mono`, IBM Plex Mono): the playlist URL only.

### Named Rules
**The One-Voice Rule.** Manrope is the only font making a typographic *identity* statement. Weight and size carry hierarchy; there is no second display face standing in for "brand character" the way Big Shoulders did.

## Layout

No CSS grid framework beyond Tailwind's utilities; the app is a single full-height flex column (`html, body, #root { height: 100% }`) with no router — `App.tsx` is a two-screen state machine (`WelcomeScreen` vs `MainScreen`) gated on store hydration, unchanged from the prior system.

**MainScreen** stacks: a wrapping topbar (`min-height`, not a hard-clipped fixed height — see Responsive Containment below), optional status banners, a horizontally-scrollable category pill bar, then a flex column holding the video player above the channel strip.

**The video player remains the dominant element** in the content column — its wrapping `<section>` is `flex-1 min-h-0`, unchanged from the validated prior structure. **The channel strip remains a single horizontally-scrolling row** pinned under the player (`flex-shrink-0`), restyled from monitor bezels to rounded cards. Tile geometry is fixed (168px card width, ~0.66 aspect art area plus a 64px label body) rather than derived from container width, for the same reason as before: a strip's compactness must hold regardless of content-column width. Above 150 channels (post category-filter), the strip switches from a plain flex row to a horizontally-virtualized `react-window` `Grid`, sized against the same tile geometry so the swap is visually seamless. Roving-tabindex keyboard navigation (left/right, Home/End) is unchanged.

**Category navigation moved from a fixed-width left sidebar to a horizontally-scrollable pill bar** spanning the full content width between the topbar and the player. This is both the "familiar streaming app" pattern (genre chips) and the structural fix for the reported narrow-window overlap bug: a pill bar that overflows simply scrolls sideways within its own row — there is no fixed-width panel competing with adjacent content for space at any window width, and therefore no state in which it can visually collide with anything else.

### Responsive Containment (the overlap-bug fix)
The reported bug — an "information" panel/strip overlapping other content when the window narrows — traced to any layout region whose content could outgrow a hard-capped container without a reflow path. The new system removes every such trap:
- **Topbar** (`app-topbar`) is `flex-wrap: wrap` with a `min-height` (not a fixed `height`) — if the brand mark, stat group, and action buttons can't all fit one row, the stat group wraps to a second row instead of being clipped or overlapping the buttons. Every stat item is `min-width: 0` with `truncate` on its value, and the widest stat (Source, a URL) is additionally hidden below the `md` breakpoint as a second line of defense.
- **Player metadata strip** (`.player-meta`) changed from a fixed-column CSS grid to a `flex-wrap: wrap` row of self-sizing chips (`max-width: 240px`, `min-width: 0`, `truncate`). A grid with fixed column tracks can force content to overflow its cell at narrow widths with nowhere to go; a wrapping flex row always has a next line to fall back to, so no chip can ever overlap another.
- **Category pill bar** scrolls horizontally in its own `overflow-x-auto` row rather than occupying a competing fixed-width column, eliminating the sidebar-vs-content collision class of bug entirely.
- Verified by reasoning through the flex/grid behavior down to the Tauri window's `minWidth: 1000` / `minHeight: 640` (`src-tauri/tauri.conf.json`, unchanged — the new layout's real minimum did not require raising it): at 1000px, the topbar's brand mark + stats + two buttons fit on one row; below that (not reachable in the shipped app, but verified defensively) the topbar wraps to two rows cleanly rather than clipping.

**Spacing rhythm:** the dominant gap/padding unit is **12–14px** (channel-strip gap, card padding) with **20px** used for the topbar's horizontal padding and the category-tab row's padding. Panels use 16–24px interior padding. Form fields use 6px between label and input.

## Elevation & Depth

Depth comes from a warm near-black tonal scale (`bg` → `surface` → `card`) plus offset+blur shadows — real depth, not flat colored halos. The one deliberately glass-like surface is the video player's corner "Live" chip, which uses `backdrop-filter: blur(6px)` for a specific, functional reason: it sits over unpredictable live video content and needs to stay legible regardless of what's playing beneath it, not as decorative glass.

### Shadow Vocabulary
- **Card rest** (`--shadow-card`: `0 10px 24px -12px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.03) inset`): every channel card's resting shadow.
- **Card hover** (`--shadow-card-hover`): a deeper offset+blur drop shadow layered with a 1px accent-tinted ring and a soft accent glow — the signature hover/select treatment (see Motion).
- **Panel lift** (`.app-panel`: `0 16px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.02)`): the welcome-screen form panel and channel-list panel's resting lift.
- **Player frame** (`--shadow-player`: `0 22px 50px -16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)`): the video player's resting shadow, larger than a card's since it's the dominant element.

## Shapes

Fully rounded, "familiar app" geometry — no bezel/hardware framing. `10–12px` for buttons and inputs, `16px` for channel cards and panels, `20px` for the video player frame, `999px` (pill) for category tabs and status-adjacent chips. Borders stay 1px hairlines; nothing uses a colored `border-left`/`border-right` as a decorative accent — identity is carried by fill, ring, and glow.

## Components

### Channel Card (`.channel-card`, `ChannelCard.tsx`)
The system's primary browsable content unit, replacing the prior "Monitor Tile." A rounded (16px) card: `.channel-card__art` (a flex-1 area with a soft violet-tinted radial gradient behind the channel logo, or a two-letter monogram when no logo exists) above `.channel-card__body` (channel name, category name, and a `StatusBadge`). States: hover lifts the card (`translateY(-4px) scale(1.015)`) and brightens the border/shadow to an accent-tinted glow — the system's one authored motion moment; the active/playing card gets a persistent 2px accent ring plus glow and a brief 260ms scale-settle pulse on transition into that state; a dimmed (search-non-matching) card drops to 35% opacity and desaturates rather than unmounting.

### Status Badge (`.status-badge`, `StatusBadge` in `ChannelCard.tsx`)
A small colored dot (`.status-dot`) always paired with an uppercase text label — live (violet), connecting (amber, pulsing), offline (rose), idle (muted gray). Reused identically on channel cards, the video player's footer, and its corner overlay chip, so the same status vocabulary reads consistently everywhere it appears.

### Category Pill (`.category-pill`, `CategoryTabs.tsx`)
The category-navigation unit, replacing the prior sidebar "Patch Row." A pill button in a horizontally-scrollable row; the active pill fills solid with `--color-accent-strong` and white text plus a soft accent-glow shadow, inactive pills sit on `--color-surface` with a hairline border. No per-category color-coding (the prior "patch-bay bus palette") — category identity is carried by the label text and position, keeping the single committed accent as the only competing hue in the system, which also keeps the pill bar coherent at any playlist size instead of turning into a wall of unrelated hues.

### Buttons (`.btn-primary`, `.btn-secondary`)
- **Primary** (`.btn-primary`): solid `--color-accent-strong` fill, white text, `rounded-md` (12px); a `.btn-shimmer` sweep plays while loading; `active:scale-[0.98]` on press, 45% opacity when disabled.
- **Secondary** (`.btn-secondary`): `--color-surface` fill, `--color-border-strong` border, `--color-text-secondary` label; hover brightens border/text to the accent (or danger for the `--danger` variant, used on "Switch profile").

### Inputs / Fields (`.app-input`)
- **Style:** `rounded-md` (12px), `--color-bg` fill, `--color-border` stroke, `--color-text-muted` placeholder.
- **Focus:** border shifts to `--color-accent` plus a soft 3px accent-tinted ring (`box-shadow: 0 0 0 3px var(--color-accent-soft)`) — a more "app-like" focus treatment than a bare outline, layered on top of (not instead of) the global `:focus-visible` outline used everywhere else.
- **Error:** a `role="alert"` block beneath the field, `--color-danger` border/fill tint and message text.

### Status Banners (`StatusBanner`, `App.tsx`)
Two tones sharing one shape: `error` (`border-danger/40 bg-danger-soft text-danger`, `role="alert"`, `aria-live="assertive"`) and `notice` (`border-accent/30 bg-accent-soft text-accent-text`, `role="status"`, `aria-live="polite"`), both `rounded-xl` with a dismiss button.

## Do's and Don'ts

### Do:
- **Do** pair every status indicator with a text label — never rely on dot color alone (The Dot-Plus-Label Rule).
- **Do** let the committed accent carry real visual weight across buttons, active states, and focus rings — this is a "Committed" color strategy, not a "one micro-signal" strategy.
- **Do** reach for `flex-wrap` with `min-width: 0` and `truncate` on any row of variable-width content before reaching for a fixed grid or a hidden-below-breakpoint pattern — this is what makes the topbar and player metadata strip immune to the narrow-window overlap class of bug.
- **Do** keep the connecting/offline status hues functional and distinct from the committed accent — they mean something specific and must never be reused as decorative color.

### Don't:
- **Don't** use a colored `border-left`/`border-right` on cards, rows, or alerts (project-wide craft-floor rule) — identity is carried by fill, ring, and glow.
- **Don't** reintroduce per-category color-coding (the prior "patch-bay bus palette") — it competes with the committed accent and doesn't scale visually past a handful of categories.
- **Don't** use IBM Plex Mono as a "technical flavor" voice for anything that isn't genuinely a URL or similarly measured/logged value.
- **Don't** cap a variable-width content row at a fixed height or fixed-column grid without a wrap/reflow path — that is exactly the class of bug this redesign fixed structurally.
