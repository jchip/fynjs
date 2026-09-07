"use strict";

const getCompletion = require("../../lib/completion");

describe("completion", function () {
  it("should emit close for node.js 8", () => {
    const completion = getCompletion(8);

    const f = {
      emit(e) {
        return e;
      }
    };

    expect(completion.emitClose(f)).to.equal("close");
  });

  it("should not emit close for node.js > 8", () => {
    const f = {
      emit(e) {
        return e;
      }
    };

    [10, 12, 14].forEach(v => {
      const completion10 = getCompletion(v);
      expect(completion10.emitClose(f)).to.equal(undefined);
    });
  });

  it("should not call destroy for node.js 14", () => {
    const f = {
      destroy() {
        return "destroy";
      }
    };
    expect(getCompletion(14).destroy(f)).to.equal(undefined);
  });

  it("should  call destroy for node.js < 14", () => {
    const f = {
      destroy() {
        return "destroy";
      }
    };
    [8, 10, 12].forEach(v => {
      expect(getCompletion(v).destroy(f)).to.equal("destroy");
    });
  });
});
