import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { BunnyConfig } from './bunny.config';

const REQUEST_TIMEOUT_MS = 15_000;

/** A failed Bunny call. The message never contains the API key. */
export class BunnyError extends Error {
  constructor(
    message: string,
    /** HTTP status, or null for a network error or timeout. */
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'BunnyError';
  }
}

const createdSchema = z.object({ guid: z.string().min(1) });
const videoSchema = z.object({
  guid: z.string().min(1),
  status: z.number().int(),
  length: z.number().default(0),
  encodeProgress: z.number().default(0),
});

export type BunnyVideo = z.infer<typeof videoSchema>;

/** A thin typed wrapper over Bunny Stream's library API. */
@Injectable()
export class BunnyClient {
  constructor(@Inject(BunnyConfig) private readonly config: BunnyConfig) {}

  async createVideo(title: string): Promise<{ guid: string }> {
    const { libraryId } = this.config.require();
    const body = await this.request('POST', `/library/${libraryId}/videos`, {
      title,
    });
    return parse(createdSchema, body);
  }

  async getVideo(guid: string): Promise<BunnyVideo> {
    const { libraryId } = this.config.require();
    const body = await this.request(
      'GET',
      `/library/${libraryId}/videos/${encodeURIComponent(guid)}`,
    );
    return parse(videoSchema, body);
  }

  /** A video that is already gone counts as deleted. */
  async deleteVideo(guid: string, libraryId?: string): Promise<void> {
    const settings = this.config.require();
    const targetLibraryId = libraryId ?? settings.libraryId;
    try {
      await this.request(
        'DELETE',
        `/library/${targetLibraryId}/videos/${encodeURIComponent(guid)}`,
      );
    } catch (error) {
      if (error instanceof BunnyError && error.status === 404) return;
      throw error;
    }
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    json?: unknown,
  ): Promise<unknown> {
    const { apiBase, apiKey } = this.config.require();
    let response: Response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        method,
        headers: {
          AccessKey: apiKey,
          Accept: 'application/json',
          ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: json === undefined ? undefined : JSON.stringify(json),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new BunnyError(
        timedOut
          ? `Bunny ${method} ${redact(path)} timed out`
          : `Bunny ${method} ${redact(path)} could not be reached`,
        null,
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new BunnyError(
        `Bunny ${method} ${redact(path)} answered ${response.status}`,
        response.status,
      );
    }
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BunnyError(
        `Bunny ${method} ${redact(path)} returned invalid JSON`,
        response.status,
      );
    }
  }
}

/** Keeps the library id out of log lines; the path shape is enough. */
function redact(path: string): string {
  return path.replace(/\/library\/[^/]+/, '/library/:id');
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BunnyError('Bunny returned an unexpected response', null);
  }
  return result.data;
}
