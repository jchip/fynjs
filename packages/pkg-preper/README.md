[![NPM version][npm-image]][npm-url] [![Build Status][build-image]][build-url]

# pkg-preper

A [pacote] `dirPacker` that runs a package's `prepare` script before packing it.

When a dependency is installed from a git URL rather than the registry, what's in the repo is often source that has to be built first - that's what a `prepare` script is for. pacote will pack such a directory for you, but it won't build it. `pkg-preper` supplies the packer that does: it reads the directory's `package.json`, and if there's a `prepare` script it hands the directory to your `installDependencies` callback (which installs deps and runs the script) before packing the result into a tarball with [npm-packlist] and [tar].

Extracted from [fyn], which uses it for git dependencies.

## Install

```bash
npm install pkg-preper
```

## Usage

```js
import PkgPreper from "pkg-preper";
import pacote from "pacote";

const preper = new PkgPreper({
  tmpDir: "/path/to/tmp",
  installDependencies: async (dir, message) => {
    // install the package's dependencies in `dir` and run its prepare script
  }
});

await pacote.tarball(spec, { dirPacker: preper.getDirPackerCb() });
```

## API

### `new PkgPreper({ tmpDir, installDependencies })`

- **`tmpDir`** - directory for [cacache]'s scratch space while packing
- **`installDependencies(dir, message)`** - called only when the package has a `prepare` script; return a promise

### `preper.getDirPackerCb()`

Returns the `(manifest, dir) => stream` callback to hand to pacote as its `dirPacker`.

### `preper.depDirPacker(manifest, dir)`

The packer itself, if you'd rather call it directly. Returns a stream of the packed tarball; emits `prepared` once the prepare step is done and `error` if anything fails.

### `preper.packDirectory(manifest, dir, target)`

Packs `dir` into a tarball at `target`, without the prepare step. Files are chosen by npm-packlist, so the package's `files` field and ignore rules are honored.

## License

The packing code is adapted from the [npm CLI](https://github.com/npm/cli/blob/latest/lib/commands/pack.js), so this package is licensed under the [Artistic License 2.0](./LICENSE), same as the original.

[fyn]: https://github.com/jchip/fynjs/tree/main/packages/fyn
[pacote]: https://www.npmjs.com/package/pacote
[npm-packlist]: https://www.npmjs.com/package/npm-packlist
[tar]: https://www.npmjs.com/package/tar
[cacache]: https://www.npmjs.com/package/cacache
[npm-image]: https://badge.fury.io/js/pkg-preper.svg
[npm-url]: https://npmjs.org/package/pkg-preper
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
