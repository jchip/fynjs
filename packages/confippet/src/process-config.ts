import * as fs from "fs";
import { defaults, forEach, get, isEmpty } from "lodash-es";

/** a config reference the templates asked for but the context could not supply */
export type MissingRef = { path: string; value: any; tmpl: string };

/** how many times the whole config is walked before giving up on templates */
const MAX_RUN = 20;

function processObj(obj: any, data: any): void {
  const depthPath = data.depth.join(".");

  forEach(obj, (v: any, k: any) => {
    if (v !== null && typeof v === "object") {
      data.depth.push(k);
      processObj(v, data);
      data.depth.pop();
      return;
    }

    /**
     * Resolve one `{{...}}` body against the context.
     *
     * The body is colon-delimited: the first part names the context path, the
     * rest are params. A leading `-` makes the rest a literal.
     */
    const resolve = (tmpl: string): string => {
      const refs = tmpl.split(":");
      const path = refs[0];

      if (path.startsWith("-")) {
        return path.slice(1);
      }

      const x = get(data.context, path);

      if (typeof x === "function") {
        return x({
          context: data.context,
          config: data.config,
          obj,
          key: k,
          value: v,
          tmpl,
          params: refs.slice(1),
          depthPath
        });
      } else if (x === undefined) {
        data.missing.push({ path: `${depthPath}.${k}`, value: v, tmpl });
        return "";
      } else {
        const extras = refs.slice(1).map(resolve).join("");
        return `${x}${extras}`;
      }
    };

    if (typeof v === "string" && v.includes("{{")) {
      obj[k] = v.replace(/\{\{([^}]+)}}/g, (_match: string, tmpl: string) => {
        const newV = resolve(tmpl);
        // a substitution that itself contains a template needs another pass
        data.more += typeof newV === "string" && newV.includes("{{") ? 1 : 0;
        return newV;
      });
    }
  });
}

/**
 * Resolve every `{{...}}` template in a config, in place.
 *
 * Templates are resolved against a context of the config itself plus process
 * information, and re-run until no substitution produces another template.
 *
 * @param config the config to process, mutated in place
 * @param options `{ context }` to add to or override the built-in context
 *
 * @returns the references that could not be resolved
 */
export function processConfig(config?: any, options?: any): MissingRef[] {
  if (isEmpty(config)) {
    return [];
  }

  options = options || {};

  const context: Record<string, any> = {
    config,
    process,
    argv: process.argv,
    cwd: process.cwd(),
    env: process.env,
    now: Date.now,

    readFile: (data: any) => {
      if (data.params[0]) {
        const enc = data.params[1] || "utf8";
        return fs.readFileSync(data.params[0].trim()).toString(enc.trim() as BufferEncoding);
      }
      throw new Error("config file readFile template missing filename");
    },

    getEnv: (data: any) => {
      if (data.params[0]) {
        let value = process.env[data.params[0]];
        if (value) {
          const cc = data.params[1];
          if (cc === "lowerCase" || cc === "LC") {
            value = value.toLowerCase();
          } else if (cc === "upperCase" || cc === "UC") {
            value = value.toUpperCase();
          }
        }
        return value;
      }
      return undefined;
    }
  };

  defaults(context, options.context);

  const data = { config, context, options, more: 1, missing: [] as MissingRef[], depth: ["config"] };

  for (let i = 0; data.more > 0; i++) {
    if (i >= MAX_RUN) {
      throw new Error(`Unable to process config after ${MAX_RUN} passes.`);
    }
    data.more = 0;
    processObj(config, data);
  }

  return data.missing;
}

export default processConfig;

