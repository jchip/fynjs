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

/** The prompt streams, or undefined when there is no terminal to ask on. */
const terminal = (promptOpts) => {
  const input = promptOpts.input || process.stdin;
  const output = promptOpts.output || process.stdout;
  const runningInCI = promptOpts.isCI ?? isCI;
  return runningInCI || !input.isTTY || !output.isTTY ? undefined : { input, output };
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

const line = (name: string, collated) => {
  const pkg = collated.packages[name];
  return `  ${name}: ${pkg.version} -> ${pkg.newVersion}`;
};

/** Why a package is bumped, from the reasons that pass `keep`. */
const describeReasons = (name: string, collated, keep = (_r) => true) => {
  const reasons = (collated.packages[name].bumpReasons || []).filter(keep);
  const list = (reason, text) => {
    const by = reasons.filter((r) => r.reason === reason).map((r) => r.by);
    return by.length > 0 ? [`${text} ${by.join(", ")}`] : [];
  };
  const parts = [...list("locked", "locked with"), ...list("depends", "depends on")];
  return parts.length > 0 ? ` (${parts.join("; ")})` : "";
};

const describeBumps = (group: BumpGroup, collated) => {
  // only reasons from packages bumped at the same type explain this bump
  const why = (name) =>
    describeReasons(name, collated, (r) => collated.packages[r.by]?.updateType === group.type);
  const withCommits = (name) => [
    `${line(name, collated)}${why(name)}`,
    ...(collated.packages[name].bumpMsgs || []).map(
      (x) => `    ${x.id.slice(0, 8)}: ${x.m.split("\n")[0]}`
    ),
  ];
  return [
    ...group.direct.flatMap(withCommits),
    ...(group.along.length > 0
      ? [
          "Bumped along with them:",
          ...group.along.map((name) => `${line(name, collated)}${why(name)}`),
        ]
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

  const io = terminal(promptOpts);
  if (!io) {
    logger.warn(
      "Can't confirm minor/major version bumps without a terminal. " +
        "Using the bump types from commit messages."
    );
    return true;
  }

  if (majors.direct.length > 0) {
    logger.warn(
      [
        "These packages will get a MAJOR version bump based on their commit messages:",
        ...describeBumps(majors, collated),
        "One answer covers all of them.",
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
        "One answer covers all of them. Answering no will bump all of them as patch instead.",
      ].join("\n")
    );
    const answer = await ask("Bump minor versions? [Y/n] ", io);
    if (answer === undefined) {
      logger.error("Version bump confirmation cancelled.");
      return false;
    }
    const declined = ["n", "no"].includes(answer.trim().toLowerCase());
    if (declined) {
      // minor bumps only start from packages' own commits, so with those declined
      // nothing is left to justify a minor anywhere
      for (const name of bumped) {
        findVersion(name, 0, collated);
      }
    }
    logger.info(
      [
        declined ? "Using patch bumps instead:" : "Minor bumps confirmed:",
        ...bumped.map((name) => line(name, collated)),
      ].join("\n")
    );
  }

  return true;
};

/**
 * Ask which indirect bumps to keep. These packages have no commits of their own and are bumped
 * only because of a dependency or a version lock. A skipped package is dropped from the
 * changelog, so prepare only updates its dependency ranges and it is released later.
 * When selecting, packages locked together are asked about as one group.
 *
 * @returns false when the user cancels
 */
export const confirmIndirectBumps = async (collated, promptOpts: any = {}): Promise<boolean> => {
  const names: string[] = collated.indirectBumps.filter(
    (name) => !collated.packages[name].originalPkg?.private
  );
  if (names.length === 0) {
    return true;
  }

  const io = terminal(promptOpts);
  if (!io) {
    return true;
  }

  logger.warn(
    [
      "These packages have no commits of their own. They are bumped because of a dependency or a version lock:",
      ...names.map((name) => `${line(name, collated)}${describeReasons(name, collated)}`),
    ].join("\n")
  );

  let choice: string | undefined;
  do {
    const answer = await ask("Approve [a]ll, [s]elect, or [n]one? [A/s/n] ", io);
    if (answer === undefined) {
      logger.error("Version bump confirmation cancelled.");
      return false;
    }
    choice = { "": "a", a: "a", all: "a", s: "s", select: "s", n: "n", none: "n" }[
      answer.trim().toLowerCase()
    ];
  } while (!choice);

  let skipped: string[] = [];
  if (choice === "n") {
    skipped = names;
  } else if (choice === "s") {
    // version locked packages must move together, so each lock group gets one answer
    const lockMap = collated.opts?.versionLockMap || {};
    const groups: string[][] = [];
    for (const name of names) {
      if (!groups.some((g) => g.includes(name))) {
        groups.push((lockMap[name] || [name]).filter((n) => names.includes(n)));
      }
    }
    for (const group of groups) {
      let question = `${line(group[0], collated)}? [Y/n] `;
      if (group.length > 1) {
        io.output.write(
          ["Version locked together:", ...group.map((name) => line(name, collated)), ""].join("\n")
        );
        question = "Bump all of them? [Y/n] ";
      }
      const answer = await ask(question, io);
      if (answer === undefined) {
        logger.error("Version bump confirmation cancelled.");
        return false;
      }
      if (["n", "no"].includes(answer.trim().toLowerCase())) {
        skipped.push(...group);
      }
    }
  }

  if (skipped.length > 0) {
    collated.indirectBumps = collated.indirectBumps.filter((name) => !skipped.includes(name));
    logger.info(
      ["Skipping these bumps:", ...skipped.map((name) => line(name, collated))].join("\n")
    );
  }

  return true;
};
