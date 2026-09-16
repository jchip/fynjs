import readline from "readline";
import { isCI } from "ci-info";
import * as _ from "lodash-es";

import { execSync } from "../child-process.ts";
import { logger } from "../logger.ts";
import { makePublishTagSearchTerm } from "../utils.ts";

type PublishCommitCandidate = {
  sha: string;
  date: string;
  subject: string;
  tags: string[];
  offFirstParent: boolean;
  searchTerm: string;
};

const lines = (output: string): string[] =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const listTags = (opts, pattern?: string): string[] =>
  lines(execSync("git", ["tag", "--list"].concat(pattern ? [pattern] : []), { cwd: opts.cwd }));

const findTaggedPublishCommit = (
  opts,
  searchTerm: string,
  firstParent: boolean
): PublishCommitCandidate | undefined => {
  const output = execSync(
    "git",
    [
      "log",
      ...(firstParent ? ["--first-parent"] : []),
      "--format=%H%x09%cs%x09%s",
      "--fixed-strings",
      "--grep=[Publish]",
      "HEAD",
    ],
    { cwd: opts.cwd }
  );

  for (const line of lines(output)) {
    const [sha, date, ...subjectParts] = line.split("\t");
    const subject = subjectParts.join("\t");
    if (subject !== "[Publish]") {
      continue;
    }

    const tags = lines(execSync("git", ["tag", "--points-at", sha], { cwd: opts.cwd }));
    if (tags.length > 0) {
      return { sha, date, subject, tags, offFirstParent: !firstParent, searchTerm };
    }
  }

  return undefined;
};

export const confirmReleaseBoundary = async (
  candidate: PublishCommitCandidate,
  promptOpts: any = {}
): Promise<boolean | undefined> => {
  const input = promptOpts.input || process.stdin;
  const output = promptOpts.output || process.stdout;
  const runningInCI = promptOpts.isCI ?? isCI;

  if (runningInCI || !input.isTTY || !output.isTTY) {
    return undefined;
  }

  logger.warn(
    [
      `No tags match the configured release tag pattern '${candidate.searchTerm}'.`,
      `Found tagged publish commit candidate ${candidate.sha.slice(0, 8)} (${candidate.date}):`,
      `  ${candidate.subject}`,
      `  tags: ${candidate.tags.join(", ")}`,
      ...(candidate.offFirstParent
        ? ["This commit is reachable through a merge, not HEAD's first-parent history."]
        : []),
      "A [Publish] commit does not prove that publication completed.",
    ].join("\n")
  );

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await new Promise<string | undefined>((resolve) => {
      let settled = false;
      const settle = (value: string | undefined) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      rl.once("close", () => settle(undefined));
      rl.question("Use this commit as the release boundary? [y/N] ", (value) => settle(value));
    });
    if (answer === undefined) {
      return undefined;
    }
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
};

/**
 * Offer a tagged full-publish commit when a changed tag template hides every old release tag.
 * Accepted candidates are fed through the existing `--since` resolver so ancestry and range
 * behavior stay identical to an explicit boundary.
 */
export const recoverReleaseBoundary = async (opts): Promise<void> => {
  if (opts.since) {
    return;
  }

  const tagTmpl = _.get(opts, "command.publish.gitTagTemplate");
  const searchTerm = makePublishTagSearchTerm(tagTmpl);
  if (listTags(opts, searchTerm).length > 0) {
    return;
  }

  if (listTags(opts).length === 0) {
    return;
  }

  const candidate =
    findTaggedPublishCommit(opts, searchTerm, true) ||
    findTaggedPublishCommit(opts, searchTerm, false);
  if (!candidate) {
    throw new Error(
      `No tags match the configured release tag pattern '${searchTerm}', and no tagged ` +
        "[Publish] commit was found in history reachable from HEAD. Re-run with " +
        "--since <git-ref>."
    );
  }

  const confirm = opts._confirmReleaseBoundary || confirmReleaseBoundary;
  const accepted = await confirm(candidate);

  if (accepted === undefined) {
    throw new Error(
      `Cannot ask for confirmation in this environment. Re-run with --since ${candidate.sha} ` +
        "or another trusted Git ref."
    );
  }

  if (!accepted) {
    throw new Error(
      `Publish commit candidate ${candidate.sha} was not accepted; re-run with --since ` +
        `${candidate.sha} or another trusted Git ref.`
    );
  }

  opts.since = candidate.sha;
  opts._sinceFromPublishFallback = true;
};
