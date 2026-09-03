//
// yarn's own v1 lockfile parser, vendored from yarnpkg/yarn v1.22.22 (the repo is frozen, and
// the v1 lockfile format with it). The grammar is upstream's byte for byte; the only deliberate
// change is `yamljs` in place of `js-yaml` for the YAML fallback path.
//
import parseLockfile from "./src/lockfile/parse";

/**
 * @param {string} str the yarn.lock contents
 * @param {string} [filename] name to report in parse errors
 * @returns {object} the lockfile as a map of `name@spec` to its resolution
 */
export function parseYarnLock(str: string, filename?: string): Record<string, unknown> {
  return parseLockfile(str, filename).object;
}

export default { parseYarnLock };
