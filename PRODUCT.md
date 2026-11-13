# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) frontend, NestJS API, PostgreSQL, Docker Compose on a single Hostinger VPS behind Cloudflare, and Bunny Stream for video. Full architecture in PLAN.md.

## Users

- **Primary: Arabic-speaking adults in Egypt / MENA learning Mandarin Chinese.** Arabic is the main interface language; English and Chinese are also offered. Every account can open every published level, then work through it lesson by lesson (video, then quiz), mostly on phones, often in short sessions.
- **Admin: Mazen (the teacher).** He alone creates levels, lessons and quizzes; uploads videos and images; and manages students. Historical order and enrollment records remain available for support and audit.

## Product Purpose

Let Mazen deliver his own structured Chinese course directly to Arabic-speaking learners, and let every registered learner progress through all published levels step by step with clear feedback on how far they have come. Success: a learner can create an account, choose a published level, and finish lessons in order without friction; Mazen can publish new content without developer help.

## Positioning

A free personal course by one named teacher, Mazen, built for Arabic speakers first, not a generic marketplace or app with anonymous content. Published levels are included with every account.

## Operating Context

- Learners: browse levels → register (phone required) → open any published level → complete lessons in order (lesson N+1 unlocks when lesson N's video is ≥ 90 % watched and its quizzes are passed) → see progress per level. Some lessons remain available as anonymous previews.
- Mazen: admin dashboard for content management, video upload (Bunny Stream), quiz building, orders and students.
- Three UI languages: Arabic (RTL, default audience), English, Chinese. Course content (titles, descriptions, quiz text) can be provided per language.

## Capabilities and Constraints

- Levels → lessons → one video + zero or more quizzes (single choice, multiple choice, true/false).
- No payment processing or paid access tiers.
- Must stay cheap to run: one VPS and no paid SaaS beyond Bunny.
- Email verification, certificates, coupons, wallets: not in the first release.
- **Open:** platform name and logo. Nothing exists yet; the design pass may propose a working name and wordmark for approval.

## Brand Commitments

- **Chinese identity is very important to the design** (binding, from the owner).
- The brand is built around one named teacher: **Mazen**.

## Evidence on Hand

None yet: no logo, photos of Mazen, testimonials, student numbers, or sample lessons are in the repository. Future work must not invent testimonials, learner counts, ratings, or credentials. Use clearly marked placeholders until real assets are provided.

## Product Principles

1. **Arabic-first, trilingual always.** Every screen works natively in Arabic RTL, English, and Chinese; nothing is a translated afterthought.
2. **One teacher, one path.** The experience centers on Mazen's course and a clear sequential path, not browsing or choice overload.
3. **Progress you can feel.** Learners always know where they are, what unlocks next, and what they have completed.
4. **Cheap, fast, mobile.** Pages load quickly on mid-range phones and Egyptian mobile networks; no heavy extras.
5. **Open access is explicit.** Every published level is free with an account, and the interface never implies that payment or a manual grant is required.

## Accessibility & Inclusion

WCAG 2.2 AA contrast and keyboard/focus support; respect reduced motion; correct `lang`/`dir` per locale and correct mixed Arabic/Chinese/Latin text rendering.
