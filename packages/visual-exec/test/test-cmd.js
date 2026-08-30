// chalk 6 is ESM-only; require() of it on node >=22.12 yields the namespace,
// so the callable chalk is on `.default`
const chalk = require("chalk").default;

let x = 0;
const interval = setInterval(() => {
  console.log(chalk.green("test command ") + x + " " + Date.now());
  x++;
  if (x > 5) clearInterval(interval);
}, 500);
