# Design System — Kampaign (Campaign Messaging)

## Product Context
- **What this is:** An enterprise confidential briefing and high-deliverability messaging platform featuring cryptographic isolation, personalized landing endpoints (`/m/[token]`), DNS deliverability verification (SPF/DKIM/DMARC), and 2-way verified inbox threads.
- **Who it's for:** Founders, enterprise executives, legal teams, and client relations officers who send high-value, private briefings without looking like bulk marketing or triggering spam filters.
- **Space/industry:** Enterprise communications, private executive briefing, privacy & security tech.
- **Project type:** Web application & dashboard with recipient-facing verification endpoints.

---

## Aesthetic Direction
- **Direction:** Industrial / Refined Utilitarian
- **Decoration level:** Minimal (visual hierarchy driven by crisp typography, hairline structural borders, and semantic contrast rather than decorative fluff).
- **Mood:** Engineered trust, tactile clarity, executive confidentiality. Serious software engineered for mission-critical client communications. Zero AI-generated slop (no saturated glow halos, no multi-color gradient clipping, no pitch-black unreadable surfaces).
- **Reference sites & benchmarks:** Linear (precision borders and dense layout), Superhuman (high-speed keyboard navigation and austere density), Proton Mail (privacy trust, clean white-and-slate surfaces).

---

