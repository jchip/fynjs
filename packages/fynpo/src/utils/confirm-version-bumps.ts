import readline from "readline";
import { isCI } from "ci-info";

import { logger } from "../logger.ts";
import { findVersion } from "./get-package-version.ts";

const MINOR = 1;
const MAJOR = 2;

/** Ask a question, resolving undefined when input closes or the user hits Ctrl-C. */
const ask = async (question: string, promptOpts): Promise<string | undefined> => {
  const rl = readline.createInterface({ input: promptOpts.input, output: promptOpts.output });
  try {
    return await new Promise<string | undefined>((resolve) => {
      let settled = false;
      const settle = (value: string | undefined) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      rl.once("close", () => settle(undefined));
      rl.once("SIGINT", () => settle(undefined));
      rl.question(question, (value) => settle(value));
    });
  } finally {
    rl.close();
  }
};

type BumpGroup = { type: number; direct: string[]; along: string[] };

/**
 * Split the packages bumped at `type` into the ones whose own commits ask for it and the ones
 * that only follow along through version locks or dependencies.
 */
const groupBumps = (names: string[], type: number, collated): BumpGroup => {
  const bumped = names.filter((name) => collated.packages[name].updateType === type);
  const isDirect = (name) => collated.packages[name].ownUpdateType === type;
  return {
    type,
    direct: bumped.filter(isDirect),
    along: bumped.filter((name) => !isDirect(name)),
  };
};

const describeBumps = (group: BumpGroup, collated) => {
  const line = (name) => {
    const pkg = collated.packages[name];
    return `  ${name}: ${pkg.version} -> ${pkg.newVersion}`;
  };
  return [
    ...group.direct.map(line),
    ...(group.along.length > 0
      ? ["Bumped along with them through version locks or dependencies:", ...group.along.map(line)]
      : []),
  ];
};

/**
 * Confirm minor and major bumps that packages' own commit messages ask for. Packages that
 * follow along through locks or dependencies are shown but not asked about. A declined minor
 * bump falls back to patch. A declined major bump stops the release.
 *
 * @returns false when the release must stop
 */
export const confirmVersionBumps = async (collated, promptOpts: any = {}): Promise<boolean> => {
  const names: string[] = [...collated.directBumps, ...collated.indirectBumps];
  const majors = groupBumps(names, MAJOR, collated);
  const minors = groupBumps(names, MINOR, collated);

  if (majors.direct.length === 0 && minors.direct.length === 0) {
    return true;
  }

  const input = promptOpts.input || process.stdin;
  const output = promptOpts.output || process.stdout;
  const runningInCI = promptOpts.isCI ?? isCI;

  if (runningInCI || !input.isTTY || !output.isTTY) {
    logger.warn(
      "Can't confirm minor/major version bumps without a terminal. " +
        "Using the bump types from commit messages."
    );
    return true;
  }

  const io = { input, output };

  if (majors.direct.length > 0) {
    logger.warn(
      [
        "These packages will get a MAJOR version bump based on their commit messages:",
        ...describeBumps(majors, collated),
      ].join("\n")
    );
    const answer = await ask("OK to bump major versions? [y/N] ", io);
    if (!["y", "yes"].includes(answer?.trim().toLowerCase())) {
      logger.error("Major version bump not confirmed. You must confirm a major bump to continue.");
      return false;
    }
  }

  if (minors.direct.length > 0) {
    const bumped = [...minors.direct, ...minors.along];
    logger.warn(
      [
        "These packages will get a minor version bump based on their commit messages:",
        ...describeBumps(minors, collated),
        "Answering no will bump all of them as patch instead.",
      ].join("\n")
    );
    const answer = await ask("Bump minor versions? [Y/n] ", io);
    if (answer === undefined) {
      logger.error("Version bump confirmation cancelled.");
      return false;
    }
    if (["n", "no"].includes(answer.trim().toLowerCase())) {
      // minor bumps only start from packages' own commits, so with those declined
      // nothing is left to justify a minor anywhere
      for (const name of bumped) {
        findVersion(name, 0, collated);
      }
      logger.info("Using patch bumps for:", bumped.join(", "));
    }
  }

  return true;
};
