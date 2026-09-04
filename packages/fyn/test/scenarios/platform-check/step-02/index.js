const verifyLockedPlatformOptional = require("../verify-lock");

module.exports = {
  title: "not download/install optional package where cpu not match",
  verify: cwd => verifyLockedPlatformOptional(cwd, "mod-bad-cpu", "cpu")
};
