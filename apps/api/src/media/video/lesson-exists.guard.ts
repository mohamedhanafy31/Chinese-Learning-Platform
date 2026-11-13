import {
  Inject,
  Injectable,
  ParseUUIDPipe,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonExistsGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const id = request.params.id;
    if (typeof id !== 'string') {
      throw new NotFoundException('Lesson not found');
    }
    const validId = (await new ParseUUIDPipe().transform(id, {
      type: 'param',
      metatype: String,
      data: 'id',
    })) as string;
    if (
      !(await this.prisma.lesson.findUnique({
        where: { id: validId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Lesson not found');
    }
    return true;
  }
}
