/**
 * Restore the manifest prepack saved.
 *
 * The path prepack recorded wins over the one resolved here: only prepack knows for
 * certain which file it modified, and if the two disagree - two checkouts of the same
 * package, a runner that moved cwd - restoring to the resolved path would write the
 * backup over the wrong manifest and leave the real one pruned (FPM-75).
 *
 * Save files written by an older publish-util have no sidecar, so the resolved path
 * stays as the fallback.
 */
export declare function postPack(): Promise<void>;
