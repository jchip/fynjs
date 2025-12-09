const chalk = require("chalk");

let x = 0;
const interval = setInterval(() => {
  console.log(chalk.green("test command ") + x + " " + Date.now());
  x++;
  if (x > 5) clearInterval(interval);
}, 500);
