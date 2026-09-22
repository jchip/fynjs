import { describe, it, expect, vi } from "vitest";
import { LocalPkgBuilder } from "../../lib/local-pkg-builder";

describe("LocalPkgBuilder", function() {
  it.each([
    { forceInstall: true, hasScript: "build", name: "dependency", scheduled: true },
    { forceInstall: false, hasScript: "build", name: "dependency", scheduled: false },
    { forceInstall: true, hasScript: undefined, name: "dependency", scheduled: false },
    { forceInstall: true, hasScript: "build", name: "consumer", scheduled: false }
  ])("schedules unchanged local package builds: %j", async ({ forceInstall, hasScript, name, scheduled }) => {
    const builder = new LocalPkgBuilder({
      fyn: {
        _options: { forceInstall },
        _pkg: { name: "consumer" },
        getLocalPkgInstall: async () => ({ localBuild: false, hasScript, pkgJson: { name } })
      }
    });
    const addItem = vi.fn();
    builder._promiseQ = { addItem } as any;
    const item = { fullPath: "/local-package" };

    await builder.addItem(item);

    expect(addItem).toHaveBeenCalledTimes(scheduled ? 1 : 0);
  });

  it("reports local scan failures to item waiters without rejecting start", async () => {
    const error = new Error("scan failed");
    const item = { fullPath: "/missing/local-package" };
    const builder = new LocalPkgBuilder({
      localsByDepth: [[item]],
      fyn: {
        getLocalPkgInstall: async () => {
          throw error;
        }
      }
    });

    await builder.start();
    const result = await builder.waitForItem(item.fullPath);

    expect(result.error).toBe(error);
  });
});
