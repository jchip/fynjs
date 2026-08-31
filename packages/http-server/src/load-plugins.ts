import assert from "assert";
import Path from "path";
import { createRequire } from "module";
import { map as xaaMap } from "xaa";
import { fastifyPluginDecorate } from "./fastify-plugin-decorate.js";

/**
 * The fields to look for a plugin's register on a loaded module, in order.
 *
 * Matches electrode-server so a module written for it drops in unchanged.
 */
const PLUGIN_FIELDS = ["fastifyPlugin", "default.fastifyPlugin", "plugin", "default"];

/** read a dot-delimited path off an object, `undefined` if any hop is missing */
const getPath = (obj: any, path: string): any =>
  path.split(".").reduce((acc, key) => (acc === undefined || acc === null ? acc : acc[key]), obj);

/**
 * A module could be one in node_modules or a file in a path relative to CWD.
 * - module in node_modules: no leading "."
 * - file in a directory: relative path with leading "." under CWD, resolve
 *   the full path for require
 */
const fullRequirePath = (x: string): string => (x.startsWith(".") ? Path.resolve(x) : x);

/** require `name`, from `fromPath` when given, else relative to this module */
const requireModule = (name: string, fromPath?: string): any => {
  const xrequire = fromPath
    ? createRequire(Path.join(fromPath, "_"))
    : createRequire(import.meta.url);
  return xrequire(name);
};

const num = (x: any): number => (typeof x === "string" ? parseInt(x, 10) : x);
const checkNaN = (x: any): number => (isNaN(x) ? Infinity : x);
const priorityOf = (p: any): number => checkNaN(num(p.priority));
const isEnabled = (p: any): boolean => p.__name !== "requireFromPath" && p.enable !== false;

/**
 * Resolve which module a plugin should be loaded from.
 *
 * With no `module` field the plugin's own key in the plugins config is the
 * module name, which is what makes `{ "./plugins/foo": {} }` work.
 */
const getPluginModule = (p: any): { name: string; requireFromPath?: string } => {
  const requireFromPath = p.requireFromPath;

  if (typeof p.module === "string") {
    return { name: p.module, requireFromPath };
  }

  if (p.module && typeof p.module === "object") {
    assert(p.module.name, `plugin ${p.__name} 'module' must have 'name' field`);
    assert(
      !p.module.requireFromPath || typeof p.module.requireFromPath === "string",
      `plugin ${p.__name} 'module.requireFromPath' must be a string`
    );
    return { requireFromPath, ...p.module };
  }

  if (p.module !== false) {
    return { name: p.__name, requireFromPath };
  }

  throw new Error(`plugin ${p.__name} disable 'module' but has no 'register' field`);
};

/**
 * Load a single plugin's register function, from its `register` field if given,
 * otherwise by requiring its module.
 */
const loadPlugin = async (p: any, topRequireFromPath?: string): Promise<any> => {
  if (p.register) {
    return fastifyPluginDecorate(p);
  }

  const pluginMod = getPluginModule(p);

  let name: string;
  let mod: any;
  let fromPath = pluginMod.requireFromPath || topRequireFromPath;

  if (fromPath) {
    name = pluginMod.name;
    p.requireFromPath = fromPath;
  } else {
    name = fullRequirePath(pluginMod.name);
    p.requireFromPath = "";
  }

  try {
    mod = requireModule(name, fromPath);
  } catch (error: any) {
    const fromMsg = fromPath ? ` from path: ${fromPath}` : "";
    error.message = `Failed loading module ${pluginMod.name}${fromMsg}: ${error.message}`;
    throw error;
  }

  const pluginField = PLUGIN_FIELDS.find(x => getPath(mod, x));
  const pluginExport = (pluginField && getPath(mod, pluginField)) || mod;
  p.register = pluginExport.register || pluginExport;

  const msg = `for plugin '${p.__name}' from exported field '${pluginField}' of its module from '${name}'`;
  assert(p.register, `register of plugin is falsy value: ${p.register} - ${msg}`);
  assert(typeof p.register === "function", `register of plugin is not a function - ${msg}`);

  return fastifyPluginDecorate(p);
};

/**
 * Turn the plugins config object into the ordered array of plugins to register.
 *
 * Disabled plugins are dropped, and the rest are sorted by `priority` - lower
 * registers earlier, and anything non-numeric sorts last.
 *
 * @param plugins - the `config.plugins` object
 * @returns plugins in registration order, each with a resolved `register`
 */
export async function convertPluginsToArray(plugins: Record<string, any> = {}): Promise<any[]> {
  const topRequireFromPath = plugins.requireFromPath;

  assert(
    !topRequireFromPath || typeof topRequireFromPath === "string",
    `config.plugins.requireFromPath must be a string`
  );

  const arr = Object.keys(plugins)
    .map(k => ({ __name: k, ...plugins[k] }))
    .filter(isEnabled)
    // sort is stable in node, so equal priorities keep their config order
    .sort((a, b) => priorityOf(a) - priorityOf(b));

  return xaaMap(arr, (p: any) => loadPlugin(p, topRequireFromPath));
}
