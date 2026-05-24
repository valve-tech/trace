import { useState, useEffect } from "react";

/** PulseChain. gib.show serves token art at /image/<chainId>/<address>. */
const DEFAULT_CHAIN_ID = 369;

interface Props {
  address: string;
  /** Defaults to PulseChain (369). */
  chainId?: number;
  /** Used for the fallback glyph + alt text when no image is available. */
  symbol?: string;
  /** Pixel size of the square. */
  size?: number;
  className?: string;
}

/**
 * Token logo via gib.show, with a graceful fallback. gib.show returns 404
 * for unknown tokens, so on any load error we render a square bearing the
 * symbol's first character (or a coin glyph) instead of a broken image.
 *
 * Square, not circular — matches the platform's `border-radius: 0` aesthetic.
 */
export function TokenImage({
  address,
  chainId = DEFAULT_CHAIN_ID,
  symbol,
  size = 20,
  className = "",
}: Props) {
  const [errored, setErrored] = useState(false);

  // Reset the error gate when the token changes, so a previously-failed image
  // doesn't strand a different token on its fallback.
  useEffect(() => setErrored(false), [address, chainId]);

  const box = { width: size, height: size } as const;

  if (errored || !address) {
    const glyph = symbol?.trim()?.[0]?.toUpperCase();
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 font-semibold ${className}`}
        style={{
          ...box,
          fontSize: size * 0.5,
          backgroundColor: "var(--color-accent-muted)",
          color: "var(--color-accent)",
        }}
        aria-label={symbol ?? "token"}
      >
        {glyph ?? "◈"}
      </span>
    );
  }

  return (
    <img
      src={`https://gib.show/image/${chainId}/${address}`}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      alt={symbol ?? "token"}
      className={`shrink-0 object-cover ${className}`}
      style={box}
    />
  );
}
