import { expect } from "chai";
import instance from "../../lib/xrun-instance.js";
import XRun from "../../lib/xrun.js";

describe("xrun-instance", function() {
  let originalInstance;

  beforeEach(function() {
    // Store the original instance
    originalInstance = instance._xrun;
  });

  afterEach(function() {
    // Restore the original instance
    instance._xrun = originalInstance;
  });

  it("should return an instance equal to ._xrun", function() {
    expect(instance.xrun).to.equal(instance._xrun);
  });

  it("should handle _xrun = null then return valid instance from .xrun", function() {
    instance._xrun = null;

    const xrunInstance = instance.xrun;
    expect(xrunInstance).to.be.instanceOf(XRun);
    expect(xrunInstance).to.equal(instance._xrun);
  });

  it("should create new instance on reset() and return it from .xrun", function() {
    const oldInstance = instance._xrun;

    instance.reset();
    expect(instance._xrun).to.be.instanceOf(XRun);
    expect(instance._xrun).to.not.equal(oldInstance);
    expect(instance.xrun).to.equal(instance._xrun);
  });
});
