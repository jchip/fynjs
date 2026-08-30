import Fs from "fs";
import Os from "os";
import Path from "path";

//
// `test/sample` is shared by most of the fynpo test files, and vitest runs those files in
// parallel with no isolation configured. That is safe only while every reader leaves it
// alone - but `utils.loadConfig` WRITES during load (it stamps a fynpo signature into
// lerna.json and rewrites package.json), so the files that call it were racing each other
// on one directory. See FPO-14.
//
// Any test that mutates the sample gets its own copy instead.
//

const SAMPLE_DIR = Path.join(__dirname, "..", "..", "test", "sample");

/**
 * Copy `test/sample` to a fresh temp directory.
 *
 * @param label - short name to make the temp dir identifiable when a test leaves one behind
 * @returns absolute path of the copy
 */
export function makeSampleFixture(label: string): string {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), `fynpo-${label}-`));
  const dest = Path.join(dir, "sample");

  Fs.cpSync(SAMPLE_DIR, dest, { recursive: true });

  return dest;
}

/**
 * Remove a fixture made by {@link makeSampleFixture}. Safe to call twice.
 *
 * @param dir - the path returned by makeSampleFixture
 */
export function removeSampleFixture(dir: string): void {
  if (!dir) {
    return;
  }
  // dir is <tmp>/sample - drop the mkdtemp parent too
  Fs.rmSync(Path.dirname(dir), { recursive: true, force: true });
}
