# check-pkg-new-version-engine

[![License][license-image]][license-url]
[![build][build-image]][build-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

- [API reference](https://fynjs.pages.dev/api/modules/check-pkg-new-version-engine) - TypeDoc
- [Markdown reference](docs/reference.md) - the full API and runtime behavior in one file. Also ships in the package.
- [GitHub](https://github.com/jchip/fynjs/tree/main/packages/check-pkg-new-version-engine)

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

[license-image]: https://img.shields.io/npm/l/check-pkg-new-version-engine.svg
[license-url]: LICENSE
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
[downloads-image]: https://img.shields.io/npm/dm/check-pkg-new-version-engine.svg
[downloads-url]: https://npm-stat.com/charts.html?package=check-pkg-new-version-engine
[npm-badge-png]: https://nodei.co/npm/check-pkg-new-version-engine.png?downloads=true&stars=true
[package-url]: https://npmjs.com/package/check-pkg-new-version-engine
