import { defineConfig } from 'drizzle-kit'

const dbUrl = process.env.DATABASE_URL!
const isLocalhost = dbUrl?.includes('localhost')

export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
  },
})
