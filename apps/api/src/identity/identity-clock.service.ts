import { Injectable } from '@nestjs/common';

@Injectable()
export class IdentityClockService {
  now(): Date {
    return new Date();
  }
}
