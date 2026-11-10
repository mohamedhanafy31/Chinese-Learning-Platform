import 'reflect-metadata';

import { confirm, input, password } from '@inquirer/prompts';
import { NestFactory } from '@nestjs/core';
import { registerRequestSchema } from '@app/shared';

import { createOrPromoteAdmin } from './admin-create';
import { PasswordService } from './password.service';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

async function runAdminCreateCli(): Promise<void> {
  const email = await input({ message: 'Email:' });
  const name = await input({ message: 'Name:' });
  const phone = await input({ message: 'Phone (E.164):' });
  const firstPassword = await password({ message: 'Password:', mask: '*' });
  const repeatedPassword = await password({
    message: 'Repeat password:',
    mask: '*',
  });
  if (firstPassword !== repeatedPassword) {
    throw new Error('Passwords do not match');
  }

  const registration = registerRequestSchema.parse({
    email,
    name,
    phone,
    password: firstPassword,
  });
  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await createOrPromoteAdmin(
      application.get(PrismaService),
      application.get(PasswordService),
      registration,
      async (user) =>
        confirm({
          message: `${user.email} already exists. Promote this user to ADMIN?`,
          default: false,
        }),
    );
    console.info(
      `Admin create result: ${result.status} (${result.user.email})`,
    );
  } finally {
    await application.close();
  }
}

void runAdminCreateCli().catch(() => {
  console.error(
    'Admin creation failed. Check the entered values and database connection.',
  );
  process.exitCode = 1;
});
