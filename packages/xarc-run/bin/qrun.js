#!/usr/bin/env node
process.env.XRUN_QUIET = "1";

//
// dynamic import - a static `import "./xrun.js"` is hoisted and its module body (which ends in
// a top level `await xrun()`) runs BEFORE the assignment above, so xrun never sees XRUN_QUIET.
//
await import("./xrun.js");
