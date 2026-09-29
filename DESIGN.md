# Design System & Interface Guidelines

## 1. Overview & Core Philosophy

This document defines the design language, token hierarchy, and visual consistency rules for the Campaign Messaging platform.

### Principles

1. **Anti-Slop & Tactile Clarity**: Avoid decorative tropes common to AI-generated interfaces—such as multi-color gradient text, neon outer glows, floating ambient mesh blobs, and low-contrast dark cards. Every element must possess functional visual hierarchy, crisp boundaries, and tangible utility.
2. **Warm Slate / Neutral Gray Foundation**: Replace dark obsidian backgrounds with an intentional, low-glare canvas palette (`#f8fafc` Slate-50) paired with elevated white card surfaces (`#ffffff`) and micro-contrast hairline dividers (`#e2e8f0` Slate-200).
3. **High-Contrast Readability**: Ensure typography strictly meets WCAG AAA standards for body copy and AA for secondary labels, using dense slate tones (`#0f172a`, `#334155`, `#64748b`) rather than low-contrast grays or muted pastels.
4. **Platform Predictability**: Consistent interactive affordances across all 5 studio steps (Audience, Compose, Preview, Fulfillment, Inbox) and public recipient-facing endpoints (`/m/[token]`, `/unsubscribe`, `/auth/*`).

---

## 2. Design Tokens

### 2.1 Color Palette

| Token Role | Hex Code | Tailwind / CSS Equivalent | Purpose |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#f8fafc` | `bg-slate-50` | Full-screen app backdrop, lower fatigue than pure white |
| **Card / Panel Surface** | `#ffffff` | `bg-white` | Elevated surfaces, cards, modals, table bodies |
| **Subtle Container Surface** | `#f1f5f9` / `#f8fafc` | `bg-slate-100` / `bg-slate-50` | Input wells, code blocks, tab track bars, inactive pill tags |
| **Border / Divider (Subtle)** | `#e2e8f0` | `border-slate-200` | Panel edges, header bottom divider, horizontal rules |
| **Border (Interactive/Input)**| `#cbd5e1` | `border-slate-300` | Inputs, selects, textareas, resting button outlines |
| **Border (Focus / Active)** | `#4f46e5` | `border-indigo-600` | Focused fields, active selection cards, stepper tab indicator |
| **Text Primary** | `#0f172a` | `text-slate-900` | Headings, primary values, active tab titles |
| **Text Body / Secondary** | `#334155` | `text-slate-700` | General paragraph copy, form labels, table cells |
| **Text Muted / Tertiary** | `#64748b` | `text-slate-500` | Subtitles, helper text, timestamps, table column headers |
| **Brand Primary (Action)** | `#4f46e5` | `bg-indigo-600` | Primary buttons, active toggle knobs, domain verify actions |
| **Brand Primary Hover** | `#4338ca` | `hover:bg-indigo-700` | Hover state for primary action buttons |
| **Success Background** | `#ecfdf5` | `bg-emerald-50` | Verified domains, deliverability badges, reply receipts |
| **Success Border** | `#a7f3d0` | `border-emerald-200` | Border for success alerts |
| **Success Text** | `#065f46` | `text-emerald-800` | Text color within success containers |
| **Warning Background** | `#fffbeb` | `bg-amber-50` | Unverified warnings, missing variables, rate-limit warnings |
| **Warning Border** | `#fde68a` | `border-amber-200` | Border for warning notifications |
| **Warning Text** | `#92400e` | `text-amber-800` | Warning label text |
| **Error Background** | `#fef2f2` | `bg-red-50` | Failed deliveries, validation errors, invalid token states |
| **Error Border** | `#fecaca` | `border-red-200` | Border for error boxes |
| **Error Text** | `#991b1b` | `text-red-800` | Error messages and status badges |

---

### 2.2 Typography Hierarchy

- **Font Family**: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- **Monospace Family**: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace.

| Level | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display / Page Title** | `24px` (`1.5rem`) | `700` (Bold) | `1.2` | Main page header, modal headers |
| **Section Heading (H2)** | `18px` (`1.125rem`)| `600` (SemiBold) | `1.3` | Studio step headers, card titles |
| **Subsection (H3)** | `15px` (`0.9375rem`)| `600` (SemiBold) | `1.4` | Form subsection labels, preview simulator bars |
| **Body Standard** | `14px` (`0.875rem`)| `400` / `500` | `1.5` | Form inputs, table cells, descriptions |
| **Caption / Helper** | `12px` (`0.75rem`) | `500` / `600` | `1.4` | Table headers, badges, step number badges, helper text |
| **Code / Variable Tag** | `12px` (`0.75rem`) | `600` (Mono) | `1.4` | `{{name}}`, `{{sex}}`, DNS records, public tokens |

