import container from "./xrun-instance.js";

const xrun = container.xrun;

export default xrun;

//
// Keep `require("@fynjs/run")` returning the xrun instance itself rather than the module
// namespace, so a CommonJS task file - still a first class way to use this - does not have to
// learn about `.default` because the package moved to ESM.
//
export { xrun as "module.exports" };
