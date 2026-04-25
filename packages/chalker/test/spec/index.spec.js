"use strict";

process.env.FORCE_COLOR = "1";

const chalk = require("chalk");
const ansiColors = require("ansi-colors");
const chalker = require("../..");

const BASIC =
  "\u001b[31m\u001b[1mred bold text\u001b[22m\u001b[39m" +
  "\u001b[44m\u001b[32m\u001b[1mgreen on blue bold\u001b[22m\u001b[39m\u001b[49m";

const CHALK_EXPECTED = {
  nesting: `plain1 \u001b[31mred1\u001b[44m on blue\u001b[36m cyan on blue\u001b[39m\u001b[31m\u001b[30m black\u001b[39m\u001b[31m\u001b[49m\u001b[39m
\u001b[31m\u001b[44m\u001b[30m on blue\u001b[39m\u001b[31m\u001b[32m\u001b[48;5;220mgreen on gold\u001b[49m\u001b[44m\u001b[39m\u001b[31m red2 on\u001b[49m\u001b[39m
\u001b[31m\u001b[44m blue       \u001b[38;5;214m\u001b[48;5;16morange\u001b[49m\u001b[44m\u001b[39m\u001b[31m           \u001b[35m\u001b[42m\u001b[49m\u001b[44m\u001b[39m\u001b[31m\u001b[49m\u001b[39m
\u001b[31m\u001b[44m\u001b[35m\u001b[42mmagenta on green\u001b[49m\u001b[44m\u001b[39m\u001b[31m\u001b[49m red3 \u001b[39m plain2\u001b[35m\u001b[39m
\u001b[35mmagenta1 \u001b[31mred\u001b[39m\u001b[35m \u001b[32mgreen\u001b[39m\u001b[35m magenta2\u001b[39m plain3`,
  hex: "\u001b[38;5;214m\u001b[48;5;71mhex colors\u001b[49m\u001b[39m",
  rgb: "\u001b[38;5;196m\u001b[48;5;21mrgb red on blue\u001b[49m\u001b[39m",
  keyword:
    "\u001b[38;5;214m\u001b[48;5;34morange on green\u001b[49m\u001b[39m" +
    "\u001b[38;5;34m\u001b[48;5;220mgreen on gold\u001b[49m\u001b[39m",
  html: "\u001b[38;5;220m\u001b[48;5;34m<Gold on> &xyz;\xa0Green-\"&'\xa9\xae\u001b[49m\u001b[39m"
};

const ANSI_COLORS_EXPECTED = {
  nesting: `plain1 \u001b[31mred1\u001b[44m on blue\u001b[36m cyan on blue\u001b[39m\u001b[31m\u001b[30m black\u001b[39m\u001b[31m\u001b[49m\u001b[39m
\u001b[31m\u001b[44m\u001b[30m on blue\u001b[39m\u001b[31m\u001b[32m\u001b[48;2;255;215;0mgreen on gold\u001b[49m\u001b[44m\u001b[39m\u001b[31m red2 on\u001b[49m\u001b[39m
\u001b[31m\u001b[44m blue       \u001b[38;2;255;165;0m\u001b[48;2;0;0;0morange\u001b[49m\u001b[44m\u001b[39m\u001b[31m           \u001b[35m\u001b[42m\u001b[49m\u001b[44m\u001b[39m\u001b[31m\u001b[49m\u001b[39m
\u001b[31m\u001b[44m\u001b[35m\u001b[42mmagenta on green\u001b[49m\u001b[44m\u001b[39m\u001b[31m\u001b[49m red3 \u001b[39m plain2\u001b[35m\u001b[39m
\u001b[35mmagenta1 \u001b[31mred\u001b[39m\u001b[35m \u001b[32mgreen\u001b[39m\u001b[35m magenta2\u001b[39m plain3`,
  hex: "\u001b[38;2;255;160;16m\u001b[48;2;31;144;32mhex colors\u001b[49m\u001b[39m",
  rgb: "\u001b[38;2;255;10;20m\u001b[48;2;20;10;255mrgb red on blue\u001b[49m\u001b[39m",
  keyword:
    "\u001b[38;2;255;165;0m\u001b[48;2;0;128;0morange on green\u001b[49m\u001b[39m" +
    "\u001b[38;2;0;128;0m\u001b[48;2;255;215;0mgreen on gold\u001b[49m\u001b[39m",
  html: "\u001b[38;2;255;215;0m\u001b[48;2;0;128;0m<Gold on> &xyz;\xa0Green-\"&'\xa9\xae\u001b[49m\u001b[39m"
};

const ENGINES = [
  {
    name: "chalk",
    colors: chalk,
    context: (level) => new chalk.Instance({ level }),
    expected: CHALK_EXPECTED
  },
  {
    name: "ansi-colors",
    colors: ansiColors,
    context: () => ansiColors,
    expected: ANSI_COLORS_EXPECTED
  }
];

