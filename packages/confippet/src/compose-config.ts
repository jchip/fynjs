import * as Path from "path";
import * as fs from "fs";
import _ from "lodash";
import assert from "assert";
import defaultOpts from "./default-compose-opts.js";
import providerTypes from "./provider-types.js";
import processConfig from "./process-config.js";
import util from "./util.js";

/**
 * Load every enabled provider's config partial from one directory, merging into `data`.
 */
function composeConfigDir(dir: string, data: any, options: any): any {
  const exts: string[] = options.extSearch;
  const handlers = options.extHandlers;

  dir = Path.resolve(dir);

  const load = (key: string, provider: any) => {
    const found = exts
      .map(ext => {
        const fullF = Path.join(dir, `${provider.name}.${ext}`);

        if (fs.existsSync(fullF)) {
          assert(handlers[ext], `Config handler for extension ${ext} missing`);
          util.uMerge(data, handlers[ext](fullF));
          return ext;
        }

        return undefined;
      })
      .filter(x => x);

    if (_.isEmpty(found)) {
      const msg =
        `Config provider ${key}: no file ${provider.name} of ` +
        `extensions ${exts} found in ${dir}`;

      if (provider.type === providerTypes.required) {
        if (options.failMissing !== false) {
          throw new Error(msg);
        }
      } else if (provider.type === providerTypes.warn) {
        if (options.warnMissing !== false) {
          console.error("WARNING:", msg);
        }
      }
    }
  };

  const filterOff = (filter: any) => {
    // if it's an array any element of the array is falsy => filtered off
    // otherwise if itself is falsy => filtered off
    return _.isArray(filter) ? _.find(filter, x => !x) !== undefined : !filter;
  };

  const isEnable = (p: any) => {
    const x = p.filter;
    assert(p.type, "config provider type must be specified");
    return (
      p.type !== providerTypes.disabled &&
      (p.name || p.handler) &&
      (x === undefined ? true : !filterOff(x))
    );
  };

  const num = (x: any) => (_.isString(x) ? parseInt(x, 10) : x);
  // a provider with no usable order runs first
  const checkNaN = (x: any) => (isNaN(x) ? -1 : x);
  const order = (p: any) => checkNaN(num(p.order));

  const providers = options.providers;

  const getList = (): string[] => options.providerList || Object.keys(providers);

  const list = getList().filter(k => isEnable(providers[k]));

  assert(list.length > 0, "config providers empty");

  list
    .sort((a, b) => order(providers[a]) - order(providers[b]))
    .forEach(k => {
      const p = providers[k];
      if (p.handler) {
        if (options.verbose) {
          console.log("Confippet.compose: calling config provider:", k, JSON.stringify(p));
        }
        util.uMerge(data, p.handler());
      } else {
        if (options.verbose) {
          console.log("Confippet.compose: loading config provider:", k, JSON.stringify(p));
        }
        load(k, p);
      }
    });

  return data;
}

/**
 * Compose a single config from the partial files in one or more directories.
 *
 * The options are themselves run through `processConfig` first, so provider
 * names and filters written as `{{deployment}}` or `{{instance}}` are resolved
 * against `options.context` before any lookup happens.
 *
 * @param options compose options, merged over the built-in defaults unless
 *   `useDefaults` is `false`
 *
 * @returns the composed config data
 */
export function composeConfig(options?: any): any {
  options = options || {};

  if (options.useDefaults !== false) {
    options = util.merge(defaultOpts(), options);
  }

  processConfig(options, options);

  const dirs = options.dirs || [options.dir];
  const data = {};

  dirs.forEach((dir: string) => {
    composeConfigDir(dir, data, options);
  });

  return data;
}

export default composeConfig;
