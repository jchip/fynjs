/*
 * Avoid webpack bundling the whole package.json if doing require("../package.json")
 */

import Fs from "fs";
import Path from "path";

interface PackageJson {
  name: string;
  version: string;
  [key: string]: unknown;
}

const myPkg: PackageJson = JSON.parse(Fs.readFileSync(Path.join(__dirname, "../package.json"), "utf-8"));

export = myPkg;
