const Fs = require("fs");
const Path = require("path");
const assert = require("assert").strict;
const Yaml = require("js-yaml");

module.exports = {
  title: "reinstalls aliases from the existing lock",
  before(cwd) {
    Fs.rmSync(Path.join(cwd, "node_modules"), { recursive: true, force: true });
  },
  verify(cwd) {
    const aliasPkg = JSON.parse(
      Fs.readFileSync(Path.join(cwd, "node_modules/alias-a/package.json")),
    );
    assert.equal(aliasPkg.name, "mod-a");
    assert.equal(aliasPkg._from, "alias-a@npm:mod-a@^1.1.0");
    assert.equal(
      JSON.parse(Fs.readFileSync(Path.join(cwd, "node_modules/@alias/mod-b/package.json"))).name,
      "mod-b",
    );
    const lock = Yaml.load(Fs.readFileSync(Path.join(cwd, "fyn-lock.yaml"), "utf8"));
    assert.equal(lock.$pkg.dep["alias-a"], "npm:mod-a@^1.1.0");
    assert.equal(lock.$pkg.dep["alias-a-old"], "npm:mod-a@0.4.5");
    assert.equal(lock.$pkg.dep["@alias/mod-b"], "npm:mod-b@2.0.0");
    assert.match(lock["alias-a"]["1.1.2"]._, /\/mod-a\/-\/mod-a-1\.1\.2\.tgz$/);
  },
};
