import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { listActions, createAction, updateAction } from "../api/actions";
import { DEFAULT_CHAIN_ID } from "../lib/chains";

/**
 * The actions client threads the chosen chain through the `?chainid=N`
 * dispatcher param (same contract as the alerts client): the default chain
 * omits the param so existing requests stay byte-identical; a non-default
 * chain appends it. Updates intentionally send NO chainid — the backend
 * keeps the action on its existing chain so an edit can't migrate it.
 */

const PAYLOAD = {
  name: "a",
  code: "",
  triggerType: "block",
  triggerConfig: {},
};

const ACTION = {
  ...PAYLOAD,
  id: 1,
  chainid: 943,
  secretKeys: [],
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

function stubFetch(): { url: () => string; body: () => string } {
  let capturedUrl = "";
  let capturedBody = "";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body ?? "");
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({
        ok: true,
        action: ACTION,
        actions: [],
        stats: { total: 0, active: 0, todayExecutions: 0 },
      }),
    } as Response;
  });
  return { url: () => capturedUrl, body: () => capturedBody };
}

describe("actions client chain scoping", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("listActions appends ?chainid for a non-default chain", async () => {
    const cap = stubFetch();
    await listActions(943);
    expect(cap.url()).toMatch(/[?&]chainid=943\b/);
  });

  it("listActions omits chainid for the default chain (and when omitted)", async () => {
    const cap = stubFetch();
    await listActions(DEFAULT_CHAIN_ID);
    expect(cap.url()).not.toContain("chainid");
    await listActions();
    expect(cap.url()).not.toContain("chainid");
  });

  it("createAction appends ?chainid for a non-default chain, not in the body", async () => {
    const cap = stubFetch();
    await createAction(PAYLOAD, 1);
    expect(cap.url()).toMatch(/[?&]chainid=1\b/);
    expect(JSON.parse(cap.body())).not.toHaveProperty("chainid");
  });

  it("createAction omits chainid for the default chain", async () => {
    const cap = stubFetch();
    await createAction(PAYLOAD, DEFAULT_CHAIN_ID);
    expect(cap.url()).not.toContain("chainid");
  });

  it("updateAction never sends a chainid (backend keeps the existing chain)", async () => {
    const cap = stubFetch();
    await updateAction(1, PAYLOAD);
    expect(cap.url()).not.toContain("chainid");
    expect(JSON.parse(cap.body())).not.toHaveProperty("chainid");
  });
});
