# Phase 8 Mobile Quality Gate

## Purpose

The mobile quality gate keeps the Phase 6 performance/media protections and the Phase 7 contract tests running in CI and as a local pre-push check.

## CI Workflow

Workflow: `.github/workflows/phase8-quality-gate.yml`

Triggers:

- `pull_request`
- `push` to `main`

CI uses Node `22.12.0`, `npm ci`, and the npm lockfile cache. It does not use secrets, native device tooling, emulator tooling, or local fixture seeds.

## Required Checks

Run locally with:

```bash
npm run ci:phase8
```

The grouped command runs:

- `npm exec tsc -- --noEmit`
- `npm run test:aspect-aware-media`
- `npm run test:brand-profile-contract`
- `npm run test:design-editor-contract`
- `npm run test:store-api-contract`
- `npm run check:perf-regressions`

## What It Protects

- TypeScript route and API contract integrity.
- Aspect-aware media handling.
- Current brand profile badge/header contract.
- Current design editor/product route/media-index contract.
- Current Market route/store API contract.
- Phase 6 protections for query defaults, deterministic query keys, public-first media resolution, force-refresh-only cache bypass, AppState no-broad-invalidation, and feed cache protection.

## Manual Gate

Native Android/iOS AppState and background-resume validation remains manual. This workflow does not claim native runtime proof and does not run Expo Go, Android emulator, adb, or iOS simulator steps.

## Rollback

To remove this gate, revert the workflow file and the `ci:phase8` script. Do not remove the individual contract or performance guard scripts unless a later phase replaces them with equivalent coverage.
