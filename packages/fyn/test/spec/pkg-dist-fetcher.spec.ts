/* eslint-disable */

import { describe, it, beforeAll, afterAll } from "vitest";
import Fs from "fs";
import Yaml from "js-yaml";
import Path from "path";
import Fyn from "../../lib/fyn";
import mockNpm from "../fixtures/mock-npm";
import { expect } from "chai";
import _ from "lodash";
import PkgDepLinker from "../../lib/pkg-dep-linker";
import xsh from "xsh";
import logger from "../../lib/logger";

describe("pkg-dist-fetcher", function() {
  logger._logLevel = 999;
  const fynDir = Path.join(__dirname, `../.tmp_${Date.now()}`);

  let server;
  beforeAll(() => {
    return mockNpm({ port: 0, logLevel: "warn" }).then(s => (server = s));
  });

  afterAll(() => {
    xsh.$.rm("-rf", fynDir);
    if (server) {
      return server.stop();
    }
  });

  it("should fetch package tarballs for pkg-a fixture", { timeout: 10000 }, () => {
    const registry = `http://localhost:${server.info.port}`;
    const targetDir = `xout_${Date.now()}`;
    const fyn = new Fyn({
      opts: {
        registry,
        pkgFile: Path.join(__dirname, "../fixtures/pkg-a/package.json"),
        cwd: fynDir,
        targetDir,
        fynDir,
        ignoreDist: true
      }
    });
    // TODO: verify tarballs actually fetched
    return fyn.resolveDependencies().then(() => fyn.fetchPackages());
  });
});
