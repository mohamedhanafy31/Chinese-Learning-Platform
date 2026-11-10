import type { Prisma } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;

export const quizzesLockKey = (lessonId: string): string =>
  `assessment:quizzes:${lessonId}`;
export const questionsLockKey = (quizId: string): string =>
  `assessment:questions:${quizId}`;

/**
 * Transaction-level advisory lock for one scope (a lesson's quizzes, a quiz's
 * questions): appends, reorders and deletes in a scope never interleave.
 */
export async function lockScope(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Row lock so read-then-write changes to one quiz serialise. */
export async function lockQuizRow(tx: Tx, id: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "Quiz" WHERE id = ${id}::uuid FOR UPDATE`;
}
