import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SourceViewer } from "../../src/components/SourceViewer.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLE = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "",
  "contract Vault {",
  "    function deposit() external payable {}",
  "}",
].join("\n");

describe("SourceViewer — rendering", () => {
  it("renders one row per line and shows the line count + filename", () => {
    render(<SourceViewer source={SAMPLE} filename="Vault.sol" language="Solidity" />);
    expect(screen.getByText("Vault.sol")).toBeDefined();
    expect(screen.getByText("Solidity")).toBeDefined();
    // 6 lines in SAMPLE
    expect(screen.getByText(/6 lines/)).toBeDefined();
    expect(document.querySelectorAll("[data-line]")).toHaveLength(6);
  });

  it("falls back to 'Source' when no filename is given and omits the language badge", () => {
    render(<SourceViewer source="x" />);
    expect(screen.getByText("Source")).toBeDefined();
    // No language passed → no badge text
    expect(screen.queryByText("Solidity")).toBeNull();
  });

  it("uses singular 'line' for a one-line source", () => {
    render(<SourceViewer source="only one line" />);
    expect(screen.getByText(/1 line$/)).toBeDefined();
  });

  it("renders a zero-width placeholder for empty lines so the row keeps height", () => {
    render(<SourceViewer source={SAMPLE} />);
    const rows = document.querySelectorAll("[data-line]");
    const blankRow = rows[2]!; // SAMPLE line 3 is empty
    expect(blankRow.textContent).toContain("​");
  });
});

describe("SourceViewer — highlight", () => {
  it("marks the requested line and annotates the header", () => {
    render(<SourceViewer source={SAMPLE} highlightLine={4} />);
    const target = document.querySelector('[data-line="4"]');
    expect(target?.getAttribute("data-highlighted")).toBe("true");
    expect(screen.getByText(/line 4 highlighted/)).toBeDefined();
    // Other lines do not carry the marker.
    expect(
      document.querySelector('[data-line="1"]')?.getAttribute("data-highlighted"),
    ).toBeNull();
  });

  it("tolerates an out-of-range highlight line without crashing or marking", () => {
    render(<SourceViewer source={SAMPLE} highlightLine={9999} />);
    expect(document.querySelector("[data-highlighted]")).toBeNull();
    expect(screen.queryByText(/highlighted/)).toBeNull();
  });

  it("tolerates a non-positive highlight line", () => {
    render(<SourceViewer source={SAMPLE} highlightLine={0} />);
    expect(document.querySelector("[data-highlighted]")).toBeNull();
  });

  it("treats null highlightLine as no highlight", () => {
    render(<SourceViewer source={SAMPLE} highlightLine={null} />);
    expect(document.querySelector("[data-highlighted]")).toBeNull();
  });
});

describe("SourceViewer — scroll behavior", () => {
  // jsdom does not implement scrollIntoView. Stub it on the prototype so
  // the "function available" branch runs, then restore in cleanup.
  function withScrollIntoView(impl: () => void): () => void {
    const proto = HTMLElement.prototype as unknown as {
      scrollIntoView?: (opts?: ScrollIntoViewOptions) => void;
    };
    const had = "scrollIntoView" in proto;
    const original = proto.scrollIntoView;
    proto.scrollIntoView = impl;
    return () => {
      if (had) proto.scrollIntoView = original;
      else delete proto.scrollIntoView;
    };
  }

  it("calls scrollIntoView when the API is available", () => {
    const calls: ScrollIntoViewOptions[] = [];
    const restore = withScrollIntoView(function (
      this: HTMLElement,
      opts?: ScrollIntoViewOptions,
    ) {
      if (opts) calls.push(opts);
    });
    try {
      render(<SourceViewer source={SAMPLE} highlightLine={5} />);
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]?.block).toBe("center");
    } finally {
      restore();
    }
  });

  it("falls back to setting scrollTop when scrollIntoView is unavailable", () => {
    // jsdom default: no scrollIntoView → fallback path runs without throwing.
    const { container } = render(
      <SourceViewer source={SAMPLE} highlightLine={3} />,
    );
    expect(container.querySelector('[data-line="3"]')).not.toBeNull();
  });

  it("does not scroll when scrollToHighlight is false", () => {
    let called = false;
    const restore = withScrollIntoView(() => {
      called = true;
    });
    try {
      render(
        <SourceViewer
          source={SAMPLE}
          highlightLine={5}
          scrollToHighlight={false}
        />,
      );
      expect(called).toBe(false);
    } finally {
      restore();
    }
  });

  it("does not scroll when no highlight line is set", () => {
    let called = false;
    const restore = withScrollIntoView(() => {
      called = true;
    });
    try {
      render(<SourceViewer source={SAMPLE} />);
      expect(called).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("SourceViewer — toggles", () => {
  it("hides the header when hideHeader is set", () => {
    render(<SourceViewer source={SAMPLE} hideHeader filename="x.sol" />);
    expect(screen.queryByText("x.sol")).toBeNull();
  });

  it("hides line numbers when hideLineNumbers is set", () => {
    const { container } = render(
      <SourceViewer source={SAMPLE} hideLineNumbers />,
    );
    // Gutter span has aria-hidden; assert none present.
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe("SourceViewer — theming", () => {
  it("applies classNames + style + className to the right slots", () => {
    const { container } = render(
      <SourceViewer
        source={SAMPLE}
        highlightLine={2}
        className="root-cls"
        style={{ borderColor: "red" }}
        classNames={{
          root: "root-2",
          header: "hdr",
          body: "bd",
          line: "ln",
          highlightedLine: "hl",
          gutter: "gt",
          code: "cd",
        }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("root-cls");
    expect(root.className).toContain("root-2");
    expect(container.querySelector(".hdr")).not.toBeNull();
    expect(container.querySelector(".bd")).not.toBeNull();
    expect(container.querySelector(".ln")).not.toBeNull();
    expect(container.querySelector(".hl")).not.toBeNull();
    expect(container.querySelector(".gt")).not.toBeNull();
    expect(container.querySelector(".cd")).not.toBeNull();
  });
});
