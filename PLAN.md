# Chinese Learning Platform — Implementation Plan (v2, reviewed with Codex)

> v1 was drafted by Claude, critiqued adversarially by Codex (`gpt-5.6-sol`, high effort), and revised.
> §11 lists what changed and what was deliberately **not** adopted to keep the MVP cheap.

## 1. Scope (MVP)

**Admin**
- CRUD levels (title, slug, description, cover image, price, order, published/archived).
- CRUD lessons inside a level (title, description, order, published, optional free preview).
- Each lesson has one active video + zero or more quizzes.
- Upload video → **Bunny Stream** when Bunny credentials are configured, otherwise **local disk**.
- Upload images (level covers, lesson thumbnails, question images).
- Quiz builder: single-choice, multiple-choice, true/false (optional image + explanation).
- View students, orders, enrollments; manually grant/revoke a level.

**Student**
- Register / login / logout / forgot + reset password.
- Browse published levels (public, server-rendered for SEO).
- Buy a level ($10 default, price stored per level) via Paymob Unified Checkout.
- Watch lessons, take quizzes, see score history.
- Progress: per-lesson completion, % per level, "continue where you left off".

**Later (not MVP):** coupons, bundles, certificates, comments, mobile app, multi-instructor, HLS transcoding of local videos.

## 2. Architecture

```
Browser ──► Cloudflare (DNS proxy, Full-strict TLS, caches static + images only)
              │
              ▼
        Hostinger VPS — Docker Compose
        ┌───────────────────────────────────────────────┐
        │ Caddy  (origin TLS, Cloudflare origin cert)   │
        │   ├─ /api/*  → api  (NestJS :4000, keeps /api)│
        │   ├─ /media/* → uploads/images (immutable)    │
        │   └─ /*      → web  (Next.js standalone :3000)│
        │ postgres:16  (volume, healthcheck)            │
        │ volumes: uploads/images, uploads/videos (NOT  │
        │          publicly served), tus-tmp            │
        └───────────────────────────────────────────────┘
api ──► Bunny Stream (create video, TUS signature, signed embed token)
api ◄── Bunny webhook (HMAC-verified)     api ◄── Paymob webhook (HMAC-verified)
web (server components) ──► http://api:4000/api  (internal, forwards Cookie)
```

- One domain → same-site httpOnly cookies, no CORS.
- Nest uses global prefix `/api/v1`; Caddy does **not** strip `/api`. OpenAPI served at `/api/docs` (admin only in prod).

## 3. Tech choices

| Concern | Choice |
|---|---|
| Monorepo | pnpm workspaces: `apps/web`, `apps/api`, `packages/shared` (no Turborepo) |
| Frontend | Next.js 15 App Router, TS, Tailwind (custom design tokens from DESIGN.md), Radix primitives (shadcn as unstyled base, fully re-themed), next-intl (ar/en/zh, RTL), TanStack Query, react-hook-form + zod |
| Backend | NestJS 11, TS, nestjs-zod, @nestjs/throttler, helmet, pino (JSON logs + request id) |
| DB | PostgreSQL 16 + Prisma (migrations per feature, not one big upfront schema) |
| Auth | argon2 passwords; access JWT (15 min) + rotating refresh token (30 d), both httpOnly/Secure/SameSite=Lax host-only cookies; refresh cookie path-scoped to `/api/v1/auth` |
| Images | Multer → sharp (resize, webp) → `uploads/images/<hash>.webp`, immutable URLs, Cloudflare cached |
| Video | `VideoProvider` interface → `BunnyProvider` / `LocalProvider` (tus via `@tus/server`) |
| Payments | Paymob Intention API → Unified Checkout redirect → HMAC-SHA512 webhook |
| Email | Nodemailer over SMTP (Hostinger mailbox) |
| Tests | Jest unit (pure logic: HMAC, grading, state machines) + Jest/Supertest integration against a real Postgres from `docker-compose.test.yml`; Playwright critical-path smoke (≈5 flows). Real Bunny/Paymob runs = manual release checks, not CI |
| CI | GitHub Actions: install → lint → typecheck → test (with Postgres service) → `prisma migrate diff` check → build → docker build |
| Ops | `/api/v1/health` + `/api/v1/ready`, Docker log rotation (no paid/external monitoring in MVP) |

