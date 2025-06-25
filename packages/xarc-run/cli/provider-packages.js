"use strict";

const { makeOptionalRequire } = require("optional-require");
const { processTasks } = require("./task-file");
const WrapProcess = require("./wrap-process");
const myPkg = require("../package.json");

/**
 * Search for provider packages in the node_modules directory.
 *
 * When does xrun load provider packages?
 *
 * 1. When the user has no tasks loaded
 * 2. When the user sets the `loadProviderModules` option in their package.json under the `xrun` key
 *
 * What's considered a provider package?
 *
 * 1. The package sets the `xrunProvider` config in its package.json
 * 2. The package has @xarc/run listed in its dependencies
 *
 * What module does xrun require from the provider package to look for tasks?
 *
 * 1. The provider package sets `module` prop under the `xrunProvider` config in its package.json
 * 2. Otherwise, xrun will require the provider package using its name
 *
 * How does xrun load tasks from the provider package?
 *
 * 1. If the provider module has a `loadTasks` export function, it will be used to load tasks
 *
 * @param {*} userPkg - the user's package.json object, typically the one in CWD
 * @param {*} saveCwd - the CWD when xrun started, before xrun updated it to user specified CWD
 * @param {*} opts - the command line options
 */
function loadProviderPackages(userPkg, saveCwd, opts) {
  const optionalRequire = makeOptionalRequire(opts.cwd || WrapProcess.cwd());
  const providers = Object.keys(
    Object.assign({}, userPkg.optionalDependencies, userPkg.devDependencies, userPkg.dependencies)
  );
  providers.forEach(pkgName => {
    const providerPkg = optionalRequire(`${pkgName}/package.json`);
    if (!providerPkg) {
      return;
    }
    const provider = providerPkg.xrunProvider;
    if (!provider && !providerPkg.dependencies?.[myPkg.name]) {
      // module is not marked as a provider and doesn't have @xarc/run as dep, assume not
      // a provider
      return;
    }
    // module looks like a provider and user does not have tasks loaded, continue
    // to see if module exports `loadTasks`

    const req = (provider?.module && `/${provider.module}`) || "";
    const providerMod = optionalRequire(`${pkgName}${req}`);
    if (providerMod?.loadTasks) {
      const loadMsg = saveCwd !== opts.cwd ? `provider package ${pkgName}` : "";
      processTasks(providerMod.loadTasks, loadMsg);
    }
  });
}

module.exports = {
  loadProviderPackages
};
