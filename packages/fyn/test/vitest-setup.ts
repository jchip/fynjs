//
// Test color state must not depend on the invoking harness: xrun sets
// FORCE_COLOR=1 for child processes, which would make the in-process fyn CLI
// emit ANSI codes that scenario assertions matching plain text can't handle.
//
process.env.FORCE_COLOR = "0";
