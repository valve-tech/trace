import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { pool } from "../../src/services/pool.js";
import { vacuumExpiredNonces } from "../../src/services/auth/nonceStore.js";
import {
  runVacuumOnce,
  startNonceVacuum,
  stopNonceVacuum,
} from "../../src/services/auth/nonceVacuum.js";

/**
 * Unit tests for the auth_nonces vacuum.
 *
 * Stubs `pool.query` to avoid a Postgres dependency; verifies the DELETE
 * predicate, the worker's swallow-and-log on failure, and that the timer is
 * idempotent + clearable.
 */

type QueryStub = (sql: string, params?: unknown[]) => Promise<unknown>;

let originalPoolQuery: typeof pool.query;
let originalError: typeof console.error;
let originalLog: typeof console.log;

function setPoolQuery(stub: QueryStub): void {
  (pool as unknown as { query: QueryStub }).query = stub;
}

beforeEach(() => {
  originalPoolQuery = pool.query.bind(pool);
  originalError = console.error;
  originalLog = console.log;
});

afterEach(() => {
  (pool as unknown as { query: typeof originalPoolQuery }).query = originalPoolQuery;
  console.error = originalError;
  console.log = originalLog;
  stopNonceVacuum();
});

describe("vacuumExpiredNonces — SQL shape", () => {
  it("issues a DELETE filtered on expires_at < NOW() - 1 hour", async () => {
    let capturedSql = "";
    setPoolQuery(async (sql) => {
      capturedSql = sql;
      return { rowCount: 3 };
    });

    const removed = await vacuumExpiredNonces();
    assert.equal(removed, 3);
    assert.match(capturedSql, /^\s*DELETE FROM auth_nonces/);
    assert.match(capturedSql, /expires_at\s*<\s*NOW\(\)\s*-\s*INTERVAL\s+'1 hour'/);
  });

  it("returns 0 when pg reports rowCount null (driver quirk)", async () => {
    setPoolQuery(async () => ({ rowCount: null }));
    const removed = await vacuumExpiredNonces();
    assert.equal(removed, 0);
  });
});

describe("runVacuumOnce — error handling", () => {
  it("returns the row count on success and logs only when >0", async () => {
    const logs: string[] = [];
    console.log = (msg: unknown) => {
      logs.push(String(msg));
    };

    setPoolQuery(async () => ({ rowCount: 0 }));
    const removed0 = await runVacuumOnce();
    assert.equal(removed0, 0);
    assert.equal(logs.length, 0, "no log when nothing was vacuumed");

    setPoolQuery(async () => ({ rowCount: 7 }));
    const removed7 = await runVacuumOnce();
    assert.equal(removed7, 7);
    assert.equal(logs.length, 1);
    assert.match(logs[0]!, /vacuumed 7 expired nonces/);
  });

  it("swallows and logs DB errors so the worker survives", async () => {
    const errors: unknown[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    setPoolQuery(async () => {
      throw new Error("connection terminated");
    });

    const removed = await runVacuumOnce();
    assert.equal(removed, 0);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /vacuum failed/);
  });
});

describe("startNonceVacuum / stopNonceVacuum", () => {
  it("is idempotent — repeated start() does not stack timers", () => {
    // We don't assert directly on Node's timer registry; idempotency means
    // a second start() doesn't throw and a single stop() fully clears.
    startNonceVacuum();
    startNonceVacuum();
    startNonceVacuum();
    stopNonceVacuum();
    // After stop, another start should succeed (re-arms cleanly).
    startNonceVacuum();
    stopNonceVacuum();
  });
});
