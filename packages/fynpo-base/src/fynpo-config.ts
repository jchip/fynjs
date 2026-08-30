import Fs from "fs";
import Path from "path";

import { optionalRequire } from "optional-require";

import { resolvePackagesConfig } from "./packages-config.js";

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

      [".js", ".json"].find((ext) => {
        return (this._config = optionalRequire(Path.join(dir, `fynpo.config${ext}`)));
      });
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
    // `patterns` is discovery only. `packages` as an ARRAY is the historical shape and now
    // means publishInclude, so it must NOT become discovery patterns - only the object form's
    // `include` does. See FPO-17.
    //
    if (this._config && this._config.hasOwnProperty("packages")) {
      const { include } = resolvePackagesConfig(this._config.packages);
      if (include.length > 0) {
        this._config.patterns = include;
      }
    }

    this._topDir = dir;
  }
}
