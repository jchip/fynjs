//

module.exports = {
  title: "should add packages to package.json",
  getArgs(options) {
    return []
      .concat(options.baseArgs)
      .concat([
        `--reg=${options.registry}`,
        `--layout=detail`,
        `add`,
        `--no-audit`,
        `mod-a`,
        `--dev`,
        `mod-d`,
        `../../fixtures/mod-g`
      ]);
  }
};
