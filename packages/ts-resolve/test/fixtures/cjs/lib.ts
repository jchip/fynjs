type Shape = { n: number };
const label = (s: Shape): string => `cjs-lib:${s.n}`;
module.exports = { label };
