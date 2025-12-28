import { describe, it } from "vitest";
import { internalNotify } from "../../src/notify-new-version.ts";

describe("notifyNewer", () => {
  it("should notify about new version", () => {
    internalNotify({ name: "test", version: "1.0.0", newVersion: "1.1.0" });
  });
});
