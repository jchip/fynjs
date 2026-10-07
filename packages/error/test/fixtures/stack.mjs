// Prints real stacks from an ES module for test/spec/real-stack.spec.ts to clean.
function thrower() { throw new Error("boom"); }
const stacks = {};
try { thrower(); } catch (err) { stacks.thrown = err.stack; }
stacks.topLevel = new Error("top").stack;
[1].forEach(() => { stacks.anonymous = new Error("anon").stack; });
console.log(JSON.stringify(stacks));
