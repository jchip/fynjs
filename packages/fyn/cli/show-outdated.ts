import chalk from "chalk";
import logger from "../lib/logger";
import PkgOutdatedProvider, {
  type FynForOutdated,
  type OutdatedRecord,
  type OutdatedResult,
} from "../lib/pkg-outdated-provider";

interface OutdatedOptions {
  packages?: string[];
  json?: boolean;
  colors?: boolean;
}

const plainRows = (records: OutdatedRecord[]): string[][] => [
  ["Package", "Current", "Wanted", "Latest", "Type", "Requested"],
  ...records.map((record) => [
    record.name,
    record.current || "MISSING",
    record.wanted,
    record.latest || "-",
    record.type,
    record.requested,
  ]),
];

export const formatOutdated = (
  records: OutdatedRecord[],
  { json = false, colors = true }: { json?: boolean; colors?: boolean } = {},
): string => {
  if (json) return JSON.stringify(records, null, 2);
  if (records.length === 0) return "";

  const rows = plainRows(records);
  const widths = rows[0].map((_, column) =>
    rows.reduce((width, row) => Math.max(width, row[column].length), 0),
  );
  const pad = (value: string, column: number) => value.padEnd(widths[column]);
  const lines = [rows[0].map(pad).join("  ")];

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const row = rows[index + 1].map(pad);
    if (colors) {
      row[0] = chalk.cyan(row[0]);
      row[1] = record.current === record.wanted ? chalk.yellow(row[1]) : chalk.red(row[1]);
      row[2] = chalk.green(row[2]);
    }
    lines.push(row.join("  "));
  }

  return lines.join("\n");
};

export const showOutdated = async (
  fyn: FynForOutdated,
  options: OutdatedOptions = {},
): Promise<OutdatedResult> => {
  const result = await new PkgOutdatedProvider({ fyn }).getOutdated({
    packages: options.packages,
  });
  const output = formatOutdated(result.records, options);

  if (output) {
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(`${output}\n`, (error) => (error ? reject(error) : resolve()));
    });
  }

  if (!options.json && options.packages?.length) {
    for (const name of result.skipped) {
      logger.info(`Skipping non-registry dependency ${chalk.cyan(name)}`);
    }
  }

  return result;
};

export default showOutdated;
