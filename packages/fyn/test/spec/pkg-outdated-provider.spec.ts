import Fs from "fs";
import Os from "os";
import Path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PkgOutdatedProvider from "../../lib/pkg-outdated-provider";

describe("pkg-outdated-provider", () => {
  let dir: string;

  beforeEach(() => {
    dir = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-outdated-")));
  });

  afterEach(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const install = (name: string, version: string) => {
    const pkgDir = Path.join(dir, "node_modules", name);
    Fs.mkdirSync(pkgDir, { recursive: true });
    Fs.writeFileSync(Path.join(pkgDir, "package.json"), JSON.stringify({ name, version }));
  };

  const meta = (versions: string[], latest: string) => ({
    versions: Object.fromEntries(
      versions.map((version) => [version, { name: "fixture", version }]),
    ),
    "dist-tags": { latest },
  });

  const makeProvider = (
    pkg: Record<string, unknown>,
    metas: Record<string, unknown>,
    fynOptions: Record<string, unknown> = {},
  ) => {
    const fetchMeta = vi.fn(async (item) => metas[item.resolutionName]);
    const fyn = {
      _pkg: pkg,
      _initializePkg: vi.fn(async () => undefined),
      getOutputDir: (name = "") => Path.join(dir, "node_modules", name),
      pkgSrcMgr: { fetchMeta },
      ...fynOptions,
    };
    return { provider: new PkgOutdatedProvider({ fyn }), fetchMeta };
  };

  it("reports distinct current, wanted, and latest versions for direct dependencies", async () => {
    install("alpha", "1.0.0");
    install("current", "1.0.0");
    const { provider } = makeProvider(
      {
        dependencies: { alpha: "^1.0.0", current: "^1.0.0" },
        devDependencies: { types: "^2.0.0" },
        optionalDependencies: { optional: "^3.0.0" },
      },
      {
        alpha: meta(["1.0.0", "1.2.0", "2.0.0"], "2.0.0"),
        current: meta(["1.0.0"], "1.0.0"),
        types: meta(["2.0.0", "2.1.0"], "2.1.0"),
        optional: meta(["3.0.0"], "3.0.0"),
      },
    );

    expect(await provider.getOutdated()).toStrictEqual({
      records: [
        {
          name: "alpha",
          type: "prod",
          requested: "^1.0.0",
          current: "1.0.0",
          wanted: "1.2.0",
          latest: "2.0.0",
        },
        {
          name: "optional",
          type: "optional",
          requested: "^3.0.0",
          current: null,
          wanted: "3.0.0",
          latest: "3.0.0",
        },
        {
          name: "types",
          type: "dev",
          requested: "^2.0.0",
          current: null,
          wanted: "2.1.0",
          latest: "2.1.0",
        },
      ],
      skipped: [],
    });
  });

  it("uses dist-tags for requested tags and latest", async () => {
    install("tagged", "1.0.0");
    const tagged = meta(["1.0.0", "2.0.0", "4.0.0"], "2.0.0");
    tagged["dist-tags"].next = "4.0.0";
    const { provider } = makeProvider({ dependencies: { tagged: "next" } }, { tagged });

    expect((await provider.getOutdated()).records[0]).toMatchObject({
      wanted: "4.0.0",
      latest: "2.0.0",
    });
  });

  it("uses the latest tag as the wanted ceiling when it satisfies the range", async () => {
    install("tagged", "1.0.0");
    const { provider } = makeProvider(
      { dependencies: { tagged: "*" } },
      { tagged: meta(["1.0.0", "2.0.0", "4.0.0"], "2.0.0") },
    );

    expect((await provider.getOutdated()).records[0]).toMatchObject({
      wanted: "2.0.0",
      latest: "2.0.0",
    });
  });

  it("honors the configured lock time when latest is outside the range", async () => {
    install("alpha", "1.0.0");
    const alpha = meta(["1.0.0", "1.2.0", "2.0.0"], "2.0.0");
    Object.assign(alpha, {
      time: {
        "1.0.0": "2024-01-01T00:00:00.000Z",
        "1.2.0": "2024-03-01T00:00:00.000Z",
        "2.0.0": "2024-04-01T00:00:00.000Z",
      },
    });
    const { provider } = makeProvider(
      { dependencies: { alpha: "^1.0.0" } },
      { alpha },
      { lockTime: new Date("2024-02-01T00:00:00.000Z") },
    );

    expect((await provider.getOutdated()).records[0]).toMatchObject({
      wanted: "1.0.0",
      latest: "2.0.0",
    });
  });

  it("filters exact names, including scoped packages", async () => {
    const { provider, fetchMeta } = makeProvider(
      { dependencies: { alpha: "^1.0.0", "@scope/pkg": "^2.0.0" } },
      {
        alpha: meta(["1.0.0"], "1.0.0"),
        "@scope/pkg": meta(["2.0.0"], "2.0.0"),
      },
    );

    const result = await provider.getOutdated({ packages: ["@scope/pkg"] });

    expect(result.records.map((record) => record.name)).toStrictEqual(["@scope/pkg"]);
    expect(fetchMeta).toHaveBeenCalledTimes(1);
    await expect(provider.getOutdated({ packages: ["missing"] })).rejects.toThrow(
      'dependency "missing" is not declared',
    );
  });

  it("fetches an alias target but reports its declared name", async () => {
    install("compat", "2.0.0");
    const { provider, fetchMeta } = makeProvider(
      { dependencies: { compat: "npm:real-compat@^2.0.0" } },
      { "real-compat": meta(["2.0.0", "2.1.0", "3.0.0"], "3.0.0") },
    );

    expect((await provider.getOutdated()).records).toStrictEqual([
      {
        name: "compat",
        resolvedName: "real-compat",
        type: "prod",
        requested: "npm:real-compat@^2.0.0",
        current: "2.0.0",
        wanted: "2.1.0",
        latest: "3.0.0",
      },
    ]);
    expect(fetchMeta.mock.calls[0][0].resolutionName).toBe("real-compat");
  });

  it("skips local and URL dependencies without fetching registry metadata", async () => {
    const { provider, fetchMeta } = makeProvider(
      {
        dependencies: {
          local: "file:../local",
          git: "github:owner/repo",
          remote: "https://example.com/pkg.tgz",
        },
      },
      {},
    );

    expect(await provider.getOutdated()).toStrictEqual({
      records: [],
      skipped: ["git", "local", "remote"],
    });
    expect(fetchMeta).not.toHaveBeenCalled();
  });

  it("skips effective fyn local overrides", async () => {
    const localDir = Path.join(dir, "local-alpha");
    Fs.mkdirSync(localDir);
    const { provider, fetchMeta } = makeProvider(
      {
        dependencies: { alpha: "^1.0.0" },
        fyn: { dependencies: { alpha: "./local-alpha" } },
      },
      {},
      { cwd: dir, fynlocal: true },
    );

    expect(await provider.getOutdated()).toStrictEqual({ records: [], skipped: ["alpha"] });
    expect(fetchMeta).not.toHaveBeenCalled();
  });

  it("skips matching fynpo packages selected by fynlocal", async () => {
    const resolvePackage = vi.fn(() => ({ name: "alpha", version: "1.1.0", path: "alpha" }));
    const { provider, fetchMeta } = makeProvider(
      { dependencies: { alpha: "^1.0.0" } },
      {},
      {
        fynlocal: true,
        isFynpo: true,
        checkNoFynLocal: () => false,
        _fynpo: {
          config: {},
          graph: { getPackageByName: () => ({ name: "alpha" }), resolvePackage },
        },
      },
    );

    expect(await provider.getOutdated()).toStrictEqual({ records: [], skipped: ["alpha"] });
    expect(resolvePackage).toHaveBeenCalledWith("alpha", "^1.0.0", false);
    expect(fetchMeta).not.toHaveBeenCalled();
  });

  it("skips optional dependencies that do not support the current platform", async () => {
    const optional = meta(["1.0.0"], "1.0.0");
    optional.versions["1.0.0"].os = [`!${process.platform}`];
    const { provider } = makeProvider(
      { optionalDependencies: { optional: "^1.0.0" } },
      { optional },
    );

    expect(await provider.getOutdated()).toStrictEqual({ records: [], skipped: ["optional"] });
  });

  it("does not report a current dependency when latest is absent", async () => {
    install("alpha", "1.0.0");
    const withoutLatest = meta(["1.0.0"], "1.0.0");
    delete withoutLatest["dist-tags"].latest;
    const { provider } = makeProvider(
      { dependencies: { alpha: "^1.0.0" } },
      { alpha: withoutLatest },
    );

    expect(await provider.getOutdated()).toStrictEqual({ records: [], skipped: [] });
  });

  it("waits for every metadata request to settle before reporting a failure", async () => {
    let finishBeta: ((value: unknown) => void) | undefined;
    const beta = new Promise((resolve) => {
      finishBeta = resolve;
    });
    const fetchMeta = vi.fn((item) =>
      item.resolutionName === "alpha" ? Promise.reject(new Error("registry failed")) : beta,
    );
    const provider = new PkgOutdatedProvider({
      fyn: {
        _pkg: { dependencies: { alpha: "^1.0.0", beta: "^1.0.0" } } as any,
        _initializePkg: vi.fn(async () => undefined),
        getOutputDir: (name = "") => Path.join(dir, "node_modules", name),
        pkgSrcMgr: { fetchMeta },
      },
    });

    let caught: Error | undefined;
    const checking = provider.getOutdated().catch((error) => {
      caught = error;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(caught).toBeUndefined();

    finishBeta?.(meta(["1.0.0"], "1.0.0"));
    await checking;
    expect(caught?.message).toBe(
      'failed to retrieve registry metadata for "alpha": registry failed',
    );
  });
});
