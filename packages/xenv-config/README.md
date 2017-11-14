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
  zooOption: { default: false, type: "truthy" }
};

process.env.BAR_OPTION = "900";
const config = xenvConfig(spec, {zooOption: true });

expect(config).to.deep.equal({
  fooOption: false,
  barOption: 900,
  zooOption: true
});

expect(config.__$trace__).to.deep.equal({
  fooOption: { src: "default" },
  barOption: { src: "env", name: "BAR_OPTION" },
  zooOption: { src: "option" }
});
```

## API

```js
xenvConfig(spec, userConfig);
```

-   `spec` - specification of the configs
-   `userConfig` - configuration from the user (use if not declared in env)

Returns `config` object.

-   Each key that exist has the value that's determined
-   A hidden field `__$trace__` that contains data to indicate where each config key's value was determined from

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

-   Each `optionKey` specifies the name of the option
-   Its value should be an object with the following fields:
    -   `env`: the name (or array of names) of the environment varialbe(s) to check first.  If it's `true`, then use `optionKey` as the env variable name.
    -   `default`: the default value.
    -   `type`: type of the value to help convert the string from `process.env` to.
    -   `post`: callback to post process value

> All fields are `optional`, if they are all skipped, then the config option will be determined from `userConfig` only.
>
> Without either `default` or `type`, the value from `env` will remain as a string.
>
> If `env` is an array, then the first one that finds a value in `process.env` will be used.
>
> If `env` is `true`, then use `optionKey` as the name to look up from `process.env`.

### Types

When loading from `env`, in order to indicate what value to convert the string into, the type can be one of.

-   `string` - no conversion
-   `number` - (integer) convert with `parseInt(x,10)`
-   `float` - (float) convert with `parseFloat(x)`
-   `boolean` - (boolean) convert with `x === "true" || x === "yes" || x === "1" || x === "on"`
-   `truthy` - (boolean from truthy check) convert with `!!x`

> If `type` is not specified, then it'd be derived from the `default` value using `typeof`, if it's defined.

### Trace

The hidden field `__$trace__` contain data for each key to indicate where its value was determined from.

-   If the value's from env, then it's `{src: "env", name: "ENV_OPTION_NAME"}`
-   If the value's from user config, then it's `{src: "option"}`
-   If the value's from default, then it's `{src: "default"}`

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
