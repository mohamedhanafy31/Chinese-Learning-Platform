import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MAIL_SERVICE } from './identity.constants';
import {
  DevelopmentMailService,
  InMemoryMailService,
  NullMailService,
  SmtpMailService,
  type MailService,
} from './mail.service';
import type { Environment } from '../config/environment';

export const mailProvider: FactoryProvider<MailService> = {
  provide: MAIL_SERVICE,
  inject: [ConfigService],
  useFactory(config: ConfigService<Environment, true>): MailService {
    const host = config.get('SMTP_HOST', { infer: true });
    const port = config.get('SMTP_PORT', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    const password = config.get('SMTP_PASSWORD', { infer: true });
    const from = config.get('SMTP_FROM', { infer: true });

    if (host && port && user && password && from) {
      return new SmtpMailService({ host, port, user, password, from });
    }

    const nodeEnvironment = config.get('NODE_ENV', { infer: true });
    if (nodeEnvironment === 'test') {
      return new InMemoryMailService();
    }
    if (nodeEnvironment === 'development') {
      return new DevelopmentMailService();
    }
    return new NullMailService();
  },
};
