"use strict";

const { resetLocalBuild, verifyLocalBuild } = require("../local-build");

module.exports = {
  title: "should run build on a local dep",
  buildLocal: true,
  before: resetLocalBuild,
  verify: verifyLocalBuild
};
