"use strict";

const { lockedVersions, updateArgs } = require("../update-helpers");
const assert = require("assert").strict;

module.exports = {
  title: "update mod-i should update its subtree and keep mod-a pinned",
  getArgs: options => updateArgs(options, ["mod-i"]),
  verify(cwd) {
    assert.deepEqual(lockedVersions(cwd), { "mod-a": ["1.0.0"], "mod-g": ["3.0.11"], "mod-i": ["1.0.0"] });
  }
};
