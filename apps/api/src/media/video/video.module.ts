import { Module } from '@nestjs/common';

import { LocalProvider } from './local.provider';
import {
  AdminVideoController,
  LessonPlaybackController,
  VideoStreamController,
} from './video.controller';
import { VideoPlaybackService } from './video-playback.service';
import { VideoStreamService } from './video-stream.service';
import { VideoService } from './video.service';
import { LearningModule } from '../../learning/learning.module';

@Module({
  imports: [LearningModule],
  controllers: [
    AdminVideoController,
    LessonPlaybackController,
    VideoStreamController,
  ],
  providers: [
    LocalProvider,
    VideoService,
    VideoPlaybackService,
    VideoStreamService,
  ],
  exports: [VideoService],
})
export class VideoModule {}
