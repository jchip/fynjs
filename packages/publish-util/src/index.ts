export { prePackObj, prePack } from "./prepack.ts";
export type { PrePackConfig } from "./prepack.ts";
export { postPack } from "./postpack.ts";
export { npmPublish } from "./npm-publish.ts";
export type { NpmPublishOptions } from "./npm-publish.ts";
export {
  getInfo,
  extractFromObj,
  removeFromObj,
  renameFromObj,
  keepStandardFields,
} from "./utils.ts";
export type {
  PackageInfo,
  ExtractSpec,
  RemoveSpec,
  RenameSpec,
} from "./utils.ts";

// Re-export utils as a namespace for backwards compatibility
import * as utils from "./utils.ts";
export { utils };
