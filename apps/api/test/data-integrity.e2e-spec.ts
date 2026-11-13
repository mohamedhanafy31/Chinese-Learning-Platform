import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  VideoProvider,
  VideoStatus,
} from '../src/generated/prisma/client';

describe('database data integrity (e2e)', () => {
  let prisma: PrismaClient;
  const suffix = randomUUID();
  let userId: string;
  let levelId: string;
  let lessonId: string;
  let activeVideoId: string;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const user = await prisma.user.create({
      data: {
        email: `integrity-${suffix}@example.com`,
        passwordHash: 'test-only',
        name: 'Integrity Test',
        phone: `+${suffix.replaceAll('-', '').slice(0, 11)}`,
      },
    });
    userId = user.id;
    const level = await prisma.level.create({
      data: {
        slug: `integrity-${suffix}`,
        hanzi: '测',
        title: { en: 'Integrity' },
        summary: { en: 'Integrity test' },
        topics: [],
        sortOrder: Math.floor(Math.random() * 1_000_000) + 1,
      },
    });
    levelId = level.id;
    const lesson = await prisma.lesson.create({
      data: {
        levelId,
        title: { en: 'Integrity lesson' },
        sortOrder: 1,
      },
    });
    lessonId = lesson.id;
    const asset = await prisma.videoAsset.create({
      data: {
        lessonId,
        provider: VideoProvider.LOCAL,
        status: VideoStatus.READY,
        localKey: `${suffix}.mp4`,
        originalName: 'integrity.mp4',
      },
    });
    activeVideoId = asset.id;
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { activeVideoId },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.lesson.updateMany({
        where: { id: lessonId },
        data: { activeVideoId: null },
      });
      await prisma.order.deleteMany({ where: { userId, levelId } });
      await prisma.videoAsset.deleteMany({ where: { lessonId } });
      await prisma.lesson.deleteMany({ where: { id: lessonId } });
      await prisma.level.deleteMany({ where: { id: levelId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  });

  it('rejects a second pending order for the same user and level', async () => {
    const orderData = {
      userId,
      levelId,
      amountMinor: 500,
      specialReference: `integrity-a-${suffix}`,
      expiresAt: new Date(Date.now() + 60_000),
    };
    await prisma.order.create({ data: orderData });
    await expect(
      prisma.order.create({
        data: { ...orderData, specialReference: `integrity-b-${suffix}` },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a LOCAL asset without localKey at the database level', async () => {
    await expect(
      prisma.videoAsset.create({
        data: {
          lessonId,
          provider: VideoProvider.LOCAL,
          status: VideoStatus.FAILED,
          localKey: null,
          originalName: 'invalid.mp4',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2039' });
  });

  it('rejects deleting a video referenced as a lesson active video', async () => {
    await expect(
      prisma.videoAsset.delete({ where: { id: activeVideoId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
