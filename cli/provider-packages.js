"use strict";

/* istanbul ignore file */
/* eslint-disable */

const optionalRequire = require("optional-require")(require);
const { processTasks } = require("./task-file");
const myPkg = require("../package.json");

function loadProviderPackages(providers) {
  providers.forEach(mod => {
    let modPkg;
    try {
      modPkg = require(`${mod}/package.json`);
    } catch (_err) {
      return;
    }
    const provider = modPkg.xrunProvider;
    if (!loaded) {
      if (!provider && !(modPkg && modPkg.dependencies && modPkg.dependencies[myPkg.name])) {
        // module is not marked as a provider and doesn't have @xarc/run as dep, assume not
        // a provider
        return;
      }
      // module looks like a provider and user does not have tasks loaded, continue
      // to see if module exports `loadTasks`
    } else if (!provider) {
      // not explicitly a provider and user has tasks, do nothing with it
      return;
    }

    const req = (provider && provider.module && `/${provider.module}`) || "";
    const providerMod = optionalRequire(`${mod}${req}`);
    if (providerMod) {
      const loadMsg = saveCwd !== opts.cwd ? `provider module ${mod}` : "";
      if (!loaded && providerMod.loadTasks) {
        // if user doesn't have any tasks loaded, and the provider exports loadTasks, then
        // automatically load tasks from provider
        processTasks(providerMod.loadTasks, loadMsg);
      } else if (provider) {
        // else only load if module explicitly marked itself as a provider
        processTasks(providerMod.loadTasks || providerMod, loadMsg);
      }
    }
  });
}

module.exports = {
  loadProviderPackages
};
