const SERIAL_SYM = Symbol("serial");
const CONCURRENT_SYM = Symbol("concurrent");

export const NAMESPACE = "/";
export const NS_SEP = "/";
export const SERIAL_SIG = [".", "-s", "--serial", "--ser", SERIAL_SYM];
export const CONCURRENT_SIG = ["--concurrent", "-c", "--conc", CONCURRENT_SYM];
export const ANON_SHELL_SIG = ["~$", "~@"];
export const ANON_SHELL_OPT_SIG = [`~(`];
export const ANON_SHELL_OPT_CLOSE_SIG = [`)$`, ")@"];
export const SHELL_FLAGS = ["tty", "spawn", "sync", "noenv", "npm"];
export const STR_ARRAY_SIG = "~[";
export const STOP_SYM = Symbol("xrun.stop");
export const INTERNALS = Symbol("xrun.internals");

export { CONCURRENT_SYM, SERIAL_SYM };

export default {
  NAMESPACE,
  NS_SEP,
  SERIAL_SIG,
  CONCURRENT_SIG,
  ANON_SHELL_SIG,
  ANON_SHELL_OPT_SIG,
  ANON_SHELL_OPT_CLOSE_SIG,
  SHELL_FLAGS,
  STR_ARRAY_SIG,
  CONCURRENT_SYM,
  SERIAL_SYM,
  STOP_SYM,
  INTERNALS
};
