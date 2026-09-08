import Fs from "fs";
import Path from "path";
import { createRequire } from "node:module";
import { readJson, readJsonSync } from "./util.js";
import { FynpoConfigError } from "./config-error.js";

import { makeOptionalImport } from "optional-import";

const optionalImport = makeOptionalImport(import.meta);
const xrequire = createRequire(import.meta.url);

export type ConfigOptions = {
  cwd?: string;
  configPath?: string;
  allowLernaWithoutFynpo?: boolean;
};

/**
 * manage fynpo config
 */
export class FynpoConfigManager {
  private options: ConfigOptions;
  private _topDir: string | undefined;
  private _config: any;
  private _type: string | undefined;
  private _fileName: string | undefined;
  private _filePath: string | undefined;

  constructor(opts: ConfigOptions = {}) {
    this.options = { cwd: process.cwd(), ...opts };
    this._topDir = undefined;
    this._config = undefined;
    this._type = undefined;
    this._fileName = undefined;
    this._filePath = undefined;
  }

  async load() {
    if (!this._config) {
      if (this.options.configPath) {
        await this.loadExplicit(this.options.configPath);
      } else {
        await this.search();
      }
    }
    return this._config;
  }

  loadSync() {
    if (!this._config) {
      if (this.options.configPath) {
        this.loadExplicitSync(this.options.configPath);
      } else {
        this.searchSync();
      }
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
   * - "lerna monorepo"
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

  /**
   * file name of the loaded config (e.g. "fynpo.config.js", "fynpo.json", "lerna.json")
   */
  get fileName() {
    return this._fileName;
  }

  /**
   * absolute path to the loaded config file
   */
  get filePath() {
    return this._filePath;
  }

  private async readJson(file: string) {
    try {
      return await readJson(file);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        throw new FynpoConfigError(file, err.message);
      }

      throw err;
    }
  }

  /**
   * A config file that's simply absent means "keep searching". Anything else - a JSON syntax
   * error above all - must surface, or a broken config gets reported as no config found and
   * callers go on to create/overwrite one.
   */
  private isNotFound(err: any) {
    return err?.code === "ENOENT";
  }

  private readJsonSync(file: string) {
    try {
      return readJsonSync(file);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        throw new FynpoConfigError(file, err.message);
      }

      throw err;
    }
  }

  private async loadExplicit(configPath: string) {
    const fullPath = Path.resolve(this.options.cwd || "", configPath);
    this._filePath = fullPath;
    this._fileName = Path.basename(fullPath);
    this._topDir = Path.dirname(fullPath);

    if (fullPath.endsWith(".js") || fullPath.endsWith(".cjs") || fullPath.endsWith(".mjs")) {
      const configMod = await optionalImport(fullPath, {
        default: undefined,
      });
      if (configMod) {
        this._config = configMod.default ?? configMod;
        this._type = "fynpo monorepo";
      }
    } else {
      this._config = await this.readJson(fullPath);
      this._type = this._fileName === "lerna.json" ? "lerna monorepo" : "fynpo monorepo";
    }
  }

  private loadExplicitSync(configPath: string) {
    const fullPath = Path.resolve(this.options.cwd || "", configPath);
    this._filePath = fullPath;
    this._fileName = Path.basename(fullPath);
    this._topDir = Path.dirname(fullPath);

    if (fullPath.endsWith(".js") || fullPath.endsWith(".cjs") || fullPath.endsWith(".mjs")) {
      if (Fs.existsSync(fullPath)) {
        try {
          const configMod = xrequire(fullPath);
          this._config = configMod?.default ?? configMod;
          this._type = "fynpo monorepo";
        } catch (err: any) {
          throw new Error(`Failed to load ${fullPath} - ${err.message}`);
        }
      }
    } else {
      this._config = this.readJsonSync(fullPath);
      this._type = this._fileName === "lerna.json" ? "lerna monorepo" : "fynpo monorepo";
    }
  }

