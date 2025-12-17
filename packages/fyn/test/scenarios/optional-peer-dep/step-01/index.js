"use strict";

const logger = require("../../../../lib/logger").default;
const stripAnsiModule = require("strip-ansi");
const stripAnsi = stripAnsiModule.default || stripAnsiModule;

module.exports = {
  title: "should NOT warn about optional peer dep missing",
  verify: () => {
    // mod-f@3.0.0 has mod-a as an optional peer dependency
    // Since it's marked as optional in peerDependenciesMeta, no warning should appear
    const msg = "peer dependencies mod-a@^0.3.0 of mod-f@3.0.0 is missing";
    const warning = logger.logData.map(x => stripAnsi(x)).find(x => x.indexOf(msg) > 0);
    expect(warning).to.be.undefined;
  }
};
