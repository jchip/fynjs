export type PkgInfo = {
  name: string;
  version: string;
};

export type NpmConfig = Record<string, string>;

export type NotifyData = PkgInfo & {
  newVersion: string;
};

export type CheckNewVersionOptions = {
  /** package info */
  pkg: PkgInfo;

  /** fetch dist tags for package from url */
  fetchDistTags?(
    url: string | URL,
    authToken: string,
    pkg?: PkgInfo
  ): Promise<Record<string, string>>;

  /** Alternate to fetchDistTags - provide a callback that will fetch JSON from given url */
  fetchJSON?(url: string, options?: any): Promise<any>;

  /** call this if version new version detected */
  notifyNewVersion?(data: any): void;

  /** directory to save meta data; default os.tmpdir() */
  saveMetaDir?: string;

  /** milliseconds to wait before checking again */
  checkInterval?: number;

  checkTag?: string;

  /** check if dist tags has a version that's newer than pkg */
  checkIsNewer?(pkg: PkgInfo, distTags: Record<string, string>, tag?: string): boolean;

  /**
   * NPM config
   *
   * Only interested these keys:
   *  - `'registry'` or `'@scope/registry'`
   *  - `'//registry.url/:_authToken'`
   *
   * Default to:
   * ```json
   * {
   *   "registry": "https://registry.npmjs.org/"
   * }
   * ```
   */
  npmConfig?: NpmConfig;
};
