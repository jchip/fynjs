# @fynjs/create-monorepo

[![License][license-image]][license-url]
[![build][build-image]][build-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Supplement tool to create a new fynpo monorepo. The directory structure of a fynpo monorepo will look like:

```
fynpo-repo/
  package.json
  packages/
    package-1/
      package.json
    package-2/
      package.json
```

When run, `create-monorepo` will:

- Add `fynpo` as a dev dependency
- Create a `fynpo.json` config file (`fynpo.config.js` with `--commitlint`)
- Add `commitlint` and `husky` config if `--commitlint` is given
- Create an empty `packages` directory

## Getting Started

To create a new fynpo monorepo,

```
npx @fynjs/create-monorepo fynpo-repo
cd fynpo-repo
fyn  # Install dependencies
```

**Note**: We're naming the repo "fynpo-repo". You can name your repo anything you'd like. The npx... command creates a directory with the same name as the repo.

### Options:

**`commitlint`** : Initialize the repo with commitlint and husky configuration. This is off by default, and a simple `fynpo.json` config file is added.

To include commitlint configuration, pass `--commitlint`. A `fynpo.config.js` is added instead of `fynpo.json`.

```
npx @fynjs/create-monorepo fynpo-repo --commitlint
```

The `commitlint` configuration can also be added later by running:

```
npx fynpo init --commitlint
```

### Commitlint

#### configuration:

If `--commitlint` is given, the initialized repo will include `fynpo.config.js` with the default `commitlint` config. This can be customized as per the team's needs.

The default configuration supports commmit message in `[<semver>][feat|bug|chore] <message>` format, where:
`<semver>` can be:

- `major`
- `minor`
- `patch`
- `chore`

The format of commit type can be modified by updating the below config:

```javaScript
parserPreset: {
    parserOpts: {
        headerPattern: /^\[([^\]]+)\] ?(\[[^\]]+\])? +(.+)$/,
        headerCorrespondence: ["type", "scope", "subject"],
    },
},
```

Refer [here](https://commitlint.js.org/#/reference-configuration) for the details of commitlint configuration.

#### Commit hooks:

To add commit hook,

```
# Install Husky
npm install husky --save-dev

# Active hooks
npx husky install

# Add hook
npx husky add .husky/commit-msg 'npx --no-install fynpo commitlint --edit $1'
```

**Note**: The initialized repo will alreday have `husky` added in `devDependencies` and also `husky install` added to the `prepare` script.

#### Test:

To test the simple usage,

```
echo '[test] msg' | npx fynpo commitlint
```

To test the hook,

```
git commit -m "[patch] message"
```

[license-image]: https://img.shields.io/npm/l/@fynjs/create-monorepo.svg
[license-url]: LICENSE
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
[downloads-image]: https://img.shields.io/npm/dm/@fynjs/create-monorepo.svg
[downloads-url]: https://npm-stat.com/charts.html?package=%40fynjs%2Fcreate-monorepo
[npm-badge-png]: https://nodei.co/npm/@fynjs/create-monorepo.png?downloads=true&stars=true
[package-url]: https://npmjs.com/package/@fynjs/create-monorepo
