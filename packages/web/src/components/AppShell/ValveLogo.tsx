/**
 * Valve City corporate mark — hub + six trapezoidal spokes (the valve wheel).
 * Ported from the monorepo brand asset (packages/web/public/logo.svg). Uses
 * `currentColor` so it inherits whatever text color it sits in (e.g. the muted
 * "by …" byline in the top bar). This is the company mark — distinct from
 * PulseLogo, the Explore product mark.
 */
const SPOKE = "238,206 274,206 296,46 216,46";

export function ValveLogo({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      fill="currentColor"
      role="img"
      aria-label="Valve City"
    >
      <circle cx="256" cy="256" r="60" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <polygon key={deg} points={SPOKE} transform={`rotate(${deg} 256 256)`} />
      ))}
    </svg>
  );
}
