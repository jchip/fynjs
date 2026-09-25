import { styleText, inspect } from "node:util";
import colorConvert from "color-convert";
import { makeChalker } from "./core.ts";

export type { ChalkerFn } from "./core.ts";
export { makeChalker } from "./core.ts";

//
// Static entry: colors come from node:util's built-in `styleText`, no dependency at all.
//
// `styleText(names, text)` takes a flat array of format names and has no chaining, so this
// builds a chalk-shaped chain on top of it: each named style (red, bold, bgBlue, ...) accumulates
// into an array, applied with one `styleText()` call when the chain is finally invoked with text.
//
// rgb/hex go around `styleText` entirely instead of registering into its lookup table
// (`util.inspect.colors`, a table shared process-wide with console.log's own coloring) - 24-bit
// truecolor escapes are a public, stable ANSI sequence, so they're built directly here the same
// way `defineAnsiColor` in ./core.ts builds them for the ansi-colors backend.
//
// Known gap: chalk/ansi-colors rescan a string they're wrapping for embedded reset codes or
// newlines and reinsert their own open code after each one, so an outer style resumes after an
// inner nested style closes or a line breaks. This backend doesn't do that rescan, so deeply
// nested sibling markers or a styled span containing a newline can leak to unstyled where chalk
// would have kept coloring. Flat/single-level markers, the common case, are unaffected.
//
type AnyColors = any;

const STYLE_NAMES: ReadonlySet<string> = new Set(Object.keys(inspect.colors));

// A chain step is either a styleText format name or a raw rgb/hex transform. Kept as one
// ordered list (rather than two) so `.rgb()`/`.bgRgb()` can be interleaved with named styles
// in any order and still nest the same way chalk/ansi-colors do: whichever step was chained
// first ends up outermost, applied last, in `applyOps` below.
type Op = string | ((text: string) => string);

function rgbOp(r: number, g: number, b: number, bg?: boolean): Op {
  const open = `${bg ? 48 : 38};2;${r};${g};${b}`;
  const close = bg ? 49 : 39;
  return (text: string) => `\u001b[${open}m${text}\u001b[${close}m`;
}

function applyOps(ops: readonly Op[], text: string): string {
  return ops.reduceRight(
    (acc: string, op: Op) => (typeof op === "string" ? styleText([op] as any, acc) : op(acc)),
    text
  );
}

function makeNode(ops: readonly Op[]): AnyColors {
  const node = ((text: string): string => applyOps(ops, text)) as AnyColors;

  node.rgb = (r: number, g: number, b: number) => makeNode(ops.concat(rgbOp(r, g, b)));
  node.bgRgb = (r: number, g: number, b: number) => makeNode(ops.concat(rgbOp(r, g, b, true)));
  node.hex = (value: string) => node.rgb(...colorConvert.hex.rgb(value));
  node.bgHex = (value: string) => node.bgRgb(...colorConvert.hex.rgb(value));

  for (const name of STYLE_NAMES) {
    Object.defineProperty(node, name, {
      get: () => makeNode(ops.concat(name)),
      enumerable: true,
      configurable: true
    });
  }

  return node;
}

export const styleTextColors: AnyColors = makeNode([]);

//
// `styleText` is a build-time guarantee here (chalker's engines field already requires a Node
// that has it stable), but this entry can still be imported directly on an older runtime despite
// that field, so fail with a clear message rather than a cryptic one from deep inside makeNode.
//
if (typeof styleText !== "function") {
  throw new TypeError("chalker/style-text requires a Node.js version with util.styleText");
}

export default makeChalker(styleTextColors);
