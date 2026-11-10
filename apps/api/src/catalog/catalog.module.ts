import { Module } from '@nestjs/common';

import { AdminLessonsController } from './admin-lessons.controller';
import { AdminLevelsController } from './admin-levels.controller';
import { CatalogAdminService } from './catalog-admin.service';
import { CatalogPublicService } from './catalog-public.service';
import { PublicCatalogController } from './public-catalog.controller';
import { VideoModule } from '../media/video/video.module';

@Module({
  imports: [VideoModule],
  controllers: [
    AdminLevelsController,
    AdminLessonsController,
    PublicCatalogController,
  ],
  providers: [CatalogAdminService, CatalogPublicService],
})
export class CatalogModule {}
