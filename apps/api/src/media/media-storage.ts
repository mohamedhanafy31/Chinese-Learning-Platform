import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../config/environment';

/**
 * Owns the uploads directory. Boot fails when the directory cannot be created
 * or written, so a misconfigured volume never surfaces as a failed upload.
 */
@Injectable()
export class MediaStorage implements OnModuleInit {
  readonly root: string;
  readonly imagesDir: string;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<Environment, true>,
  ) {
    const configured = config.get('UPLOADS_DIR', { infer: true });
    this.root = path.resolve(configured ?? path.join(process.cwd(), 'uploads'));
    this.imagesDir = path.join(this.root, 'images');
  }

  async onModuleInit(): Promise<void> {
    try {
      await mkdir(this.imagesDir, { recursive: true });
      await access(this.imagesDir, constants.R_OK | constants.W_OK);
    } catch (error) {
      throw new Error(
        `UPLOADS_DIR (${this.root}) must be a writable directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }
}
