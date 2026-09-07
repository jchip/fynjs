import { describe, it, expect, vi } from "vitest";
import { internalNotify } from "../../src/notify-new-version.js";

describe("notifyNewer", () => {
  it("should register process.on('exit') and log update notification", () => {
    let exitCallback: (() => void) | undefined;
    const onSpy = vi.spyOn(process, "on").mockImplementation((event: string | symbol, cb: any) => {
      if (event === "exit") {
        exitCallback = cb;
      }
      return process;
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      internalNotify({ name: "my-package", version: "1.0.0", newVersion: "1.1.0" });

      expect(onSpy).toHaveBeenCalledWith("exit", expect.any(Function));
      expect(exitCallback).toBeDefined();

      exitCallback!();
      expect(logSpy).toHaveBeenCalledTimes(1);
      const logMessage = logSpy.mock.calls[0][0];
      expect(logMessage).toContain("New version 'my-package' available 1.0.0 -> 1.1.0");
      expect(logMessage).toContain("my-package@1.1.0");
    } finally {
      onSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
