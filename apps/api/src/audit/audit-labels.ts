import { AuditEntity, type LocalizedText } from '@app/shared';

import { parseLocalizedText } from '../catalog/catalog.mapper';

interface TitleModel {
  findMany(args: {
    where: { id: { in: string[] } };
    select: { id: true; title: true };
  }): Promise<Array<{ id: string; title: unknown }>>;
}

/** The slice of Prisma that label resolution reads. */
export interface LabelClient {
  level: TitleModel;
  lesson: TitleModel;
  quiz: TitleModel;
  user: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; name: true };
    }): Promise<Array<{ id: string; name: string }>>;
  };
}

export interface EntityRef {
  entity: string;
  entityId: string;
}

export const labelKey = (entity: string, entityId: string): string =>
  `${entity}:${entityId}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idsOf(refs: readonly EntityRef[], entity: string): string[] {
  return Array.from(
    new Set(
      refs
        .filter((ref) => ref.entity === entity && UUID.test(ref.entityId))
        .map((ref) => ref.entityId),
    ),
  );
}

/**
 * Resolves a readable name for each referenced entity with one query per
 * entity kind. Entities that no longer exist (or have no cheap label, like
 * images) are simply absent from the result.
 */
export async function resolveEntityLabels(
  client: LabelClient,
  refs: readonly EntityRef[],
): Promise<Map<string, LocalizedText>> {
  const labels = new Map<string, LocalizedText>();
  const titled = [
    [AuditEntity.LEVEL, client.level],
    [AuditEntity.LESSON, client.lesson],
    [AuditEntity.QUIZ, client.quiz],
  ] as const;
  await Promise.all([
    ...titled.map(async ([entity, model]) => {
      const ids = idsOf(refs, entity);
      if (ids.length === 0) return;
      const rows = await model.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      });
      for (const row of rows) {
        labels.set(labelKey(entity, row.id), parseLocalizedText(row.title));
      }
    }),
    (async () => {
      const ids = idsOf(refs, AuditEntity.STUDENT);
      if (ids.length === 0) return;
      const rows = await client.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const row of rows) {
        // A person's name is not translated: English is the fallback.
        labels.set(labelKey(AuditEntity.STUDENT, row.id), { en: row.name });
      }
    })(),
  ]);
  return labels;
}
