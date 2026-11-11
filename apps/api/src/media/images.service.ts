import { createHash, randomUUID } from 'node:crypto';
import { access, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  Inject,
  Injectable,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import {
  MAX_IMAGE_INPUT_SIDE,
  MAX_IMAGE_SIDE,
  type UploadedImage,
} from '@app/shared';

import { detectImageType } from './image-format';
import { MediaStorage } from './media-storage';
import { mediaUrl } from './media-url';
import { AuditService } from '../audit/audit.service';
import { Prisma, MediaKind } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const WEBP_MIME = 'image/webp';
const WEBP_QUALITY = 82;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class ImagesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async upload(input: Buffer, actorId: string): Promise<UploadedImage> {
    if (detectImageType(input) === null) {
      throw new UnsupportedMediaTypeException(
        'Only JPEG, PNG and WebP images are accepted',
      );
    }

    const processed = await this.process(input);
    const checksum = createHash('sha256').update(processed.data).digest('hex');
    const storageKey = `${checksum}.webp`;
    await this.writeOnce(storageKey, processed.data);

    const data = {
      kind: MediaKind.IMAGE,
      storageKey,
      mime: WEBP_MIME,
      sizeBytes: processed.data.length,
      width: processed.width,
      height: processed.height,
      checksum,
    };
    const row = await this.prisma.mediaAsset
      .upsert({ where: { checksum }, create: data, update: {} })
      .catch(async (error: unknown) => {
        // Two identical uploads racing: the other one created the row first.
        if (!isUniqueViolation(error)) throw error;
        return this.prisma.mediaAsset.findUniqueOrThrow({
          where: { checksum },
        });
      });

    await this.audit.record(this.prisma, {
      actorId,
      action: 'image.upload',
      entity: 'Image',
      entityId: row.id,
      data: { width: row.width, height: row.height, sizeBytes: row.sizeBytes },
    });

    return {
      id: row.id,
      url: mediaUrl(row.storageKey),
      width: row.width,
      height: row.height,
      mime: row.mime,
      sizeBytes: row.sizeBytes,
    };
  }

  private async process(
    input: Buffer,
  ): Promise<{ data: Buffer; width: number; height: number }> {
    try {
      const metadata = await sharp(input, {
        limitInputPixels: MAX_IMAGE_INPUT_SIDE * MAX_IMAGE_INPUT_SIDE,
      }).metadata();
      const side = Math.max(metadata.width ?? 0, metadata.height ?? 0);
      if (side > MAX_IMAGE_INPUT_SIDE) {
        throw new UnprocessableEntityException(
          `Image sides must be at most ${MAX_IMAGE_INPUT_SIDE} pixels`,
        );
      }

      const { data, info } = await sharp(input, {
        limitInputPixels: MAX_IMAGE_INPUT_SIDE * MAX_IMAGE_INPUT_SIDE,
        failOn: 'error',
      })
        .rotate()
        .resize({
          width: MAX_IMAGE_SIDE,
          height: MAX_IMAGE_SIDE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      return { data, width: info.width, height: info.height };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new UnprocessableEntityException(
        'The image could not be processed',
      );
    }
  }

  /** Atomic write: temp file in the same directory, then rename. */
  private async writeOnce(storageKey: string, data: Buffer): Promise<void> {
    const target = path.join(this.storage.imagesDir, storageKey);
    if (await exists(target)) return;
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, data, { flag: 'wx' });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
