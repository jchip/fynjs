import chalk from "chalk";

const PKG_NAME = "@fynjs/http-server";
const PKG_URL = "https://github.com/jchip/fynjs";
const caught = chalk.cyan("caught");

export const ErrorCommon = {
  fileIssue: chalk.green(`
    If you have followed this resolution step and you are still seeing an
    error, please file an issue on the fynjs repository

    ${PKG_URL}
  `),
  errContext: `${PKG_NAME} ${caught} an error while starting your server`
};
