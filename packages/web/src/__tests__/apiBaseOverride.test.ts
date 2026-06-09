import { describe, it, expect, beforeEach } from "vitest";
import {
  API_BASE_OVERRIDE_KEY,
  getApiBaseOverride,
  setApiBaseOverride,
  clearApiBaseOverride,
} from "../lib/apiBase";

describe("apiBase override writer/reader", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when no override is stored", () => {
    expect(getApiBaseOverride()).toBeNull();
  });

  it("persists a normalized origin and reads it back", () => {
    const saved = setApiBaseOverride("https://explore.valve.city/some/path");
    expect(saved).toBe("https://explore.valve.city");
    expect(localStorage.getItem(API_BASE_OVERRIDE_KEY)).toBe(
      "https://explore.valve.city",
    );
    expect(getApiBaseOverride()).toBe("https://explore.valve.city");
  });

  it("rejects non-http(s) input and writes nothing", () => {
    expect(setApiBaseOverride("javascript:alert(1)")).toBeNull();
    expect(setApiBaseOverride("not a url")).toBeNull();
    expect(setApiBaseOverride("")).toBeNull();
    expect(localStorage.getItem(API_BASE_OVERRIDE_KEY)).toBeNull();
  });

  it("clears a stored override", () => {
    setApiBaseOverride("http://localhost:10100");
    expect(getApiBaseOverride()).toBe("http://localhost:10100");
    clearApiBaseOverride();
    expect(getApiBaseOverride()).toBeNull();
    expect(localStorage.getItem(API_BASE_OVERRIDE_KEY)).toBeNull();
  });

  it("ignores a poisoned (non-http) stored value on read", () => {
    localStorage.setItem(API_BASE_OVERRIDE_KEY, "data:text/html,evil");
    expect(getApiBaseOverride()).toBeNull();
  });
});
