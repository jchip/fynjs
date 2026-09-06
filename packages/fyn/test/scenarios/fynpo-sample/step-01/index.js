const Fs = require("fs");
const Path = require("path");
/* global expect */ // vitest global (globals: true); vitest cannot be require()d from CJS

module.exports = {
  title: "should add a package from fynpo monorepo",
  pkgDir: ".ignore-dir",
  timeout: 10000,
  getArgs(options) {
    return [].concat(options.baseArgs).concat([`--layout=detail`, `add`, `../packages/pkg2`]);
  },
  async before(cwd, scenarioDir) {
    try {
      Fs.unlinkSync(Path.join(scenarioDir, ".fynpo-data.json"));
    } catch (_err) {
      //
    }
  },
  async verify(cwd, scenarioDir) {
    expect(
      Fs.existsSync(Path.join(scenarioDir, ".fynpo-data.json")),
      ".fynpo-data.json should not exist"
    ).toBe(false);
  }
};
