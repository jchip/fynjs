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
    "prepublishOnly": "...",
    "prepack": "publish-util-prepack",
    "postpack": "publish-util-postpack"
  },
  "publishUtil": {
    "remove": [
      "devDependencies",
      { "scripts": ["test", "coverage", "build", "prepublishOnly"] }
    ],
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

## `publishUtil` configs:

You can configure some behaviors with `publishUtil` in your `package.json`.

| Config            | Description                                                  | Default |
| ----------------- | ------------------------------------------------------------ | ------- |
| `remove`          | array of keys and nesting keys to remove from `package.json` |         |
| `keep`            | array of keys and nesting keys to keep from `package.json`.  |         |
| `removeExtraKeys` | remove top level non-standard fields.                        | `true`  |
| `autoPostPack`    | insert `scripts.postpack` if it's missing.                   | `true`  |

- `publishUtil` is removed automatically.
- `scripts.prepack` is removed automatically. Add it to `publishUtil.keep` to keep it:

```json
{
  "publishUtil": {
    "keep": [{ "scripts": ["prepack"] }]
  }
}
```

- Can't remove `scripts.postpack` because npm needs that to restore `package.json`.

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
