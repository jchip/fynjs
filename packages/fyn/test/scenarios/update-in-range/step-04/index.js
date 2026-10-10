"use strict";

const { updateArgs } = require("../update-helpers");
const assert = require("assert").strict;

module.exports = {
  title: "update a package that isn't locked should fail",
  getArgs: options => updateArgs(options, ["mod-x"]),
  expectFailure(err) {
    assert.match(err.message, /not found in lock data: mod-x/);
  }
};
