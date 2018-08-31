[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url]
[![Dependency Status][daviddm-image]][daviddm-url] [![devDependency Status][daviddm-dev-image]][daviddm-dev-url]

# xenv-config

Load config from env, user config, or default spec.

## Install

```bash
$ npm i xenv-config --save
```

## Usage

```js
const xenvConfig = require("xenv-config");
const spec = {
  fooOption: { env: "FOO_OPTION", default: false },
  barOption: { env: "BAR_OPTION", type: "number" },
  zooOption: { default: false, type: "truthy" },
  jsonOption: { env: "JSON_OPTION", type: "json" }
};

process.env.BAR_OPTION = "900";
process.env.JSON_OPTION = "{b:90}";
const config = xenvConfig(spec, { zooOption: true, jsonOption: { a: 50 } });

expect(config).to.deep.equal({
  fooOption: false,
  barOption: 900,
  zooOption: true,
  jsonOption: { a: 50, b: 90 }
});

expect(config.__$trace__).to.deep.equal({
  fooOption: { src: "default" },
  barOption: { src: "env", name: "BAR_OPTION" },
  zooOption: { src: "option" },
  jsonOption: { src: "env,option" }
});
```

## API

```js
xenvConfig(spec, userConfig, options);
```

- `spec` - specification of the configs
- `userConfig` - configuration from the user (use if not declared in env)
- `options` - options

Returns `config` object.

- Each key that exist has the value that's determined
- A hidden field `__$trace__` that contains data to indicate where each config key's value was determined from

`options`:

- `_env` - Object that represents environment instead of `process.env`
- `merge` - function to merge `json` object instead of using `Object.assign`

## Spec

The spec is a JSON object with the following format:

```js
{
  "<optionKey>": {
    env: "ENV_VAR_NAME",
    default: <default_value>,
    type: "<type>",
    post: (val, trace) => {}
  }
}
```

- Each `optionKey` specifies the name of the option
- Its value should be an object with the following fields:
  - `env`: the name (or array of names) of the environment varialbe(s) to check first. If it's `true`, then use `optionKey` as the env variable name.
  - `default`: the default value or a function to return the default value.
  - `type`: indicate how to interpret and convert the string from `process.env`.
  - `post`: callback to post process value

> All fields are `optional`, if they are all skipped, then the config option will be determined from `userConfig` only.
>
> Without either `default` or `type`, the value from `env` will remain as a string.
>
> If `default` is a function, then `type` must be defined or it will be `string`.
>
> If `env` is an array, then the first one that finds a value in `process.env` will be used.
>
> If `env` is `true`, then use `optionKey` as the name to look up from `process.env`.

### Types

When loading from `env`, in order to indicate what value to convert the string into, the type can be one of.

- `string` - no conversion
- `number` - (integer) convert with `parseInt(x,10)`
- `float` - (float) convert with `parseFloat(x)`
- `boolean` - (boolean) convert with `x === "true" || x === "yes" || x === "1" || x === "on"`
- `truthy` - (boolean from truthy check) convert with `!!x`
- `json` - (JSON) parsed with `JSON.parse`

> If `type` is not specified, and `default` exist and not a function, then `typeof default` will be used.

### Trace

The hidden field `__$trace__` contain data for each key to indicate where its value was determined from.

- If the value's from env, then it's `{src: "env", name: "ENV_OPTION_NAME"}`
- If the value's from user config, then it's `{src: "option"}`
- If the value's from default, then it's `{src: "default"}`

### json Type

`json` type is slightly different.

- If `default` is an object like `{}`, then type is detected to be `json`, unless spec has `type` explicitly.
- Values from all three sources are combined in the following order `env`, `option`, `default`.
- It uses `Object.assign` to combine values unless you pass in a `merge` function in options. For example, merge from `lodash`.
- `trace.src` would be a comma separate list of them. For example, `"env,option"`, `"env,option,default"`, or `"option,default"`

## Option Orders

The order of source to check are:

1.  The `env` if it's defined in the spec and `process.env` contains the variable
2.  The value from `userConfig` directly if it contains the `optionKey`
3.  The default value from spec if it's declared
4.  Nothing

[travis-image]: https://travis-ci.org/jchip/xenv-config.svg?branch=master
[travis-url]: https://travis-ci.org/jchip/xenv-config
[npm-image]: https://badge.fury.io/js/xenv-config.svg
[npm-url]: https://npmjs.org/package/xenv-config
[daviddm-image]: https://david-dm.org/jchip/xenv-config/status.svg
[daviddm-url]: https://david-dm.org/jchip/xenv-config
[daviddm-dev-image]: https://david-dm.org/jchip/xenv-config/dev-status.svg
[daviddm-dev-url]: https://david-dm.org/jchip/xenv-config?type=dev
