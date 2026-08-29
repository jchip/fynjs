/* eslint-disable complexity, max-statements, no-magic-numbers, prefer-template, prefer-spread */

import assert from "node:assert";
import { createRequire } from "node:module";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import colorConvert from "color-convert";

//
// convert color markers in a string to terminal/ansi color codes with chalk
// color marker format is "<red>red text</red><blue.bold>blue bold text</blue.bold>"
// the end marker can simply be "</>" also
// the marker is converted to chalk methods directly, for example:
// - chalk.red is called for "<red>"
// - chalk.blue.bold is called for "<blue.bold>"
//
// More advanced colors can be applied with:
//
// <(r,g,b)>, <rgb(255,10,20)>
// <bg(r,g,b)>, <bgRgb(255,10,20)>
// <#FF0000>, <bg#0000FF>, <hex(#FF0000)>, <bgHex(#0000FF)>
// <(orange)>, <keyword(orange)>, <keyword('orange')>,
//    <keyword("orange")>, <keyword(`orange`)>
// <bg(orange)>, <bgKeyword(orange)>, <bgKeyword('orange')>,
//    <bgKeyword("orange")>, <bgKeyword(`orange`)>
// <hsl(32,100,50)>, <hsv(32,100,100)>, <hwb(32,0,50)>
//
// any thing that's not found as a basic color is tried using chalk.keyword
//
// <orange>, <'orange'>, <"orange">, <`orange`>
//
// If it's prefixed with `"bg-"` or `"bg "` then it's tried using chalk.bgKeyword
//
// <bg-orange>, <bg orange>
//
// These can be comined with . in any order as long as they work with chalk
//
// ie: <#FF0000.bg#0000FF.orange.keyword()>
//

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyColors = any;

export type ChalkerFn = {
  (s?: string | readonly string[] | null, ...args: unknown[]): string;
  remove: (s: string, keepHtml?: boolean) => string;
  decodeHtml: (s: string) => string;
  CHALK: AnyColors;
};

// require() from this module's own context, used to optionally load chalk/ansi-colors
// without failing the whole module load when neither is installed.
const nodeRequire = createRequire(import.meta.url);

function deQuote(str: string, marker: string): string {
  const q = str[0];
  if (q === `'` || q === `"` || q === "`") {
    // remove enclosing quotes ', ", or ` if they are present
    assert(str.endsWith(q), `chalk ${marker} param must be enclosed with matching quote ${q}`);
    str = str.substr(1, str.length - 2);
  }

  return str;
}

// https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references
// https://en.wikipedia.org/wiki/Universal_Coded_Character_Set

const htmlEntities: Record<string, string> = {
  [`&quot;`]: `"`,
  [`&amp;`]: "&",
  [`&apos;`]: "'",
  [`&lt;`]: "<",
  [`&gt;`]: ">",
  [`&nbsp;`]: "\xa0",
  [`&copy;`]: "\xa9",
  [`&reg;`]: "\xae"
};

/**
 * Check if an error from require() is really due to the module not being found,
 * and not because the module itself tried to require another module that's missing.
 */
function isModuleNotFoundError(err: unknown, requestPath: string): boolean {
  const e = err as NodeJS.ErrnoException & { requestPath?: string };
  const msg = String(e && e.message ? e.message : "").split("\n")[0];

  if (!msg) {
    return false;
  }

  return Boolean(
    e &&
      e.code === "MODULE_NOT_FOUND" &&
      (e.requestPath === requestPath ||
        msg.includes(`not find module '${requestPath}'`) ||
        msg.includes(`not find package '${requestPath}'`))
  );
}

// try to require an optional module, returning undefined if it's simply not
// installed, but re-throwing any other error (ie: the module itself is broken)
function tryRequireOptional(id: string): AnyColors {
  try {
    return nodeRequire(id);
  } catch (err) {
    if (isModuleNotFoundError(err, id)) {
      return undefined;
    }
    throw err;
  }
}

function loadColors(): AnyColors {
  let colors = tryRequireOptional("chalk") || tryRequireOptional("ansi-colors");

  if (!colors) {
    // just go for chalk and let require take care of errors
    colors = nodeRequire("chalk");
  }

  return normalizeColors(colors);
}

function normalizeColors(colorsModule: AnyColors): AnyColors {
  const colors =
    colorsModule &&
    colorsModule.default &&
    (typeof colorsModule.default === "function" || typeof colorsModule.default === "object")
      ? colorsModule.default
      : colorsModule;

  return addAnsiColorsCompat(colors);
}

