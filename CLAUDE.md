# Kampaign — Engineering & Architecture Guidelines

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Core Commands
- `pnpm dev` — Start the Next.js development server
- `pnpm test` — Run all test suites across the monorepo
- `pnpm typecheck` — Verify TypeScript compiler across all packages and apps
- `pnpm lint` — Run ESLint across all projects
- `pnpm build` — Build production bundle

## Design & UI Constraints
- Strictly avoid AI slop: no multi-color gradient text clipping, no saturated box-shadow glows, no unreadable low-contrast surfaces.
- Use Slate-50 (`#f8fafc`) canvas with pure white elevated cards (`#ffffff`) and hairline slate borders (`#e2e8f0` / `#cbd5e1`).
- Primary brand accent is Indigo-600 (`#4f46e5`).
- Status indicators must use solid semantic tokens without decorative glow halos.
