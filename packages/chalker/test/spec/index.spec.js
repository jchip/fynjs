"use strict";

const chalk = require("chalk");
const chalker = require("../..");

describe("chalker", function() {
  it("should support basic colors", () => {
    const r = chalker("<red.bold>red bold text</red.bold><bgBlue.green.bold>green on blue bold</>");
    expect(r).to.equal("[31m[1mred bold text[22m[39m[44m[32m[1mgreen on blue bold[22m[39m[49m");
    console.log(r);
  });

  it("should support template string tagging", () => {
    const x = chalker``;
    expect(x).to.equal(``);
    const y = "hello world";
    const b = "<blue>";
    const x2 = chalker`${b}blue</><red>${y}</red>`;
    expect(x2).to.equal("[34mblue[39m[31mhello world[39m");
    const r = chalker`<red.bold>red bold text</red.bold><bgBlue.green.bold>green on blue bold</>`;
    expect(r).to.equal("[31m[1mred bold text[22m[39m[44m[32m[1mgreen on blue bold[22m[39m[49m");
    console.log(r);
  });

  it("should support nesting colors", () => {
    const ctx = new chalk.constructor({ level: 2 });
    const r = chalker(
      `plain1 <red>red1<bgBlue> on blue<cyan> cyan on blue</cyan><black> black
 on blue</black><green.bg-gold>green on gold</> red2 on
 blue       <orange.bg#0>orange</>           <magenta.bgGreen>
magenta on green</magenta.bgGreen></bgBlue> red3 </red> plain2<magenta>
magenta1 <red>red</red> <green>green</> magenta2</magenta> plain3`,
      ctx
    );

    const e = `plain1 [31mred1[44m on blue[36m cyan on blue[31m[30m black[31m[49m[39m
[31m[44m[30m on blue[31m[32m[48;5;220mgreen on gold[44m[31m red2 on[49m[39m
[31m[44m blue       [38;5;214m[48;5;16morange[44m[31m           [35m[42m[44m[31m[49m[39m
[31m[44m[35m[42mmagenta on green[44m[31m[49m red3 [39m plain2[35m[39m
[35mmagenta1 [31mred[35m [32mgreen[35m magenta2[39m plain3`;
    expect(r).to.equal(e);
    console.log(r);
  });

  it("should support hex colors", () => {
    const ctx = new chalk.constructor({ level: 2 });
    const r = chalker("<#FFA010.bg#1f9020>hex colors</>", ctx);
    expect(r).to.equal("[38;5;214m[48;5;71mhex colors[49m[39m");
    console.log(r);
  });

  it("should support hex 'bg-#' colors", () => {
    const ctx = new chalk.constructor({ level: 2 });
    const r = chalker("<#FFA010.bg-#1f9020>hex colors</>", ctx);
    expect(r).to.equal("[38;5;214m[48;5;71mhex colors[49m[39m");
    console.log(r);
  });

  it("should support hex 'bg #' colors", () => {
    const ctx = new chalk.constructor({ level: 2 });
    const r = chalker("<#FFA010.bg-#1f9020>hex colors</>", ctx);
    expect(r).to.equal("[38;5;214m[48;5;71mhex colors[49m[39m");
    console.log(r);
  });

  it("should support rgb triples", () => {
    const ctx = new chalk.constructor({ level: 2 });
    const r = chalker("<(255, 10, 20).bg(20,10,255)>rgb red on blue</>", ctx);
    expect(r).to.equal("[38;5;196m[48;5;21mrgb red on blue[49m[39m");
    console.log(r);
    const r2 = chalker("<rgb(255, 10, 20).bgRgb(20,10,255)>rgb red on blue</>", ctx);
    expect(r2).to.equal(r);
  });

  it("should support keyword", () => {
    const ctx = new chalk.constructor({ level: 2 });
    const r = chalker(
      "<orange.bgKeyword(`green`)>orange on green</><'green'.bg gold>green on gold</>",
      ctx
    );
    expect(r).to.equal("[38;5;214m[48;5;34morange on green[49m[39m[38;5;34m[48;5;220mgreen on gold[49m[39m");
    console.log(r);
    const r2 = chalker(
      `<'orange'.bg("green")>orange on green</><(green).bg(gold)>green on gold</>`,
      ctx
    );
    expect(r2).to.equal(r);
  });

  it("should decode html escapes", () => {
    const ctx = new chalk.constructor({ level: 2 });
    const r = chalker(
      `<gold.bg-green>&lt;Gold on&gt; &xyz;&nbsp;Green-&quot;&amp;&apos;&copy;&reg;</gold.bg-green>`,
      ctx
    );
    const x = "[38;5;220m[48;5;34m<Gold on> &xyz;\xa0Green-\"&'©®[49m[39m";
    expect(r).to.equal(x);
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