## 4. Repository structure

```
chinese-platform/
├─ apps/
│  ├─ api/
│  │  ├─ prisma/ schema.prisma, migrations/, seed.ts
│  │  ├─ src/
│  │  │  ├─ main.ts, app.module.ts
│  │  │  ├─ config/            # zod-validated env; provider readiness flags
│  │  │  ├─ common/            # guards, decorators, filters, raw-body helper, origin check
│  │  │  ├─ prisma/
│  │  │  ├─ identity/          # users, auth, sessions (refresh tokens), password reset
│  │  │  ├─ catalog/           # levels, lessons: admin + public controllers, reorder
│  │  │  ├─ media/
│  │  │  │  ├─ images/
│  │  │  │  └─ video/ providers/{video-provider.ts,bunny.provider.ts,local.provider.ts},
│  │  │  │           bunny-webhook.controller.ts, local-stream.controller.ts
│  │  │  ├─ learning/          # enrollments, ContentAccessPolicy, progress
│  │  │  ├─ assessment/        # quizzes, questions, attempts, grading
│  │  │  ├─ billing/           # orders, payment transactions, paymob/{client,hmac,webhook}
│  │  │  ├─ audit/             # tiny admin audit log
│  │  │  └─ jobs/              # @nestjs/schedule: expire orders, clean tus temp, reconcile Bunny
│  │  ├─ test/                 # integration tests
│  │  └─ Dockerfile
│  └─ web/
│     ├─ src/app/
│     │  ├─ (marketing)/ page.tsx, levels/, levels/[slug]/
│     │  ├─ (auth)/ login/, register/, forgot-password/, reset-password/
│     │  ├─ (learner)/ dashboard/, learn/[levelSlug]/[lessonId]/
│     │  ├─ (backoffice)/admin/ levels/, levels/[id]/, lessons/[id]/, students/, orders/, settings/
│     │  └─ checkout/result/   # renders even without a valid session
│     ├─ src/components/ ui/, video/, quiz/, upload/
│     ├─ src/lib/ api-server.ts (server-only, forwards cookies), api-client.ts, queries/
│     ├─ middleware.ts         # UX redirects only; Nest guards are authoritative
│     └─ Dockerfile
├─ packages/shared/            # transport contracts only: enums, request/response zod schemas. No Prisma/Nest/Next imports
├─ infra/
│  ├─ docker-compose.yml, docker-compose.dev.yml, docker-compose.test.yml
│  ├─ Caddyfile
│  ├─ backup/ (pg_dump + uploads → off-box via rclone, retention, restore.md)
│  └─ DEPLOY.md
├─ .github/workflows/ci.yml
├─ .env.example
├─ AGENTS.md                   # conventions + gate commands (Codex reads it every task)
└─ package.json, pnpm-workspace.yaml
```

## 5. Data model (added incrementally by the owning milestone)

