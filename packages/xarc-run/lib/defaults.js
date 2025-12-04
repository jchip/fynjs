"use strict";

const SERIAL_SYM = Symbol("serial");
const CONCURRENT_SYM = Symbol("concurrent");

module.exports = {
  NAMESPACE: "/",
  NS_SEP: "/",
  SERIAL_SIG: [".", "-s", "--serial", "--ser", SERIAL_SYM],
  CONCURRENT_SIG: ["--concurrent", "-c", "--conc", CONCURRENT_SYM],
  ANON_SHELL_SIG: ["~$", "~@"],
  ANON_SHELL_OPT_SIG: [`~(`],
  ANON_SHELL_OPT_CLOSE_SIG: [`)$`, ")@"],
  SHELL_FLAGS: ["tty", "spawn", "sync", "noenv", "npm"],
  STR_ARRAY_SIG: "~[",
  CONCURRENT_SYM,
  SERIAL_SYM,
  STOP_SYM: Symbol("xrun.stop"),
  INTERNALS: Symbol("xrun.internals")
};
