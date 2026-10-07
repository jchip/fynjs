// Prints real stacks from a CommonJS module for test/spec/real-stack.spec.ts to clean.
function thrower() { throw new Error("boom"); }
const stacks = {};
try { thrower(); } catch (err) { stacks.thrown = err.stack; }
try { require("oops"); } catch (err) { stacks.require = err.stack; }
[1].forEach(() => { stacks.anonymous = new Error("anon").stack; });
stacks.aggregate = new AggregateError([], "require failed").stack;
console.log(JSON.stringify(stacks));