```
User(id, email citext unique, passwordHash, name, phone?, role[ADMIN|STUDENT], isActive, createdAt, updatedAt)
Session(id, userId, familyId, refreshTokenHash, replacedById?, userAgent?, ip?, expiresAt, revokedAt?)
   -- reuse of a rotated token ⇒ revoke whole family; 10s grace for concurrent refresh
PasswordReset(id, userId, tokenHash, expiresAt, usedAt?)

MediaAsset(id, kind[IMAGE], storageKey, mime, sizeBytes, width?, height?, checksum, createdAt)

Level(id, slug unique (never reused), title, description, coverImageId?→MediaAsset,
      priceMinor int ≥0, currency, sortOrder, isPublished, archivedAt?, createdAt, updatedAt)
      @@index(isPublished, archivedAt, sortOrder)
Lesson(id, levelId, title, description, thumbnailId?, sortOrder, isPublished, isFreePreview,
       archivedAt?, createdAt, updatedAt)   @@unique(levelId, sortOrder)

VideoAsset(id, lessonId, provider[BUNNY|LOCAL], status[UPLOADING|PROCESSING|READY|FAILED],
           bunnyLibraryId?, bunnyVideoId?, localKey?, durationSec?, sizeBytes?, originalName,
           lastEventAt?, createdAt, updatedAt)
Lesson.activeVideoId? → VideoAsset   -- replacement uploads as a new asset; switched when READY; old one cleaned by job

Quiz(id, lessonId, title, passingScore 0–100, sortOrder, archivedAt?)        @@unique(lessonId, sortOrder)
Question(id, quizId, type[SINGLE|MULTIPLE|TRUE_FALSE], prompt, imageId?, explanation?, points=1, sortOrder)
Option(id, questionId, text, isCorrect, sortOrder)
QuizAttempt(id, userId, quizId, score, passed, snapshot Json, createdAt)
   -- snapshot = questions, chosen + correct option ids, points, passingScore at submit time

Order(id, userId, levelId, amountMinor, currency, status[PENDING|PAID|EXPIRED|CANCELED|REFUNDED],
      specialReference unique, paymobIntentionId?, paymobOrderId?, clientSecret?, expiresAt,
      createdAt, paidAt?)   @@index(userId, status)
PaymentTransaction(id, orderId, providerTransactionId unique, integrationId, success, pending,
      amountMinor, currency, isRefund, payloadRedacted Json, occurredAt, createdAt)
Enrollment(id, userId, levelId, source[PURCHASE|ADMIN], orderId?, revokedAt?, createdAt)
      @@unique(userId, levelId)
LessonProgress(userId, lessonId, maxPositionSec, lastPositionSec, completedAt?, updatedAt) @@id(userId, lessonId)

AuditLog(id, actorId, action, entity, entityId, data Json, createdAt)
WebhookEvent(id, provider, externalEventId unique, receivedAt)   -- dedupe Bunny/Paymob retries
```

Rules: money as integer minor units; archive (never hard-delete) anything purchased/attempted; financial rows are never deleted; reorder via a transactional endpoint.

## 6. Video upload & playback

**Provider selection.** `bunnyReady` = all of `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY` (library key, upload/manage), `BUNNY_TOKEN_KEY` (embed token auth), `BUNNY_WEBHOOK_SECRET`, `BUNNY_CDN_HOST` present and valid. Partial config ⇒ boot warning + shown in Admin › Settings › Diagnostics, falls back to Local. Each `VideoAsset` stores its own provider, so switching configuration never breaks existing assets; migrating local → Bunny is an explicit admin action (later), not automatic.

**Bunny (bytes never touch the VPS):**
1. `POST /api/v1/admin/lessons/:id/videos` → api creates Bunny video, returns `{assetId, tusEndpoint, videoId, libraryId, signature=sha256(libraryId+apiKey+expire+videoId), expire}`.
2. Browser uploads with `tus-js-client` (resumable, progress bar).
3. `POST /api/v1/webhooks/bunny` — verify HMAC-SHA256 over raw body, dedupe by event id, ignore older-than-`lastEventAt` → READY (+duration) → becomes lesson's active video. A job polls PROCESSING assets every 5 min as reconciliation.
4. Playback: `GET /api/v1/lessons/:id/playback` → `ContentAccessPolicy` check → Bunny iframe URL with token auth (`sha256(tokenKey+videoId+expires)`, ~2 h). Bunny Player.js events feed progress.

