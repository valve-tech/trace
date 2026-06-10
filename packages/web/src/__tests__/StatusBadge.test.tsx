import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../components/primitives/StatusBadge";

/**
 * StatusBadge has three mutually-exclusive labels. `pending` is the mempool
 * case and must win over `success` — an unmined tx has no known outcome, so it
 * should never read as "Success" or "Reverted".
 */
describe("StatusBadge", () => {
  it("renders Success when success and not pending", () => {
    render(<StatusBadge success={true} />);
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("renders Reverted when not success and not pending", () => {
    render(<StatusBadge success={false} />);
    expect(screen.getByText("Reverted")).toBeInTheDocument();
  });

  it("renders Pending — overriding success — when pending", () => {
    render(<StatusBadge success={true} pending />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Success")).not.toBeInTheDocument();
  });
});
