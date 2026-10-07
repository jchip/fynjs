# @jchip/error reference

`@jchip/error` has helpers to print readable error stacks and an `AggregateError` subclass whose `stack` includes the stacks of the errors it holds. It has no runtime dependencies. ESM only (`"type": "module"`). Requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`.

## Imports

```js
import { cleanErrorStack, aggregateStack, aggregateErrorStack, AggregateError } from "@jchip/error";
import * as jerr from "@jchip/error";
```

Everything is a named export from the package root. There is no default export and there are no subpaths (only `@jchip/error/package.json`).

Runtime exports: `cleanErrorStack`, `aggregateStack`, `aggregateErrorStack`, `AggregateError`.

There are no exported types besides the class `AggregateError`. The options type `CleanErrorStackOptions` is declared but not exported, so it cannot be imported by name. Use `Parameters<typeof cleanErrorStack>[1]` to get it.

## `cleanErrorStack(error, options?)`

```ts
type CleanErrorStackOptions = {
  replacePath?: false | string;
  ignorePathFilter?: (string | RegExp)[];
};

function cleanErrorStack(
  error: Error,
  options?: CleanErrorStackOptions
): string
```

Returns the text of `error.stack` with noisy stack frames removed and file paths shortened. The error is not modified.

| option | type | default | behavior |
| --- | --- | --- | --- |
| `replacePath` | `false \| string` | `` `${process.cwd()}/` `` (evaluated on each call) | Substring removed from each kept frame path. Ignored when `false`, empty, or exactly 1 character long (so `"/"` does nothing). |
| `ignorePathFilter` | `(string \| RegExp)[]` | `[]` | Extra filters. A frame whose path matches any filter is dropped. Added to the built-in filter. |

Input selection:

- The text cleaned is `error.stack`, or `error.message` when the stack is falsy.
- When neither exists (or `error` is `null`/`undefined`), nothing is cleaned and the return value is `String(error && (error.stack || error.message))`. That gives `"null"` for `null` and `"undefined"` for `undefined`, `{}`, or an object with empty stack and no message.
- A non-string, truthy `stack` (such as a number) throws `TypeError` (`stack.split is not a function`).

Processing, applied to each line of the text split on `"\n"`:

1. A line that does not match `/ {4,}at/` (an `at` preceded by 4 or more spaces anywhere in the line) is kept unchanged. This covers the message line, `Require stack:` lines, and frames indented with fewer than 4 spaces.
2. A frame line is parsed with `/( {4,}at)([^\(]+\()([^\)]+\))(.*)/`. Group 3 is the "path": the text after the first `(` up to and including the first `)`. Groups 2 and 4 are the text before and after it.
3. The frame is dropped when parsing fails. That removes frames without parentheses, such as `    at /abs/file.js:1:1` and `    at node:internal/main/run_main_module:17:47`, and any `at file:///...` frame.
4. The frame is dropped unless the path contains `scheme://` (regex `/[^:]+:\/\//`) or `path.isAbsolute(path)` is true. That removes relative paths and `node:internal/...` frames. `path.isAbsolute` is platform specific, so a Windows path like `C:\a\b.js` is dropped on POSIX.
5. Backslashes in the path are replaced with `/`.
6. The frame is dropped if the path matches the built-in filter or any `ignorePathFilter` entry. A `RegExp` entry uses `path.match(re)`. A string entry uses `path.includes(str)`. Falsy entries (such as `""`) are skipped.
7. Otherwise `replacePath` (when usable) is removed with `String.prototype.replace` (first occurrence only, plain string, not a regex). It can match anywhere in the path, not only at the start.
8. The kept frame is rebuilt as group1 + group2 + new path + group4. Because the path comes from group 3, everything after the first `)` (group 4) is unchanged. A `)` inside a file path ends the path early.
9. After mapping, empty strings are removed and lines are joined with `"\n"`. Blank lines in the original text (including a trailing newline) are therefore removed too.

Built-in filter (always on, checked before `ignorePathFilter`):

```
/\/node_modules.*\/(pirates\/|isomorphic-loader\/lib\/extend-require)/
```

It drops frames from the `pirates` and `isomorphic-loader` require hooks. It matches on the backslash-normalized path.

Not removed: frames from other `node_modules` packages, and any absolute path outside `replacePath`. Only `node:` internals and relative paths go by rule 4.

```js
cleanErrorStack(err);
// Error: boom
//     at run (src/app.js:10:5)
cleanErrorStack(err, { replacePath: false, ignorePathFilter: ["/node_modules/", /vitest/] });
```

## `aggregateStack(stack, errors)`

```ts
function aggregateStack(stack: string, errors: any[]): string
```

Builds a text from a top stack and a list of errors. Output is `stack`, then one entry per error, all joined with `"\n"`. Each error entry is its text with every line indented by 2 spaces (`replace(/^/gm, "  ")`, so blank lines become `"  "`).

The text of one error `e` is `e.stack`, else `e.message`, else `String(e)`. A falsy `e` gives `String(e)`. Examples: `1` gives `"1"`, `null` gives `"null"`, `{ message: "mm" }` gives `"mm"`.

