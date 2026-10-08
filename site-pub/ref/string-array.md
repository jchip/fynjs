# string-array reference

`string-array` parses a bracketed, comma separated string such as `"[a, b, [c]]"` into a nested array of strings. It has no runtime dependencies. ESM only (`"type": "module"`).

## Imports

```js
import { parse } from "string-array";
import type { ParseResult, StringArray } from "string-array";
```

Everything is a named export from the package root. There is no default export and there are no subpaths (only `string-array/package.json`). The `exports` map has a single `default` condition pointing at an ESM file.

Runtime exports: `parse`.

Type-only exports: `StringArray`, `ParseResult`.

## `StringArray`

```ts
type StringArray = string | StringArray[];
```

An element is either a string or a nested array of elements. Leaves are always strings. Quote characters are never interpreted, and no numbers or booleans are produced.

## `ParseResult`

```ts
interface ParseResult {
  prefix: string;
  array: StringArray[];
  remain: string;
}
```

| Field | Type | Behavior |
| --- | --- | --- |
| `prefix` | `string` | Trimmed text before the first `[`. `""` when there is none, when `noPrefix` is `true`, or when the input is empty. |
| `array` | `StringArray[]` | The outermost parsed array. Its items are strings or nested arrays. `[]` for empty input. |
| `remain` | `string` | Text left after the first complete top-level array, with leading whitespace and one separating `,` removed. The input is trimmed up front, so `remain` has no outer whitespace. `""` when nothing is left. |

## `parse(str, noPrefix?, noExtra?)`

```ts
function parse(str: string, noPrefix?: boolean, noExtra?: boolean): ParseResult
```

Parses one array from the start of `str` (after an optional prefix) and returns it with the prefix and the unparsed rest.

| Parameter | Type | Default | Behavior |
| --- | --- | --- | --- |
| `str` | `string` | none | Input text. Trimmed first. A non-string throws `TypeError`. |
| `noPrefix` | `boolean` | `undefined` | Only the exact value `true` disables prefix detection. Any other value, including truthy ones such as `1`, keeps it enabled. |
| `noExtra` | `boolean` | `undefined` | Only the exact value `true` makes text after the top-level array an error. Any other value allows it and returns it in `remain`. |

### Grammar

Informal, as implemented:

```
input   := ws* [ prefix ] array rest
prefix  := text before the first "[", trimmed; only when that "[" is not at index 0
array   := "[" ws* items "]"
items   := (element | array) separated by ","
element := any characters up to the next "," or "]", trimmed
rest    := ws* [ "," ws* ] remain
```

- Brackets: `[` opens an array and `]` closes it. Consecutive openers such as `[[[a]]]` nest.
- Nesting: unbounded depth. The parser is iterative, with no recursion.
- Separator: `,`. Whitespace around elements, brackets and separators is trimmed (`String.prototype.trim` semantics).
- Elements: raw text, trimmed. Quotes (`'`, `"`, backtick) stay part of the element. There is no escape character and no way to put `,` or `]` inside an element. A `[` in the middle of an element is accepted as plain text (see edge cases).
- The comma after a nested array is optional. If present directly after its `]`, it is consumed.
- Only the first top-level array is parsed. Later text is not parsed, it is returned in `remain`.

### Algorithm

1. `str` is trimmed. If the result is empty, return `{ prefix: "", array: [], remain: "" }`. This happens before any other check, so `noPrefix` and `noExtra` do not matter for empty input.
2. Unless `noPrefix === true`, find the first `[`. If its index is greater than 0, `prefix` is the text before it (trimmed) and parsing starts at that `[`. If the index is 0 or there is no `[`, `prefix` is `""` and the text is parsed as is.
3. The parse loop: if the remaining text starts with `[`, a new array opens (leading whitespace after it is skipped). Otherwise, if no array is open, it throws `array missing [`.
4. In an open array, the next element runs up to the next `,` or `]`. If neither exists it throws `array missing ]`.
5. The element is trimmed. A non-empty element is pushed. An empty element is pushed as `""` only when it ends at `,`. An empty element ending at `]` is dropped.
6. On `]`, the array closes. A single `,` that follows is consumed.
7. When the outermost array closes, the loop stops. If text remains and `noExtra === true`, it throws `extra data at end of array`. Otherwise the text is returned as `remain`.

`array` is the outermost array itself. `"[a, [b]]"` gives `array: ["a", ["b"]]`. Each call returns fresh objects.

### Non-array and unusual input

| Input | Result |
| --- | --- |
| `""` or whitespace only | `{ prefix: "", array: [], remain: "" }`. No error, with any flags. |
| No `[` (`"abc"`) | Throws `array missing [`. |
| Text then `[`, with `noPrefix: true` (`"pre[a]"`) | Throws `array missing [`. |
| `"]"` | Throws `array missing [`. |
| `"[a"`, `"[[a]"` | Throws `array missing ]`. |
| `null`, `undefined`, number, array | Throws `TypeError` from `str.trim`. Not guarded. |

### Errors

All thrown errors are plain `Error` instances (not `AssertionError`) except the `TypeError` for non-string input.

| Message | When |
| --- | --- |
| `array missing [` | Input is non-empty and the parser needs an opening `[` but finds none: no `[` in the input, text before `[` with `noPrefix: true`, or input starting with `]`. |
| `array missing ]` | An array is still open and there is no further `,` or `]`, or the input ends while an array is open. |
| `extra data at end of array` | The top-level array closed, text remains, and `noExtra === true`. |

An unmatched `]` after a complete array is not an error. It lands in `remain`, or throws `extra data at end of array` with `noExtra`.

### Edge cases

| Input | Result |
| --- | --- |
| `"[]"`, `"[ ]"` | `array: []` |
| `"[a,]"` | `["a"]`. A trailing comma adds nothing. |
| `"[,]"` | `[""]` |
| `"[a,,b]"` | `["a", "", "b"]` |
| `"[a,,]"` | `["a", ""]` |
| `"[[a],]"` | `[["a"]]` |
| `"[[a] b]"` | `[["a"], "b"]`. The comma after a nested array is optional. |
| `"[[],[]]"`, `"[a,[]]"` | `[[], []]`, `["a", []]` |
| `"[ 'x,y' ]"` | `["'x", "y'"]`. Quotes do not protect the comma. |
| `"[a [b]]"` | `array: ["a [b"]`, `remain: "]"`. The inner `[` is plain text, so the first `]` closes the outer array. |
| `"pre [a] post"` | `prefix: "pre"`, `array: ["a"]`, `remain: "post"` |
| `"x]y[a]"` | `prefix: "x]y"`, `array: ["a"]` |
| `"[a], x"` | `remain: "x"`. The comma after `]` is consumed. |
| `"[a] x [b]"` | `remain: "x [b]"`. The second array is not parsed. |
| `"[a]]"` | `remain: "]"` |
| `"[a]["` | `remain: "["` |
| `"[a],"`, `"[a]  ,  "` | `remain: ""`, even with `noExtra: true`. The comma is consumed and nothing is left. |
| `"[a] ,x"` with `noExtra` | Throws `extra data at end of array`. |
| `"pre[a]"` with `noExtra` | Fine. A prefix is not extra data. |

```js
parse("tag[ hello, world, [ 1, [2] ] ] rest");
// { prefix: "tag", array: ["hello", "world", ["1", ["2"]]], remain: "rest" }

parse("[a, b] more", false, true); // throws Error("extra data at end of array")
```
