import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './core/services/storage/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