function addAnsiColorsCompat(colors: AnyColors): AnyColors {
  if (!colors || typeof colors.alias !== "function" || typeof colors.rgb === "function") {
    return colors;
  }

  colors.rgb = function (r: number, g: number, b: number) {
    return this[defineAnsiColor(colors, "rgb", [r, g, b])];
  };
  colors.bgRgb = function (r: number, g: number, b: number) {
    return this[defineAnsiColor(colors, "bgRgb", [r, g, b], true)];
  };
  colors.hex = function (value: string) {
    return this.rgb.apply(this, colorConvert.hex.rgb(value));
  };
  colors.bgHex = function (value: string) {
    return this.bgRgb.apply(this, colorConvert.hex.rgb(value));
  };

  return colors;
}

function defineAnsiColor(
  colors: AnyColors,
  name: string,
  values: number[],
  bg?: boolean
): string {
  const styleName = `chalker_${name}_${values.join("_")}`;

  if (!colors.styles[styleName]) {
    const prefix = bg ? 48 : 38;
    const close = bg ? 49 : 39;
    colors.alias(
      styleName,
      (text: string) => `\u001b[${prefix};2;${values.join(";")}m${text}\u001b[${close}m`
    );
  }

  return styleName;
}

function convertColorModel(name: string, values: unknown[]): { name: string; values: number[] } {
  const bg = name.startsWith("bg");
  const model = bg ? name[2].toLowerCase() + name.substring(3) : name;
  const rgb =
    model === "keyword"
      ? colorConvert.keyword.rgb(String(values[0]).toLowerCase())
      : colorConvert[model] && colorConvert[model].rgb.apply(colorConvert[model], values);

  assert(rgb, `unknown color ${values[0]}`);

  return { name: bg ? "bgRgb" : "rgb", values: rgb };
}

function applyChalkMethod(chalkInstance: AnyColors, name: string, values: unknown[]): AnyColors {
  if (typeof chalkInstance[name] === "function") {
    return chalkInstance[name].apply(chalkInstance, values);
  }

  if (
    name === "keyword" ||
    name === "bgKeyword" ||
    name === "hsl" ||
    name === "bgHsl" ||
    name === "hsv" ||
    name === "bgHsv" ||
    name === "hwb" ||
    name === "bgHwb"
  ) {
    const converted = convertColorModel(name, values);
    return chalkInstance[converted.name].apply(chalkInstance, converted.values);
  }

  throw new TypeError(`${name} is not a chalk function`);
}

function decodeHtml(str: string): string {
  return str.replace(/&[\w#]+;/g, m => {
    if (Object.prototype.hasOwnProperty.call(htmlEntities, m)) return htmlEntities[m];
    if (m.startsWith("&#x")) {
      const s = m.substring(3, m.length - 1);
      const p = parseInt(s, 16);
      return String.fromCodePoint(p);
    }
    if (m.startsWith("&#")) {
      const s = m.substring(2, m.length - 1);
      const p = parseInt(s, 10);
      return String.fromCodePoint(p);
    }
    return m;
  });
}

