import { describe, it, expect } from "vitest";
import { describeUnknownError } from "../../src/util/errors.js";

describe("describeUnknownError", () => {
  it("returns Error.message for Error subclasses", () => {
    expect(describeUnknownError(new Error("boom"))).toBe("boom");
    expect(describeUnknownError(new TypeError("wrong type"))).toBe("wrong type");
  });

  it("returns String(value) for non-Error throws", () => {
    expect(describeUnknownError("just a string")).toBe("just a string");
    expect(describeUnknownError(42)).toBe("42");
    expect(describeUnknownError(null)).toBe("null");
    expect(describeUnknownError({ toString: () => "stringified" })).toBe("stringified");
  });

  it("handles undefined", () => {
    expect(describeUnknownError(undefined)).toBe("undefined");
  });
});
