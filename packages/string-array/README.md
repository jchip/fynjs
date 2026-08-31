[![NPM version][npm-image]][npm-url]

# String Array

Parse string into array of string elements.

`"[ hello, world, [ 1, [2, [ 3 ]]]]"` :arrow_right: `[ "hello", "world", [ "1", [ "2", [ "3" ]]]]`

## Install

```bash
npm i --save string-array
```

## Usage

```js
const stringArray = require("string-array");

const r1 = stringArray.parse("[]");
// r1 === { prefix: "", array: [], remain: "" }
const r2 = stringArray.parse("test[1,2,3]");
// r2 === { prefix: "test", array: ["1","2","3"], remain: "" }
```

* Elements are automatically treated as strings, so quotes `'`, `"` and backtick are taken as part of element.

* All leading and trailing whitespaces are automatically `trim`ed.

* Can't have these characters in elements: `,` `[` `]`

## Examples

* `stringArray.parse("")`:
* `stringArray.parse("[]")`:

```js
{
  prefix: "",
  array: [],
  remain: ""
}
```

* `stringArray.parse('test[1,2,"3"]')`:

```js
{
  prefix: "test",
  array: ["1","2", '"3"'],
  remain: ""
}
```

* `stringArray.parse("[hello, world, [ [ foo, bar ], 1, [ 2 ], 3 ] ] some other stuff [blah]")`:

```js
{
  prefix: "",
  array: ["hello", "world", [ ["foo", "bar"], "1", ["2"], "3" ] ],
  remain: "some other stuff [blah]"
}
```

> More samples in [test](./test/spec/index.spec.js)

## Parameters

#### `stringArray.parse(str, noPrefix, noExtra)`

* `str` - string array to be parsed
* `noPrefix` - if `true`, then do not check for a prefix
* `noExtra` - if `true`, then do not allow trailing text following a complete array in `str`

## Throws

* `AssertionError("array missing [")`
  * Also throws if `str` doesn't start with `[` and `noPrefix` is `true`
* `AssertionError("array missing ]")`
* `AssertionError("array has extra ]")`
* `AssertionError("extra data at end of array")` - if `noExtra` is `true` and there are extra text following a complete array in `str`

## License

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0)

[npm-image]: https://badge.fury.io/js/string-array.svg
[npm-url]: https://npmjs.org/package/string-array
[npm scripts]: https://docs.npmjs.com/misc/scripts