function applyChalkMarkers(markers: string, text: string, userChalk: AnyColors): string {
  const chalkify = markers
    .trim()
    .split(".")
    .reduce((a: AnyColors, marker: string) => {
      marker = marker.trim();

      if (a[marker]) {
        // a basic color found
        return a[marker];
      } else if (marker.startsWith("#")) {
        // a hex value
        return a.hex(marker);
      } else if ((marker[2] === "#" || marker[3] === "#") && marker.startsWith("bg")) {
        // a bgHex value, `bg#`, `bg-#`, `bg #`
        // no need to extract only the #HHHHHH part since chalk seems to deal with
        // the value in the form of text#HHHHHH
        return a.bgHex(marker);
      }

      const openIx = marker.indexOf("(");
      if (openIx >= 0) {
        // apply other advanced colors when ( is found
        const closeIx = marker.lastIndexOf(")");
        assert(closeIx > openIx, `marker ${marker} missing matching ()`);

        // extract name if there're something before (
        let name: string | false = openIx > 0 && marker.substring(0, openIx).trim();

        // extract values within ()
        let values: unknown = marker.substring(openIx + 1, closeIx).trim();
        if ((values as string).indexOf(",") >= 0) {
          // extract rgb/hsl/hsv/hwb values like (255, 10, 20)
          values = (values as string).split(",").map(x => parseInt(x.trim(), 10));

          // default no name to rgb, and bg to bgRgb
          if (!name) name = "rgb";
          else if (name === "bg") name = "bgRgb";
        } else {
          // extract a string (with or without quotes) to use for keyword
          values = [deQuote((values as string).trim(), marker)];

          // default no name to keyword, and bg to bgKeyword
          if (!name) name = "keyword";
          else if (name === "bg") name = "bgKeyword";
        }

        try {
          a = applyChalkMethod(a, name as string, values as unknown[]);
        } catch (err) {
          throw new Error(
            `marker ${marker} is invalid: calling chalk.${name} failed with: ${
              (err as Error).message
            }`
          );
        }
      } else {
        // if not found as a basic color, then try with chalk.keyword or chalk.bgKeyword
        try {
          const kw = deQuote(marker, marker);
          if (kw.startsWith("bg-") || kw.startsWith("bg ")) {
            a = applyChalkMethod(a, "bgKeyword", [kw.substring(3)]);
          } else {
            a = applyChalkMethod(a, "keyword", [kw]);
          }
        } catch (err) {
          throw new Error(`marker ${marker} is not found and invalid as a keyword`);
        }
      }

      assert(a, `marker ${marker} is invalid`);

      return a;
    }, userChalk);

  assert(
    typeof chalkify === "function",
    `final chalk value is not a function after applying ${markers}`
  );

  return chalkify(text);
}

// remove the color marker like <red>text</> from strings
function remove(s: string, keepHtml?: boolean): string {
  const r = s.replace(/<[^>]*>/g, "").trim();
  return keepHtml ? r : decodeHtml(r);
}

type MarkerLevel = { mk?: string; ix?: number; s: string };

function format(s: string | null | undefined, userChalk?: AnyColors): string {
  userChalk = normalizeColors(userChalk || (chalker as ChalkerFn).CHALK);

  // skip applying ansi colors if chalk says color support is off
  if (userChalk.supportsColor === false) {
    return remove(s as string);
  }

  const tks = s && s.match(/(<[^>]+>|[^<>]+)/g);

  // empty string "" result in null from match
  // but other strings w/o matches gets ['original-string']
  if (!tks) return s || "";

  const colorized = tks.reduceRight(
    (a: MarkerLevel[], e: string, ix: number) => {
      const lvl = a[a.length - 1];

      // text
      if (e[0] !== "<") {
        lvl.s = e + lvl.s;
        return a;
      }

      // close marker
      if (e[1] === "/") {
        a.push({ mk: e.substring(2, e.length - 1), ix, s: "" });
        return a;
      }

      // open marker

      // markers balance check
      if (a.length === 1) {
        const partial =
          tks.slice(0, ix).join("") + `[${tks[ix]}]` + (tks.length > ix + 1 ? "..." : "");
        throw new Error(`unbalanced open/close markers: ${partial}`);
      }

      // markers match check
      const mk = e.substring(1, e.length - 1);
      if (lvl.mk && mk !== lvl.mk) {
        const partial =
          tks.slice(0, ix).join("") +
          `[** ${tks[ix]} **]` +
          tks.slice(ix + 1, lvl.ix).join("") +
          `[** ${tks[lvl.ix as number]} **]`;
        throw new Error(`mismatch markers: ${partial}`);
      }

      // apply marker and update result at previous level
      const t = applyChalkMarkers(mk, lvl.s, userChalk);
      a.pop();
      const nl = a.length - 1;
      a[nl].s = t + a[nl].s;

      return a;
    },
    [{ s: "" }] as MarkerLevel[]
  );

  return decodeHtml(colorized[0].s);
}

function chalker(s?: string | readonly string[] | null, ...args: unknown[]): string {
  if (Array.isArray(s)) {
    // template string tagging
    let c = "";
    let ix: number;
    for (ix = 0; ix < args.length; ix++) {
      c = c + s[ix] + String(args[ix]);
    }
    return format(c + s[ix]);
  }

  return format(s as string | null | undefined, args[0]);
}

(chalker as ChalkerFn).remove = remove;

(chalker as ChalkerFn).decodeHtml = decodeHtml;

(chalker as ChalkerFn).CHALK = loadColors();

export default chalker as ChalkerFn;

// let require(esm) in CJS consumers receive the callable directly instead of the namespace
const chalkerExport = chalker as ChalkerFn;
export { chalkerExport as "module.exports" };
