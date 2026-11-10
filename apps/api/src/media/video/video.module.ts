import { Module } from '@nestjs/common';

import { BunnyClient } from './bunny/bunny.client';
import { BunnyConfig } from './bunny/bunny.config';
import { BunnyProvider } from './bunny/bunny.provider';
import { BunnyVideoService } from './bunny/bunny-video.service';
import { BunnyWebhookController } from './bunny/bunny-webhook.controller';
import { LocalProvider } from './local.provider';
import {
  AdminVideoController,
  LessonPlaybackController,
  VideoStreamController,
} from './video.controller';
import { VideoPlaybackService } from './video-playback.service';
import { VideoProviders } from './video-providers';
import { VideoStreamService } from './video-stream.service';
import { VideoService } from './video.service';
import { LearningModule } from '../../learning/learning.module';

@Module({
  imports: [LearningModule],
  controllers: [
    AdminVideoController,
    LessonPlaybackController,
    VideoStreamController,
    BunnyWebhookController,
  ],
  providers: [
    LocalProvider,
    BunnyConfig,
    BunnyClient,
    BunnyProvider,
    BunnyVideoService,
    VideoProviders,
    VideoService,
    VideoPlaybackService,
    VideoStreamService,
  ],
  exports: [VideoService, VideoProviders],
})
export class VideoModule {}
