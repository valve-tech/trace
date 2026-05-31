import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, type RefObject } from "react";
import { FindBar } from "../components/debugger/SoliditySourceViewer/FindBar";

/**
 * Component tests for the in-pane find bar. The bar is pure
 * presentational + callback-driven (state lives in useFindInSource),
 * so these tests focus on (a) what renders for various match counts
 * and (b) what callbacks fire on each interaction.
 */

interface HarnessProps {
  query?: string;
  activeMatch?: number;
  matchCount?: number;
  onQueryChange?: (q: string) => void;
  onStep?: (dir: 1 | -1) => void;
  onClose?: () => void;
}

function Harness(props: HarnessProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <FindBar
      inputRef={inputRef as RefObject<HTMLInputElement | null>}
      query={props.query ?? ""}
      onQueryChange={props.onQueryChange ?? (() => {})}
      activeMatch={props.activeMatch ?? 0}
      matchCount={props.matchCount ?? 0}
      onStep={props.onStep ?? (() => {})}
      onClose={props.onClose ?? (() => {})}
    />
  );
}

describe("FindBar — rendering", () => {
  it("renders the search input, prev/next buttons, and close button", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Find in source")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous match")).toBeInTheDocument();
    expect(screen.getByLabelText("Next match")).toBeInTheDocument();
    expect(screen.getByLabelText("Close find")).toBeInTheDocument();
  });

  it("shows an empty counter when query is empty (no '0/0' yet)", () => {
    render(<Harness />);
    const counter = screen.getByTestId("find-counter");
    expect(counter.textContent).toBe("");
  });

  it("shows '0/0' when query is non-empty but matchCount is 0", () => {
    render(<Harness query="nothinginthere" matchCount={0} />);
    expect(screen.getByTestId("find-counter").textContent).toBe("0/0");
  });

  it("shows 'N/M' where N=activeMatch+1 and M=matchCount", () => {
    render(<Harness query="count" activeMatch={1} matchCount={3} />);
    expect(screen.getByTestId("find-counter").textContent).toBe("2/3");
  });

  it("disables prev/next when matchCount is 0", () => {
    render(<Harness query="x" matchCount={0} />);
    expect(screen.getByLabelText("Previous match")).toBeDisabled();
    expect(screen.getByLabelText("Next match")).toBeDisabled();
  });

  it("enables prev/next when matchCount > 0", () => {
    render(<Harness query="x" matchCount={2} />);
    expect(screen.getByLabelText("Previous match")).not.toBeDisabled();
    expect(screen.getByLabelText("Next match")).not.toBeDisabled();
  });
});

describe("FindBar — interactions", () => {
  it("fires onQueryChange when the user types in the input", () => {
    const onQueryChange = vi.fn();
    render(<Harness onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByLabelText("Find in source"), {
      target: { value: "hello" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("hello");
  });

  it("fires onStep(1) when Enter is pressed in the input", () => {
    const onStep = vi.fn();
    render(<Harness onStep={onStep} matchCount={2} />);
    fireEvent.keyDown(screen.getByLabelText("Find in source"), {
      key: "Enter",
    });
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("fires onStep(-1) when Shift+Enter is pressed in the input", () => {
    const onStep = vi.fn();
    render(<Harness onStep={onStep} matchCount={2} />);
    fireEvent.keyDown(screen.getByLabelText("Find in source"), {
      key: "Enter",
      shiftKey: true,
    });
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it("fires onClose when Escape is pressed in the input", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText("Find in source"), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT fire onStep on other keys (e.g. plain letter)", () => {
    const onStep = vi.fn();
    render(<Harness onStep={onStep} matchCount={2} />);
    fireEvent.keyDown(screen.getByLabelText("Find in source"), { key: "a" });
    expect(onStep).not.toHaveBeenCalled();
  });

  it("fires onStep(-1) on Previous-button click", () => {
    const onStep = vi.fn();
    render(<Harness onStep={onStep} matchCount={2} />);
    fireEvent.click(screen.getByLabelText("Previous match"));
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it("fires onStep(1) on Next-button click", () => {
    const onStep = vi.fn();
    render(<Harness onStep={onStep} matchCount={2} />);
    fireEvent.click(screen.getByLabelText("Next match"));
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("fires onClose on Close-button click", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close find"));
    expect(onClose).toHaveBeenCalled();
  });
});
