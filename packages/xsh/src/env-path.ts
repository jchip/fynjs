import Path from "node:path";

const pathDelim = Path.delimiter;

const defaultEnvKey = process.platform === "win32" ? "Path" : "PATH";

/** an env container like `process.env` */
export type EnvContainer = Record<string, string | undefined>;

/**
 * Find the key for the PATH variable in `env` - case insensitive fallback for
 * platforms (Windows) where it's not exactly `PATH`.
 */
export function findEnvKey(env: EnvContainer, key?: string): string | undefined {
  if (!key || !Object.prototype.hasOwnProperty.call(env, key)) {
    for (const x of Object.keys(env)) {
      if (x.toLowerCase() === "path") {
        key = x;
        break;
      }
    }
  }

  return key;
}

export const envKey = findEnvKey(process.env, defaultEnvKey) as string;

function check(env?: EnvContainer | string): EnvContainer {
  // allow calls like this: envPath.add("addition_path", "existing_path");
  if (typeof env === "string") {
    env = { [envKey]: env };
  } else if (!env) {
    env = process.env;
  }

  return env;
}

/**
 * Add `p` to the front of PATH in `env`, removing any existing occurrences.
 *
 * @param p path to add
 * @param env env container, a PATH string, or undefined for `process.env`
 * @returns the updated PATH string
 */
export function addToFront(p: string | null | undefined, env?: EnvContainer | string): string {
  env = check(env);

  let update = env[envKey] || "";

  if (typeof p === "string" && p) {
    update = update.trim();
    const paths = update.split(pathDelim).filter(x => x && x !== p);
    paths.unshift(p);
    update = paths.join(pathDelim);
  }

  env[envKey] = update;

  return update;
}

/**
 * Add `p` to the end of PATH in `env`, removing any existing occurrences.
 *
 * @param p path to add
 * @param env env container, a PATH string, or undefined for `process.env`
 * @returns the updated PATH string
 */
export function addToEnd(p?: string | null, env?: EnvContainer | string): string {
  env = check(env);

  let update = env[envKey] || "";

  if (typeof p === "string" && p) {
    update = update.trim();
    const paths = update.split(pathDelim).filter(x => x && x !== p);
    paths.push(p);
    update = paths.join(pathDelim);
  }

  env[envKey] = update;

  return update;
}

/**
 * Add `p` to the end of PATH in `env` only if it's not already in there.
 *
 * @param p path to add
 * @param env env container, a PATH string, or undefined for `process.env`
 * @returns the updated PATH string
 */
export function add(p?: string | null, env?: EnvContainer | string): string {
  env = check(env);

  let update = env[envKey] || "";

  if (typeof p === "string" && p) {
    update = update.trim();
    const paths = update.split(pathDelim).filter(x => x);
    if (paths.indexOf(p) < 0) {
      paths.push(p);
      update = paths.join(pathDelim);
    }
  }

  env[envKey] = update;

  return update;
}

export const envPath = { addToFront, addToEnd, add, envKey, findEnvKey };
