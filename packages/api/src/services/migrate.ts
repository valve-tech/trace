import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(thisDir, "../../migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.log("[migrate] no migrations directory found, skipping");
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Use a single client with advisory lock to prevent concurrent migrations
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(1)");

    const { rows: applied } = await client.query(
      "SELECT name FROM _migrations ORDER BY id",
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      console.log(`[migrate] applying ${file}`);

      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    }

    await client.query("SELECT pg_advisory_unlock(1)");
    console.log("[migrate] all migrations applied");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    await client.query("SELECT pg_advisory_unlock(1)").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
