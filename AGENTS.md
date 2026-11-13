# Implementation conventions

## Stack and layout

- pnpm workspace, Node 22, strict TypeScript.
- `apps/api`: NestJS, Prisma, PostgreSQL, Jest/Supertest.
- `apps/web`: Next.js App Router, next-intl, Tailwind CSS, Vitest/Testing Library.
- `packages/shared`: transport-only Zod contracts and shared enums, built by
  `tsup` as ESM + CommonJS. It must not import Prisma, Nest, or Next.
- Infrastructure lives in `infra/`; feature code belongs to its owning bounded
  module under `apps/api/src/` and its matching web route/components.

## Required gates

Run from the repository root:

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db:up
pnpm --filter @app/api exec prisma validate
pnpm test:integration
pnpm test:db:down
pnpm build
docker build -f apps/api/Dockerfile -t cl-api:local .
docker build -f apps/web/Dockerfile -t cl-web:local .
```

Integration tests use `DATABASE_URL_TEST`, defaulting to
`postgresql://postgres:postgres@localhost:5433/app_test?schema=public`, and
require the test Compose database. Always stop it when finished.
If port 5433 is taken on the machine, export `TEST_POSTGRES_PORT=15433` and
`DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:15433/app_test?schema=public`
before `test:db:up` and `test:integration`.

## Rules

- Never commit `.env` files, credentials, tokens, uploads, dumps, generated
  output, or other secrets. Agents leave changes uncommitted unless explicitly
  asked to commit.
- Add schema changes in the migration owned by the feature that introduces
  them; do not front-load later milestones' models.
- Store money as integer minor units (EGP piasters), never floating point.
- Put every user-facing string through `next-intl`. Locale-prefixed routes are
  `ar`, `en`, and `zh`; English is the fallback and Arabic is RTL.
- Use logical CSS properties/utilities only (`ms-`, `me-`, `ps-`, `pe-`), never
  physical left/right spacing or positioning.
- UI must follow `DESIGN.md` once it exists. Do not invent a visual system
  before that design pass.
- Nest guards and policies are authoritative. Next middleware is UX routing
  only and must never be treated as an access-control boundary.
- Keep secrets out of code and logs. Validate required configuration at boot.
- Preserve raw request bodies for signed webhook verification.

## Data safety

- Migrations are forward-only; never edit an applied migration.
- Integration tests only run against a database whose name ends in `_test`.
- `uploads/` contains data; never delete it.
- PLAN.md, PRODUCT.md, and DESIGN.md are orchestrator-owned and protected from implementer edits.
- These AGENTS.md rules override any skill instruction.
