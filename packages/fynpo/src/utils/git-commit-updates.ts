import { logger } from "../logger";
import * as utils from "../utils";

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
  /**
   * Staged ahead of the package.json paths. `version` and `changelog` stage CHANGELOG.md
   * along with the packages; `prepare` stages only the packages, since the changelog was
   * already committed by then.
   */
  changeLogFile?: string;
};

export type CommitAndTagResult = {
  committed: boolean;
  /** how many tags were actually created - 0 when --tag is off (FPO-49) */
  tagged: number;
};

/**
 * Is the working tree clean? `git diff --quiet` exits non-zero when it is not, which xsh
 * surfaces as a rejection, so the answer is which branch we land in.
 */
export const checkGitClean = (sh: ShellRunner): Promise<boolean> =>
  sh(`git diff --quiet`).then(
    () => true,
    () => false
  );

/**
 * Commit the updated package.json files (plus the changelog, for the commands that stage it)
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

  // the changelog path is deliberately unquoted, as it was in all three originals
  const quotedPackages = packages.map((x) => `"${x}"`).join(" ");
  const staged = ctx.changeLogFile ? `${ctx.changeLogFile} ${quotedPackages}` : quotedPackages;

  const addOutput = await ctx.sh(`git add ${staged}`);
  logger.info("git add", addOutput);

  const commitOutput = await ctx.sh(
    `git commit -n -m "${utils.makePublishCommitSubject(ctx.isSelective)}"` +
      ` -m " - ${tags.join("\n - ")}"`
  );
  logger.info("git commit", commitOutput);

  if (!ctx.tag) {
    return { committed: true, tagged: 0 };
  }

  // sequential on purpose - git refuses concurrent index access
  for (const tag of tags) {
    logger.info("tagging", tag);
    const tagOut = await ctx.sh(`git tag ${tag}`);
    logger.info("tag", tag, "output", tagOut);
  }

  return { committed: true, tagged: tags.length };
};