describe("chalker", function () {
  const originalChalk = chalker.CHALK;
  let originalAnsiEnabled;

  ENGINES.forEach((engine) => {
    describe(`with ${engine.name}`, function () {
      beforeEach(() => {
        originalAnsiEnabled = ansiColors.enabled;
        ansiColors.enabled = true;
        chalker.CHALK = engine.colors;
      });

      afterEach(() => {
        ansiColors.enabled = originalAnsiEnabled;
        chalker.CHALK = originalChalk;
      });

      it("should support basic colors", () => {
        const r = chalker(
          "<red.bold>red bold text</red.bold><bgBlue.green.bold>green on blue bold</>"
        );
        expect(r).to.equal(BASIC);
        console.log(r);
      });

      it("should not apply colors if chalk supportsColor is false", () => {
        const r = chalker(
          "<red.bold>red bold text</red.bold><bgBlue.green.bold>green on blue bold</>",
          { supportsColor: false }
        );
        expect(r).to.equal("red bold textgreen on blue bold");
      });

      it("should support colors module namespace default", () => {
        const r = chalker("<red>red text</red>", { default: engine.context(1) });
        expect(r).to.equal("\u001b[31mred text\u001b[39m");
      });

      it("should support template string tagging", () => {
        const x = chalker``;
        expect(x).to.equal(``);
        const y = "hello world";
        const b = "<blue>";
        const x2 = chalker`${b}blue</><red>${y}</red>`;
        expect(x2).to.equal("\u001b[34mblue\u001b[39m\u001b[31mhello world\u001b[39m");
        const r = chalker`<red.bold>red bold text</red.bold><bgBlue.green.bold>green on blue bold</>`;
        expect(r).to.equal(BASIC);
        console.log(r);
      });

      it("should support nesting colors", () => {
        const ctx = engine.context(2);
        const r = chalker(
          `plain1 <red>red1<bgBlue> on blue<cyan> cyan on blue</cyan><black> black
 on blue</black><green.bg-gold>green on gold</> red2 on
 blue       <orange.bg#0>orange</>           <magenta.bgGreen>
magenta on green</magenta.bgGreen></bgBlue> red3 </red> plain2<magenta>
magenta1 <red>red</red> <green>green</> magenta2</magenta> plain3`,
          ctx
        );

        expect(r).to.equal(engine.expected.nesting);
        console.log(r);
      });

      it("should support hex colors", () => {
        const ctx = engine.context(2);
        const r = chalker("<#FFA010.bg#1f9020>hex colors</>", ctx);
        expect(r).to.equal(engine.expected.hex);
        console.log(r);
      });

      it("should support hex 'bg-#' colors", () => {
        const ctx = engine.context(2);
        const r = chalker("<#FFA010.bg-#1f9020>hex colors</>", ctx);
        expect(r).to.equal(engine.expected.hex);
        console.log(r);
      });

      it("should support hex 'bg #' colors", () => {
        const ctx = engine.context(2);
        const r = chalker("<#FFA010.bg-#1f9020>hex colors</>", ctx);
        expect(r).to.equal(engine.expected.hex);
        console.log(r);
      });

      it("should support rgb triples", () => {
        const ctx = engine.context(2);
        const r = chalker("<(255, 10, 20).bg(20,10,255)>rgb red on blue</>", ctx);
        expect(r).to.equal(engine.expected.rgb);
        console.log(r);
        const r2 = chalker("<rgb(255, 10, 20).bgRgb(20,10,255)>rgb red on blue</>", ctx);
        expect(r2).to.equal(r);
      });

      it("should support keyword", () => {
        const ctx = engine.context(2);
        const r = chalker(
          "<orange.bgKeyword(`green`)>orange on green</><'green'.bg gold>green on gold</>",
          ctx
        );
        expect(r).to.equal(engine.expected.keyword);
        console.log(r);
        const r2 = chalker(
          `<'orange'.bg("green")>orange on green</><(green).bg(gold)>green on gold</>`,
          ctx
        );
        expect(r2).to.equal(r);
      });

      it("should support advanced color methods missing from chalk 5", () => {
        const ctx = createChalk5CompatibleTestDouble();
        const r = chalker(
          "<orange.bg(gold).hsl(32,100,50).hsv(32,100,100).hwb(32,0,50)" +
            ".bgHsl(120,100,25).bgHsv(120,100,50).bgHwb(120,0,50)>text</>",
          ctx
        );
        expect(r).to.equal(
          "rgb(255,165,0)|bgRgb(255,215,0)|rgb(255,136,0)|rgb(255,136,0)|" +
            "rgb(128,68,0)|bgRgb(0,128,0)|bgRgb(0,128,0)|bgRgb(0,128,0):text"
        );
      });

      it("should decode html escapes", () => {
        const ctx = engine.context(2);
        const r = chalker(
          `<gold.bg-green>&lt;Gold on&gt; &xyz;&nbsp;Green-&quot;&amp;&apos;&copy;&reg;</gold.bg-green>`,
          ctx
        );
        expect(r).to.equal(engine.expected.html);
        console.log(r);
      });

      it("should decode html escape code points", () => {
        const r = chalker("&#x0391; &#x398; &#8201; &#8657; &#x2666; &#xD83D;&#xDC69;");
        const x = "\u0391 \u0398 \u2009 \u21d1 \u2666 \uD83D\uDC69";
        expect(r).to.equal(x);
      });

      it("should fail for mismatched ()", () => {
        expect(() => chalker("<(10,20,30>bad</>")).to.throw("missing matching ()");
      });

      it("should fail if op name is invalid", () => {
        expect(() => chalker(`<blah(red)>bad</>`)).to.throw("blah is not a chalk function");
      });

      it("should handle chalk api throwing", () => {
        expect(() =>
          chalker("<blah(foo)>bar</>", {
            blah: () => {
              throw new Error("fake");
            }
          })
        ).to.throw("calling chalk.blah failed with: fake");
      });

      it("should handle empty/null string or strings w/o markers", () => {
        expect(chalker(null)).to.equal("");
        expect(chalker(undefined)).to.equal("");
        expect(chalker("")).to.equal("");
        expect(chalker("<")).to.equal("<");
        expect(chalker("hello world")).to.equal("hello world");
        expect(chalker("&quot;hello world&quot;")).to.equal(`"hello world"`);
      });

      it("should fail for invalid keyword", () => {
        expect(() => chalker(`<blah>bad</blah>`)).to.throw(
          "blah is not found and invalid as a keyword"
        );
      });

      it("should fail for unbalanced markers", () => {
        expect(() => chalker(`<red>`)).to.throw("unbalanced open/close markers: [<red>]");
        expect(() => chalker(`oops <red>red<blue></blue>`)).to.throw(
          "unbalanced open/close markers: oops [<red>]..."
        );
        expect(() => chalker(`<red>red<blue><cyan></>`)).to.throw(
          "unbalanced open/close markers: <red>red[<blue>]..."
        );
      });

      it("should fail for mismatched markers", () => {
        expect(() => chalker(`blah <red>red<blue>blue</blue></rad>`)).to.throw(
          "blah [** <red> **]red<blue>blue</blue>[** </rad> **]"
        );
      });

      it("should remove markers", () => {
        const r = chalker.remove(
          "<red.bold>red bold text &#xD83D;&#xDC69;</red.bold><bgBlue.green.bold>green on blue bold</>"
        );
        expect(r).to.equal("red bold text \uD83D\uDC69green on blue bold");
      });

      it("should remove markers but keep html escapes if flag is true", () => {
        const r = chalker.remove(
          "<red.bold>red bold text &#xD83D;&#xDC69;</red.bold><bgBlue.green.bold>green on blue bold</>",
          true
        );
        expect(r).to.equal("red bold text &#xD83D;&#xDC69;green on blue bold");
      });
    });
  });

  describe("optional color loading", function () {
    it("should load ansi-colors if chalk is not available", () => {
      const colors = ansiColors.create();
      const calls = [];

      colors.enabled = true;
      colors.alias("red", (text) => `ansi-colors red: ${text}`);
      const freshChalker = loadFreshWithOptionalRequire((name) => {
        calls.push(name);
        return name === "ansi-colors" ? colors : undefined;
      });

      expect(calls).to.deep.equal(["chalk", "ansi-colors"]);
      expect(freshChalker.CHALK).to.equal(colors);
      expect(freshChalker("<red>red text</red>")).to.equal("ansi-colors red: red text");
      expect(freshChalker("<#FFA010>hex text</>")).to.equal(
        "\u001b[38;2;255;160;16mhex text\u001b[39m"
      );
    });

    it("should fail if no color library is available", () => {
      expect(() => loadFreshWithOptionalRequire(() => undefined)).to.throw(
        "chalker requires either chalk or ansi-colors to be installed"
      );
    });
  });
});

function loadFreshWithOptionalRequire(load) {
  const Module = require("module");
  const originalLoad = Module._load;
  const chalkerPath = require.resolve("../..");

  delete require.cache[chalkerPath];
  Module._load = function (request, parent, isMain) {
    if (request === "optional-require") {
      return () => load;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require("../..");
  } finally {
    Module._load = originalLoad;
    delete require.cache[chalkerPath];
    require("../..");
  }
}

function createChalk5CompatibleTestDouble(chain = []) {
  const ctx = (text) => `${chain.join("|")}:${text}`;

  ctx.rgb = (r, g, b) => createChalk5CompatibleTestDouble(chain.concat(`rgb(${r},${g},${b})`));
  ctx.bgRgb = (r, g, b) => createChalk5CompatibleTestDouble(chain.concat(`bgRgb(${r},${g},${b})`));

  return ctx;
}