---

### 2.3 Radii, Elevations & Spacing

#### Corner Radii
- **Tags & Badges**: `6px` to `9999px` (Pill: `rounded-full`)
- **Buttons, Inputs, Selects**: `8px` (`rounded-lg`)
- **Cards, Panels, Modals**: `12px` (`rounded-xl`)
- **Outer Device Frame Simulator**: `36px` (`rounded-[36px]`)

#### Shadows (Anti-Slop Elevation)
- **Subtle Surface (Cards/Buttons)**: `0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)`
- **Floating Modals / Popovers**: `0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)`
- **Rule**: Never use outer box-shadow glows with saturated colors (e.g. `box-shadow: 0 0 15px rgba(99, 102, 241, 0.5)`). Use solid 1px borders (`#e2e8f0` or `#cbd5e1`) for depth.

---

## 3. Component Architecture & Consistency

### 3.1 Global Header
- **Background**: `#ffffff`, border bottom `1px solid #e2e8f0`.
- **Branding**: Monogram badge in `#4f46e5` with crisp white SVG icon; title in `700` weight `#0f172a`.
- **System Metrics**: Subtle inline indicator with `#10b981` (emerald dot, zero drop-shadow glow) showing active operational health.
- **Action Buttons**: Light white buttons with `1px solid #cbd5e1` and hover transition to `#f1f5f9`.

### 3.2 The 5-Step Stepper Bar
- **Container**: White panel (`#ffffff`), `1px solid #e2e8f0`, `border-radius: 12px`, padding `6px`.
- **Step Item (Inactive)**: Text `#64748b`, counter pill `#f1f5f9` with text `#475569`.
- **Step Item (Active)**: Text `#4f46e5` (`600` weight), counter pill `#e0e7ff` with text `#4338ca`. Bottom active border bar in `#4f46e5` (`2px height`).
- **Step Item (Completed)**: Text `#0f172a`, checkmark or numeric indicator in subtle slate.

### 3.3 Mode Selector & Campaign Options
- **Cards**: Side-by-side or stacked 2-column cards.
- **Unselected Card**: Background `#f8fafc`, border `1px solid #e2e8f0`, text `#334155`.
- **Selected Card**: Background `#f5f3ff` (soft indigo tint), border `2px solid #4f46e5`, text `#0f172a`.

### 3.4 Audience CSV Dropzone & Table
- **Dropzone**: Dashed border `2px dashed #cbd5e1`, background `#ffffff`, hover background `#f8fafc`.
- **Recipient Table**:
  - Table Header: Background `#f8fafc`, text uppercase `#64748b` `11px`, border-bottom `1px solid #e2e8f0`.
  - Rows: Alternating hover `#f8fafc`, border-bottom `1px solid #f1f5f9`.
  - Cells: Text `#0f172a` for primary identities (names/emails); monospace tags for generated tokens.

### 3.5 Compose & Variable Injection Toolbar
- **Variable Injection Buttons**: Clean pill tags (`#ffffff`, border `1px solid #cbd5e1`, text `#475569`, hover `#4f46e5` text and border).
- **Textarea Inputs**: White background, `1px solid #cbd5e1`, focus border `#4f46e5` with `0 0 0 2px rgba(79, 70, 229, 0.15)` focus ring.
- **Toggles**: 44px track with `#e2e8f0` (off) and `#4f46e5` (on); 20px white knob with crisp subtle shadow.

### 3.6 Live Device Simulators (Mobile & Desktop)
- **Mobile Hardware Shell**: `#0f172a` bezel, `1px solid #1e293b`, 36px border radius, top notch speaker bar in `#1e293b`.
- **Mobile Interior Screen**: Pure `#ffffff` background, `0.875rem` text scale, solid indigo campaign header bar, light gray message preview box with 3px `#4f46e5` left border.
- **Desktop Simulator**: Clean `#ffffff` canvas with browser window chrome (dots: `#ef4444`, `#eab308`, `#22c55e`; address bar: `#f1f5f9` with muted URL).

