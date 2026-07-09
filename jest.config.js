// DATABASE_URL / JWT_SECRET / PORT come from .env.test, loaded by the
// `test` npm script via `dotenv -e .env.test -- jest ...` BEFORE this
// process starts — not from a jest setupFiles hook, so there is no
// ambiguity between dev `.env` and `.env.test` at test time.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
};
