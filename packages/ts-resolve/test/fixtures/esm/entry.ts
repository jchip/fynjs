import { label, type Shape } from "./lib.js";
import { identity } from "./util";
import { which } from "./both.js";
import { from } from "./nested";
const s: Shape = { n: 5 };
console.log(JSON.stringify({ label: label(s), id: identity("ok"), which, from }));
