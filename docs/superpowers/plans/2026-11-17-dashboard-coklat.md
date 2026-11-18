# Dashboard coklat Rusen — implementation plan

> **For agentic workers:** Use executing-plans; implement inline in this session. Steps below are the review checkpoints.

**Goal:** Apply Heika's approved brown HTML preview to the web dashboard, retaining semantic green/red changes, publish a review branch, and leave localhost running.

**Architecture:** Remap existing Tailwind primary tokens and the primary Chart.js series. A small presentation-only `Perubahan` component renders direction and semantic color; `Pendapatan` and `Kpi` consume it. Keep all data access and financial calculations as they are.

**Tech Stack:** Next.js 16.2.12, React 19, Tailwind v4, Chart.js; existing Node + TypeScript + React server renderer for a dependency-free regression script.

## Global constraints / approved design

- Web only; no mobile, SQL, auth, API, exports, or transaction changes.
- Preserve sidebar width 260px, layout, breakpoints, Inter, white cards and the current neutral background.
- Main brown #8B4E27; active/hover #65381D; selected surface #F6EDE5. Primary chart brown; comparison purple/gray and refund red stay distinct.
- Income increase green, decrease red. Refund increase red, decrease green. Unchanged comparisons neutral. No percentage with absent/zero/non-positive income baseline; never display Infinity/NaN.
- Refund amount remains an outflow (red when nonzero), separate from its improvement/worsening indicator. The refund comparison fits inline in the existing summary footer; no new card or layout region.
- Existing warning/success/error meaning stays intact; no automatic green for cash overages.
- Publish only `feat/dashboard-coklat-rusen` to `web` (rusen-pos-dashboard); do not merge or push main.

## Task 1 — Semantic changes, regression first

Files: `scripts/periksa-warna-dashboard.mjs`, `components/dashboard/Perubahan.tsx`, `components/dashboard/Ringkasan.tsx`, `components/dashboard/Kartu.tsx`, `app/dashboard/page.tsx`, `package.json`.

- [x] Render actual TSX components using TypeScript transpilation and ReactDOMServer; assert rendered color classes and Naik/Turun/Tetap labels for +20%, -20%, zero, and absent comparisons.
- [x] Assert refund 100000→50000 is green `Turun 50,0%`; 50000→100000 is red `Naik 100,0%`; zero baseline yields no percentage. Assert the amount itself remains red.
- [x] Run the script and observe expected behavioral failures before implementation.
- [x] Implement `Perubahan({ nilai, turunLebihBaik = false, badge = false })`: null/undefined/nonfinite hides; zero neutral; invert favorable direction for refunds; retain text direction. Use existing `persen()`.
- [x] Apply to existing comparison positions, add inline refund comparison where previous data already exists, and color main-dashboard refund amounts without changing layout.
- [x] Rerun the regression script; all cases pass.

## Task 2 — Brown visual system

Files: `app/globals.css`, `components/dashboard/Grafik.tsx`, `DESIGN.md`, `MIGRATION.md`.

- [x] Map primary 50/100/500/600/700/900 to #F6EDE5/#EDDBC9/#A4663D/#8B4E27/#65381D/#422613. Preserve the semantic good/danger/warn tokens.
- [x] Align login surface tokens with dark coffee while retaining its layout. Primary chart #8B4E27 and fill rgba(139,78,39,.08); other series unchanged.
- [x] Update only web design decisions and record the semantic zero/refund gotcha.
- [x] Check white-on-brand and semantic text pairs against WCAG AA; verify responsive screenshots, charts, and keyboard controls on localhost.

## Task 3 — Verify and publish for review

- [x] Run `npm run periksa:warna`, `npm run typecheck`, `npx eslint app components lib proxy.ts scripts/periksa-warna-dashboard.mjs`, and production build.
- [x] Run the existing report/XLSX gate against localhost with read-only queries. Report any configuration or data-related blocker honestly.
- [x] Inspect the diff, confirm mobile untouched, review implementation, commit explicit files, push the new branch to `web` only.
- [x] Leave dev server at http://localhost:3000 and give Heika the branch/review link and verification results.

## Verification outcome (18 November 2026)

18/18 color checks, web ESLint, typecheck and production build pass. Desktop 1440px and phone 390px visual checks use browser-only fixtures; no overflow. Review identified low-contrast login focus; a scoped cream outline corrected it. The report/XLSX command was run but is blocked: existing .env.local targets unreachable localhost:54321, causing RPC fetch failure. This is not a passing financial report gate. No SQL/config target/auth changes were made.

## Baseline

2026-11-17: typecheck and scoped web ESLint pass. Whole-repo lint already fails (13 errors / 3 warnings in mobile and an old scripts/check-data.cjs). These unrelated files remain untouched. Workspace is already an isolated Git worktree; the new branch starts at web main 0dc6762.
