import { describe, it, expect, vi, afterEach } from "vitest";
import { copyToClipboard } from "../lib/clipboard";

function setSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", { value, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("copyToClipboard", () => {
  it("uses the async Clipboard API in a secure context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    setSecureContext(true);

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when the Clipboard API is absent (insecure context)", async () => {
    vi.stubGlobal("navigator", {});
    setSecureContext(false);
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec as unknown as typeof document.execCommand;

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when the Clipboard API throws", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });
    setSecureContext(true);
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec as unknown as typeof document.execCommand;

    await expect(copyToClipboard("x")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("returns false when both paths fail", async () => {
    vi.stubGlobal("navigator", {});
    setSecureContext(false);
    document.execCommand = (() => {
      throw new Error("denied");
    }) as unknown as typeof document.execCommand;

    await expect(copyToClipboard("x")).resolves.toBe(false);
  });
});
