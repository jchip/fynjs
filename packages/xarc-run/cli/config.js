import myPkg from "../package.json" with { type: "json" };

export default {
  taskFile: "xrun-tasks.js",
  taskFileExt: ["js", "cjs", "ts", "mts", "cts", "mjs"],
  search: ["xrun-tasks", "xrun", "xclap.", "clapfile.", "clap.", "gulpfile."],
  getPkgOpt: pkg => ["xclap", "xrun", myPkg.name].find(f => pkg.hasOwnProperty(f))
};
