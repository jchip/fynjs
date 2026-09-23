import { describe, it, expect, vi } from "vitest";
import { signal, verify } from "run-verify";
import { LocalPkgBuilder } from "../../lib/local-pkg-builder";

describe("LocalPkgBuilder", function() {
  it("waits for builds that are still being discovered", () => {
    const firstBuildFinished = signal<void>();
    const secondScanStarted = signal<void>();
    const secondBuildStarted = signal<void>();
    let releaseScan!: () => void;
    let releaseBuild!: () => void;
    const scanGate = new Promise<void>(resolve => {
      releaseScan = resolve;
    });
    const buildGate = new Promise<void>(resolve => {
      releaseBuild = resolve;
    });
    const first = { fullPath: "/first-package" };
    const second = { fullPath: "/second-package" };
    const builder = new LocalPkgBuilder({
      // start() reverses dependency order, so first is discovered before second.
      localsByDepth: [[second, first]],
      fyn: {
        _options: { forceInstall: false },
        _pkg: { name: "consumer" },
        getLocalPkgInstall: async (fullPath: string) => {
          if (fullPath === second.fullPath) {
            secondScanStarted.resolve();
            await scanGate;
          }
          return { localBuild: true, hasScript: "build", pkgJson: { name: fullPath } };
        }
      }
    });
    const processItem = vi.spyOn(builder, "processItem").mockImplementation(async item => {
      if (item === first) {
        firstBuildFinished.resolve();
      } else {
        secondBuildStarted.resolve();
        await buildGate;
      }
    });
    let start: Promise<void> | undefined;
    let done: Promise<void> | undefined;
    let settled = false;

    return verify({
      timeout: 1000,
      signals: { firstBuildFinished, secondScanStarted, secondBuildStarted },
      cleanup: async () => {
        releaseScan();
        releaseBuild();
        await start;
        await done;
      }
    })
      .step(() => {
        start = builder.start();
      })
      .awaiting(firstBuildFinished)
      .awaiting(secondScanStarted)
      .step(() => {
        done = builder.waitForDone();
        expect(done).toBeInstanceOf(Promise);
        done.then(() => {
          settled = true;
        });
      })
      .step(() => releaseScan())
      .awaiting(secondBuildStarted)
      .step(() => expect(settled).toBe(false))
      .step(() => releaseBuild())
      .step(() => done!)
      .step(() => expect(processItem).toHaveBeenCalledTimes(2));
  });

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
