/*
 * Avoid webpack bundling the whole package.json if doing require("../package.json")
 */

import Fs from "fs";
import Path from "path";
import { fileURLToPath } from "url";
import type { PackageJson } from "../lib/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);

const myPkg: PackageJson = JSON.parse(Fs.readFileSync(Path.join(__dirname, "../package.json"), "utf-8"));

export default myPkg;
