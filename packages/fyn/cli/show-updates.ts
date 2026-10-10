import chalk from "chalk";
import logger from "../lib/logger";

/**
 * Lines of `name old -> new` for every package whose locked versions changed
 */
export const formatUpdates = (
  before: Record<string, string[]>,
  after: Record<string, string[]>
): string[] => {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const lines: string[] = [];
  for (const name of names) {
    const oldVersions = (before[name] || []).join(", ");
    const newVersions = (after[name] || []).join(", ");
    if (oldVersions === newVersions) continue;
    lines.push(
      `${chalk.cyan(name)} ${chalk.red(oldVersions || "(none)")} -> ${chalk.green(newVersions || "(removed)")}`
    );
  }
  return lines;
};

export const showUpdates = (before: Record<string, string[]>, after: Record<string, string[]>): void => {
  const lines = formatUpdates(before, after);
  if (lines.length === 0) {
    logger.info("All locked versions are already the newest their ranges allow");
  } else {
    logger.info(`Updated ${lines.length} packages:\n  ${lines.join("\n  ")}`);
  }
};

export default showUpdates;
