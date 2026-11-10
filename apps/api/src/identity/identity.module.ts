import { Module } from '@nestjs/common';

import { IdentityController } from './identity.controller';
import { IdentityClockService } from './identity-clock.service';
import { IdentityService } from './identity.service';
import { IdentityTokensService } from './identity-tokens.service';
import { mailProvider } from './mail.provider';
import { PasswordService } from './password.service';
import { MAIL_SERVICE } from './identity.constants';

@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    IdentityClockService,
    IdentityTokensService,
    PasswordService,
    mailProvider,
  ],
  exports: [
    IdentityService,
    IdentityClockService,
    IdentityTokensService,
    PasswordService,
    MAIL_SERVICE,
  ],
})
export class IdentityModule {}
