# publish-util

Clean up `package.json` for publishing.

Your `package.json`:

```json
{
  "name": "...",
  "version": "...",
  "description": "...",
  "scripts": {
    "test": "...",
    "coverage": "...",
    "build": "...",
    "prepack": "npm run build && publish-util-prepack",
    "postpack": "publish-util-postpack"
  },
  "publishUtil": {
    "remove": ["devDependencies", { "scripts": ["test", "coverage", "build"] }],
    "keep": ["options"]
  },
  "dependencies": {
    "react": "^17.0.0",
    "react-dom": "^17.0.0"
  },
  "devDependencies": {
    "tap": "^15.0.0",
    "publish-util": "^1.0.0"
  },
  "nyc": {
    "reporter": ["lcov", "text", "text-summary"]
  },
  "options": {}
}
```

Your `package.json` published:

```json
{
  "name": "...",
  "version": "...",
  "description": "...",
  "scripts": {
    "postpack": "publish-util-postpack"
  },
  "dependencies": {
    "react": "^17.0.0",
    "react-dom": "^17.0.0"
  },
  "options": {}
}
```

## Usage

Just install this to your module:

`npm install --save-dev publish-util`

It will automatically add `prepack` and `postpack` scripts to your package.json for you.

Out of the box it will clean up non-standard fields plus `workspaces` and `devDependencies` from your `package.json`. To keep `devDependencies`, see [details below](#removing-non-standard-fields)

## Publishing

This module offers a custom publishing script to fix some behaviors of `npm publish`.

The problem is that before any thing can process `package.json`, `npm publish` will load and upload it to the registry as packument (meta for the package).

If you want the copy of `package.json` after this module processed it to be the packument meta, then use the `do-publish` command:

`npx do-publish`

The script use whatever version of `npm` you have to do the actual work. It takes all CLI arguments that `npm publish` accepts and will pass them through.

## `publishUtil` configs:

You can configure some behaviors with `publishUtil` in your `package.json`.

| Config            | Description                                                             | Default |
| ----------------- | ----------------------------------------------------------------------- | ------- |
| `rename`          | object map of keys to rename from `package.json` - done before `remove` |         |
| `remove`          | array of keys and nesting keys to remove from `package.json`            |         |
| `keep`            | array of keys and nesting keys to keep from `package.json`.             |         |
| `removeExtraKeys` | remove top level non-standard fields.                                   | `true`  |
| `autoPostPack`    | insert `scripts.postpack` if it's missing.                              | `true`  |
| `silent`          | don't log message with console                                          | `false` |

- `publishUtil` is removed automatically.

- `rename` details. The rename config is an object map, with key being the field to rename, and its value being the target name.

For example:

```json
{
  "publishUtil": {
    "rename": {
      "scripts.foo": "scripts.renamedFoo"
    }
  }
}
```

- `scripts.prepublishOnly` is removed automatically if it's just `"publish-util-prepublishonly"`. Add it to `publishUtil.keep` to keep it:

```json
{
  "publishUtil": {
    "keep": [{ "scripts": ["prepublishOnly"] }]
  }
}
```

- Can't remove `scripts.postpack` because npm needs that to restore `package.json`.

- Can't use `prepack` because `npm publish` uploads meta data before that so if you want to publish with different `dependencies` it will break.

### `remove` and `keep` formats

The config `remove` and `keep` can be:

- Array of strings that are either keys in the object or a regular expression to match keys in the object.
- To specify a regular expression, use the format `"/<regexp>/<flags>"`
- To reach into a nesting object, use an object of keys and array of keys/regex.

For example, to reach `pkg.key1.key2`, and `pkg.key1.xyz*`:

```json
[
  {
    "key1": ["key2", "/xyz.*/"]
  }
]
```

## Removing Non-standard Fields

These top level fields are considered standard fields:

- all top level fields defined at [npm package.json](https://docs.npmjs.com/cli/v7/configuring-npm/package-json), except `workspaces` and `devDependencies`
- And these fields: `module`

Any extra top level fields not in the standard fields are automatically removed.

- To skip this automatic removal, set `publishUtil.removeExtraKeys` to `false`.
- You can also add fields to `publishUtil.keep` to avoid them being removed.

For example, to keep `devDependencies`:

```json
{
  "publishUtil": {
    "keep": ["devDependencies"]
  }
}
```

## Auto `postpack` Insert

If you don't have a `scripts.postpack`, then it's automatically added with `"publish-util-postpack"` to ensure your package.json is restored after packing.

- Set `publishUtil.autoPostPack` to `false` to skip this.

## Dry Run and Verify

To verify `package.json` content.

1. Run `npm run prepack`
2. Inspect `package.json` to ensure everything is in order
3. Run `npm run postpack` to restore `package.json`
4. Inspect `package.json` again

Using `npm pack`

1. Run `npm pack`
2. Inspect `package.json` to ensure it's not modified
3. Look for the `.tgz` file and extract it
4. Inspect `package/package.json` to ensure it's as expected.
