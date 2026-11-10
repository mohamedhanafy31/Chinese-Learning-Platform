import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Locale } from '@app/shared';

export interface PasswordResetMail {
  locale: Locale;
  resetLink: string;
  to: string;
  userId: string;
}

export interface MailService {
  sendPasswordReset(mail: PasswordResetMail): Promise<void>;
}

export type MailOutboxEntry = PasswordResetMail;

export class InMemoryMailService implements MailService {
  readonly outbox: MailOutboxEntry[] = [];

  async sendPasswordReset(mail: PasswordResetMail): Promise<void> {
    this.outbox.push(mail);
  }

  clear(): void {
    this.outbox.length = 0;
  }
}

export class DevelopmentMailService implements MailService {
  private readonly logger = new Logger(DevelopmentMailService.name);

  async sendPasswordReset(mail: PasswordResetMail): Promise<void> {
    this.logger.log(`Generated a password reset email for user ${mail.userId}`);
    console.info(`[development only] Password reset link: ${mail.resetLink}`);
  }
}

export class NullMailService implements MailService {
  private readonly logger = new Logger(NullMailService.name);

  constructor() {
    this.logger.warn(
      'SMTP is not configured; password reset emails will not be sent',
    );
  }

  async sendPasswordReset(mail: PasswordResetMail): Promise<void> {
    this.logger.warn(
      `Skipped password reset email for user ${mail.userId}: SMTP is not configured`,
    );
  }
}

interface SmtpConfiguration {
  from: string;
  host: string;
  password: string;
  port: number;
  user: string;
}

export class SmtpMailService implements MailService {
  private readonly transporter: Transporter;

  constructor(private readonly configuration: SmtpConfiguration) {
    this.transporter = nodemailer.createTransport({
      host: configuration.host,
      port: configuration.port,
      secure: configuration.port === 465,
      auth: {
        user: configuration.user,
        pass: configuration.password,
      },
    });
  }

  async sendPasswordReset(mail: PasswordResetMail): Promise<void> {
    const arabic = mail.locale === 'ar';
    const subject = arabic ? 'إعادة تعيين كلمة المرور' : 'Reset your password';
    const instruction = arabic
      ? 'استخدم الرابط التالي لإعادة تعيين كلمة المرور خلال 30 دقيقة:'
      : 'Use the following link to reset your password within 30 minutes:';

    await this.transporter.sendMail({
      from: this.configuration.from,
      to: mail.to,
      subject,
      text: `${instruction}\n\n${mail.resetLink}`,
      html: `<p>${instruction}</p><p><a href="${mail.resetLink}">${subject}</a></p>`,
    });
  }
}
