import {
  labelKey,
  resolveEntityLabels,
  type LabelClient,
} from './audit-labels';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const LESSON = '22222222-2222-4222-8222-222222222222';
const QUIZ = '33333333-3333-4333-8333-333333333333';
const STUDENT = '44444444-4444-4444-8444-444444444444';
const GONE = '55555555-5555-4555-8555-555555555555';

function client(calls: string[] = []): LabelClient {
  const titled = (kind: string, rows: Record<string, unknown>) => ({
    findMany: ({ where }: { where: { id: { in: string[] } } }) => {
      calls.push(`${kind}:${where.id.in.join(',')}`);
      return Promise.resolve(
        where.id.in
          .filter((id) => id in rows)
          .map((id) => ({
            id,
            title: rows[id],
          })),
      );
    },
  });
  return {
    level: titled('level', { [LEVEL]: { en: 'Beginner', ar: 'البداية' } }),
    lesson: titled('lesson', { [LESSON]: { en: 'Greetings' } }),
    quiz: titled('quiz', { [QUIZ]: { en: 'Check' } }),
    user: {
      findMany: ({ where }) => {
        calls.push(`user:${where.id.in.join(',')}`);
        return Promise.resolve(
          where.id.in.includes(STUDENT) ? [{ id: STUDENT, name: 'Nour' }] : [],
        );
      },
    },
  };
}

describe('resolveEntityLabels', () => {
  it('resolves titles and student names, one query per entity kind', async () => {
    const calls: string[] = [];
    const labels = await resolveEntityLabels(client(calls), [
      { entity: 'Level', entityId: LEVEL },
      { entity: 'Level', entityId: LEVEL },
      { entity: 'Lesson', entityId: LESSON },
      { entity: 'Quiz', entityId: QUIZ },
      { entity: 'Student', entityId: STUDENT },
    ]);
    expect(labels.get(labelKey('Level', LEVEL))).toEqual({
      en: 'Beginner',
      ar: 'البداية',
    });
    expect(labels.get(labelKey('Lesson', LESSON))).toEqual({ en: 'Greetings' });
    expect(labels.get(labelKey('Quiz', QUIZ))).toEqual({ en: 'Check' });
    expect(labels.get(labelKey('Student', STUDENT))).toEqual({ en: 'Nour' });
    expect(calls).toHaveLength(4);
  });

  it('leaves deleted entities, images and non-id references unresolved', async () => {
    const calls: string[] = [];
    const labels = await resolveEntityLabels(client(calls), [
      { entity: 'Level', entityId: GONE },
      { entity: 'Level', entityId: 'all' },
      { entity: 'Image', entityId: LEVEL },
    ]);
    expect(labels.size).toBe(0);
    // 'all' and the image never reach the database.
    expect(calls).toEqual([`level:${GONE}`]);
  });
});
