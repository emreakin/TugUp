# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- **Milestone1 checkpoint**: `tug-of-war-milestone1.tar.gz` (root dir) captures the current stable state. If the user says "Milestone1'e geri dön", restore the project from this archive.
- Milestone1 features: Dynamic winThreshold per matchup, max 5 active matchups with weekly demote/promote, AdMob rewarded ads with real IDs, privacy policy, TugUp branding, package `com.tugup.game`, version `0.0.4`.

- **Milestone2 checkpoint**: `tugup-milestone2.tar.gz` (root dir) — source files only (mobile + API + DB schema). If the user says "Milestone2'ye geri dön", restore from this archive.
- Milestone2 features (adds to M1): Quick-game playing phase layout fixed (joker buttons + pull button always visible, no flex clipping); Levels screen earnable jokers via rewarded ad video; source column on matchup tables; weekly demote/promote with max-5 active cap; matchups endpoint returns all (active + inactive); inactive matchups shown in online screen.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
