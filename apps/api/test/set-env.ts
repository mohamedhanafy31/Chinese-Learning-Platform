import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
// Never write uploads into the working tree during tests.
process.env.UPLOADS_DIR ??= path.join(
  tmpdir(),
  `cl-api-uploads-${process.pid}`,
);
process.env.PORT = '4001';
process.env.APP_URL = 'http://localhost:3000';
process.env.INTERNAL_API_URL = 'http://localhost:4001';
process.env.JWT_ACCESS_SECRET =
  'test-only-access-secret-at-least-thirty-two-characters';
process.env.JWT_REFRESH_SECRET =
  'test-only-refresh-secret-at-least-thirty-two-characters';
process.env.BILLING_EXPIRY_INTERVAL_SEC = '0';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/app_test?schema=public';

let databaseName: string;
try {
  databaseName =
    new URL(process.env.DATABASE_URL).pathname
      .split('/')
      .filter(Boolean)
      .at(-1) ?? '';
} catch {
  throw new Error('Integration tests require DATABASE_URL to be a valid URL');
}
if (!databaseName.endsWith('_test')) {
  throw new Error(
    'Integration tests require DATABASE_URL database name ending in _test',
  );
}
