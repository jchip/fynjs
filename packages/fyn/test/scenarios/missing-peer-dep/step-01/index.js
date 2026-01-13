"use strict";

const logger = require("../../../../lib/logger").default;
const stripAnsiModule = require("strip-ansi");
const stripAnsi = stripAnsiModule.default || stripAnsiModule;

module.exports = {
  title: "should warn peer dep missing",
  verify: () => {
    // New format: "Warning: peer dependencies mod-a@^0.3.0 is missing (by: mod-f@2.1.1)"
    // Search for the warning message in the log data
    const peerDep = "mod-a@^0.3.0";
    const requiringPkg = "mod-f@2.1.1";
    const logText = logger.logData.map(x => stripAnsi(x)).join(" ");
    
    // Check that the warning contains the peer dep, "is missing", "(by:", and the requiring package
    expect(logText).to.include(peerDep);
    expect(logText).to.include("is missing");
    expect(logText).to.include("(by:");
    expect(logText).to.include(requiringPkg);
  }
};