Nested aggregate stacks indent again, so each nesting level adds 2 spaces.

Edge cases on `errors`:

- An array (or any object with a `map` function) is mapped. `[]` returns `stack` alone with no trailing newline.
- A falsy `errors` (`null`, `undefined`, `""`) or a value with no `map` function (such as a string or a plain object without `map`) is treated as no errors, but the result gets a trailing `"\n"`, for example `aggregateStack("t", null) === "t\n"`.
- A truthy `errors.map` that is not a function throws `TypeError`.
- `stack` is not checked. A non-string is joined as is.

## `aggregateErrorStack(error)`

```ts
function aggregateErrorStack(error: AggregateError): string
```

Returns `aggregateStack(error.__stack || error.message || String(error), error.errors)`. The parameter type is this package's `AggregateError` class.

- For an instance of this package's `AggregateError`, the top part is its saved original stack (`__stack`), which is the native stack text, including the header `AggregateError: <message>` and frames.
- For a native `globalThis.AggregateError` (or any object without `__stack`), the top part is `error.message`, falling back to `String(error)` when the message is empty. The native stack frames and the `AggregateError:` header are not used. Example: message `"msg"` yields `"msg\n  Error: e\n      at ..."`.
- The list used is `error.errors`.
- The result is computed each time. It is cached only by the `stack` getter of this package's class.

```js
console.log(aggregateErrorStack(new AggregateError([new Error("error 1")], "test")));
// AggregateError: test
//     at ...
//   Error: error 1
//       at ...
```

## `AggregateError`

```ts
class AggregateError extends globalThis.AggregateError {
  readonly name: string;   // "AggregateError"
  errors: any[];
  stack: string;
  __stack: string;
  constructor(errors?: any[], msg?: string);
}
```

An `AggregateError` whose `stack` also prints the errors it wraps. It is a subclass, not a polyfill. See "Polyfill behavior" below.

Constructor `new AggregateError(errors, msg?)`:

- `errors` must be truthy and have a callable `[Symbol.iterator]`. Otherwise it throws `TypeError` with the message `input errors must be iterable but it's ${typeof errors}`. Falsy values give `undefined`, `object` (for `null`), `number`, and so on. A truthy number (`5`) gives `number`. A string is accepted since strings are iterable.
- `msg` is the message. When omitted the message is `""`. There is no third `options` argument. `{ cause }` passed as a third argument is ignored.
- The parent constructor is called as `super(errors, msg)`.

Instance properties (all defined with `Object.defineProperty`, so `Object.keys(err)` is `[]`):

| property | attributes | value |
| --- | --- | --- |
| `name` | non-enumerable, non-writable, non-configurable own property | `"AggregateError"`. A subclass cannot override it by assignment. |
| `errors` | non-enumerable, writable, configurable | `[].concat(errors)`: a shallow copy when `errors` is an array. |
| `__stack` | non-enumerable, non-writable, non-configurable | `this.stack` read right after `super()`: the native stack text of the error. |
| `stack` | non-enumerable, configurable accessor | Getter returning `aggregateErrorStack(this)`, computed on first read and cached. |

`stack` details:

- The cache means `errors` changes made after the first read of `stack` are not reflected. Changes made before the first read are.
- Only a getter is defined. The existing native setter of the engine remains, so assigning to `err.stack` does not throw and has no effect on the getter result (observed on Node 24).
- `instanceof` works against the native class (`new AggregateError([]) instanceof globalThis.AggregateError` is `true`). A native instance is not an instance of this class.
- `console.log(err)` and `err.stack` in a debugger show the aggregate form. `cleanErrorStack(err)` therefore also cleans the nested error stacks, and the nested lines keep their 2-space indent.

Edge cases from `[].concat(errors)`, which does not iterate:

- A non-array iterable (for example `Set` or a generator) is wrapped as a single element: `new AggregateError(new Set([e])).errors` is `[Set]`, not `[e]`. The native parent receives the original iterable, but the own `errors` property replaces the native one.
- A generator is consumed by `super()` first, so `errors` ends up `[<exhausted generator>]`, and the nested stack lists `String(generator)` (`[object Generator]`).
- A string `"ab"` gives `["ab"]`, where the native class would give `["a", "b"]`.

## Polyfill behavior

- The package does not patch or define any global. Importing it has no side effects (`"sideEffects": false`).
- `AggregateError` here is a different class from `globalThis.AggregateError` (`AggregateError !== globalThis.AggregateError`). Its prototype parent is the global one.
- The module evaluates `class AggregateError extends globalThis.AggregateError` at import time. If the runtime lacks a global `AggregateError`, import throws. All supported Node versions (`engines`) have it, so there is no fallback implementation.
- Code that wants the aggregate-stack behavior must import this class explicitly. Native `AggregateError` instances are unchanged, and `aggregateErrorStack(native)` is the way to format them (see above for how the top line differs).

## README mismatches

- The README calls `AggregateError` a polyfill. In code it is a subclass of the global class and never installs itself.
- The README says Node 15+ has a built-in `AggregateError`. The code requires the global, and `engines` is Node 22 or newer.
