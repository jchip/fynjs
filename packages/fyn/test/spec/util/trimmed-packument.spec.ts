import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { verify } from "run-verify";
import {
  TRIMMED_FORMAT,
  trimPackument,
  trimmedPackumentFile,
  readTrimmedPackument,
  writeTrimmedPackument
} from "../../../lib/util/trimmed-packument";

const packument = {
  name: "mod-a",
  readme: "a long readme",
  maintainers: [{ name: "someone" }],
  "dist-tags": { latest: "1.1.0" },
  time: { "1.0.0": "2020-01-01T00:00:00.000Z", "1.1.0": "2021-01-01T00:00:00.000Z" },
  versions: {
    "1.0.0": {
      name: "mod-a",
      version: "1.0.0",
      description: "dropped",
      main: "index.js",
      engines: { node: ">=8" },
      bin: { a: "bin/a.js" },
      dependencies: { "mod-b": "^1.0.0" },
      os: [],
      scripts: { test: "vitest", postinstall: "node setup.js" },
      dist: { integrity: "sha512-x", shasum: "abc", tarball: "http://r/mod-a-1.0.0.tgz", fileCount: 3 }
    },
    "1.1.0": {
      name: "mod-a",
      version: "1.1.0",
      optionalDependencies: { "mod-c": "^2.0.0" },
      peerDependencies: { react: "*" },
      bundleDependencies: ["mod-d"],
      cpu: ["arm64"],
      deprecated: "use 2.x",
      _hasShrinkwrap: true,
      scripts: { build: "tsc" },
      dist: { integrity: "sha512-y", tarball: "http://r/mod-a-1.1.0.tgz", signatures: [{}] }
    }
  }
};

describe("trimmed-packument", function () {
  let dir;

  beforeEach(() => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-trimmed-"));
  });

  afterEach(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps only the fields fyn reads", () => {
    const t = trimPackument(packument);
    expect(Object.keys(t).sort()).toEqual(["$format", "dist-tags", "name", "time", "versions"]);
    expect(t.versions["1.0.0"]).toEqual({
      dependencies: { "mod-b": "^1.0.0" },
      os: [],
      scripts: { postinstall: "node setup.js" },
      dist: { integrity: "sha512-x", shasum: "abc", tarball: "http://r/mod-a-1.0.0.tgz" }
    });
    expect(t.versions["1.1.0"]).toEqual({
      optionalDependencies: { "mod-c": "^2.0.0" },
      peerDependencies: { react: "*" },
      bundleDependencies: ["mod-d"],
      cpu: ["arm64"],
      deprecated: "use 2.x",
      _hasShrinkwrap: true,
      dist: { integrity: "sha512-y", shasum: undefined, tarball: "http://r/mod-a-1.1.0.tgz" }
    });
  });

  it("keeps an empty os list, since the platform check tests for the key", () => {
    expect(Object.prototype.hasOwnProperty.call(trimPackument(packument).versions["1.0.0"], "os")).toBe(true);
  });

  it("writes atomically and reads back with the refresh time", () => {
    const file = trimmedPackumentFile(Path.join(dir, "not-yet"), "http://r/mod-a");
    const refreshTime = Date.now() - 60 * 60 * 1000;
    return verify()
      .step(() => writeTrimmedPackument(file, packument, refreshTime))
      .step(() => readTrimmedPackument(file))
      .step(read => {
        expect(read.packument.versions["1.1.0"].deprecated).toBe("use 2.x");
        expect(read.packument.$format).toBe(undefined);
        expect(Math.abs(read.refreshTime - refreshTime)).toBeLessThan(1000);
        expect(Fs.readdirSync(Path.dirname(file)).filter(f => f.endsWith(".tmp"))).toEqual([]);
      });
  });

  it("reads nothing from a missing, corrupt, or other-format file", () => {
    const file = trimmedPackumentFile(dir, "http://r/mod-a");
    return verify()
      .step(() => readTrimmedPackument(file))
      .step(read => expect(read).toBe(undefined))
      .step(() => Fs.writeFileSync(file, "{ not json"))
      .step(() => readTrimmedPackument(file))
      .step(read => expect(read).toBe(undefined))
      .step(() => Fs.writeFileSync(file, JSON.stringify({ $format: TRIMMED_FORMAT + 1, versions: {} })))
      .step(() => readTrimmedPackument(file))
      .step(read => expect(read).toBe(undefined));
  });
});
