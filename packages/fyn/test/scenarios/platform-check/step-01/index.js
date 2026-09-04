const verifyLockedPlatformOptional = require("../verify-lock");

module.exports = {
  title: "not download/install optional package where os not match",
  // mod-bad-os depends on mod-c, which must be recorded in the lock but must NOT be installed -
  // a package skipped on os/cpu records its deps without resolving them. nm-tree.yaml is the
  // other half of that assertion: mod-c must not appear in it.
  verify: cwd => verifyLockedPlatformOptional(cwd, "mod-bad-os", "os", { "mod-c": "^2.0.0" })
};
