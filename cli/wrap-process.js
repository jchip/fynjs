"use strict";

/** @type {WrapProcess} */
const WrapProcess = {
  exit: code => process.exit(code),
  cwd: () => process.cwd(),
  chdir: dir => process.chdir(dir)
};

module.exports = WrapProcess;
