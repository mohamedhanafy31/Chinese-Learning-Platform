# Chinese Learning Platform

M0 provides the monorepo, service skeletons, health checks, test infrastructure,
and deployment scaffolding. It intentionally contains no business features or
visual design system.

## Local development

Requirements: Node 22, pnpm 10, Docker, and Docker Compose v2.

```sh
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000/en` (or `/ar`, `/zh`). API liveness is at
`http://localhost:4000/api/v1/health`; readiness also checks PostgreSQL at
`/api/v1/ready`.

Stop development with Ctrl+C, then run `pnpm db:down`.

## Tests

`pnpm test` runs all unit tests without Docker. Integration tests use a separate
temporary PostgreSQL instance:

```sh
pnpm test:db:up
pnpm test:integration
pnpm test:db:down
```

See `AGENTS.md` for the complete gate list and project conventions.
