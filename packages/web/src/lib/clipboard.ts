/**
 * Copy text to the clipboard, resolving to whether it succeeded.
 *
 * The async Clipboard API (`navigator.clipboard`) only exists in a *secure
 * context* — HTTPS or localhost. Over plain http:// on a LAN / Tailscale IP it
 * is undefined, so calling it throws and nothing copies. We fall back to the
 * legacy `execCommand("copy")` via an off-screen textarea in that case.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
