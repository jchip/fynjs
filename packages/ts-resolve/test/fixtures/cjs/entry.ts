const { label } = require("./lib.js");
const { identity } = require("./util");
console.log(JSON.stringify({ label: label({ n: 3 }), id: identity("ok") }));
