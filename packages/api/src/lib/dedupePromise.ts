/**
 * Collapse concurrent calls for the same key into a single in-flight
 * promise. The entry is cleared as soon as the promise settles, so the
 * NEXT call (after settle) starts fresh — successful results should be
 * memoized externally (e.g. a persistent cache); failures are not held.
 *
 * Typical use: an expensive async lookup (RPC, DB) where a burst of
 * parallel callers would otherwise each fire the underlying work.
 *
 *   const cache = new Map<string, Promise<T>>();
 *   const result = await dedupePromise(cache, key, () => slowFetch(key));
 */
export function dedupePromise<T>(
  inFlight: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = factory();
  inFlight.set(key, promise);
  // `.finally(...)` returns a new promise chain; if the original rejects,
  // that chain becomes an unhandled rejection unless something subscribes.
  // `.then(cleanup, cleanup)` settles the side-chain ourselves while
  // leaving the original `promise` untouched for callers to await.
  const cleanup = () => {
    inFlight.delete(key);
  };
  promise.then(cleanup, cleanup);
  return promise;
}
