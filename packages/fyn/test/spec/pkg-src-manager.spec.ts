/* eslint-disable */

import Fs from "fs";
import Yaml from "js-yaml";
import Path from "path";
import _ from "lodash";
import xsh from "xsh";
import { expect } from "chai";
import Fyn from "../../lib/fyn";
import PkgSrcManager from "../../lib/pkg-src-manager";
import mockNpm from "../fixtures/mock-npm";

describe("pkg-src-manager", function() {
  let fynCacheDir;

  let server;
  before(() => {
    return mockNpm({ logLevel: "warn" }).then(s => (server = s));
  });

  after(() => {
    return server.stop();
  });

  beforeEach(() => {
    fynCacheDir = Path.join(__dirname, `../.tmp_${Date.now()}`);
  });

  afterEach(() => {
    xsh.$.rm("-rf", fynCacheDir);
  });

  it.skip("should save meta cache with etag", () => {
    const host = `localhost:${server.info.port}`;
    const mgr = new PkgSrcManager({
      registry: `http://${host}`,
      fynCacheDir,
      fyn: {}
    });
    return mgr
      .fetchMeta({
        name: "mod-a",
        semver: ""
      })
      .then(meta => {
        expect(meta.fynFo.etag).to.exist;
      });
  });

  it.skip("should handle 304 when fetching meta that's already in local cache", () => {
    const host = `localhost:${server.info.port}`;
    const options = {
      registry: `http://${host}`,
      fynCacheDir,
      fyn: {}
    };
    let etag;
    let mgr = new PkgSrcManager(options);
    return mgr
      .fetchMeta({
        name: "mod-a",
        semver: ""
      })
      .then(meta => {
        expect(meta.fynFo.etag).to.exist;
        etag = meta.fynFo.etag;
        return new PkgSrcManager(options).fetchMeta({
          name: "mod-a",
          semver: ""
        });
      })
      .then(meta => {
        expect(meta.fynFo.etag).to.exist;
        expect(meta.fynFo.etag).to.equal(etag);
      });
  });
});
