import { describe, it } from "vitest";
import * as xaa from "../../src/index.ts";

describe("index", function () {
  it("should load", () => {
    return xaa.delay(20);
  });
});
