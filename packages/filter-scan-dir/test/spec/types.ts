import type { Dirent, Stats } from "fs";
import { filterScanDir, filterScanDirSync } from "../../src/index.js";
import type {
  ExtrasData,
  FilterCallback,
  GroupingOptions,
  GroupingResult,
  Options,
} from "../../src/index.js";

// Compile-time checks only. This function is never executed by the test runner.
export function checkFilterTypes(fullStat: boolean) {
  const asyncFiles: Promise<string[]> = filterScanDir({
    filter: (_name, _path, { stat }) => {
      const metadata: Stats = stat;
      // @ts-expect-error Stats does not expose a Dirent name.
      stat.name;
      return metadata.size > 0;
    },
    filterDir: (_name, _path, { stat }) => stat.mode > 0,
  });
  const syncFiles: string[] = filterScanDirSync({
    fullStat: true,
    filter: (_name, _path, { stat }) => stat.size > 0,
  });
  filterScanDir({
    fullStat: undefined,
    filter: (_name, _path, { stat }) => {
      const metadata: Stats = stat;
      // @ts-expect-error Explicit undefined retains the default Stats mode.
      stat.name;
      return metadata.size > 0;
    },
  });
  filterScanDirSync({
    fullStat: undefined,
    filter: (_name, _path, { stat }) => {
      const metadata: Stats = stat;
      // @ts-expect-error Synchronous undefined also retains Stats mode.
      stat.name;
      return metadata.size > 0;
    },
  });

  filterScanDir({
    fullStat: false,
    filter: (_name, _path, { stat }) => {
      const entry: Dirent = stat;
      // @ts-expect-error Dirent has no file size.
      stat.size;
      return entry.isFile();
    },
    filterDir: (_name, _path, { stat }) => {
      // @ts-expect-error Directory Dirents have no permissions.
      stat.mode;
      return stat.isDirectory();
    },
  });
  filterScanDirSync({
    fullStat: false,
    filter: (_name, _path, { stat }) => {
      const entry: Dirent = stat;
      // @ts-expect-error Synchronous Dirents also lack metadata.
      stat.mtime;
      return entry.isFile();
    },
  });

  filterScanDir({
    fullStat,
    filter: (_name, _path, { stat }) => {
      const entry: Dirent | Stats = stat;
      // @ts-expect-error A runtime boolean does not guarantee Stats.
      stat.size;
      return entry.isFile();
    },
  });
  filterScanDirSync({
    fullStat,
    filter: (_name, _path, { stat }) => {
      // @ts-expect-error A runtime boolean does not guarantee Dirent.
      const entry: Dirent = stat;
      return entry.isFile();
    },
  });

  const asyncGroups: Promise<GroupingResult> = filterScanDir({
    grouping: true,
    filter: (_name, _path, { stat }) => (stat.size > 0 ? "nonempty" : false),
  });
  const undefinedAsyncGroups: Promise<GroupingResult> = filterScanDir({
    grouping: true,
    fullStat: undefined,
    filter: (_name, _path, { stat }) => {
      // @ts-expect-error Grouped undefined uses Stats too.
      stat.name;
      return stat.size > 0;
    },
  });
  const undefinedSyncGroups: GroupingResult = filterScanDirSync({
    grouping: true,
    fullStat: undefined,
    filter: (_name, _path, { stat }) => {
      // @ts-expect-error Synchronous grouped undefined uses Stats too.
      stat.name;
      return stat.size > 0;
    },
  });
  const syncGroups: GroupingResult = filterScanDirSync({
    grouping: true,
    fullStat: false,
    filter: (_name, _path, { stat }) => {
      // @ts-expect-error Grouping does not change the metadata mode.
      stat.size;
      return stat.isFile() ? "files" : false;
    },
  });
  const dynamicGroups: Promise<GroupingResult> = filterScanDir({
    grouping: true,
    fullStat,
    filter: (_name, _path, { stat }) => {
      // @ts-expect-error Grouped runtime booleans still have union metadata.
      stat.size;
      return stat.isFile();
    },
  });

  const options: Options = { filter: (_name, _path, { stat }) => stat.isFile() };
  const groupedOptions: GroupingOptions = { ...options, grouping: true };
  const groupedVariable: Promise<GroupingResult> = filterScanDir(groupedOptions);
  const syncGroupedVariable: GroupingResult = filterScanDirSync(groupedOptions);
  const callback: FilterCallback = (_name, _path, extras: ExtrasData) => extras.stat.isFile();
  const statsCallback: FilterCallback<Stats> = (_name, _path, { stat }) => stat.size > 0;
  const direntCallback: FilterCallback<Dirent> = (_name, _path, { stat }) => stat.isFile();
  filterScanDir({ ...options, filter: callback });
  filterScanDir({ filter: statsCallback });
  filterScanDir({ fullStat: false, filter: direntCallback });
  // @ts-expect-error Dirent options must explicitly disable the default full stat mode.
  const missingFastMode: Options<false> = { filter: direntCallback };
  const fastOptions: Options<false> = { fullStat: false, filter: direntCallback };
  filterScanDir(fastOptions);
  // @ts-expect-error A Stats-only callback cannot run in Dirent mode.
  filterScanDir({ fullStat: false, filter: statsCallback });
  // @ts-expect-error A Dirent-only callback cannot run with default full stats.
  filterScanDirSync({ filter: direntCallback });

  filterScanDir({
    ignoreDirs: ["node_modules", ".git"],
    prefilter: (name, path, entry) => {
      const dirent: Dirent = entry;
      // @ts-expect-error Prefilters always receive Dirent, never Stats.
      entry.size;
      return dirent.isDirectory() || `${path}/${name}`.endsWith(".ts");
    },
  });
  // This combination is checked at runtime, so it remains expressible in TypeScript.
  filterScanDirSync({ fullStat: false, prefilter: () => true });
  // @ts-expect-error Prefilters must return a boolean synchronously.
  filterScanDir({ prefilter: async () => true });

  return {
    asyncFiles,
    syncFiles,
    asyncGroups,
    undefinedAsyncGroups,
    undefinedSyncGroups,
    syncGroups,
    dynamicGroups,
    groupedVariable,
    syncGroupedVariable,
  };
}
