import { providerTypes, store, util } from "@fynjs/confippet";
import defaultConfig from "./config/default.js";
import developmentConfig from "./config/development.js";
import productionConfig from "./config/production.js";
import qaConfig from "./config/qa.js";
import stagingConfig from "./config/staging.js";
import testConfig from "./config/test.js";

/**
 * The internal per-deployment config overlays, keyed by NODE_ENV.
 *
 * electrode-server read these off disk with electrode-confippet's file
 * providers. They are static imports here so a bundler keeps them, and nothing
 * has to ship `dist/config` as loose files - the composition itself still runs
 * through confippet, with each overlay supplied as a handler provider.
 */
const DEPLOYMENT_CONFIGS: Record<string, Record<string, any>> = {
  development: developmentConfig,
  production: productionConfig,
  qa: qaConfig,
  staging: stagingConfig,
  test: testConfig
};

/** provider order: internal defaults first, deployment overlay over them */
const ORDER_DEFAULT = 100;
const ORDER_DEPLOYMENT = 140;
/** decors sit between the internal config and the caller's own */
const ORDER_DECOR = 500;
/** appConfig is last, ahead only of confippet's own `NODE_CONFIG` provider */
const ORDER_APP = 900;

const isPlainObject = (x: any): boolean => Boolean(x) && typeof x === "object" && !Array.isArray(x);

/**
 * Deep merge `src` into `target`, in place.
 *
 * confippet's merge, with a guard: a source that isn't a plain object is not a
 * config partial, and lodash would spread a string or an array into numbered
 * keys rather than ignore it.
 *
 * @param target - object to merge into
 * @param src - object to merge from
 * @returns target
 */
export function merge<T extends Record<string, any>>(target: T, src: any): T {
  if (!isPlainObject(src)) {
    return target;
  }

  return util.merge(target, src);
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
 * then each decor in order, then the caller's own config, then confippet's
 * `NODE_CONFIG` / `CONFIPPET*` environment provider.
 *
 * Every layer is a confippet handler provider, so all of confippet's
 * composition semantics apply: arrays replace, a `+`-prefixed key unions
 * instead, and `{{...}}` templates in the result are resolved afterwards
 * against the config itself, the process environment and `deployment`.
 *
 * @param appConfig - the caller's config, applied last so it always wins
 * @param decors - extra config objects applied between the internal defaults and appConfig
 * @param deployment - which overlay to apply, defaults to NODE_ENV
 * @returns the composed config, as a confippet store - a plain config object
 *   with a hidden `$(path)` reader and `_$` operations
 */
export function composeConfig(
  appConfig: any = {},
  decors: any[] = [],
  deployment: string | undefined = getDeployment()
): Record<string, any> {
  const providers: Record<string, any> = {
    httpServerDefault: {
      type: providerTypes.required,
      order: ORDER_DEFAULT,
      handler: () => defaultConfig
    },
    httpServerDeployment: {
      type: providerTypes.optional,
      order: ORDER_DEPLOYMENT,
      handler: () => (deployment && DEPLOYMENT_CONFIGS[deployment]) || {}
    },
    appConfig: {
      type: providerTypes.required,
      order: ORDER_APP,
      handler: () => appConfig
    }
  };

  const decorKeys = decors.map((decor, ix) => {
    const key = `decor${ix}`;
    providers[key] = {
      type: providerTypes.required,
      order: ORDER_DECOR + ix,
      handler: () => decor
    };
    return key;
  });

  const config = store();

  config._$.compose({
    //
    // no file provider is in the list, so nothing is read from disk and the
    // directory is never consulted - it only has to be a path confippet can
    // resolve
    //
    dir: ".",
    providers,
    providerList: [
      "httpServerDefault",
      "httpServerDeployment",
      ...decorKeys,
      "appConfig",
      // confippet's own: NODE_CONFIG and any CONFIPPET* env var, as JSON
      "confippetEnv"
    ],
    context: { deployment: deployment || "" }
  });

  config._$.process({ context: { deployment: deployment || "" } });

  // `listener` is a hook, not config - it is consumed before composition
  delete config.listener;

  return config;
}
