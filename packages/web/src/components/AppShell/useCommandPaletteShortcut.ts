import { useEffect } from "react";

/**
 * Wires the global ⌘K / Ctrl-K toggle and Escape-to-close for the command
 * palette. Returns nothing; drives the supplied state setters.
 */
export function useCommandPaletteShortcut(
  setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setPaletteOpen]);
}
