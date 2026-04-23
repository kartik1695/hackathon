# Frontend Design Instructions

These instructions describe the design system used across this repo. Follow them whenever you build, edit, or extend UI so new screens stay visually consistent with the existing app (`artifacts/human-edge-hrms`).

---

## 1. Typography

- **Font family**: `Outfit`, sans-serif. Loaded from Google Fonts:
  ```
  https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600;700;800&display=swap
  ```
- **Base size**: `html { font-size: 14px; }`. All `rem`/`em`/inline px values are calibrated to this.
- **Font weights**:
  - Headings & large display numbers (`h1`, `h2`, dashboard stat numbers): **`fontWeight: 250`** (renders as 200 since Outfit's nearest available weight is 200). This light weight is the signature look — never use bold for titles.
  - Subtitles / page descriptions: `300`.
  - Body text & labels: `400`.
  - Buttons, table headers, emphasized inline text: `500`–`600`.
  - Active nav pill / strong CTAs: `600`.
- **Letter spacing** on headings: tight, `-0.01em` to `-0.03em` (larger heading → tighter spacing).
- **Line height** on display headings: `1.1`.

### Heading scale
| Element | Size | Weight | Tracking |
|---|---|---|---|
| Welcome / hero h1 | 36px | 250 | -0.03em |
| Page title h1 (`PH` component) | 28px | 250 | -0.02em |
| Modal h2 | 18px | 250 | -0.01em |
| Stat display number | 38px | 250 | -0.03em |

---

## 2. Theme System

The app supports 6 themes defined in `THEMES` at the top of `HumanEdgeHRMS.jsx`. **Default and primary theme is `arctic` (Arctic Blue).** All new components must read colors from theme tokens via CSS variables (`var(--ink)`, `var(--card)`, etc.) or via the active theme object `t` — never hardcode brand colors.

### Arctic (default) palette
| Token | Value | Usage |
|---|---|---|
| `pageBg` | `linear-gradient(315deg, hsla(214,81%,86%,1) 0%, hsla(217,57%,93%,1) 47%, hsla(218,60%,92%,1) 100%)` | App background |
| `card` | `rgba(255,255,255,0.55)` | Card surface (translucent) |
| `cardBorder` | `rgba(255,255,255,0.6)` | Card border |
| `cardShadow` | `0 2px 20px rgba(37,99,235,0.06), 0 0 0 1px rgba(255,255,255,0.4) inset` | Default card elevation |
| `surface2` | `#f3f7ff` | Secondary surface (chips, subtle fills) |
| `accent` | `#2563eb` | Primary brand blue / CTAs / active states |
| `accentLight` | `#dbeafe` | Accent fills, hover surfaces |
| `accentText` | `#1e40af` | Text on accent-light |
| `accent2` | `#60a5fa` | Secondary accent |
| `navPill` | `#1e3a8a` | Active nav pill background |
| `ink` | `#0c1a3a` | Primary text |
| `muted` | `#64748b` | Secondary / muted text |
| `border` | `rgba(37,99,235,0.09)` | Dividers, input borders |
| `darkCard` | `#1e2d5e` | Inverted/dark cards (e.g. Onboarding panel) |
| `success` | `#10b981` | Positive states |
| `warning` | `#f59e0b` | Warning states |
| `danger` | `#ef4444` | Errors / destructive |
| `barActive` | `#2563eb` | Active chart bars |
| `barInactive` | `#c7d8f8` | Inactive chart bars |
| `timerDash` | `#c7d8f8` | Timer ring inactive segment |

Other available themes: `solar` (gold), `aurora` (teal), `midnight` (dark), `blossom` (pink), `forest` (green). Each defines the same token set — read them, don't reinvent them.

---

## 3. Surfaces & Cards

- **Cards are translucent frosted glass.** Always render via the `Card` component, which applies:
  - `background: var(--card)` (semi-transparent white)
  - `border-radius: 20px`
  - `border: 1px solid var(--cardBorder)`
  - `backdrop-filter: blur(20px)` (and `-webkit-backdrop-filter`)
  - `box-shadow: var(--cardShadow)` (lifts subtly on hover)
  - `overflow: hidden`
- **Modals**: `border-radius: 20`, `padding: 28`, opaque white, `box-shadow: 0 24px 80px rgba(0,0,0,0.2)`.
- **Inputs / selects**: `border-radius` ~ 10–12px, `1px solid var(--border)`, background `var(--card)`, font-size 13, `font-family: inherit`.
- **Buttons (pill)**: `border-radius: 999`, padding `7px 14px` (or `7px 18px` when active), no border, transition `all 0.18s`.
- **Chips / tags**: `border-radius: 999`, small padding, `font-size: 11`, `font-weight: 600`.

### Standard radii
| Element | Radius |
|---|---|
| Cards / modals | 20 |
| Inputs / small surfaces | 10–12 |
| Pills, chips, nav buttons | 999 (full) |
| Avatar / profile circles | 50% |

---

## 4. Layout & Spacing

- **Dashboard rows use compact gaps**: `gap: 10` between cards in a row (not 14+). Keep the dashboard feeling packed.
- **Section vertical gap**: `gap: 10` between rows in the main dashboard column.
- **Page padding** (TopNav and main): `12px 32px` horizontal.
- **Card internal padding**: typically `padding: 16–20`. Profile/highlight cards may use more.
- Use CSS Grid for row layouts (`gridTemplateColumns` like `"200px 1fr 180px 1fr"`), Flex for clusters.

---

## 5. Top Navigation

- Sticky transparent header. On scroll (`window.scrollY > 10`), it gains a **stacked gradient blur** effect: 4 absolutely-positioned overlays with progressively larger `backdrop-filter: blur()` values (4 / 10 / 20 / 40 px), each masked with a top-to-bottom `linear-gradient` that fades to transparent before the bottom edge — so the blur is strongest at the top and dissolves smoothly with no hard line.
- A white-fade gradient (`rgba(255,255,255,0.7)` → transparent) sits on top of the blur for legibility.
- Nav pills themselves are always opaque-frosted: `background: rgba(255,255,255,0.82)`, `backdrop-filter: blur(16px)`, `border-radius: 999`, with a soft accent-tinted shadow.

When adding fixed/sticky surfaces over the gradient page background, prefer this same layered blur + mask pattern over a single solid backdrop.

---

## 6. Iconography & Imagery

- Icons are rendered through the local `IC` component (`<IC n="settings" s={13} c={t.muted}/>`). Sizes are typically `13–16` for inline, `15` for nav, `20+` for emphasis.
- Profile/avatar imagery uses `objectFit: "cover"` inside a card with `overflow: hidden` so rounded corners clip cleanly.
- Asset imports use the `@assets` Vite alias, e.g. `import photo from "@assets/filename.png"`.

---

## 7. Charts & Data Viz

- Bar charts: active bars `t.barActive`, inactive `t.barInactive`, rounded tops, thin gaps.
- Progress bars: pill-shaped (`border-radius: 999`), filled with `t.accent` over `t.accentLight`.
- Timer ring uses `t.accent` for progress and `t.timerDash` for the track.
- Numeric KPIs use the heading style: large size, `fontWeight: 250`, tight tracking.

---

## 8. Motion

- Card hover: `transition: box-shadow 0.2s` (shadow lift only).
- Buttons / nav: `transition: all 0.18s`.
- Scroll-driven nav blur: `transition: backdrop-filter 0.25s, background 0.25s`.
- Keep transitions short (150–250ms) and easing default. No bouncy / overshoot motion.

---

## 9. Do / Don't

**Do**
- Use the `Card`, `PH` (page header), and `Modal` components instead of rebuilding their styles.
- Read colors from the active theme `t` or CSS variables.
- Use `fontWeight: 250` for titles and large numbers.
- Keep card surfaces translucent with backdrop blur.
- Use compact gaps (`10`) between dashboard cards.

**Don't**
- Don't introduce a new font family — use Outfit only.
- Don't use bold (`700`+) for headings or hero numbers.
- Don't hardcode hex colors that exist as theme tokens.
- Don't put solid opaque backgrounds on dashboard cards (breaks the frosted-glass feel).
- Don't add hard borders/lines under sticky elements — use a faded gradient instead.
- Don't use Tailwind or external UI kits in `human-edge-hrms`; this artifact is intentionally inline-styled and self-contained.
