// Download exact npm and pnpm versions as registry tarballs and unpack them, no install step.
import Fs from "node:fs";
import Path from "node:path";
import Zlib from "node:zlib";

const D = Path.dirname(new URL(import.meta.url).pathname);
const plat = `${process.platform}-${process.arch}`;
const specs = [
  ["npm", "npm/-/npm-12.2.0.tgz"],
  ["pnpm11", "pnpm/-/pnpm-11.28.2.tgz"],
  ["pnpm12", `@pnpm/exe.${plat}/-/exe.${plat}-12.9.1.tgz`]
];

// minimal ustar reader: regular files and dirs, strips the leading "package/"
function untar(buf, dest) {
  let off = 0, longName = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every(b => b === 0)) break;
    const str = (a, b) => h.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    let name = str(0, 100);
    const prefix = str(345, 500);
    if (prefix) name = `${prefix}/${name}`;
    if (longName) { name = longName; longName = null; }
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const mode = parseInt(str(100, 108).trim() || "644", 8);
    const type = String.fromCharCode(h[156] || 48);
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") { longName = body.toString("utf8").replace(/\0.*$/s, ""); continue; }
    const rel = name.split("/").slice(1).join("/");
    if (!rel) continue;
    const file = Path.join(dest, rel);
    if (type === "5") { Fs.mkdirSync(file, { recursive: true }); continue; }
    if (type !== "0" && type !== "\0") continue;
    Fs.mkdirSync(Path.dirname(file), { recursive: true });
    Fs.writeFileSync(file, body, { mode: mode | 0o600 });
  }
}

for (const [dir, path] of specs) {
  const dest = Path.join(D, "managers", dir);
  Fs.rmSync(dest, { recursive: true, force: true });
  const res = await fetch(`https://registry.npmjs.org/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  untar(Zlib.gunzipSync(Buffer.from(await res.arrayBuffer())), dest);
  console.log(`${dir}: ${Fs.readdirSync(dest).join(" ")}`);
}