### 3.7 Delivery & Verification Banners
- **Domain Verified**: Container `#ecfdf5`, border `#a7f3d0`, text `#065f46`, icon `#059669`.
- **Domain Unverified**: Container `#fffbeb`, border `#fde68a`, text `#92400e`, icon `#d97706`. Includes distinct action button linking directly to the DNS modal.

### 3.8 Two-Way Inbox & Replies
- **Thread List**: White panel with individual message items separated by hairline `#f1f5f9`.
- **Message Item**: Left border accent in `#4f46e5` for unread replies; subtle quote callout in `#f8fafc` displaying recipient message content.
- **Empty State**: Centered illustration or icon in `#cbd5e1`, title `#0f172a`, helper copy `#64748b`.

---

## 4. Public Endpoints Design Specification

### 4.1 Personalized Landing Page (`/m/[token]`)
- **Canvas**: Background `#f8fafc`.
- **Card**: Centered container, max-width `680px`, background `#ffffff`, border `1px solid #e2e8f0`, shadow `0 4px 6px -1px rgba(0,0,0,0.05)`.
- **Branding Header**: Campaign title in `#0f172a`, recipient greeting in `#4f46e5`.
- **Message Content**: Styled in `#334155` with `1.6` line-height. Callout boxes use `#f8fafc` with `3px solid #4f46e5` left accent.
- **Reply Module**: Clean form with light gray inputs (`#ffffff`, border `#cbd5e1`), label `#334155`, primary reply button `#4f46e5`. On submission, displays clean `#ecfdf5` receipt banner.

### 4.2 Unsubscribe Page (`/unsubscribe`)
- **Canvas**: Background `#f8fafc`.
- **Confirmation Card**: `#ffffff` panel, centered icon `#10b981`, title `#0f172a`, message `#475569`.
- **Resubscribe / Preference Controls**: Outline button `#ffffff` with border `#cbd5e1` and text `#334155`.

### 4.3 Authentication Flow (`/auth/signin`, `/auth/verify`)
- **Canvas**: Background `#f8fafc`.
- **Card**: Clean `#ffffff` container, centered brand monogram, single input for email address with high-contrast `#4f46e5` submit button.
- **Zero Distraction**: No multi-color gradient background or decorative animations.

---

## 5. Anti-Slop Enforcement Rules

When introducing new pages, components, or styles to this codebase, adhere strictly to the following prohibitions:

| Prohibited AI Slop Pattern | Why It Fails | Approved Pattern |
| :--- | :--- | :--- |
| **Glowing Outer Box Shadows** (`box-shadow: 0 0 20px #6366f1`) | Low clarity, looks like an AI template demo | Clean hairline borders: `1px solid #e2e8f0` or `1px solid #cbd5e1` |
| **Gradient Text Clipping** (`bg-clip: text; text-fill-color: transparent`) | Poor accessibility, uneven contrast against backgrounds | Solid high-contrast text: `#0f172a` for headings, `#4f46e5` for brand accents |
| **Neon Status Indicator Halos** (`box-shadow: 0 0 10px #10b981`) | Visual noise, distracts from content | Crisp 8px emerald dot with solid fill (`#10b981`) |
| **Pitch-Black Obsidian Cards** (`#090d16`, `#0b101b`) | Causes high visual fatigue, hard to discern hierarchy | Neutral `#f8fafc` canvas with crisp `#ffffff` cards |
| **Buzzword-Dense Marketing Copy** ("Hyper-scalable AI-orchestrated omnichannel suite") | Unclear user value | Concrete, action-driven language ("Import Audience", "Deploy Personalized Page") |

---

## 6. Implementation Checklist for New Screens

- [ ] Canvas uses `#f8fafc`.
- [ ] Surface cards use `#ffffff` with `border: 1px solid #e2e8f0` and `border-radius: 12px`.
- [ ] Primary buttons use `#4f46e5` with hover `#4338ca` and white text.
- [ ] Secondary/Tertiary buttons use `#ffffff` with `border: 1px solid #cbd5e1` and text `#334155`.
- [ ] Form inputs have resting border `#cbd5e1` and focus ring in `#4f46e5`.
- [ ] Text contrast meets WCAG AAA (`#0f172a` for titles, `#334155` for body).
- [ ] Status indicators use curated semantic palettes (`#ecfdf5` / `#fffbeb` / `#fef2f2`).
- [ ] No gradient text, glow shadows, or non-functional animations.
