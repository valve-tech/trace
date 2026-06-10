import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { listAlerts, createAlert, updateAlert } from "../api/alerts";
import { DEFAULT_CHAIN_ID } from "../lib/chains";

/**
 * The alerts client threads the chosen chain through the `?chainid=N`
 * dispatcher param (same contract as createFork): the default chain omits
 * the param so existing requests stay byte-identical; a non-default chain
 * appends it. Updates intentionally send NO chainid — the backend keeps the
 * alert on its existing chain so an edit can't migrate it.
 */

const PAYLOAD = {
  name: "a",
  type: "address_activity" as const,
  conditions: { address: "0x1111111111111111111111111111111111111111" },
  notifications: [],
  enabled: true,
  cooldown_seconds: 60,
};

const ALERT = { ...PAYLOAD, id: 1, chainid: 943, last_triggered_at: null, created_at: "", updated_at: "" };

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
        alert: ALERT,
        alerts: [],
        stats: { total: 0, active: 0, triggered_today: 0 },
      }),
    } as Response;
  });
  return { url: () => capturedUrl, body: () => capturedBody };
}

describe("alerts client chain scoping", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("listAlerts appends ?chainid for a non-default chain", async () => {
    const cap = stubFetch();
    await listAlerts(943);
    expect(cap.url()).toMatch(/[?&]chainid=943\b/);
  });

  it("listAlerts omits chainid for the default chain (and when omitted)", async () => {
    const cap = stubFetch();
    await listAlerts(DEFAULT_CHAIN_ID);
    expect(cap.url()).not.toContain("chainid");
    await listAlerts();
    expect(cap.url()).not.toContain("chainid");
  });

  it("createAlert appends ?chainid for a non-default chain, not in the body", async () => {
    const cap = stubFetch();
    await createAlert(PAYLOAD, 1);
    expect(cap.url()).toMatch(/[?&]chainid=1\b/);
    expect(JSON.parse(cap.body())).not.toHaveProperty("chainid");
  });

  it("createAlert omits chainid for the default chain", async () => {
    const cap = stubFetch();
    await createAlert(PAYLOAD, DEFAULT_CHAIN_ID);
    expect(cap.url()).not.toContain("chainid");
  });

  it("updateAlert never sends a chainid (backend keeps the existing chain)", async () => {
    const cap = stubFetch();
    await updateAlert(1, PAYLOAD);
    expect(cap.url()).not.toContain("chainid");
    expect(JSON.parse(cap.body())).not.toHaveProperty("chainid");
  });
});
