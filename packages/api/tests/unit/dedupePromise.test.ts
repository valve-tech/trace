import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupePromise } from "../../src/lib/dedupePromise.js";

/**
 * Resolvable promise + counter — lets a test pause "the underlying work"
 * and observe how many times the factory was actually invoked.
 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("dedupePromise", () => {
  it("collapses concurrent calls for the same key into one factory invocation", async () => {
    const inFlight = new Map<string, Promise<number>>();
    const work = deferred<number>();
    let calls = 0;
    const factory = () => {
      calls++;
      return work.promise;
    };

    const a = dedupePromise(inFlight, "k", factory);
    const b = dedupePromise(inFlight, "k", factory);
    const c = dedupePromise(inFlight, "k", factory);

    assert.equal(calls, 1, "factory ran exactly once for the burst");
    assert.equal(inFlight.size, 1, "exactly one in-flight entry");

    work.resolve(42);
    assert.equal(await a, 42);
    assert.equal(await b, 42);
    assert.equal(await c, 42);
  });

  it("releases the in-flight entry after settle so the next call runs fresh", async () => {
    const inFlight = new Map<string, Promise<number>>();
    let calls = 0;
    const factory = async () => {
      calls++;
      return calls;
    };

    const first = await dedupePromise(inFlight, "k", factory);
    // settle hooks run as microtasks — wait one tick so the .finally cleanup lands.
    await Promise.resolve();
    const second = await dedupePromise(inFlight, "k", factory);

    assert.equal(first, 1);
    assert.equal(second, 2, "second call after settle gets its own invocation");
    assert.equal(inFlight.size, 0, "map is empty after settle");
  });

  it("keys are independent — different keys never share a promise", async () => {
    const inFlight = new Map<string, Promise<string>>();
    const aWork = deferred<string>();
    const bWork = deferred<string>();

    const a = dedupePromise(inFlight, "a", () => aWork.promise);
    const b = dedupePromise(inFlight, "b", () => bWork.promise);

    assert.equal(inFlight.size, 2);

    bWork.resolve("B");
    aWork.resolve("A");

    assert.equal(await a, "A");
    assert.equal(await b, "B");
  });

  it("releases on rejection so a retry starts fresh", async () => {
    const inFlight = new Map<string, Promise<number>>();
    let calls = 0;
    const factory = async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return 7;
    };

    await assert.rejects(
      () => dedupePromise(inFlight, "k", factory),
      /boom/,
    );
    // microtask tick for the .finally cleanup
    await Promise.resolve();
    assert.equal(inFlight.size, 0, "entry is released after rejection");

    const retried = await dedupePromise(inFlight, "k", factory);
    assert.equal(retried, 7, "retry invokes the factory again and succeeds");
  });
});
