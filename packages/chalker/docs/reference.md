# chalker reference

`chalker` turns XML-like markers such as `<red>text</red>` in a string into ANSI color codes. It delegates the styling to a colors backend: `chalk`, `ansi-colors`, or Node's `util.styleText`. ESM only (`"type": "module"`).

## Imports

```js
import chalker from "chalker";                 // auto-detect backend (top-level await)
import chalker from "chalker/chalk";           // static: chalk
import chalker from "chalker/ansi-colors";     // static: ansi-colors
import chalker from "chalker/style-text";      // static: node:util styleText, no dependency
import { makeChalker } from "chalker";         // also from every subpath below
import { makeChalker } from "chalker/core";    // no backend, no default export
import { styleTextColors } from "chalker/style-text";
```

Subpaths: `.`, `./chalk`, `./ansi-colors`, `./style-text`, `./core`, `./package.json`.

Runtime exports by entry:

| Entry | Default export | Named runtime exports |
| --- | --- | --- |
| `chalker` | `chalker` function | `makeChalker` |
| `chalker/chalk` | `chalker` function | `makeChalker` |
| `chalker/ansi-colors` | `chalker` function | `makeChalker` |
| `chalker/style-text` | `chalker` function | `makeChalker`, `styleTextColors` |
| `chalker/core` | none | `makeChalker` |

Type-only export from every entry: `ChalkerFn`.

Not exported: `normalizeColors`, `decodeHtml` and `remove` as standalone functions (they exist only as `chalker.decodeHtml` and `chalker.remove`), and the color-model helpers. There is no named export called `chalker`.

Entry differences:

- `chalker` loads its backend at import time with a top-level `await`. Because of that it cannot be loaded by `require()` (source comments cite `ERR_REQUIRE_ASYNC_MODULE`), and a bundler must leave the backend external. The static entries have no top-level await.
- `chalker` tries `chalk`, then `ansi-colors`, then (if neither is installed and `node:util` has a function `styleText`) the built-in `styleTextColors`. If none works it imports `chalk` again and lets the not-found error propagate.
- `chalker/chalk` and `chalker/ansi-colors` hard-import their peer dependency. A missing peer is an import-time resolve error.
- `chalker/style-text` throws `TypeError("chalker/style-text requires a Node.js version with util.styleText")` at import when `util.styleText` is not a function.
- Each entry builds its own chalker through `makeChalker`, so entries do not share `CHALK` state.
- `package.json` peer dependencies: `chalk >=4` and `ansi-colors >=4`, both optional. Runtime dependencies: `color-convert`, `optional-import`. Node engines: `^22.22.2 || ^24.15.0 || >=26.0.0`.

## `makeChalker(colors)`

```ts
function makeChalker(colors: any): ChalkerFn
```

Builds a chalker bound to a colors module. `colors` is a chalk or ansi-colors module or default export, or any object with chalk-shaped chains (such as `styleTextColors`). Every entry's default export is `makeChalker(<its backend>)`.

- `chalker.CHALK` is set to `normalizeColors(colors)`. Normalizing uses `colors.default` when that is a function or object, otherwise `colors` itself. Then the ansi-colors compat step runs (see `CHALK` below).
- No validation of `colors` happens here. A bad value fails later, on the first format call.
- Each call returns a new function with its own `CHALK`, `remove` and `decodeHtml` properties.

## `ChalkerFn`

```ts
type ChalkerFn = {
  (s?: string | readonly string[] | null, ...args: unknown[]): string;
  remove: (s: string, keepHtml?: boolean) => string;
  decodeHtml: (s: string) => string;
  CHALK: any;
};
```

The type of every default export and of the `makeChalker` return value.

## `chalker(s, colors?)` and the tagged template form

```ts
chalker(s?: string | null, colors?: any): string
chalker(strings: readonly string[], ...values: unknown[]): string
```

Converts markers in `s` to ANSI codes and returns the string.

String form:

- The second argument is an optional colors module used for this call instead of `chalker.CHALK`. It is normalized the same way as `CHALK` (`.default` unwrap, ansi-colors compat). Only `args[0]` is read.
- A falsy `colors` argument falls back to `chalker.CHALK`. `CHALK` is read at call time, so assigning `chalker.CHALK = other` takes effect on the next call.
- `s` of `""`, `null` or `undefined` returns `""` when colors are enabled.
- A string with no match for the tokenizer returns unchanged (not entity-decoded). That is only a string made solely of `<` and `>` characters, such as `"<"`, `"<>"`, `">"`.

