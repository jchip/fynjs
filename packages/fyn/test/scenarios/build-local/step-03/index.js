"use strict";

const { resetLocalBuild, verifyLocalBuild } = require("../local-build");

module.exports = {
  title: "should install and run build when a local dep changed",
  buildLocal: true,
  forceInstall: false,
  before: resetLocalBuild,
  verify: verifyLocalBuild
};
