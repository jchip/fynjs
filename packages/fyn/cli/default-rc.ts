import ci from "ci-info";

const defaultRc = {
  registry: "https://registry.npmjs.org",
  targetDir: "node_modules",
  progress: ci.isCI ? "none" : "normal"
} as const;

export = defaultRc;
