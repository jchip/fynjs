import { afterEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({ info: vi.fn(), setItemType: vi.fn() }));

vi.mock("visual-logger", () => ({
  default: class {
    info = logger.info;
    setItemType = logger.setItemType;
  }
}));

afterEach(() => {
  vi.doUnmock("ci-info");
  vi.resetModules();
  vi.clearAllMocks();
});

describe("default logger", () => {
  it.each([false, true])("reuses its logger with CI=%s", async isCI => {
    vi.resetModules();
    vi.doMock("ci-info", () => ({ isCI }));
    const { getDefaultLogger } = await import("../src/get-default-logger.js");

    const first = getDefaultLogger();
    expect(getDefaultLogger()).toBe(first);

    if (isCI) {
      expect(logger.info).toHaveBeenCalledExactlyOnceWith("visual-exec: CI env detected");
      expect(logger.setItemType).toHaveBeenCalledExactlyOnceWith("none");
    } else {
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.setItemType).not.toHaveBeenCalled();
    }
  });
});
