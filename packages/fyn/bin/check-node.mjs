//
// Refuse to run on a node older than package.json engines, with a message rather than whatever
// syntax error the bundle would produce.
//
// This is its own module, imported before the bundle, because node parses an entire static
// import graph before evaluating any of it - a check sitting above a static import of the
// bundle would never get to run on the versions it exists for.
//
const MIN_NODE = "22.12.0";

const parts = version => version.split("-")[0].split(".").map(n => parseInt(n, 10));

const older = (a, b) => {
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i];
  }
  return false;
};

if (older(process.versions.node, MIN_NODE)) {
  console.error(`fyn requires node >= ${MIN_NODE}, and this is ${process.versions.node}.`);
  process.exit(1);
}