## Typography
- **Display/Hero:** Inter (`700` Bold) — High legibility, crisp geometry at scale, professional authority.
- **Body:** Inter (`400` Regular / `500` Medium) — Standardized readability across screen sizes and email clients.
- **UI/Labels:** Inter (`500` Medium / `600` SemiBold) — High-contrast labels, form inputs, button targets.
- **Data/Tables:** Inter with `tabular-nums` / JetBrains Mono (`500`) — Aligned financial/audience numbers and recipient indices.
- **Code/Tokens:** JetBrains Mono (`600`) — Used for template variables (`{{name}}`, `{{company}}`), DNS hostnames/records, and cryptographic access tokens.
- **Loading:** CDN via Google Fonts (`Inter:wght@400;500;600;700` & `JetBrains+Mono:wght@400;500;600`) with system fallback (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
- **Scale:**
  - `Display / H1`: `24px` (`1.5rem`), Line Height `1.2`, Weight `700`
  - `Section / H2`: `18px` (`1.125rem`), Line Height `1.3`, Weight `600`
  - `Subsection / H3`: `15px` (`0.9375rem`), Line Height `1.4`, Weight `600`
  - `Body Standard`: `14px` (`0.875rem`), Line Height `1.5`, Weight `400` / `500`
  - `Caption / Helper`: `12px` (`0.75rem`), Line Height `1.4`, Weight `500` / `600`
  - `Mono Token`: `12px` (`0.75rem`), Line Height `1.4`, Weight `600`

---

## Color
- **Approach:** Restrained & Balanced (primary indigo action accent paired with neutral slate surfaces; semantic emerald, amber, and red used strictly for status and health).
- **Primary:** `#4f46e5` (`indigo-600`) — Primary interactive buttons, stepper indicator bars, focused inputs, active tabs.
- **Primary Hover:** `#4338ca` (`indigo-700`) — Hover state for primary buttons and interactive accents.
- **Neutrals (Light Mode Canvas & Surfaces):**
  - Canvas Background: `#f8fafc` (`slate-50`) — Low-glare backdrop preventing eye fatigue.
  - Surface / Cards: `#ffffff` (`white`) — Elevated cards, modals, table bodies, preview simulators.
  - Subsurface / Wells: `#f1f5f9` (`slate-100`) — Code boxes, input wells, filter bars, inactive pill tags.
  - Hairline Border: `#e2e8f0` (`slate-200`) — Structural 1px separation between cards, sections, and headers.
  - Interactive Border: `#cbd5e1` (`slate-300`) — Resting borders for inputs, buttons, and selectable cards.
- **Text Neutrals:**
  - Text Primary: `#0f172a` (`slate-900`) — Page titles, primary metrics, active tab headings.
  - Text Body: `#334155` (`slate-700`) — Paragraph copy, form labels, recipient table contents.
  - Text Muted: `#64748b` (`slate-500`) — Helper text, timestamps, table column headers, subtitles.
- **Semantic Colors:**
  - Success: Surface `#ecfdf5` (`emerald-50`), Border `#a7f3d0` (`emerald-200`), Text `#065f46` (`emerald-800`), Icon `#059669`.
  - Warning: Surface `#fffbeb` (`amber-50`), Border `#fde68a` (`amber-200`), Text `#92400e` (`amber-800`), Icon `#d97706`.
  - Error: Surface `#fef2f2` (`red-50`), Border `#fecaca` (`red-200`), Text `#991b1b` (`red-800`), Icon `#dc2626`.
- **Dark Mode Strategy:**
  - Deep Slate background (`#090d16` to `#0f172a`) with elevated surfaces (`#1e293b`), desaturating borders to `#334155` and accent to `#6366f1`. High text contrast preserved via `#f8fafc` primary and `#94a3b8` secondary.

---

## Spacing
- **Base unit:** 8px grid (with 4px micro-increments for compact badges and tight inputs).
- **Density:** Compact-to-Comfortable (high information density suitable for enterprise dashboards without feeling cramped).
- **Scale:**
  - `2xs`: `2px` (`0.125rem`)
  - `xs`: `4px` (`0.25rem`)
  - `sm`: `8px` (`0.5rem`)
  - `md`: `16px` (`1.0rem`)
  - `lg`: `24px` (`1.5rem`)
  - `xl`: `32px` (`2.0rem`)
  - `2xl`: `48px` (`3.0rem`)
  - `3xl`: `64px` (`4.0rem`)

---

## Layout
- **Approach:** Grid-disciplined with hybrid utility panels.
- **Grid:** 12-column responsive layout, collapsing to single-column on mobile viewports (< 768px).
- **Max content width:**
  - Studio / Dashboard: `1280px` (`max-w-7xl`) for multi-column operations.
  - Public Briefing Pages (`/m/[token]`): `680px` centered for focused, high-speed executive reading.
  - Auth Modals & Screens (`/auth/*`): `440px` centered card.
- **Border radius hierarchy:**
  - Badges & Status Pills: `6px` (`rounded-md`) or `9999px` (`rounded-full`)
  - Inputs, Buttons, Dropdowns: `8px` (`rounded-lg`)
  - Cards, Modals, Panels: `12px` (`rounded-xl`)
  - Mobile Simulator Frame: `36px` (`rounded-[36px]`)
- **Shadows & Elevations:**
  - Restrained micro-shadow: `0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)`
  - Elevated Popover/Modal: `0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)`
  - Prohibited: Never use diffuse colored neon shadows (e.g., `box-shadow: 0 0 20px rgba(99, 102, 241, 0.5)`).

---

## Motion & Interaction
- **Approach:** Minimal-functional. Motion is used exclusively to reinforce hierarchy, state shifts, and user comprehension.
- **Easing:**
  - Entrance: `ease-out` (`cubic-bezier(0, 0, 0.2, 1)`)
  - Exit: `ease-in` (`cubic-bezier(0.4, 0, 1, 1)`)
  - State Transitions / Tabs: `ease-in-out` (`cubic-bezier(0.4, 0, 0.2, 1)`)
- **Duration:**
  - Micro-interactions (button press, toggle switch): `100ms`
  - Short (dropdown toggle, tab indicator move, modal backdrop): `150ms - 200ms`
  - Medium (drawer open, full-view transitions): `250ms`
  - Long: Avoided to prevent user interface sluggishness.

---

## Component Architecture & Consistency

### 1. Global Navigation & Header
- Pure white panel (`#ffffff`) with 1px border bottom (`#e2e8f0`).
- Left: Brand monogram badge in solid `#4f46e5` with crisp typography; workspace selector pill with subtle border (`#cbd5e1`).
- Center/Right: Live health telemetry with solid emerald dot (`#10b981`, no glow), quick action triggers, and authenticated user identity pill.

### 2. 5-Step Campaign Studio Stepper
- Step indicator pill track on `#ffffff` surface with `1px solid #e2e8f0`.
- Inactive: Slate-500 label with `#f1f5f9` counter badge.
- Active: Indigo-600 label (`font-semibold`), `#e0e7ff` counter badge, 2px solid `#4f46e5` bottom active indicator bar.
- Completed: Dark slate label (`#0f172a`) with subtle checkmark.

### 3. Audience CSV Dropzone & Table
- Dropzone: `2px dashed #cbd5e1`, clean `#ffffff` surface, with instant CSV column detection and template insertion button.
- Recipient Table: Sticky uppercase header in `#64748b` (`11px`), alternating subtle row hover (`#f8fafc`), monospace pill tags for recipient access tokens.

### 4. Live Device Simulator (Mobile & Desktop)
- Mobile hardware frame: `#0f172a` bezel with `1px solid #1e293b`, 36px corner radius, speaker notch bar.
- Interior viewport: `#ffffff` canvas with real rendered recipient markdown briefings and 2-way reply forms.
- Desktop simulator: Sleek browser window chrome with macOS control dots (`#ef4444`, `#eab308`, `#22c55e`) and muted URL address bar.

### 5. Personalized Recipient Endpoint (`/m/[token]`)
- Distraction-free, zero-tracker executive briefing environment.
- Centered 680px card on `#f8fafc` canvas.
- 2-way verified reply form with instant emerald receipt banner upon message delivery.

---

## Anti-Slop Enforcement Rules

| Prohibited AI Slop Pattern | Why It Fails | Approved Pattern |
| :--- | :--- | :--- |
| **Glowing Outer Box Shadows** (`box-shadow: 0 0 20px #6366f1`) | Cheap AI demo appearance, visual distraction | Hairline 1px border (`#e2e8f0` or `#cbd5e1`) |
| **Gradient Text Clipping** (`bg-clip: text`) | Poor accessibility, uneven contrast | Solid high-contrast text (`#0f172a` / `#4f46e5`) |
| **Neon Status Halos** (`box-shadow: 0 0 10px #10b981`) | Visual clutter | Crisp 8px solid emerald dot (`#10b981`) |
| **Pitch-Black Obsidian Cards** (`#090d16`) | Severe visual fatigue, poor hierarchy | Slate-50 backdrop with pure `#ffffff` cards |
| **Generic Marketing Jargon** ("AI Omnichannel Suite") | Unclear value proposition | Concrete action-driven language ("Import Audience") |

---

## Decisions Log

| Date | Decision | Rationale |
| :--- | :--- | :--- |
| 2026-09-30 | Initial Design Consultation | Established "Engineered Trust & Executive Confidentiality" design system via `/design-consultation`. Adopted Slate-50 low-glare canvas, pure white card surfaces, Inter typography, 8px grid, and strict anti-slop rules. |
| 2026-09-30 | Purged All Mock / Dev Testbed Data | Cleaned out all placeholder emails, dev persona switches, and mock records in favor of clean empty states with contextual CSV helper templates. |
| 2026-09-30 | Standalone Visual Preview Generated | Created interactive HTML preview at `/tmp/design-consultation-preview-kampaign.html` demonstrating font specimens, palette swatches, components, and live briefing simulators. |
