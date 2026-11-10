# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) frontend, NestJS API, PostgreSQL, Docker Compose on a single Hostinger VPS behind Cloudflare; Bunny Stream for video; Paymob for payments. Full architecture in PLAN.md.

## Users

- **Primary: Arabic-speaking adults in Egypt / MENA learning Mandarin Chinese.** Arabic is the main interface language; English and Chinese are also offered. They buy one level at a time, then work through it lesson by lesson (video, then quiz), mostly on phones, often in short sessions.
- **Admin: Mazen (the teacher).** He alone creates levels, lessons, quizzes; uploads videos and images; watches orders and students; manually grants or revokes access.

## Product Purpose

Let Mazen sell and deliver his own structured Chinese course directly to Arabic-speaking learners at low cost, and let learners progress through it step by step with clear feedback on how far they have come. Success: a learner can find a level, pay in EGP, and finish lessons in order without friction; Mazen can publish new content without developer help.

## Positioning

A personal course by one named teacher, Mazen, built for Arabic speakers first, not a generic marketplace or app with anonymous content. Learners buy Mazen's teaching level by level, at a small fixed price in EGP.

## Operating Context

- Learners: browse levels → register (phone required) → pay by card via Paymob → open lessons one at a time (lesson N+1 unlocks when lesson N's video is ≥ 90 % watched and its quizzes are passed) → see progress per level. Some lessons are free previews.
- Mazen: admin dashboard for content management, video upload (Bunny Stream), quiz building, orders and students.
- Three UI languages: Arabic (RTL, default audience), English, Chinese. Course content (titles, descriptions, quiz text) can be provided per language.

## Capabilities and Constraints

- Levels → lessons → one video + zero or more quizzes (single choice, multiple choice, true/false).
- Payment: Paymob, cards only, EGP, lifetime access per purchased level.
- Must stay cheap to run: one VPS, no paid SaaS beyond Bunny and Paymob.
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
5. **Trust at the payment moment.** Price in EGP, clear about what a level includes, payment confirmation that never leaves the learner unsure.

## Accessibility & Inclusion

WCAG 2.2 AA contrast and keyboard/focus support; respect reduced motion; correct `lang`/`dir` per locale and correct mixed Arabic/Chinese/Latin text rendering.
