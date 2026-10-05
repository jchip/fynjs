import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import ssri from "ssri";
import * as Tar from "tar";
import FynCentral from "../../lib/fyn-central";
import FileOps from "../../lib/util/file-ops";

// With `worker.on`, FynCentral gets a pool that runs the fs worker's store and scan jobs
// in-thread. The test's integrity is a label, so the pool checks the bytes against their own hash.
const worker = vi.hoisted(() => ({ on: false }));
vi.mock("../../lib/util/fs-worker-pool", async () => {
  const { storeJobSync } = await import("../../lib/util/fs-worker");
  const { scanShasumsSync } = await import("../../lib/util/store-entry");
  const pool = {
    run: async (op: string, job: any) => {
      if (op === "scan") return scanShasumsSync(job.dir);
      if (op !== "store") throw new Error(`unexpected fs job ${op}`);
      return storeJobSync({ ...job, integrity: ssri.fromData(job.data).toString() });
    }
  };
  return { POOL_SIZE: 1, getFsWorkerPool: () => (worker.on ? pool : undefined) };
});

//
// Concurrent installs share one central store and never wait on each other. Each extracts a
// package into its own temp dir and renames it into place, so others see an entry complete or
// not at all. An `.extracting` marker tells other installs one is in progress, so they can do
// other packages first. Deletes rename the entry away before removing it.
//
describe.each([
  { name: "in-thread", inWorker: false },
  { name: "with an fs worker", inWorker: true }
])("fyn-central store, $name", ({ inWorker }) => {
  let root: string;
  let central: any;
  let contentPath: string;
  const integrity = ssri.fromData("pkg-a@1.0.0").toString();
  const old = new Date(Date.now() - 10 * 60 * 1000);

  /**
   * a gzipped tarball of package/{package.json,index.js,lib/util.js}, with npm's fixed
   * 1985-10-26 mtime on every file, as npm publishes them
   */
  const tarball = (opts: { noMtime?: boolean } = {}) => {
    const src = Path.join(root, "src");
    const npmTime = new Date("1985-10-26T08:15:00Z");
    Fs.mkdirSync(Path.join(src, "package", "lib"), { recursive: true });
    const files = {
      "package.json": '{"name":"pkg-a","version":"1.0.0"}',
      "index.js": "module.exports = 1;\n",
      "lib/util.js": "module.exports = 2;\n"
    };
    for (const [file, text] of Object.entries(files)) {
      Fs.writeFileSync(Path.join(src, "package", file), text);
      Fs.utimesSync(Path.join(src, "package", file), npmTime, npmTime);
    }
    return Tar.c({ gzip: true, cwd: src, ...opts }, ["package"]) as unknown as NodeJS.ReadableStream;
  };
  const siblings = () => Fs.readdirSync(Path.dirname(contentPath)).sort();
  const base = () => Path.basename(contentPath);

  beforeEach(() => {
    worker.on = inWorker;
    root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-central-store-")));
    central = new FynCentral({ centralDir: Path.join(root, "central") });
    contentPath = central._analyze(integrity).contentPath;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Fs.rmSync(root, { recursive: true, force: true });
  });

  /** the tarball as bytes, as a download hands it to the fs worker */
  const bytes = async (stream: unknown) => {
    const chunks: Buffer[] = [];
    for await (const c of stream as AsyncIterable<Buffer>) chunks.push(c);
    return { data: new Uint8Array(Buffer.concat(chunks)) };
  };
  const store = (deferIfBusy?: boolean, stream: () => unknown = tarball, opts?: { noMtime?: boolean }) =>
    central.storeTarStream(
      "pkg-a@1.0.0",
      integrity,
      stream,
      deferIfBusy,
      inWorker ? () => bytes(tarball(opts)) : undefined
    );

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
    const winRace = (to: string) => {
      if (to === contentPath && !Fs.existsSync(contentPath)) {
        // the other install wins the race
        Fs.mkdirSync(Path.join(contentPath, "package"), { recursive: true });
        Fs.writeFileSync(Path.join(contentPath, "tree.json"), JSON.stringify({ $: {}, shaSum: "winner", _: 1 }));
      }
    };
    if (inWorker) {
      const realRenameSync = Fs.renameSync;
      vi.spyOn(Fs, "renameSync").mockImplementation((from: Fs.PathLike, to: Fs.PathLike) => {
        winRace(to as string);
        return realRenameSync(from, to);
      });
    } else {
      const realRename = FileOps.rename;
      vi.spyOn(FileOps, "rename").mockImplementation(async (from: string, to: string) => {
        winRace(to);
        return realRename(from, to);
      });
    }

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

  //
  // tree.json's shaSum hashes each file's path, mtime in seconds and size (format 2). A fresh
  // entry gets it from the tar headers. validate() compares a stat walk, and moves an older
  // format entry to format 2 after checking it with its own format's hash.
  //
  const treeFile = () => Path.join(contentPath, "tree.json");
  const readTree = () => JSON.parse(Fs.readFileSync(treeFile(), "utf8"));
  /** a new FynCentral on the same store, so nothing is cached from storing the entry */
  const validateFresh = async () => {
    const other: any = new FynCentral({ centralDir: Path.join(root, "central") });
    await other.has(integrity);
    return other.validate(integrity);
  };
  /** rewrite the stored entry as format 1, with its v1 hash */
  const makeOldFormat = async () => {
    const { v1 } = await central._scanShasums(Path.join(contentPath, "package"));
    Fs.writeFileSync(treeFile(), JSON.stringify({ ...readTree(), shaSum: v1, _: 1 }));
  };
  const editFile = () => {
    const file = Path.join(contentPath, "package", "index.js");
    Fs.writeFileSync(file, "module.exports = 9;\n");
    Fs.utimesSync(file, new Date(), new Date());
  };

  it("hashes a new entry from the tar headers, without a walk, and a stat walk agrees", async () => {
    const scan = vi.spyOn(central, "_scanShasums");
    await store();

    expect(scan).not.toHaveBeenCalled();
    expect(readTree()._).toBe(2);
    expect(await validateFresh()).toBe(true);
  });

  it("walks the files when the tarball has no mtimes", async () => {
    const scan = vi.spyOn(central, "_scanShasums");
    await store(false, () => tarball({ noMtime: true }), { noMtime: true });

    // the fs worker walks with sync calls, and must get the same hash as the async walk
    expect(scan).toHaveBeenCalledTimes(inWorker ? 0 : 1);
    expect(readTree().shaSum).toBe((await central._scanShasums(Path.join(contentPath, "package"))).v2);
    expect(await validateFresh()).toBe(true);
  });

  it("catches an edited file", async () => {
    await store();
    editFile();
    expect(await validateFresh()).toBe(false);
  });

  it("checks an old format entry with its own hash, then converts it", async () => {
    await store();
    await makeOldFormat();

    expect(await validateFresh()).toBe(true);
    expect(readTree()._).toBe(2);
    expect(await validateFresh()).toBe(true);
  });

  it("leaves an old format entry that changed as it is, so it gets replaced", async () => {
    await store();
    await makeOldFormat();
    editFile();

    expect(await validateFresh()).toBe(false);
    expect(readTree()._).toBe(1);
  });

  it("converts a legacy tree with no wrapper or hash", async () => {
    await store();
    Fs.writeFileSync(treeFile(), JSON.stringify(readTree().$));

    expect(await validateFresh()).toBe(true);
    expect(readTree()._).toBe(2);
    expect(await validateFresh()).toBe(true);
  });

  it("rewrites tree.json through a temp file", async () => {
    await store();
    await central.setMutation(integrity, true);

    expect(JSON.parse(Fs.readFileSync(Path.join(contentPath, "tree.json"), "utf8")).mutates).toBe(true);
    expect(Fs.readdirSync(contentPath).sort()).toEqual(["package", "tree.json"]);
  });
});
