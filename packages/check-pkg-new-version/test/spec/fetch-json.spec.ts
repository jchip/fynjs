import { describe, it, expect } from "vitest";
import { internalFetchJSON } from "../../src/fetch-json.ts";

describe("internalFetchJSON", () => {
  it("should return {} when the request fails", async () => {
    expect(await internalFetchJSON("not-a-valid-url", {})).toEqual({});
  });
});
