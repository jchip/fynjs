"use strict";

const chalk = require("chalk");
const chalker = require("../..");

describe("chalker", function() {
  it("should support basic colors", () => {
    const r = chalker("<red.bold>red bold text</red.bold><bgBlue.green.bold>green on blue bold</>");
    expect(r).to.equal("[31m[1mred bold text[22m[39m[44m[32m[1mgreen on blue bold[22m[39m[49m");
    console.log(r);
  });

  it("should support hex colors", () => {
    const ctx = new chalk.constructor({ level: 2 });
    const r = chalker("<#FFA010.bg#1f9020>hex colors</>", ctx);
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
      "<orange.bgKeyword(`green`)>orange on green</orange><'green'.bg gold>green on gold</>",
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

  it("should fail for mismatched ()", () => {
    expect(() => chalker("<(10,20,30>bad</>")).to.throw("missing matching ()");
  });

  it("should fail if op name is invalid", () => {
    expect(() => chalker(`<blah(red)>bad</>`)).to.throw("blah is not a chalk function");
  });

  it("should fail for invalid keyword", () => {
    expect(() => chalker(`<blah>bad</blah>`)).to.throw(
      "blah is not found and invalid as a keyword"
    );
  });

  it("should remove markers", () => {
    const r = chalker.remove(
      "<red.bold>red bold text</red.bold><bgBlue.green.bold>green on blue bold</>"
    );
    expect(r).to.equal("red bold textgreen on blue bold");
  });
});
