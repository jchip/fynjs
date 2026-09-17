import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getOutdated: vi.fn() }));

vi.mock("../../lib/pkg-outdated-provider", () => ({
  default: class {
    getOutdated = mocks.getOutdated;
  },
}));

import showOutdated from "../../cli/show-outdated";

describe("show-outdated", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for stdout to flush before returning", async () => {
    mocks.getOutdated.mockResolvedValue({
      records: [
        {
          name: "alpha",
          type: "prod",
          requested: "^1.0.0",
          current: "1.0.0",
          wanted: "1.1.0",
          latest: "1.1.0",
        },
      ],
      skipped: [],
    });

    let flushed: ((error?: Error | null) => void) | undefined;
    vi.spyOn(process.stdout, "write").mockImplementation(((...args: unknown[]) => {
      flushed = args.find((arg) => typeof arg === "function") as typeof flushed;
      return false;
    }) as typeof process.stdout.write);

    let returned = false;
    const showing = showOutdated({} as any, { json: true }).then(() => {
      returned = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(returned).toBe(false);

    flushed?.();
    await showing;
    expect(returned).toBe(true);
  });
});
