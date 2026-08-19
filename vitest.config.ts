import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DISCORD_TOKEN: 'fake_token_for_tests',
      DISCORD_CLIENT_ID: 'fake_id_for_tests',
      DISCORD_CLIENT_SECRET: 'fake_secret_for_tests',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/test',
      JWT_SECRET: 'test_jwt_secret_0123456789abcdef0123456789abcdef',
    },
  },
});
