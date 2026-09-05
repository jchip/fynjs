//

module.exports = {
  title: "should remove a package from package.json",
  getArgs(options) {
    return []
      .concat(options.baseArgs)
      .concat([`--reg=${options.registry}`, `--layout=detail`, `remove`, `--no-audit`, `mod-g`]);
  }
};
