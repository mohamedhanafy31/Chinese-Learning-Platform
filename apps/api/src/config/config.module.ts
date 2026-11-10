import path from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { validateEnvironment } from './environment';

@Module({
  imports: [
    NestConfigModule.forRoot({
      cache: true,
      envFilePath: [path.resolve(process.cwd(), '../../.env'), '.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
  ],
})
export class ConfigModule {}
