const Fs = require("fs");
const Path = require("path");
/* global expect */ // vitest global (globals: true); vitest cannot be require()d from CJS

module.exports = {
  title: "should handle a fynpo monorepo",
  pkgDir: "@scope/pkg-2",
  timeout: 10000,
  async before(cwd, scenarioDir) {
    try {
      Fs.unlinkSync(Path.join(scenarioDir, ".fynpo-data.json"));
    } catch (_err) {
      //
    }
  },
  async verify(cwd, scenarioDir) {
    const fynData = JSON.parse(Fs.readFileSync(Path.join(scenarioDir, ".fynpo-data.json")));
    const eData = JSON.parse(Fs.readFileSync(Path.join(__dirname, "_fynpo-data.json")));
    expect(fynData.indirects).toStrictEqual(eData.indirects);
  }
};