  private async search() {
    let dir = this.options.cwd || process.cwd();
    let prevDir = dir;
    let count = 0;

    do {
      // allow manually disable fynpo with a file
      if (Fs.existsSync(Path.join(dir, ".no-fynpo"))) {
        break;
      }

      const jsPath = Path.join(dir, "fynpo.config.js");
      const configMod = await optionalImport(jsPath, {
        default: undefined,
      });

      if (configMod) {
        // a CJS config's `module.exports`, or an ESM config's `export default`, is on `.default`
        this._config = configMod.default ?? configMod;
        this._fileName = "fynpo.config.js";
        this._filePath = jsPath;
        this._type = "fynpo monorepo";
        break;
      } else {
        try {
          const cfgJson = Path.join(dir, "fynpo.config.json");
          this._config = await this.readJson(cfgJson);
          this._fileName = "fynpo.config.json";
          this._filePath = cfgJson;
          this._type = "fynpo monorepo";
          break;
        } catch (err: any) {
          if (!this.isNotFound(err)) {
            throw err;
          }
        }
      }

      try {
        const fynpoJson = Path.join(dir, "fynpo.json");
        this._config = await this.readJson(fynpoJson);
        this._fileName = "fynpo.json";
        this._filePath = fynpoJson;
        this._type = "fynpo monorepo";
        break;
      } catch (err: any) {
        if (!this.isNotFound(err)) {
          throw err;
        }
      }

      try {
        const lernaJson = Path.join(dir, "lerna.json");
        const lerna = await this.readJson(lernaJson);
        if (lerna.fynpo || this.options.allowLernaWithoutFynpo) {
          this._type = lerna.fynpo ? "lerna monorepo with fynpo" : "lerna monorepo";
          this._config = lerna;
          this._fileName = "lerna.json";
          this._filePath = lernaJson;
          break;
        }
      } catch (err: any) {
        if (!this.isNotFound(err)) {
          throw err;
        }
      }

      prevDir = dir;
      dir = Path.dirname(dir);
    } while (++count < 50 && dir !== prevDir);

    this._topDir = this._config ? dir : undefined;
  }

  private searchSync() {
    let dir = this.options.cwd || process.cwd();
    let prevDir = dir;
    let count = 0;

    do {
      if (Fs.existsSync(Path.join(dir, ".no-fynpo"))) {
        break;
      }

      const jsPath = Path.join(dir, "fynpo.config.js");
      if (Fs.existsSync(jsPath)) {
        try {
          const configMod = xrequire(jsPath);
          this._config = configMod?.default ?? configMod;
          this._fileName = "fynpo.config.js";
          this._filePath = jsPath;
          this._type = "fynpo monorepo";
          break;
        } catch (err: any) {
          throw new Error(`Failed to load ${jsPath} - ${err.message}`);
        }
      } else {
        const cfgJson = Path.join(dir, "fynpo.config.json");
        if (Fs.existsSync(cfgJson)) {
          try {
            this._config = this.readJsonSync(cfgJson);
            this._fileName = "fynpo.config.json";
            this._filePath = cfgJson;
            this._type = "fynpo monorepo";
            break;
          } catch (err: any) {
            if (!this.isNotFound(err)) {
              throw err;
            }
          }
        }
      }

      const fynpoJson = Path.join(dir, "fynpo.json");
      if (Fs.existsSync(fynpoJson)) {
        try {
          this._config = this.readJsonSync(fynpoJson);
          this._fileName = "fynpo.json";
          this._filePath = fynpoJson;
          this._type = "fynpo monorepo";
          break;
        } catch (err: any) {
          if (!this.isNotFound(err)) {
            throw err;
          }
        }
      }

      const lernaJson = Path.join(dir, "lerna.json");
      if (Fs.existsSync(lernaJson)) {
        try {
          const lerna = this.readJsonSync(lernaJson);
          if (lerna.fynpo || this.options.allowLernaWithoutFynpo) {
            this._type = lerna.fynpo ? "lerna monorepo with fynpo" : "lerna monorepo";
            this._config = lerna;
            this._fileName = "lerna.json";
            this._filePath = lernaJson;
            break;
          }
        } catch (err: any) {
          if (!this.isNotFound(err)) {
            throw err;
          }
        }
      }

      prevDir = dir;
      dir = Path.dirname(dir);
    } while (++count < 50 && dir !== prevDir);

    this._topDir = this._config ? dir : undefined;
  }
}
