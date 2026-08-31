/**
 * What composing `test/config` with instance "0" and deployment "development"
 * is expected to produce. Mirrors upstream's test/composed-result.js.
 */
export const composedResult = () => ({
  json: "json",
  yaml: "yaml",
  js: "js",
  instance0: "yaml",
  deployment: "dev",
  arr: ["js", 1, { b: 50 }],
  "+uArray": ["a", "b", "c", "x", "1"]
});

export default composedResult;
