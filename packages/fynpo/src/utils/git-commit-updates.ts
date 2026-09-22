import { logger } from "../logger.ts";
import * as utils from "../utils.ts";

export class ReleaseTagConflictError extends Error {}

/** Runs a shell command in the command's cwd - each command class passes its own `_sh`. */
export type ShellRunner = (command: string) => any;

export type CommitAndTagContext = {
  sh: ShellRunner;
  /** the `--commit` option; false skips committing entirely */
  commit: boolean;
  /** the `--tag` option, already narrowed to a strict `=== true` */
  tag: boolean;
  /** result of {@link checkGitClean}; a dirty tree skips committing */
  gitClean: boolean;
  /** whether --only narrowed the release, which changes the commit subject */
  isSelective: boolean;
  /** Existing prepare commit to amend, after the caller matched its release metadata. */
  amend?: string;
  /**
   * Staged ahead of the release file paths. `version` and `changelog` stage CHANGELOG.md
   * along with the packages; `prepare` supplies all files changed during preparation.
   */
  changeLogFile?: string;
};

export type CommitAndTagResult = {
  committed: boolean;
  amended?: boolean;
  /** how many tags were actually created - 0 when --tag is off (FPO-49) */
  tagged: number;
};

/** Include staged, unstaged, and nonignored untracked files in the clean-tree check. */
export const checkGitClean = (sh: ShellRunner): Promise<boolean> =>
  sh(`git status --porcelain --untracked-files=all`).then(
    ({ stdout }) => stdout.trim().length === 0,
    () => false
  );

/**
 * Commit the updated release files (plus the changelog, for the commands that stage it)
 * and tag the release.
 *
 * Shared by `prepare`, `version` and `update-changelog`, which had three copies of this
 * (FJM-24). It reports what actually happened rather than returning void, so callers can say
 * so instead of assuming (FPO-49).
 */
export const commitAndTagUpdates = async (
  ctx: CommitAndTagContext,
  { packages, tags }: { packages: string[]; tags: string[] }
): Promise<CommitAndTagResult> => {
  const didNothing = { committed: false, tagged: 0 };

  if (!ctx.commit) {
    logger.warn("commit option disabled, skip committing updates.");
    return didNothing;
  }

  if (!ctx.gitClean) {
    logger.warn("Your git branch is not clean, skip committing updates.");
    return didNothing;
  }

  const files = ctx.changeLogFile ? [ctx.changeLogFile, ...packages] : packages;
  if (files.length === 0) {
    logger.info("No release files changed; skipping commit and tags.");
    return didNothing;
  }
  const existingTags = new Map<string, string>();
  if (ctx.amend) {
    const { stdout } = await ctx.sh(
      "git for-each-ref --format='%(refname:strip=2) %(objectname)' refs/tags"
    );
    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      const [tag, objectId] = line.split(" ");
      existingTags.set(tag, objectId);
    }
    if (ctx.tag) {
      const conflict = tags.find(tag => existingTags.has(tag) && existingTags.get(tag) !== ctx.amend);
      if (conflict) {
        throw new ReleaseTagConflictError(`Cannot amend prepare: tag ${conflict} already points elsewhere.`);
      }
    }
  }
  const staged = files.map((x) => `'${x.replace(/'/g, "'\\''")}'`).join(" ");

  const addOutput = await ctx.sh(`git add -- ${staged}`);
  logger.info("git add", addOutput);

  const commitOutput = await ctx.sh(
    ctx.amend ? "git commit -n --amend --no-edit" :
      `git commit -n -m "${utils.makePublishCommitSubject(ctx.isSelective)}"` +
      ` -m " - ${tags.join("\n - ")}"`
  );
  logger.info("git commit", commitOutput);

  if (ctx.amend) {
    const { stdout } = await ctx.sh("git rev-parse HEAD");
    for (const tag of tags.filter(tag => existingTags.get(tag) === ctx.amend)) {
      const ref = `refs/tags/${tag}`.replace(/'/g, "'\\''");
      await ctx.sh(`git update-ref '${ref}' ${stdout.trim()} ${ctx.amend}`);
    }
  }
  const result = { committed: true, tagged: 0, ...(ctx.amend ? { amended: true } : {}) };
  if (!ctx.tag) {
    return result;
  }

  // sequential on purpose - git refuses concurrent index access
  for (const tag of tags.filter(tag => !existingTags.has(tag))) {
    logger.info("tagging", tag);
    const tagOut = await ctx.sh(`git tag ${tag}`);
    logger.info("tag", tag, "output", tagOut);
    result.tagged++;
  }

  return result;
};
