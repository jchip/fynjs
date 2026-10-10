"use strict";

const { lockedVersions, updateArgs } = require("../update-helpers");
const assert = require("assert").strict;

module.exports = {
  title: "update with no names should update everything",
  getArgs: options => updateArgs(options, []),
  verify(cwd) {
    assert.deepEqual(lockedVersions(cwd), { "mod-a": ["1.1.2"], "mod-g": ["3.0.11"], "mod-i": ["1.0.0"] });
  }
};
