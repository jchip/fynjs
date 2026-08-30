import Fs from "fs";
import Path from "path";

import { makeOptionalImport } from "optional-import";

const optionalImport = makeOptionalImport(import.meta);


type ConfigOptions = {
  cwd?: string;
};

/**
 * manage fynpo config
 */
export class FynpoConfigManager {
  private options: ConfigOptions;
  private _topDir: string;
  private _config: any;
  private _type: string;

  constructor(opts: ConfigOptions = {}) {
    this.options = { cwd: process.cwd(), ...opts };
    this._topDir = undefined;
    this._config = undefined;
  }

  async load() {
    if (!this._config) {
      await this.search();
    }
    return this._config;
  }

  /**
   * config loaded
   */
  get config() {
    return this._config;
  }

  /**
   * Get the description of the monorepo detected
   * - "fynpo monorepo"
   * - "lerna monorepo with fynpo"
   */
  get repoType() {
    return this._type;
  }

  /**
   * current working directory
   * - this may be different than topDir.
   */
  get cwd() {
    return this.options.cwd;
  }

  /**
   * top dir of the fynpo monorepo
   */
  get topDir() {
    return this._topDir;
  }

  private async readJson(file: string) {
    try {
      const data = await Fs.promises.readFile(file, "utf8");
      return JSON.parse(data);
    } catch (err) {
      if (err.code !== "ENOENT") {
        const msg = `Failed to read JSON file ${file} - ${err.message}`;
        throw new Error(msg);
      }

      throw err;
    }
  }

  private async search() {
    let dir = this.options.cwd;
    let prevDir = dir;
    let count = 0;

    do {
      // allow manually disable fynpo with a file
      if (Fs.existsSync(Path.join(dir, ".no-fynpo"))) {
        break;
      }

      //
      // `fynpo.config.js` loads as a module: an absent file falls back, while one that exists
      // but throws still surfaces as an error rather than being mistaken for absent.
      //
      // `fynpo.config.json` is NOT loaded as a module - `import()` of JSON needs an import
      // attribute (`ERR_IMPORT_ATTRIBUTE_MISSING` without one), and reading it as JSON is what
      // it is anyway. `readJson` already reports a malformed file and swallows only ENOENT.
      //
      const configMod = await optionalImport(Path.join(dir, "fynpo.config.js"), {
        default: undefined,
      });

      if (configMod) {
        // a CJS config's `module.exports`, or an ESM config's `export default`, is on `.default`
        this._config = configMod.default ?? configMod;
      } else {
        try {
          this._config = await this.readJson(Path.join(dir, "fynpo.config.json"));
        } catch (_e) {
          //
        }
      }

      if (this._config) {
        this._type = "fynpo monorepo";
        break;
      }

      try {
        this._config = await this.readJson(Path.join(dir, "fynpo.json"));
        this._type = "fynpo monorepo";
        break;
      } catch (_e) {
        //
      }

      try {
        const lerna = await this.readJson(Path.join(dir, "lerna.json"));
        if (lerna.fynpo) {
          this._type = "lerna monorepo with fynpo";
          this._config = lerna;
          break;
        }
      } catch (_e) {
        //
      }

      prevDir = dir;
      dir = Path.dirname(dir);
    } while (++count < 50 && dir !== prevDir);

    //
    // No `patterns` alias any more - see the matching note in fynpo/src/utils.ts loadConfig.
    // `patterns` bypasses auto-search, while `include` is meant to filter what auto-search
    // found. The raw `packages` config is carried through and resolved downstream. FPO-17.
    //

    this._topDir = dir;
  }
}
