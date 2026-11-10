import { Global, Module } from '@nestjs/common';

import { AdminMediaController } from './admin-media.controller';
import { ImagesService } from './images.service';
import { MediaStorage } from './media-storage';

@Global()
@Module({
  controllers: [AdminMediaController],
  providers: [ImagesService, MediaStorage],
  exports: [MediaStorage],
})
export class MediaModule {}
