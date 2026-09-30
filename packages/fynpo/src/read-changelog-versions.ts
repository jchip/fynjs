
import Fs from "fs";
import Path from "path";

/**
 * @param skipHeading - a line (e.g. `### Fynpo Updated`) whose section is ignored, up to the
 *   next `###` heading
 */
export function readChangelogVersions(dir, packages, markers, skipHeading?: string) {
  const tags = [];
  const versions = {};

  const check = (l) => {
    for (const name in packages) {
      const regex = new RegExp("[ `]" + name + "@([0-9]+.[0-9]+.[0-9]+)([^ `]*)[ `]");
      const m = l.match(regex);
      if (m) {
        tags.push(m[0].trim().replace(/`/g, ""));
        versions[name] = m.slice(1, 3).join("").trim().replace(/`/g, "");
      }
    }
  };

  const clLines = Fs.readFileSync(Path.join(dir, "CHANGELOG.md")).toString().split("\n");

  const ix1 = clLines.indexOf(markers[0]);
  const ix2 = clLines.indexOf(markers[1]);

  if (ix1 >= 0 && ix2 > ix1) {
    const lines = clLines.slice(ix1, ix2);
    let skipping = false;
    lines.forEach((l) => {
      if (l.startsWith("### ")) {
        skipping = l.trim() === skipHeading;
      }
      if (!skipping) check(l);
    });
  }

  return { tags, versions };
}
