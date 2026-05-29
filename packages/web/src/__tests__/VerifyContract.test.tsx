import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VerifyContract from "../components/VerifyContract";

/**
 * Smoke tests for the verify form. Validates the two-call submit/check
 * cycle against the Etherscan-shaped dispatcher and the rendering of
 * pass/fail states. Wrapped in MemoryRouter so the component's
 * `useSearchParams` hook resolves.
 */

const ADDRESS = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const STANDARD_JSON = JSON.stringify({
  language: "Solidity",
  sources: { "Foo.sol": { content: "contract Foo {}" } },
  settings: {},
});

function renderForm() {
  return render(
    <MemoryRouter initialEntries={[`/verify?address=${ADDRESS}`]}>
      <VerifyContract />
    </MemoryRouter>,
  );
}

interface FetchRoute {
  matches: (req: { url: string; init?: RequestInit }) => boolean;
  body: unknown;
}

/** Sequence-matching stub — calls match by route predicate, FIFO. */
function stubFetchSequence(routes: FetchRoute[]): void {
  const queue = [...routes];
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input, init?: RequestInit) => {
      const url = String(input);
      const idx = queue.findIndex((r) => r.matches({ url, init }));
      if (idx < 0) {
        throw new Error(`No route matched ${init?.method ?? "GET"} ${url}`);
      }
      const route = queue.splice(idx, 1)[0]!;
      return {
        ok: true,
        status: 200,
        json: async () => route.body,
      } as Response;
    },
  );
}

async function fillAndSubmit(): Promise<void> {
  const compilerInput = screen.getByDisplayValue(/v0\.8\.20\+commit/);
  fireEvent.change(compilerInput, {
    target: { value: "v0.8.20+commit.a1b79de6" },
  });

  const sourceTextarea = document.querySelector("textarea") as HTMLTextAreaElement;
  fireEvent.change(sourceTextarea, { target: { value: STANDARD_JSON } });

  const submitButton = screen.getByRole("button", { name: /^Verify$/ });
  fireEvent.click(submitButton);
}

describe("VerifyContract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefills the address field from ?address= query param", () => {
    renderForm();
    const addressInput = screen.getByPlaceholderText("0x…") as HTMLInputElement;
    expect(addressInput.value).toBe(ADDRESS);
  });

  it("submits to the dispatcher and shows Pass on success", async () => {
    stubFetchSequence([
      {
        matches: ({ url, init }) =>
          url === "/api" && init?.method === "POST",
        body: { status: "1", message: "OK", result: "guid-abc123" },
      },
      {
        matches: ({ url, init }) =>
          url.startsWith("/api?") && url.includes("checkverifystatus") &&
            (init?.method === undefined || init.method === "GET"),
        body: { status: "1", message: "OK", result: "Pass - Verified" },
      },
    ]);

    renderForm();
    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/Verification succeeded/)).toBeTruthy(),
    );
    expect(screen.getByText(/Pass - Verified/)).toBeTruthy();
  });

  it("shows Fail when checkverifystatus returns status=0", async () => {
    stubFetchSequence([
      {
        matches: ({ init }) => init?.method === "POST",
        body: { status: "1", message: "OK", result: "guid-xyz" },
      },
      {
        matches: ({ url }) => url.includes("checkverifystatus"),
        body: {
          status: "0",
          message: "NOTOK",
          result: "Fail - deployed bytecode does not match",
        },
      },
    ]);

    renderForm();
    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/Verification failed/)).toBeTruthy(),
    );
    expect(screen.getByText(/deployed bytecode does not match/)).toBeTruthy();
  });

  it("shows Fail and skips the check when submit returns status=0", async () => {
    stubFetchSequence([
      {
        matches: ({ init }) => init?.method === "POST",
        body: {
          status: "0",
          message: "NOTOK",
          result: "Unsupported codeformat — only 'solidity-standard-json-input' is accepted",
        },
      },
    ]);

    renderForm();
    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/Verification failed/)).toBeTruthy(),
    );
    expect(screen.getByText(/Unsupported codeformat/)).toBeTruthy();
  });
});
