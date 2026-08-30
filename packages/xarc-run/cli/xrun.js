import { xrunMain } from "./xrun-main.js";

//
// Async: task files load through `import()` so a task file can use top-level await, which
// `require` can never support. Callers must await this - bin/xrun.js does, and so must any
// programmatic caller that wants to observe the run.
//
export default xrunMain;
