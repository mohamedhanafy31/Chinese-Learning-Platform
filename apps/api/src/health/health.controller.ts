import { Controller, Get, Inject } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

interface HealthResponse {
  status: 'ok';
}

@Controller()
@Public()
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('health')
  health(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<HealthResponse> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