Tagged template form (detected with `Array.isArray(s)`):

- The cooked strings and `String(value)` of each interpolation are joined into one string first, then that string is formatted. Interpolated text is parsed for markers like any other text, so a value containing `<` can inject or break markers.
- A `colors` override cannot be passed in template form. Every argument after the strings is treated as an interpolated value.
- A plain array passed as the first argument is treated the same way (`["a", "b"]` formats `"a"`, because the loop reads `s[ix]` for `ix` up to `args.length`).

```js
chalker("<red.bgGreen>Red on Green</>");
chalker`<green>hello ${name}</green>`;
chalker("<red>x</>", new chalk.Instance({ level: 2 }));
```

### Color-disabled behavior

After normalizing the colors module, if `colors.supportsColor === false` (strict comparison) the call returns `chalker.remove(s)`. That means:

- All `<...>` tags are stripped without parsing, so malformed, unbalanced or unknown markers do not throw.
- The result is trimmed and entity-decoded.
- `null` or `undefined` input throws `TypeError` (`.replace` on a non-string). `""` returns `""`.
- A stray `<` and later `>` in plain text are removed as if they were a tag (`"a < b > c"` loses `< b >`). The enabled path handles that text differently (see Tokenizing).

Only the exact value `false` disables. `undefined` (for example chalk 6 instances, ansi-colors, `styleTextColors` have no `supportsColor`) means colors stay on in chalker. Whether codes then appear is up to the backend's own level (chalk `level`, ansi-colors `enabled`, Node `styleText` stream checks).

## Marker grammar

### Tokenizing

The string is split with `/(<[^>]+>|[^<>]+)/g`.

- A tag is `<` followed by one or more non-`>` characters and `>`. Everything else between tags is text.
- A `<` with no later `>` and a stray `>` are not matched by either alternative, so they are silently dropped from the output (`"a > b"` gives `"a  b"`, `"a < b"` gives `"a  b"`). `<>` is not a tag and is dropped too (it only survives as the whole string, see above).
- To get a literal `<` or `>` in output, write `&lt;` or `&gt;`. Entities are decoded after styling, so `&lt;red&gt;` becomes the literal text `<red>` and is never parsed as a marker.
- Tags cannot contain `>`.

### Open and close markers

- A tag whose second character is `/` is a close marker. Its name is the text between `</` and `>`. `</>` has the empty name and closes any open marker.
- Any other tag is an open marker. Its name is the text between `<` and `>`, untrimmed.
- Matching is exact string comparison between the open name and the close name, including whitespace and case. `<red>a</red >` is a mismatch. A named close marker must equal its open marker. `</>` always matches.
- There are no self-closing or standalone tags. `<red/>` is an open marker named `red/`.

Nesting is by proper pairing. Text is processed from the end of the string to the start with a stack.

```js
chalker("<red>a<blue>b</>c</>");   // red(a + blue(b) + c), inner applied first
```

Errors (all plain `Error` unless noted):

| Condition | Message |
| --- | --- |
| Open marker with no pending close marker to its right | `unbalanced open/close markers: <text before>[<tag>]...` (the trailing `...` is present when more tokens follow) |
| Open and close names differ | `mismatch markers: <text>[** <open> **]<between>[** <close> **]` |

A close marker with no matching open marker is not an error. Because of how the stack unwinds, the close marker and all text to its right, up to the next open marker that consumes it, behave oddly: `"abc</red>"` returns `""` (text is lost) and `"</red>abc"` returns `"abc"`. Treat stray close markers as a bug in the input.

Whitespace inside text between markers is preserved (`"<red> a </red>"` styles `" a "`). The enabled path never trims.

### Marker name syntax

A marker name is split on `.` (so `.` cannot appear inside a segment) and each segment is trimmed, then applied left to right to build a chain, then the chain is called with the text. The whole name is trimmed first. The chain must end as a function, else `AssertionError("final chalk value is not a function after applying <name>")`.

Segment resolution order, first match wins:

