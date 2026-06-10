/**
 * Suspense fallback for lazy-loaded routes. Mirrors the in-page loading
 * pattern used across views (accent spinner + secondary text) so a chunk
 * fetch is visually indistinguishable from a data fetch.
 */
export default function RouteFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] p-4">
      <div
        className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
        style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
      />
      <span className="text-sm theme-text-secondary">Loading…</span>
    </div>
  );
}
