import pg from "pg"
const { Pool } = pg

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null

export { pool }
export const USE_DB = !!pool
