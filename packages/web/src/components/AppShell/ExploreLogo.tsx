/**
 * Explore product mark — a traced route through nodes: the multichain
 * tx-tracing / exploration motif. Noir treatment: light line + nodes via
 * `currentColor` (no fill disc), so it inherits the surrounding text color. The
 * destination node is drawn larger to read as the "found" endpoint. Replaces
 * the former purple PulseLogo; distinct from ValveLogo (the company mark).
 *
 * To reintroduce an accent later (e.g. amber on the endpoint), give the last
 * <circle> its own `className`/`fill` — everything else stays mono.
 */
export function ExploreLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      role="img"
      aria-label="Explore"
    >
      <polyline
        points="6,11 15,5 26,12 17,27"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="11" r="2.6" fill="currentColor" />
      <circle cx="15" cy="5" r="2.6" fill="currentColor" />
      <circle cx="26" cy="12" r="2.6" fill="currentColor" />
      <circle cx="17" cy="27" r="3.6" fill="currentColor" />
    </svg>
  );
}
