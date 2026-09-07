"use strict";

const DrainQueue = require("../../lib/drain-queue");

describe("DrainQueue", function() {
  it("should reset data if all consumed", () => {
    const dq = new DrainQueue();

    dq.add("a");
    dq.add("b");
    expect(dq._index).to.equal(0);
    expect(dq._data.length).to.equal(2);
    dq.get();
    dq.get();
    expect(dq._index).to.equal(0);
    expect(dq._data.length).to.equal(0);
  });
});
