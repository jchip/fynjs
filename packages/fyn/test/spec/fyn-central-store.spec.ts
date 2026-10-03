import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import ssri from "ssri";
import * as Tar from "tar";
import FynCentral from "../../lib/fyn-central";
import FileOps from "../../lib/util/file-ops";

//
// Concurrent installs share one central store and never wait on each other. Each extracts a
// package into its own temp dir and renames it into place, so others see an entry complete or
// not at all. An `.extracting` marker tells other installs one is in progress, so they can do
// other packages first. Deletes rename the entry away before removing it.
//
describe("fyn-central store", () => {
  let root: string;
  let central: any;
  let contentPath: string;
  const integrity = ssri.fromData("pkg-a@1.0.0").toString();
  const old = new Date(Date.now() - 10 * 60 * 1000);

  /** a gzipped tarball of package/{package.json,index.js} */
  const tarball = () => {
    const src = Path.join(root, "src");
    Fs.mkdirSync(Path.join(src, "package"), { recursive: true });
    Fs.writeFileSync(Path.join(src, "package", "package.json"), '{"name":"pkg-a","version":"1.0.0"}');
    Fs.writeFileSync(Path.join(src, "package", "index.js"), "module.exports = 1;\n");
    return Tar.c({ gzip: true, cwd: src }, ["package"]) as unknown as NodeJS.ReadableStream;
  };
  const siblings = () => Fs.readdirSync(Path.dirname(contentPath)).sort();
  const base = () => Path.basename(contentPath);

  beforeEach(() => {
    root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-central-store-")));
    central = new FynCentral({ centralDir: Path.join(root, "central") });
    contentPath = central._analyze(integrity).contentPath;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Fs.rmSync(root, { recursive: true, force: true });
  });

  const store = (deferIfBusy?: boolean, stream: () => unknown = tarball) =>
    central.storeTarStream("pkg-a@1.0.0", integrity, stream, deferIfBusy);

  it("stores the package and leaves no temp dir or marker behind", async () => {
    expect(await store()).toBe(true);
    expect(await central.has(integrity)).toBe(true);
    expect(Fs.readFileSync(Path.join(contentPath, "package", "index.js"), "utf8")).toBe("module.exports = 1;\n");
    expect(siblings()).toEqual([base()]);
  });

  it("defers without reading the tarball while another install holds the marker", async () => {
    Fs.mkdirSync(`${contentPath}.extracting`, { recursive: true });
    const stream = vi.fn(tarball);

    expect(await store(true, stream)).toBe(false);
    expect(stream).not.toHaveBeenCalled();
    expect(Fs.existsSync(contentPath)).toBe(false);
  });

  it("extracts its own copy when not deferring, and leaves the other install's marker", async () => {
    Fs.mkdirSync(`${contentPath}.extracting`, { recursive: true });

    expect(await store(false)).toBe(true);
    expect(await central.has(integrity)).toBe(true);
    expect(siblings()).toEqual([base(), `${base()}.extracting`]);
  });

  it("takes over a marker left by an install that died", async () => {
    const marker = `${contentPath}.extracting`;
    Fs.mkdirSync(marker, { recursive: true });
    Fs.utimesSync(marker, old, old);

    expect(await store(true)).toBe(true);
    expect(siblings()).toEqual([base()]);
  });

  it("uses the entry another install renamed in first, and drops its own copy", async () => {
    const realRename = FileOps.rename;
    vi.spyOn(FileOps, "rename").mockImplementation(async (from: string, to: string) => {
      if (to === contentPath && !Fs.existsSync(contentPath)) {
        // the other install wins the race
        Fs.mkdirSync(Path.join(contentPath, "package"), { recursive: true });
        Fs.writeFileSync(Path.join(contentPath, "tree.json"), JSON.stringify({ $: {}, shaSum: "winner", _: 1 }));
      }
      return realRename(from, to);
    });

    expect(await store()).toBe(true);
    expect(central._map.get(integrity).shaSum).toBe("winner");
    expect(siblings()).toEqual([base()]);
  });

  it("removes temp dirs dead installs left behind, but not live ones", async () => {
    Fs.mkdirSync(Path.dirname(contentPath), { recursive: true });
    const dead = `${contentPath}.tmp-1-dead`;
    const live = `${contentPath}.tmp-2-live`;
    Fs.mkdirSync(dead);
    Fs.mkdirSync(live);
    Fs.utimesSync(dead, old, old);

    await store();
    expect(siblings()).toEqual([base(), `${base()}.tmp-2-live`]);
  });

  it("deletes by renaming the entry away first", async () => {
    await store();
    const rename = vi.spyOn(FileOps, "rename");

    await central.delete(integrity);
    expect(rename).toHaveBeenCalledWith(contentPath, expect.stringContaining(`${base()}.del-`));
    expect(siblings()).toEqual([]);
  });

  it("rewrites tree.json through a temp file", async () => {
    await store();
    await central.setMutation(integrity, true);

    expect(JSON.parse(Fs.readFileSync(Path.join(contentPath, "tree.json"), "utf8")).mutates).toBe(true);
    expect(Fs.readdirSync(contentPath).sort()).toEqual(["package", "tree.json"]);
  });
});
