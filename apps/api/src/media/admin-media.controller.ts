import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MAX_IMAGE_UPLOAD_BYTES,
  Role,
  type PublicUser,
  type UploadedImage,
} from '@app/shared';

import { ImagesService } from './images.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/media')
@Roles(Role.ADMIN)
export class AdminMediaController {
  constructor(@Inject(ImagesService) private readonly images: ImagesService) {}

  @Post('images')
  @UseInterceptors(
    FileInterceptor('file', {
      // No storage option: Multer buffers the upload in memory.
      limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES, files: 1 },
    }),
  )
  upload(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentUser() admin: PublicUser,
  ): Promise<UploadedImage> {
    if (!file) throw new BadRequestException('A file is required');
    return this.images.upload(file.buffer, admin.id);
  }
}
