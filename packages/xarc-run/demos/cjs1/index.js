#!/usr/bin/env node

const { optionalRequireCwd } = require("optional-require");

optionalRequireCwd("tsx/esm");

const { createRequire } = require("node:module");

const x = optionalRequireCwd("./t2.ts", { fail: err => console.log("fail", err) });

// const x = createRequire(process.cwd())("./t2.ts");

console.log("x is", x);