1. Basic style: if `chain[segment]` is truthy, use it. This is any property the backend exposes, such as `red`, `bold`, `bgRed`, `underline`, `gray`. The valid names are whatever the backend provides, they are not listed in chalker. For `styleTextColors` the names are `Object.keys(util.inspect.colors)` of the running Node. A non-function property such as `level` is accepted here and fails at the final function check.
2. Hex: a segment starting with `#` calls `chain.hex(segment)`.
3. Background hex: a segment starting with `bg` whose character at index 2 or index 3 is `#` (`bg#0000FF`, `bg-#0000FF`, `bg #0000FF`) calls `chain.bgHex(segment)` with the whole segment, including the `bg` prefix. The hex parser finds the first 3 or 6 hex digit run, so it works.
4. Parenthesized form: if the segment contains `(` (see below).
5. Keyword fallback: otherwise, optional matching quotes are removed, then a `bg-` or `bg ` prefix selects `bgKeyword` (the first 3 characters are dropped), else `keyword`.

#### Parenthesized form

`name(args)`. Text up to the first `(` is the name (trimmed, may be empty). Args are the text between that `(` and the last `)` in the segment, trimmed.

- No `)` after the `(`: `AssertionError("marker <segment> missing matching ()")`.
- Args containing `,`: split on `,`, each part `parseInt(part.trim(), 10)` (a non-number gives `NaN`, not an error). An empty name becomes `rgb`, name `bg` becomes `bgRgb`.
- Args without `,`: one string value with optional matching quotes removed. An empty name becomes `keyword`, name `bg` becomes `bgKeyword`.
- Any other name is used as is and is case sensitive. Examples: `rgb`, `bgRgb`, `hex`, `bgHex`, `keyword`, `bgKeyword`, `hsl`, `bgHsl`, `hsv`, `bgHsv`, `hwb`, `bgHwb`.
- Quotes are `'`, `"` or a backtick. If the first character is a quote, the last must be the same quote, else `AssertionError("chalk <segment> param must be enclosed with matching quote <q>")`. Both enclosing characters are removed. Commas inside quotes still split.
- The named method is called on the current chain with the values spread. If `chain[name]` is a function it is used. Otherwise, for `keyword`, `bgKeyword`, `hsl`, `bgHsl`, `hsv`, `bgHsv`, `hwb`, `bgHwb`, chalker converts the values to RGB with `color-convert` and calls `rgb` or `bgRgb` instead. For `keyword` the value is lowercased. A failed conversion throws `unknown color <value>`. Any other missing name throws `TypeError("<name> is not a chalk function")`. Errors from this step are rewrapped as `Error("marker <segment> is invalid: calling chalk.<name> failed with: <message>")`.
- So chalk 4 (which has native `keyword`/`hsl`/...) uses its own methods. Chalk 5 and later, ansi-colors and styleText go through `color-convert`.

#### Keyword fallback details

- `<orange>`, `<'orange'>`, `<"orange">`, `` <`orange`> `` all use `keyword`. `<bg-orange>`, `<bg orange>`, `<"bg-orange">` use `bgKeyword("orange")`.
- Keywords are CSS color names via `color-convert`, lowercased, so `<Red>` is not the basic `red` style. It resolves to the keyword `red` and emits 24-bit RGB `38;2;255;0;0` (when the backend supports it).
- Any failure, including a quote mismatch here, becomes `Error("marker <segment> is not found and invalid as a keyword")`. So an unknown marker like `<foo>` throws. Unknown tags are never passed through as text.

#### Examples

| Marker | Effect |
| --- | --- |
| `<red>`, `<blue.bold>` | basic styles |
| `<#FF0000>`, `<hex(#FF0000)>` | `hex` |
| `<bg#0000FF>`, `<bgHex(#0000FF)>` | `bgHex` |
| `<(255,10,20)>`, `<rgb(255,10,20)>` | `rgb` |
| `<bg(255,10,20)>`, `<bgRgb(255,10,20)>` | `bgRgb` |
| `<(orange)>`, `<keyword('orange')>`, `<orange>` | `keyword` |
| `<bg(orange)>`, `<bgKeyword(orange)>`, `<bg-orange>` | `bgKeyword` |
| `<hsl(32,100,50)>`, `<hsv(32,100,100)>`, `<hwb(32,0,50)>` | model converted to RGB |
| `<red.bold.bg#00f>` | chained, in the listed order |

Chain order: segments chain left to right. chalk and ansi-colors give the same output as chaining those names in code (`chalk.red.bold.bgHex(...)`).

