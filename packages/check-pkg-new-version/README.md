[![NPM version][npm-image]][npm-url] [![Build Status][build-image]][build-url]

# check-pkg-new-version

Let a published CLI tell its users when a newer version of itself exists.

It fetches the package's dist-tags from the registry, compares them against the version the user is running, and calls you back when there's something newer. Checks are throttled - the result is cached on disk, so a CLI can call this on every run without hitting the registry every time.

This package is the batteries-included version: it reads the registry URL and auth token out of the user's `.npmrc` and does the HTTP itself. If you'd rather supply those yourself, use [check-pkg-new-version-engine] directly - this package re-exports everything from it.

## Install

```bash
npm install check-pkg-new-version
```

## Usage

```js
import { checkPkgNewVersion } from "check-pkg-new-version";

await checkPkgNewVersion({
  pkg: { name: "my-cli", version: "1.2.3" },
  notifyNewVersion: ({ name, version, newVersion }) => {
    console.log(`${name} ${newVersion} is available (you have ${version})`);
  }
});
```

## API

### `checkPkgNewVersion(options): Promise<any>`

| option | type | description |
| --- | --- | --- |
| `pkg` | `{ name, version }` | **required** - the package and the version currently running |
| `notifyNewVersion` | `(data) => void` | called with `{ name, version, newVersion }` when a newer version is found |
| `checkInterval` | `number` | milliseconds to wait before checking the registry again |
| `saveMetaDir` | `string` | where to cache check metadata; defaults to `os.tmpdir()` |
| `checkTag` | `string` | dist-tag to compare against instead of `latest` |
| `npmConfig` | `object` | npm config to use; read from the user's `.npmrc` when omitted |
| `fetchJSON` | `(url, options) => Promise` | override the HTTP fetch |
| `checkIsNewer` | `(pkg, distTags, tag) => CheckResult` | override the "is this newer" comparison |

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).

[check-pkg-new-version-engine]: https://github.com/jchip/fynjs/tree/main/packages/check-pkg-new-version-engine
[npm-image]: https://badge.fury.io/js/check-pkg-new-version.svg
[npm-url]: https://npmjs.org/package/check-pkg-new-version
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
