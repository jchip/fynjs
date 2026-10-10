import { describe, expect, it } from "vitest";
import { verify } from "run-verify";
import chalk from "chalk";
import { formatUpdates } from "../../cli/show-updates";

describe("show-updates", () => {
  it("lists only packages whose locked versions changed", () => {
    const level = chalk.level;
    return verify({ cleanup: () => (chalk.level = level) })
      .step(() => {
        chalk.level = 0;
        return formatUpdates(
          { same: ["1.0.0"], bumped: ["1.0.0"], gone: ["2.0.0"], multi: ["3.1.0", "3.0.0"] },
          { same: ["1.0.0"], bumped: ["1.2.0"], added: ["0.1.0"], multi: ["3.1.0"] }
        );
      })
      .step((lines) => {
        expect(lines).toStrictEqual([
          "added (none) -> 0.1.0",
          "bumped 1.0.0 -> 1.2.0",
          "gone 2.0.0 -> (removed)",
          "multi 3.1.0, 3.0.0 -> 3.1.0",
        ]);
      });
  });
});