### Entities

`chalker.decodeHtml` is applied to the final formatted string (after styling), and by `chalker.remove` unless `keepHtml` is true. Marker names are never decoded.

## `chalker.CHALK`

```ts
CHALK: any
```

The colors module used when a call has no override. Own, writable property of each chalker.

- Assign a chalk instance or module, an ansi-colors module, or `styleTextColors`: `chalker.CHALK = ansiColors`.
- It is normalized on every call. The stored value is not replaced by the normalized one when you assign it.
- ansi-colors compat: if the module has a function `alias` and no function `rgb`, chalker mutates that module in place by adding `rgb`, `bgRgb`, `hex` and `bgHex` (using `color-convert` for hex). Each distinct color is registered once through `colors.alias` under a name like `chalker_rgb_1_2_3` or `chalker_bgRgb_1_2_3`. These mutations are visible to other users of the same ansi-colors module.
- Passing `null`/`undefined` as `CHALK` and no override makes a call throw `TypeError` when reading `supportsColor`.

## `chalker.remove(s, keepHtml?)`

```ts
remove(s: string, keepHtml?: boolean): string
```

Deletes every match of `/<[^>]*>/g` (so `<>` goes too, and any `<` ... `>` span, valid marker or not), trims the result, then decodes entities unless `keepHtml` is truthy.

- No balance or name checks. Never throws on markup.
- A non-string `s` throws `TypeError`.
- Does not use `CHALK`.
- Decoding can throw `RangeError` (see `decodeHtml`).

```js
chalker.remove("<red>a &lt; b</red>");        // "a < b"
chalker.remove("<red>a &lt;</>", true);       // "a &lt;"
```

## `chalker.decodeHtml(s)`

```ts
decodeHtml(s: string): string
```

Replaces each match of `/&[\w#]+;/g` in one pass.

- Named entities, exactly these: `&quot;` `"`, `&amp;` `&`, `&apos;` `'`, `&lt;` `<`, `&gt;` `>`, `&nbsp;` U+00A0, `&copy;` U+00A9, `&reg;` U+00AE.
- `&#x<hex>;` decodes the hex code point with `String.fromCodePoint(parseInt(hex, 16))`. `&#<dec>;` decodes decimal the same way. Lowercase `x` only.
- Any other named entity (`&foo;`) is left as is.
- Decoding is single pass: `&amp;lt;` gives `&lt;`.
- An invalid numeric reference throws `RangeError`: non-numeric (`&#xZZ;`, `&#X41;`, `&#;`) gives `Invalid code point NaN`, and values above `0x10FFFF` are also a `RangeError`. Surrogate halves such as `&#xD83D;&#xDC69;` decode to two code units that join into one character.

## `styleTextColors`

```ts
const styleTextColors: any  // from "chalker/style-text" only
```

A chalk-shaped chain built on `util.styleText`. It is the backend of `chalker/style-text` and of the fallback in `chalker`.

- Each name in `Object.keys(util.inspect.colors)` is a getter that returns a new chain with that style appended. Chains are callable: `styleTextColors.red.bold("x")`.
- `rgb(r, g, b)`, `bgRgb(r, g, b)`, `hex(value)`, `bgHex(value)` are methods on every chain. They emit 24-bit escapes directly (`38;2;r;g;b` closing with `39`, background `48;2;...` closing `49`) and bypass `styleText`. `hex` parses with `color-convert`.
- Order: the step chained first ends up outermost. Chains mix named and RGB steps in any order.
- No `supportsColor` or `level` property exists on it. Named styles are applied by `util.styleText(name, text)` with default options, so Node's own stream and color checks decide whether they emit codes. RGB and hex escapes are built by chalker, and follow the same check: each one asks `util.styleText` whether colors are on, at call time.
- Known gaps: an rgb or hex outer color does not resume after a nested color closes (`<#FF0000>a<blue>b</blue>c</>` leaves `c` unstyled). A style is not re-opened after a newline, as chalk and ansi-colors do. Named outer styles do resume, since `util.styleText` handles that.

## Behavior summary

- Marker text is applied inside out: innermost markers first, each result wrapped by its parent.
- Output of the enabled path is passed through `decodeHtml` once at the end.
- Errors are thrown synchronously from the call. There is no non-throwing mode except the color-disabled path.
