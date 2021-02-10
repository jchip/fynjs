# check-pkg-new-version-engine

Provide generic engine for npm CLI packages to check newer version.

- bundler friendly (webpack etc)
- minimal - no bloats, depend on caller to provide fetch and npm config

Example:

```js
import os from "os";
import Path from "path";
import { promises as Fs } from "fs";
import fetch from "node-fetch"; // or your favorite fetch lib
import ini from "ini";
import semver from "semver";
import { checkPkgNewVersionEngine } from "check-pkg-new-version-engine";

const myPkg = require("./package.json");

async function loadIni(dir, rcFile = ".npmrc") {
  try {
    const iniFile = Path.join(dir, rcFile);
    const iniData = await Fs.readFile(iniFile, "utf-8");
    const iniRc = ini.parse(iniData);
    return iniRc;
  } catch {
    return {};
  }
}

async function getNpmRcConfig() {
  return { ...(await loadIni(os.homedir())), ...(await loadIni(process.cwd())) };
}

async function start() {
  checkPkgNewVersionEngine({
    pkg,
    // without npm config the engine falls back to "https://registry.npmjs.org/"
    npmConfig: await getNpmRcConfig(),
    checkIsNewer: (pkg, distTags, tag) => semver.gt(distTags[tag], pkg.version),
    fetchJSON: async (url, options) => {
      const res = await fetch(url, options);
      return await res.json();
    },
  });
}
```
