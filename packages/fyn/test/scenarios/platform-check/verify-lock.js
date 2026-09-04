const Fs = require("fs");
const Path = require("path");
const Yaml = require("js-yaml");

/**
 * FPM-92: an optional dep skipped by the os/cpu check still gets a full lock entry - resolved
 * version, integrity, tarball, and the os/cpu that explain the skip - so a machine that cannot
 * use it resolves it from the lock alone, with no registry packument fetch (the property FPM-63
 * was filed over).
 *
 * What the entry must NOT carry is `optFailed`. That is the verdict of whichever machine ran the
 * install, and honoring another machine's copy of it made linux CI skip packages it could use
 * (FPM-67). Any reader re-derives it from the os/cpu right there on the entry.
 */
module.exports = function verifyLockedPlatformOptional(cwd, name, field) {
  const lock = Yaml.load(Fs.readFileSync(Path.join(cwd, "fyn-lock.yaml")).toString());

  const pkg = lock[name];
  expect(pkg, `${name} should be in the lock`).to.be.an("object");

  const meta = pkg["1.0.0"];
  expect(meta, `${name}@1.0.0 should be in the lock`).to.be.an("object");

  expect(meta, `${name} should not record this machine's platform verdict`).to.not.have.property(
    "optFailed"
  );
  expect(meta[field], `${name} should record its ${field}`).to.deep.equal(["foo", "bar", "blah"]);
  expect(meta._, `${name} should record its tarball`).to.contain(`/${name}/-/${name}-1.0.0.tgz`);
  expect(meta.$, `${name} should record its integrity`).to.exist;
};
