/*
 * Collect a package's file tree from the tar headers while it extracts. The central store saves
 * this tree, and hashes its sizes and mtimes, so a fresh extraction never stats its files again.
 *
 * Shared by the in-thread extraction and the tar worker, so it imports nothing from fyn.
 */

/** File metadata in the tree */
export interface FileInfo {
  /** File size */
  z: number;
  /** Modification time in seconds */
  m: number;
  /** Checksum (tar header cksum) */
  $: number | boolean;
}

/** Directory tree node - uses null prototype objects to avoid name conflicts */
export interface TreeNode {
  /** Files in this directory */
  "/": Record<string, FileInfo>;
  /** Subdirectories */
  [dir: string]: TreeNode | Record<string, FileInfo>;
}

/**
 * The tree, and whether its sizes and mtimes are what stat will report: true when every
 * non-dir entry is a regular file with an mtime. A link or a missing mtime leaves something
 * only a stat walk can see.
 */
export interface UntarTree {
  tree: TreeNode;
  fromHeaders: boolean;
}

/** The tar entry fields the tree reads; node-tar's ReadEntry has them all */
export interface TreeEntry {
  path: string;
  type: string;
  size: number;
  mtime?: Date;
  header: { cksumValid: boolean; cksum?: number };
}

/** An `onentry` for Tar.x that builds the tree, and the result once extraction finishes */
export function treeCollector(strip: number): {
  onentry: (entry: TreeEntry) => void;
  result: UntarTree;
} {
  // since we are using objects to store directory tree we have to
  // create objects without the normal prototypes to avoid name conflict
  // with file names
  const newDirObj = (): TreeNode => {
    const n = Object.create(null) as TreeNode;
    n["/"] = Object.create(null);
    return n;
  };

  const result: UntarTree = { tree: newDirObj(), fromHeaders: true };

  const onentry = (entry: TreeEntry): void => {
    const parts = entry.path.split(/\/|\\/);
    const isDir = entry.type === "Directory";
    const dirs = parts.slice(strip, isDir ? parts.length : parts.length - 1);

    const wtree = dirs.reduce((wt: TreeNode, dir: string) => {
      return (wt[dir] as TreeNode) || (wt[dir] = newDirObj());
    }, result.tree);

    if (isDir) return;

    if (!entry.mtime || !["File", "OldFile", "ContiguousFile"].includes(entry.type)) {
      result.fromHeaders = false;
    }

    const fname = parts[parts.length - 1];
    if (fname) {
      const m = Math.round((entry.mtime ? entry.mtime.getTime() : Date.now()) / 1000);
      wtree["/"][fname] = {
        z: entry.size,
        m,
        $: entry.header.cksumValid && entry.header.cksum
      };
    }
  };

  return { onentry, result };
}
