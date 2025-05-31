// import requireAt from "require-at";

// const x = requireAt(process.cwd(), "./t2.mjs");

// console.log(x);

const { optionalRequire } = require("optional-require");

const x = optionalRequire("./t2.mjs");

console.log(x);
