import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports liveness without querying the database', async () => {
    const query = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: query } }],
    }).compile();

    expect(moduleRef.get(HealthController).health()).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });
});
