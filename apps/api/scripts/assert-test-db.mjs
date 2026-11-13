const url =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@localhost:5433/app_test?schema=public';
let database;
try {
  database = new URL(url).pathname.slice(1).split('/')[0];
} catch {
  throw new Error('DATABASE_URL_TEST must be a valid URL');
}
if (!database.endsWith('_test'))
  throw new Error(
    'Refusing integration migration: DATABASE_URL_TEST database name must end in _test',
  );
