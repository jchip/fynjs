import Fs from "fs";
import Path from "path";

//
// This package's own manifest, and the directory holding it.
//
// It used to be `import myPkg from "../package.json" with { type: "json" }` in six files. That
// cannot survive the build: tsc pulls the JSON into the program and emits a COPY at
// dist/package.json, and that copy - name "@fynjs/run", `main` "./dist/lib/index.js" - then
// becomes what node's self-reference resolution finds when anything inside dist/ requires
// "@fynjs/run". It resolved to dist/dist/lib/index.js and the bin died before printing anything.
//
// Walking up to the first manifest that is actually ours works from source (lib/) and from the
// build (dist/lib/) alike, and emits no JSON.
//
const findOwnPkg = (): { json: any; dir: string } => {
  let dir = import.meta.dirname;

  for (;;) {
    const file = Path.join(dir, "package.json");
    if (Fs.existsSync(file)) {
      try {
        const json = JSON.parse(Fs.readFileSync(file, "utf8"));
        if (json.name === "@fynjs/run") {
          return { json, dir };
        }
      } catch {
        // unreadable or malformed - keep walking rather than dying at import time
      }
    }

    const parent = Path.dirname(dir);
    // walking past the filesystem root means this file is not inside its own package at all
    /* istanbul ignore next */
    if (parent === dir) {
      return { json: {}, dir: import.meta.dirname };
    }
    dir = parent;
  }
};

const own = findOwnPkg();

/** directory of this package's own manifest - the root of this copy of @fynjs/run */
export const myPkgDir = own.dir;

export default own.json;
