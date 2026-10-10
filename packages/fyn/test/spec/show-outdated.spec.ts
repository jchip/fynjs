import { afterEach, describe, expect, it, vi } from "vitest";
import { verify } from "run-verify";

const mocks = vi.hoisted(() => ({ getOutdated: vi.fn() }));

vi.mock("../../lib/pkg-outdated-provider", () => ({
  default: class {
    getOutdated = mocks.getOutdated;
  },
}));

import showOutdated from "../../cli/show-outdated";
import logger from "../../lib/logger";

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

  it("reports when every checked dependency is up to date", () => {
    let info;
    return verify()
      .step(() => {
        mocks.getOutdated.mockResolvedValue({ records: [], skipped: ["local"], checked: 3 });
        info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
        vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      })
      .step(() => showOutdated({} as any, {}))
      .step(() => {
        expect(info).toHaveBeenCalledWith("All 3 direct dependencies are up to date");
        expect(process.stdout.write).not.toHaveBeenCalled();
      });
  });

  it("stays silent in JSON mode except for the JSON output", () => {
    let info;
    return verify()
      .step(() => {
        mocks.getOutdated.mockResolvedValue({ records: [], skipped: [], checked: 2 });
        info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
        vi.spyOn(process.stdout, "write").mockImplementation(((...args: unknown[]) => {
          (args.find((arg) => typeof arg === "function") as () => void)?.();
          return true;
        }) as typeof process.stdout.write);
      })
      .step(() => showOutdated({} as any, { json: true }))
      .step(() => {
        expect(info).not.toHaveBeenCalled();
        expect(process.stdout.write).toHaveBeenCalledWith("[]\n", expect.any(Function));
      });
  });
});
