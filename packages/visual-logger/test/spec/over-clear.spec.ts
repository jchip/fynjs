import { describe, it, expect } from "vitest";
import { createLogUpdate } from "log-update";
import { verify } from "run-verify";
import { VisualLogger, type OutputInterface } from "../../src/index.js";
import { makeTtyStream } from "./vterm.js";

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
  it("should keep logs written after the last item is removed", () => {
    const { term, visLog } = setup();

    return verify({ timeout: 1000, cleanup: () => visLog.shutdown() })
      .step(() => {
        visLog.addItem({ name: "fetch", spinner: VisualLogger.spinners[1] });
        visLog.updateItem("fetch", "fetching packages...");
        visLog.addItem({ name: "load", spinner: VisualLogger.spinners[1] });
        visLog.updateItem("load", "loading packages...");
      })
      .step(() => delay(RENDERED))
      .step(() => {
        visLog.removeItem("fetch");
        visLog.removeItem("load");
      })
      .step(() => delay(RENDERED))
      .step(() => {
        visLog.info("KEEP-A");
        visLog.info("KEEP-B");
        visLog.info("KEEP-C");

        visLog.addItem({ name: "install", spinner: VisualLogger.spinners[1] });
        visLog.updateItem("install", "installing packages...");
      })
      .step(() => delay(RENDERED))
      .step(() => {
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
  });

  it("should keep logs written while items are frozen", () => {
    const { term, visLog } = setup();

    return verify({ timeout: 1000, cleanup: () => visLog.shutdown() })
      .step(() => {
        visLog.addItem({ name: "fetch", spinner: VisualLogger.spinners[1] });
        visLog.updateItem("fetch", "fetching packages...");
        visLog.addItem({ name: "load", spinner: VisualLogger.spinners[1] });
        visLog.updateItem("load", "loading packages...");
      })
      .step(() => delay(RENDERED))
      .step(() => visLog.freezeItems(true))
      .step(() => delay(RENDERED))
      .step(() => {
        visLog.info("KEEP-A");
        visLog.info("KEEP-B");
        visLog.info("KEEP-C");
        visLog.info("KEEP-D");

        visLog.unfreezeItems();
        visLog.updateItem("fetch", "fetching more...");
      })
      .step(() => delay(RENDERED))
      .step(() => {
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
      });
  });

  // FJM-145: setItemType() used to swap _itemType without tearing the frame down, which
  // stranded it on screen and left log-update owning lines it later erased from the wrong
  // place - the same over-clear, reached by turning the item display off and back on.
  it("should clear the frame when the item display is turned off", () => {
    const { term, visLog } = setup();

    return verify({ timeout: 1000, cleanup: () => visLog.shutdown() })
      .step(() => {
        visLog.addItem({ name: "fetch", spinner: VisualLogger.spinners[1] });
        visLog.updateItem("fetch", "fetching packages...");
        visLog.addItem({ name: "load", spinner: VisualLogger.spinners[1] });
        visLog.updateItem("load", "loading packages...");
      })
      .step(() => delay(RENDERED))
      .step(() => {
        expect(term.screen()).toEqual([
          "\u2801 fetch: fetching packages...",
          "\u2801 load: loading packages..."
        ]);

        visLog.setItemType(false);
      })
      .step(() => delay(RENDERED))
      .step(() => {
        expect(term.screen()).toEqual([]);

        visLog.info("KEEP-A");
        visLog.info("KEEP-B");
        visLog.info("KEEP-C");

        visLog.setItemType("normal");
        visLog.updateItem("fetch", "fetching more...");
      })
      .step(() => delay(RENDERED))
      .step(() => {
        expect(term.screen()).toEqual([
          "> KEEP-A",
          "> KEEP-B",
          "> KEEP-C",
          "\u2801 fetch: fetching more...",
          "\u2801 load: loading packages..."
        ]);
      });
  });

  it("should stop and restart item spinners as the display is toggled", () => {
    const { visLog } = setup();

    return verify({ timeout: 1000, cleanup: () => visLog.shutdown() }).step(() => {
      visLog.addItem({ name: "fetch", spinner: VisualLogger.spinners[1] });
      const opts = (visLog as any)._itemOptions.fetch;
      expect(opts._spinning).toBeTruthy();

      visLog.setItemType(false);
      expect(opts._spinning).toBeFalsy();

      visLog.setItemType("normal");
      expect(opts._spinning).toBeTruthy();
    });
  });

  // FJM-147: a logger whose owner never calls setItemType() used to keep animating into a
  // pipe. Those bytes get captured by the parent process and corrupt its terminal on replay.
  it("should not emit cursor control when the output is not a TTY", () => {
    const visual = { write: [] as string[], clear: 0 };
    const visLog = new VisualLogger({
      color: false,
      output: {
        isTTY: () => undefined, // node leaves isTTY undefined on a pipe
        write: () => true,
        visual: {
          write: (x: string) => visual.write.push(x),
          clear: () => visual.clear++
        }
      } as OutputInterface
    });

    return verify({ timeout: 1000, cleanup: () => visLog.shutdown() })
      .step(() => {
        visLog.addItem({ name: "fetch", spinner: VisualLogger.spinners[1] });
        visLog.updateItem("fetch", "fetching packages...");
        visLog.info("a log line");
      })
      .step(() => delay(RENDERED))
      .step(() => {
        expect(visual.write).toEqual([]);
        expect(visual.clear).toBe(0);
      });
  });

  it("should not draw a frame scheduled before the items were cleared", () => {
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

    return verify({ timeout: 1000, cleanup: () => visLog.shutdown() })
      .step(() => {
        visLog.addItem({ name: "TEST_1" });
        visLog.updateItem("TEST_1", "hello");
        visLog.removeItem("TEST_1");
      })
      .step(() => delay(RENDERED))
      .step(() => {
        expect(visual.write).toEqual([]);
        expect((visLog as any)._renderTimer).toBe(null);
      });
  });
});
