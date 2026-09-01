import { describe, it, expect } from "vitest";
import { createLogUpdate } from "log-update";
import { VisualLogger, OutputInterface } from "../../src/index.ts";
import { makeTtyStream } from "./vterm.ts";

//
// FJM-144: a render scheduled by the spinner tick used to land after the frame was torn
// down - by removing the last item, or by freezeItems(). log-update then tracked a line
// count for a region it no longer owned, and its next erase ate log lines above the items.
//
// These drive the real log-update against a virtual terminal, so they assert the symptom
// (committed output surviving) rather than the shape of the fix.
//
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// renderFps 30 -> ~33ms between frames; wait long enough for a scheduled render to land
const RENDERED = 120;

const setup = () => {
  const { term, stream } = makeTtyStream();
  const logUpdate = createLogUpdate(stream, { showCursor: true });
  const output: OutputInterface = {
    isTTY: () => true,
    write: (x: string) => stream.write(x),
    visual: { write: logUpdate, clear: logUpdate.clear }
  };

  return { term, visLog: new VisualLogger({ color: false, output }) };
};

describe("visual-logger over-clearing", () => {
  it("should keep logs written after the last item is removed", async () => {
    const { term, visLog } = setup();

    visLog.addItem({ name: "fetch", spinner: VisualLogger.spinners[1] });
    visLog.updateItem("fetch", "fetching packages...");
    visLog.addItem({ name: "load", spinner: VisualLogger.spinners[1] });
    visLog.updateItem("load", "loading packages...");
    await delay(RENDERED);

    visLog.removeItem("fetch");
    visLog.removeItem("load");
    await delay(RENDERED);

    visLog.info("KEEP-A");
    visLog.info("KEEP-B");
    visLog.info("KEEP-C");

    visLog.addItem({ name: "install", spinner: VisualLogger.spinners[1] });
    visLog.updateItem("install", "installing packages...");
    await delay(RENDERED);

    expect(term.screen()).toEqual([
      "> KEEP-A",
      "> KEEP-B",
      "> KEEP-C",
      "⠁ install: installing packages..."
    ]);

    // shutdown takes down its own frame and nothing else
    visLog.shutdown();
    expect(term.screen()).toEqual(["> KEEP-A", "> KEEP-B", "> KEEP-C"]);
  });

  it("should keep logs written while items are frozen", async () => {
    const { term, visLog } = setup();

    visLog.addItem({ name: "fetch", spinner: VisualLogger.spinners[1] });
    visLog.updateItem("fetch", "fetching packages...");
    visLog.addItem({ name: "load", spinner: VisualLogger.spinners[1] });
    visLog.updateItem("load", "loading packages...");
    await delay(RENDERED);

    visLog.freezeItems(true);
    await delay(RENDERED);

    visLog.info("KEEP-A");
    visLog.info("KEEP-B");
    visLog.info("KEEP-C");
    visLog.info("KEEP-D");

    visLog.unfreezeItems();
    visLog.updateItem("fetch", "fetching more...");
    await delay(RENDERED);

    expect(term.screen()).toEqual([
      // the frozen snapshot, printed once - not redrawn by a stale render
      "⠁ fetch: fetching packages...",
      "⠁ load: loading packages...",
      "> KEEP-A",
      "> KEEP-B",
      "> KEEP-C",
      "> KEEP-D",
      "⠁ fetch: fetching more...",
      "⠁ load: loading packages..."
    ]);

    visLog.shutdown();
  });

  it("should not draw a frame scheduled before the items were cleared", async () => {
    const visual = { write: [] as string[], clear: 0 };
    const visLog = new VisualLogger({
      color: false,
      output: {
        isTTY: () => true,
        write: () => true,
        visual: {
          write: (x: string) => visual.write.push(x),
          clear: () => visual.clear++
        }
      } as OutputInterface
    });

    visLog.addItem({ name: "TEST_1" });
    visLog.updateItem("TEST_1", "hello");
    visLog.removeItem("TEST_1");
    await delay(RENDERED);

    expect(visual.write).toEqual([]);
    expect((visLog as any)._renderTimer).toBe(null);
    visLog.shutdown();
  });
});
