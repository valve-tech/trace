import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://pulsedev:pulsedev@localhost:5432/pulsedev";

// Return TIMESTAMPTZ as ISO strings instead of Date objects
pg.types.setTypeParser(1184, (val: string) => val); // timestamptz
pg.types.setTypeParser(1114, (val: string) => val); // timestamp

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[pg] unexpected pool error", err);
});

export async function checkHealth(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