**Local (development only — decision #10):**
1. Plain multipart upload `POST /api/v1/admin/lessons/:id/videos/local` (Multer disk storage straight to `uploads/videos/<assetId>.<ext>`, outside any public root). mp4/webm only (magic-byte check), max size env (default 2 GB). No tus/chunking — not meant to run behind Cloudflare.
2. Playback: `GET /api/v1/videos/:assetId/stream`, session-cookie auth + `ContentAccessPolicy`; HEAD, single Range → 206, `Accept-Ranges`, `Content-Range`, 416; `Cache-Control: private, no-store`. HTML5 `<video>` player.
3. If production starts without Bunny credentials, admin diagnostics shows a clear warning.

## 7. Payments (Paymob)

**Checkout** `POST /api/v1/billing/checkout {levelId}` (auth, rate-limited):
1. In a DB transaction with a per-(user, level) advisory lock: reject if enrolled; reuse an unexpired PENDING order with identical amount/currency (return its stored checkout URL); else create `Order(PENDING, specialReference=uuid, expiresAt=+60 min)`.
2. Create intention: `POST https://accept.paymob.com/v1/intention/`, header `Authorization: Token <PAYMOB_SECRET_KEY>`, body `amount`, `currency`, `payment_methods:[PAYMOB_INTEGRATION_IDS]`, `items`, `billing_data` (name/email/phone; placeholders where Paymob requires values), `special_reference`, `notification_url`, `redirection_url`. Store `paymobIntentionId`, `paymobOrderId`, `clientSecret`.
3. Return `https://eg.checkout.paymob.com/?publicKey=<PAYMOB_PUBLIC_KEY>&clientSecret=<clientSecret>`; browser redirects.

**Webhook** `POST /api/v1/webhooks/paymob` (transaction processed callback) — the **only** source of truth:
1. Isolated `PaymobHmac.canonicalize(obj)` → concatenate the 20 documented fields in order (amount_cents, created_at, currency, error_occured, has_parent_transaction, id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment, is_voided, order.id, owner, pending, source_data.pan, source_data.sub_type, source_data.type, success) → HMAC-SHA512 with `PAYMOB_HMAC_SECRET` → `timingSafeEqual` with the `hmac` param. Unit-tested against Paymob's published sample vector + captured sandbox fixtures (success, failure, duplicate, refund, malformed).
2. Match order by `merchant_order_id` (= special_reference) **and** stored `paymobOrderId`; check integration id ∈ configured, amount & currency equal the order's.
3. One DB transaction: insert `PaymentTransaction` (unique providerTransactionId ⇒ duplicates are no-ops); if `success && !pending && !is_refunded` and order PENDING/EXPIRED → order PAID + `EnrollmentService.grant(PURCHASE)`. A failed attempt does **not** fail the order (student can retry). Refund callbacks are recorded only; refunds/revocation are manual in MVP (decision #8).
4. Payload stored redacted (masked PAN only, no billing PII beyond what we already have).

**Result page** `/checkout/result` — UX only: shows "confirming payment…" and polls `GET /api/v1/billing/orders/:id` until PAID / still pending after 60 s (then "we'll email you" message).

**Jobs:** expire PENDING orders after `expiresAt`; nightly report of orders with failed/uncertain callbacks.

**Currency:** EGP only (decision #1). `amount` sent in piasters.

## 8. Security & access
- `ContentAccessPolicy` (Learning module) is the single decision point: admin ⇒ allow; lesson free preview ⇒ allow; active (non-revoked) enrollment in a published-or-archived level ⇒ allow; else deny. Used by playback, streaming, quiz attempt, progress endpoints.
- Mutating requests require same-origin `Origin` header (CSRF defence on top of SameSite=Lax).
- Quiz answers never sent before submission; grading server-side.
- Throttling on login, register, reset, checkout. helmet. Upload MIME + magic-byte checks.
- Webhooks use raw body for signature verification.
- Secrets only in VPS `.env` (chmod 600). Admin bootstrapped by a one-time CLI command (`pnpm --filter api admin:create`) that prompts for the password — not stored in env.
- Deactivating a user revokes all sessions.

## 9. Milestones (each = one Codex brief → my review → commit)

Gates for every task (written into AGENTS.md):
`pnpm lint && pnpm typecheck && pnpm test && pnpm build` (+ `pnpm --filter api prisma migrate dev` / reset round-trip when the schema changes).

| # | Milestone | Done when |
|---|---|---|
| M0 | Monorepo scaffold, Nest+Next+shared, Prisma, dev/test compose, **prod Dockerfiles + compose skeleton + Caddyfile**, health endpoints, pino, CI workflow, AGENTS.md | gates green; `docker compose up` serves both apps locally |
| M1 | Identity API: User/Session/PasswordReset schema, register/login/refresh(rotation+reuse detection)/logout/reset, guards, admin CLI | integration tests for all flows |
| M2 | Identity web: auth pages, server-side api helper forwarding cookies, refresh handling, middleware redirects, layouts per route group | Playwright: register → login → logout |
| M3 | Catalog API: Level/Lesson schema, admin CRUD, reorder, archive, public catalog endpoints | integration tests |
| M4 | Images: MediaAsset + upload + sharp; catalog admin UI + public catalog pages (SEO) | covers render; Playwright admin creates level |
| — | **Staging smoke #1** on the VPS (cookies, Caddy, Cloudflare) | login works behind Cloudflare |
| M5 | Learning core: Enrollment + ContentAccessPolicy + admin manual grant/revoke + student "My levels" | policy unit tests |
| M6 | Video domain + LocalProvider (multipart upload, Range streaming), admin uploader, student player page | Range integration tests |
| M7 | BunnyProvider (create/TUS signature/webhook/reconcile/signed embed) + diagnostics page | mocked-HTTP tests; real run once you provide credentials |
| M8 | Assessment API: quizzes/questions/options, attempts, grading with snapshot | grading unit tests |
| M9 | Assessment UI: admin quiz builder, student quiz player + history | Playwright take-quiz |
| M10 | Billing core: Order/PaymentTransaction, Paymob client, HMAC canonicalizer, webhook state machine, expiry job | HMAC vector test, duplicate/failed/refund fixtures |
| M11 | Billing UI: buy button, checkout redirect, result page, admin orders; **real Paymob test-mode payment** | test card purchase enrolls the student |
| M12 | Progress + sequential unlocking + completion rule (90 % video + quizzes passed) + student dashboard | integration + Playwright |
| M13 | Admin students page, audit log view, polish, empty/error/loading states | |
| M14 | Production hardening: local nightly pg_dump + restore doc, log rotation, resource limits, non-root containers, DEPLOY.md, go-live checklist | stack boots from a clean VPS |

Workflow per milestone: I write a self-contained brief → Codex (`gpt-5.6-sol`, effort `high`) implements without committing → I re-run all gates, read the full diff against the brief, check security paths → fix small issues or send a delta brief to the same Codex session → commit. You review at milestone boundaries (I'll ping you after M0, M4/staging, M7, M11, M14).

Prerequisite: `git init` in this folder (Codex needs a git repo); optionally a private GitHub repo for CI.

## 10. Product decisions (answered 2026-11-10)

| # | Topic | Decision |
|---|---|---|
| 1 | Currency | **EGP**. `priceMinor` stored in piasters per level; default price set by admin (e.g. EGP equivalent of $10). No USD, no FX. |
| 2 | Paymob methods | **Cards only** (one card integration id). Wallets/Fawry later = add integration ids. |
| 3 | UI languages | **Arabic + English + Chinese**. `next-intl`, locale prefix routes (`/ar`, `/en`, `/zh`), Arabic = RTL (`dir="rtl"`, logical CSS properties). Content fields (level/lesson/quiz text) stored per locale (`title_ar/en/zh` via JSON `{ar,en,zh}` columns), with fallback to English. |
| 4 | Unlocking | **Sequential**: lesson N+1 opens only when lesson N is completed. Admin can preview everything. |
| 5 | Completion rule | **video ≥ 90 % watched AND every quiz of the lesson passed** (lessons without quizzes: video only). |
| 6 | Free preview | **Yes** — admin can flag lessons as free preview (open to anyone, outside the sequence lock). |
| 7 | Email verification | **Later** (not in MVP). |
| 8 | Access | **Simplest: lifetime access.** Refunds handled manually in Paymob dashboard; admin revokes enrollment by hand. No automatic refund webhook handling in MVP (callback is recorded only). |
| 9 | Phone | **required at registration** (Egyptian mobile format validated), sent to Paymob in `billing_data`. |
| 10 | Local video | **Development only.** Production uses Bunny. Local provider kept simple: plain multipart upload (no tus/chunking), cookie-auth Range streaming. |
| 11 | Archived levels | Existing buyers **keep access**. |
| 12 | Extras budget | **Skip for MVP**: no Sentry/uptime/off-box backup services. Keep a local nightly `pg_dump` script + health endpoints only. |

Impact on plan: local video simplified (no `@tus/server`, no Cloudflare chunk handling, M6 becomes small); M14 hardening trimmed; refund handling reduced to "record + manual revoke"; i18n + RTL + Chinese visual identity added to M0/M2/M4 and every UI milestone (see §12).

## 11. Changes from v1 after Codex review

**Adopted:** PaymentTransaction table separate from Order; richer order states + expiry + locked pending-order reuse; strict webhook matching (merchant_order_id + paymob order id + integration + amount + currency); isolated HMAC canonicalizer with fixtures; no mutable FX rate; Bunny webhook HMAC + dedupe + reconciliation; separate Bunny keys; tus chunk size enforced under Cloudflare's 100 MB; cookie-authenticated local streaming (no URL tokens), full Range semantics, private cache; versioned VideoAsset with active-video switch; Server Components forward cookies to internal API; refresh-token families with reuse detection; Origin check; DB uniqueness/indexes/citext; archive instead of delete; MediaAsset; quiz attempt snapshot; bounded Nest modules (identity/catalog/media/learning/assessment/billing); `(backoffice)` route group; access policy before video/quiz; milestones split smaller; schema added per feature; Docker/CI in M0 + staging smoke; one Postgres test strategy; off-box backups; health/log/uptime; audit log; `/api/v1` prefix + OpenAPI; admin bootstrap without env password.

**Not adopted (kept simple for the MVP):** full quiz versioning (attempt snapshot is enough); watched-interval tracking for anti-skip (use max position, accepted limitation); automatic local→Bunny migration (manual later); separate API process for jobs (in-process `@nestjs/schedule`).

## 12. Visual identity & frontend design (Chinese identity is a priority)

- **Design skill:** [Impeccable](https://github.com/pbakaus/impeccable) installed at project scope for both Claude Code and Codex. Before any UI milestone we produce `PRODUCT.md` + `DESIGN.md` with it (brand, audience, tone, tokens), and every UI milestone ends with an Impeccable critique/audit pass that I run and review.
- **Direction (to be refined in DESIGN.md, reviewed by you before M2):** contemporary Chinese identity, not cliché "red-and-gold takeaway menu". Ideas: ink-wash (水墨) restraint, rice-paper neutrals, cinnabar seal-red (朱红) as the single accent, jade/ink secondary, seal-stamp (印章) motif for completed lessons, subtle grid inspired by 米字格 calligraphy practice squares, brush-stroke progress indicators, level badges using HSK-style numerals.
- **Typography:** must render Arabic, Latin and CJK harmoniously: e.g. Noto Serif SC / LXGW WenKai for Chinese display, Noto Sans SC for Chinese UI, IBM Plex Sans Arabic or Noto Kufi Arabic for Arabic, a matching Latin face; self-hosted subsets via `next/font` to keep it fast.
- **RTL:** logical CSS properties only (`ms-/me-`, `ps-/pe-`), mirrored icons where directional, tested in all three locales.
- **Accessibility:** WCAG AA contrast, visible focus, reduced-motion respect.
