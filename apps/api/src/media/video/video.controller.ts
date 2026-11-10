import {
  Controller,
  Delete,
  Get,
  Header,
  Head,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  Role,
  type BunnyUploadTicket,
  type PlaybackResponse,
  type PublicUser,
  type UploadedVideo,
  type VideoDiagnostics,
} from '@app/shared';
import type { Request, Response } from 'express';

import {
  LocalVideoStorage,
  localUploadTarget,
  type StoredVideoUpload,
} from './local-upload.storage';
import { VideoPlaybackService } from './video-playback.service';
import { VideoStreamService } from './video-stream.service';
import { VideoService } from './video.service';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from '../../catalog/cache-control.interceptor';
import { OptionalUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

const PRIVATE_NO_STORE = 'private, no-store';

/**
 * Players issue many Range requests while playing and seeking, so the stream
 * gets its own, generous bucket (the limiter keys per route handler) instead
 * of the default 100 a minute. Access checks still run on every request.
 */
const STREAM_THROTTLE = { default: { limit: 1200, ttl: 60_000 } };

@Controller('admin')
@Roles(Role.ADMIN)
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class AdminVideoController {
  constructor(@Inject(VideoService) private readonly videos: VideoService) {}

  @Post('lessons/:id/videos/local')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: new LocalVideoStorage(),
      // Evaluated per request, after boot has read VIDEO_MAX_BYTES.
      limits: () => ({
        fileSize: localUploadTarget.maxBytes,
        files: 1,
        fields: 4,
      }),
    }),
  )
  upload(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: StoredVideoUpload | undefined,
    @Body() body: unknown,
  ): Promise<UploadedVideo> {
    return this.videos.uploadLocal(id, file, body);
  }

  /**
   * Bunny uploads: the browser sends only metadata here, then uploads the file
   * straight to Bunny with the returned TUS headers.
   */
  @Post('lessons/:id/videos')
  createBunnyUpload(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ): Promise<BunnyUploadTicket> {
    return this.videos.createBunnyUpload(id, body);
  }

  /** The browser calls this when its TUS upload has finished. */
  @Post('videos/:assetId/uploaded')
  @HttpCode(HttpStatus.NO_CONTENT)
  uploaded(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ): Promise<void> {
    return this.videos.markBunnyUploaded(assetId);
  }

  @Delete('lessons/:id/video')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.videos.removeActive(id);
  }

  @Get('diagnostics/video')
  diagnostics(): Promise<VideoDiagnostics> {
    return this.videos.diagnostics();
  }
}

@Controller('lessons')
@OptionalAuth()
export class LessonPlaybackController {
  constructor(
    @Inject(VideoPlaybackService)
    private readonly playback: VideoPlaybackService,
  ) {}

  @Get(':id/playback')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  get(
    @OptionalUser() user: PublicUser | null,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PlaybackResponse> {
    return this.playback.playback(user, id);
  }
}

@Controller('videos')
@OptionalAuth()
export class VideoStreamController {
  constructor(
    @Inject(VideoStreamService) private readonly streams: VideoStreamService,
  ) {}

  @Get(':assetId/stream')
  @Throttle(STREAM_THROTTLE)
  stream(
    @OptionalUser() user: PublicUser | null,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.streams.serve(user, assetId, request, response, false);
  }

  @Head(':assetId/stream')
  @Throttle(STREAM_THROTTLE)
  head(
    @OptionalUser() user: PublicUser | null,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.streams.serve(user, assetId, request, response, true);
  }
}
