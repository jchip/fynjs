"use strict";

const chalk = require("chalk");
const chalker = require("..");

function demo(x, ctx) {
  const r = chalker(x, ctx);

  x = x.replace(/(<\/?)([^>]*)(>)/g, (m, a, b) => {
    a = a.replace("<", "&lt;");
    b = b.replace(/\./g, chalk.red("."));
    return chalker(`<blue>${a}</><black>${b}</><blue>&gt;</>`);
  });
  x = chalk.bgKeyword("gray")(x);
  const indent = str => {
    return str
      .split("\n")
      .map((s, ix) => (ix > 0 ? `   ${s}` : s))
      .join("\n");
  };
  console.log(`   ${indent(x)}\n-> ${indent(r)}\n`);
}

console.log("");
demo("<red.bold>red bold text</red.bold> <bgBlue.green.bold>green on blue bold</>");

const ctx = new chalk.constructor({ level: 2 });
demo("<(255, 10, 20).bg(20,10,255)>rgb red on blue</> <gold.bg-green>gold on green</>", ctx);

demo("<cyan.bg-purple>HTML escaping: insert &lt; &gt; with &amp;lt; &amp;gt;</>");

demo("<#ff0000.bg#00ff00>red on green &#xD83D;&#xDC69; <orange>orange</> &#x2665; </>");

demo(
  `plain1 <red>red1<bgBlue> on blue<cyan> cyan on blue</><black> black
on blue</><green.bg-gold> green on gold</> red2 on
blue       <orange.bg#0> orange </>           <magenta.bgGreen>
magenta on green</></bgBlue> red3 </red> plain2<magenta>
magenta1 <red>red</red> <green>green</> magenta2</> plain3`
);
