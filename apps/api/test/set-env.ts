process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.APP_URL = 'http://localhost:3000';
process.env.INTERNAL_API_URL = 'http://localhost:4001';
process.env.JWT_ACCESS_SECRET =
  'test-only-access-secret-at-least-thirty-two-characters';
process.env.JWT_REFRESH_SECRET =
  'test-only-refresh-secret-at-least-thirty-two-characters';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@localhost:5433/app_test?schema=public';
