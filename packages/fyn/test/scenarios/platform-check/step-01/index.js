const verifyLockedPlatformOptional = require("../verify-lock");

module.exports = {
  title: "not download/install optional package where os not match",
  verify: cwd => verifyLockedPlatformOptional(cwd, "mod-bad-os", "os")
};
