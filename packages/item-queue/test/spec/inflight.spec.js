"use strict";

const Inflight = require("../../lib/inflight");

describe("inflight", function() {
  it("should add item with start and check time from NOW", () => {
    const now = Date.now();
    const ifl = new Inflight();

    ifl.add("test", "hello");
    expect(ifl.get("test")).to.equal("hello");

    expect(ifl.getStartTime("test"), "start time should be now or after").to.not.below(now);
    expect(ifl.getCheckTime("test"), "check time should be now or after").to.not.below(now);
    expect(ifl.getStartTime("foo")).to.equal(undefined);
    expect(ifl.getCheckTime("foo")).to.equal(undefined);
  });

  it("should handle start and elapse time", done => {
    const ifl = new Inflight();

    expect(ifl.elapseTime()).to.equal(-1);
    // with now
    const now = Date.now();
    ifl.add("test", "hello", now - 5);
    expect(ifl.get("test")).to.equal("hello");
    expect(ifl.elapseTime("test", now)).to.equal(5);
    // without now
    ifl.add("foo", "bar");
    setTimeout(() => {
      expect(ifl.elapseTime("foo")).to.not.below(10);
      done();
    }, 10);
  });

  it("should remove item", () => {
    const ifl = new Inflight();
    expect(ifl.isEmpty).to.equal(true);

    ifl.add("foo", "bar");
    expect(ifl.isEmpty).to.equal(false);
    ifl.add("test", "hello");
    expect(ifl.count).to.equal(2);
    expect(ifl.get("foo")).to.equal("bar");
    expect(ifl.get("test")).to.equal("hello");

    ifl.remove("test");
    expect(ifl.count).to.equal(1);

    expect(ifl.get("test")).to.equal(undefined);
    ifl.remove("foo");
    expect(ifl.get("foo")).to.equal(undefined);

    expect(ifl.count).to.equal(0);
    expect(ifl.isEmpty).to.equal(true);
  });

  it("should handle last check time", done => {
    const ifl = new Inflight();
    ifl.add("test", "hello");
    setTimeout(() => {
      expect(ifl.lastCheckTime("test")).to.be.not.below(10);
      expect(ifl.elapseCheckTime("test")).to.be.not.below(10);
      // bad item
      expect(ifl.lastCheckTime("foo")).to.equal(-1);

      // with now provided
      const now = Date.now();
      ifl.resetCheckTime().resetCheckTime("test", now - 5);
      expect(ifl.elapseCheckTime("test", now)).to.equal(5);
      // without now
      ifl.resetCheckTime("test");
      expect(ifl.elapseCheckTime("test")).to.equal(0);
      done();
    }, 10);
  });
});
