import { internalNotify } from "../../src/notify-new-version";
test("notifyNewer", () => {
  internalNotify({ name: "test", version: "1.0.0", newVersion: "1.1.0" });
});
