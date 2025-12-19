import Path from "path";
import Fs from "fs";
import Yaml from "js-yaml";
import { fileURLToPath } from "url";

function readJson(file: string) {
  return JSON.parse(Fs.readFileSync(file).toString());
}

interface PackageData {
  id: string;
}

function readPackage(file: string): PackageData {
  const pkg = readJson(file);

  const data: PackageData = {
    id: pkg._id || `[${pkg.name}@${pkg.version}]`
  };

  return data;
}

type TreeNode = { [key: string]: TreeNode | string | PackageData };

function dirTree(parent: TreeNode, dir: string, name: string): TreeNode {
  const meDir = Path.join(dir, name);
  const files = Fs.readdirSync(meDir);
  const me: TreeNode = {};
  parent[name] = me;

  for (const f of files) {
    const meFile = Path.join(meDir, f);
    const stat = Fs.lstatSync(meFile);
    if (stat.isDirectory()) {
      dirTree(me, meDir, f);
    } else if (stat.isSymbolicLink()) {
      const target = Fs.readlinkSync(meFile);
      me[f] = `-> ${target}`;
    } else if (stat.isFile()) {
      if (f === "package.json") {
        me[f] = readPackage(meFile);
      } else {
        me[f] = "file";
      }
    } else if (stat.isBlockDevice()) {
      me[f] = "block_dev";
    } else if (stat.isCharacterDevice()) {
      me[f] = "char_dev";
    } else if (stat.isFIFO()) {
      me[f] = "fifo";
    } else if (stat.isSocket()) {
      me[f] = "socket";
    } else {
      me[f] = "???";
    }
  }

  return parent;
}

export function make(dir: string, name: string): TreeNode {
  return dirTree({}, dir, name);
}

// Check if this module is being run directly
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === fileURLToPath(new URL(`file://${process.argv[1]}`));

if (isMain) {
  const tree = dirTree({}, process.cwd(), "node_modules");
  console.log(Yaml.dump(tree));
}
