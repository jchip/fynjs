const Fs = require("fs");
const Path = require("path");
const assert = require("assert").strict;

const aliases = {
  "alias-a": "npm:mod-a@^1.1.0",
  "alias-a-old": "npm:mod-a@0.4.5",
  "@alias/mod-b": "npm:mod-b@2.0.0",
};

module.exports = {
  title: "adds and installs registry packages under alias names",
  getArgs(options) {
    return []
      .concat(options.baseArgs)
      .concat([
        `--reg=${options.registry}`,
        "--layout=detail",
        "add",
        "--no-audit",
        ...Object.entries(aliases).map(([name, specifier]) => `${name}@${specifier}`),
      ]);
  },
  verify(cwd) {
    const pkg = JSON.parse(Fs.readFileSync(Path.join(cwd, "package.json")));
    const aliasPkg = JSON.parse(
      Fs.readFileSync(Path.join(cwd, "node_modules/alias-a/package.json")),
    );
    assert.deepEqual(pkg.dependencies, aliases);
    assert.equal(aliasPkg.name, "mod-a");
    assert.equal(aliasPkg._from, "alias-a@npm:mod-a@^1.1.0");
    assert.equal(
      JSON.parse(Fs.readFileSync(Path.join(cwd, "node_modules/@alias/mod-b/package.json"))).name,
      "mod-b",
    );
  },
};
