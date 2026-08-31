import defaultConfig from "./config/default.js";
import developmentConfig from "./config/development.js";
import productionConfig from "./config/production.js";
import qaConfig from "./config/qa.js";
import stagingConfig from "./config/staging.js";
import testConfig from "./config/test.js";

/**
 * The internal per-deployment config overlays, keyed by NODE_ENV.
 *
 * electrode-server read these off disk with electrode-confippet. Static imports
 * give the same composition without the extra dependency, and keep the files in
 * the bundle for consumers that don't ship `dist/config` as loose files.
 */
const DEPLOYMENT_CONFIGS: Record<string, Record<string, any>> = {
  development: developmentConfig,
  production: productionConfig,
  qa: qaConfig,
  staging: stagingConfig,
  test: testConfig
};

const isPlainObject = (x: any): boolean =>
  Boolean(x) && typeof x === "object" && !Array.isArray(x);

/**
 * Copy containers, share everything else.
 *
 * The source of a merge is often a long-lived object - the module-level default
 * config, or the caller's own - so a merge must never hand out a live reference
 * into it, or a later merge would write through and corrupt it. Functions and
 * class instances are shared deliberately: a plugin's `register` has to stay the
 * same function.
 */
const cloneValue = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  if (isPlainObject(value)) {
    const copy: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      copy[key] = cloneValue(value[key]);
    }
    return copy;
  }
  return value;
};

/**
 * Deep merge `src` into `target`, in place.
 *
 * Plain objects merge key by key; everything else - arrays, functions, class
 * instances, primitives - replaces wholesale. This matches how confippet's
 * `util.merge` behaves for the shapes a server config actually holds.
 *
 * @param target - object to merge into
 * @param src - object to merge from
 * @returns target
 */
export function merge<T extends Record<string, any>>(target: T, src: any): T {
  if (!isPlainObject(src)) {
    return target;
  }

  for (const key of Object.keys(src)) {
    const value = src[key];
    if (value === undefined) {
      continue;
    }
    if (isPlainObject(value) && isPlainObject(target[key])) {
      merge(target[key], value);
    } else {
      (target as Record<string, any>)[key] = cloneValue(value);
    }
  }

  return target;
}

/**
 * Read the current deployment name.
 *
 * Indexed rather than dotted so bundlers that constant-fold
 * `process.env.NODE_ENV` at build time leave this alone - the value has to be
 * whatever the process actually has at call time.
 */
export const getDeployment = (): string | undefined => process.env["NODE_ENV"];

/**
 * Compose the server config: internal defaults, then the deployment overlay,
 * then each decor in order, then the caller's own config.
 *
 * @param appConfig - the caller's config, applied last so it always wins
 * @param decors - extra config objects applied between the internal defaults and appConfig
 * @param deployment - which overlay to apply, defaults to NODE_ENV
 * @returns the composed config
 */
export function composeConfig(
  appConfig: any = {},
  decors: any[] = [],
  deployment: string | undefined = getDeployment()
): Record<string, any> {
  const config: Record<string, any> = {};

  merge(config, defaultConfig);

  if (deployment && DEPLOYMENT_CONFIGS[deployment]) {
    merge(config, DEPLOYMENT_CONFIGS[deployment]);
  }

  for (const decor of decors) {
    merge(config, decor);
  }

  merge(config, appConfig);

  // `listener` is a hook, not config - it is consumed before composition
  delete config.listener;

  return config;
}
