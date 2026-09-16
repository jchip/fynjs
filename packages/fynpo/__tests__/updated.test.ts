import { describe, it, expect, beforeAll, vi } from "vitest";
import { Updated } from "../src/updated";
import path from "path";
import { FynpoDepGraph } from "@fynpo/base";

// Mock get-updated-packages
vi.mock("../src/utils/get-updated-packages", () => ({
  getUpdatedPackages: vi.fn(),
}));

vi.mock("../src/utils/recover-release-boundary", () => ({
  recoverReleaseBoundary: vi.fn(),
}));

// Mock logger
vi.mock("../src/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getUpdatedPackages } from "../src/utils/get-updated-packages";
import { recoverReleaseBoundary } from "../src/utils/recover-release-boundary";
import { logger } from "../src/logger";

describe("fynpo Updated", () => {
  const dir = path.join(import.meta.dirname, "../test/sample");
  let graph: FynpoDepGraph;

  beforeAll(async () => {
    graph = new FynpoDepGraph({ cwd: path.join(import.meta.dirname, "../test/sample") });
    await graph.resolve();
  });

  it("should initialize Updated class", () => {
    const opts = { cwd: dir };
    const updated = new Updated(opts, graph);

    expect(updated.name).toBe("updated");
    expect(updated._cwd).toBe(dir);
    expect(updated._graph).toBe(graph);
    expect(updated._options).toBeDefined();
  });

  it("should handle version locks with wildcard", () => {
    const opts = { cwd: dir, versionLocks: ["*"] };
    const updated = new Updated(opts, graph);

    expect(updated._versionLockMap).toBeDefined();
  });

  it("should handle version locks with specific patterns", () => {
    const opts = { cwd: dir, versionLocks: [["name:/pkg1/"]] };
    const updated = new Updated(opts, graph);

    expect(updated._versionLockMap).toBeDefined();
  });

  it("should handle empty version locks", () => {
    const opts = { cwd: dir, versionLocks: [] };
    const updated = new Updated(opts, graph);

    expect(updated._versionLockMap).toBeDefined();
  });

  it("should merge command config overrides", () => {
    const opts = {
      cwd: dir,
      command: {
        updated: {
          someOption: "value",
        },
      },
    };
    const updated = new Updated(opts, graph);

    expect(updated._options.someOption).toBe("value");
  });

  it("should exec and handle no changed packages", async () => {
    const opts = { cwd: dir };
    const updated = new Updated(opts, graph);

    // Mock getUpdatedPackages to return empty array
    vi.mocked(getUpdatedPackages).mockReturnValue({
      pkgs: [],
      depMap: {},
      depSections: {},
      verLocks: {},
      forceUpdated: [],
      latestTag: undefined,
    });

    await updated.exec();

    expect(logger.info).toHaveBeenCalledWith("No changed packages!");

    vi.restoreAllMocks();
  });

  it("waits for boundary recovery before detecting changed packages", async () => {
    vi.clearAllMocks();
    let finishRecovery: () => void;
    vi.mocked(recoverReleaseBoundary).mockReturnValue(
      new Promise<void>((resolve) => {
        finishRecovery = resolve;
      })
    );
    vi.mocked(getUpdatedPackages).mockReturnValue({ pkgs: ["pkg1"] } as any);

    const running = new Updated({ cwd: dir }, graph).exec();
    expect(getUpdatedPackages).not.toHaveBeenCalled();

    finishRecovery();
    await running;

    expect(getUpdatedPackages).toHaveBeenCalledOnce();
  });
});
