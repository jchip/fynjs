import { describe, it, expect, beforeEach, afterEach } from "vitest";
import chalk from "chalk";
import { VisualLogger, OutputInterface } from "../../src/index.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("visual-logger", () => {
  it("should init with default color setting to true", () => {
    const visLog = new VisualLogger();
    expect((visLog as any)._output).toBeDefined();
    expect(visLog.color).toBe(true);
  });

  it("should log messages", () => {
    let out: string[] = [];
    const visLog = new VisualLogger({
      color: false,
      output: { write: (x) => (out.push(x), true) } as OutputInterface
    });
    visLog.log("log info msg");
    visLog.debug("debug msg");
    visLog.verbose("verbose msg");
    visLog.info("info msg");
    visLog.warn("warn msg");
    visLog.error("error msg");
    visLog.fyi("fyi msg");
    expect(visLog.logData).toEqual([
      "> log info msg",
      "> debug msg",
      "> verbose msg",
      "> info msg",
      "> warn msg",
      "> error msg",
      "> fyi msg"
    ]);

    expect(out).toEqual([
      "> log info msg\n",
      "> info msg\n",
      "> warn msg\n",
      "> error msg\n",
      "> fyi msg\n"
    ]);
    out = [];
    visLog.prefix("!").fyi("a").prefix(false).fyi("b").fyi("c");
    expect(out).toEqual(["!a\n", "b\n", "> c\n"]);
  });

  it("should allow changing default prefix", () => {
    const out: string[] = [];
    const visLog = new VisualLogger({
      color: false,
      output: { write: (x) => (out.push(x), true) } as OutputInterface
    });
    visLog.setPrefix("-").info("blah");
    expect(out).toEqual(["-blah\n"]);
  });

  it("should reset color prefix when color flag changes", () => {
    const out: string[] = [];
    const visLog = new VisualLogger({
      color: false,
      output: { write: (x) => (out.push(x), true) } as OutputInterface
    });
    expect((visLog as any)._colorPrefix.debug).toBe("> ");
    visLog.color = true;
    const saveLevel = chalk.level;
    chalk.level = 0;
    visLog.log("hello");
    expect((visLog as any)._colorPrefix.debug).toBe("> ");
    // Force chalk.level to 1 to test colorized prefix (saveLevel might be 0 in CI)
    chalk.level = 1;
    visLog.log("hello");
    expect((visLog as any)._colorPrefix.debug).not.toBe("> ");
    visLog.color = false;
    chalk.level = saveLevel;
    visLog.log("hello");
    expect((visLog as any)._colorPrefix.debug).toBe("> ");
  });

  describe("visual item", () => {
    let out: string[] = [];
    let clearCount = 0;
    let vis: string | undefined;
    let visList: string[] = [];
    let visLog: VisualLogger;

    const make = (opts: any = {}) => {
      out = [];
      clearCount = 0;
      vis = undefined;
      visList = [];

      return new VisualLogger({
        color: false,
        updatesPerDot: 1,
        output: {
          isTTY: () => true,
          write: (x: string) => {
            const l = out[out.length - 1];
            if (!l || l.endsWith("\n")) {
              out.push(x);
              return true;
            }
            out[out.length - 1] += x;
            return true;
          },
          visual: {
            write: (x: string) => {
              vis = x;
              visList.push(x);
            },
            clear: () => {
              vis = undefined;
              clearCount++;
            }
          }
        },
        renderFps: 30,
        ...opts
      });
    };

    const itemOpt = { name: "TEST_1", color: "blue" };
    beforeEach(() => {
      visLog = make();
      visLog.addItem(itemOpt);
    });

    afterEach(() => {
      visLog.shutdown();
    });

    const update1 = async () => {
      visLog.updateItem("TEST_1", "hello");
      await delay(40);
      expect(visLog.hasItem("TEST_1")).toBe(true);
      expect(vis).toBe("TEST_1: hello");
    };

    const add2 = (display?: string) => {
      visLog.addItem({ name: "TEST_2", color: "red", display });
      visLog.updateItem("TEST_2", "world");
      expect(visLog.hasItem("TEST_2")).toBe(true);
    };

    it("setItemType should fallback to simple if not TTY", () => {
      (visLog as any)._output.isTTY = () => undefined;
      visLog.setItemType("normal");
      expect((visLog as any)._itemType).toBe(VisualLogger.LogItemTypes.simple);
    });

    it("setItemType should turn off items if type is invalid", () => {
      visLog.setItemType("foo" as any);
      expect((visLog as any)._itemType).toBe(VisualLogger.LogItemTypes.none);
    });

    it("setItemType should turn off items if type is falsy", () => {
      visLog.setItemType();
      expect((visLog as any)._itemType).toBe(VisualLogger.LogItemTypes.none);
    });

    it("should handle update visual item", async () => {
      visLog.addItem(itemOpt).updateItem("foo").updateItem("TEST_1", "hello");
      await delay(120);
      expect(vis).toBe("TEST_1: hello");
      visLog.error("error message");
      expect(clearCount).toBe(1);
      expect(out).toEqual(["> error message\n"]);
      add2();
      visLog.updateItem("TEST_1"); // should do nothing w/o data
      await delay(50);
      expect(vis).toBe("TEST_1: hello\nTEST_2: world");
    });

    it("should removeItem", async () => {
      await update1();
      add2();
      visLog.removeItem("bad").removeItem("TEST_2");
      expect(visLog.hasItem("TEST_1")).toBe(true);
      expect(visLog.hasItem("TEST_2")).toBe(false);
    });

    it("should freeItem and stop updating them", async () => {
      await update1();
      visLog.freezeItems(false);
      expect(vis).toBeUndefined();
      out = [];
      visLog.freezeItems(true);
      expect(out[0]).toBe("TEST_1: hello\n");
    });

    it("should handle auto spinners", async () => {
      visLog.addItem({ name: "T", spinner: VisualLogger.spinners[0], color: "blue" });
      await delay(500);
      expect(visList.slice(0, 4)).toEqual([
        "TEST_1: \n| T: ",
        "TEST_1: \n/ T: ",
        "TEST_1: \n- T: ",
        "TEST_1: \n\\ T: "
      ]);
      visLog.removeItem("T");
      visList = [];
      visLog.updateItem("TEST_1", { msg: "1" });
      await delay(50);
      expect(visList).toEqual(["TEST_1: 1"]);
    });

    it("should handle spinner being true", async () => {
      const spinner = VisualLogger.spinners[1];
      visLog.addItem({ name: "T", spinner: true, color: "blue" });
      await delay(150);
      const expected = [`TEST_1: \n${spinner[0]} T: `];
      expect(visList.slice(0, 1)).toEqual(expected);
      visLog.removeItem("T");
      visList = [];
      visLog.updateItem("TEST_1", { msg: "1" });
      await delay(50);
      expect(visList).toEqual(["TEST_1: 1"]);
    });

    it("should handle spinner being a valid index", async () => {
      const spinner = VisualLogger.spinners[2];
      const opts = { name: "T", spinner: 2, color: "blue" };
      visLog.addItem(opts);
      await delay(150);
      const expected = [`TEST_1: \n${spinner[0]} T: `];
      expect(visList.slice(0, 1)).toEqual(expected);
      visLog.removeItem("T");
      visList = [];
      visLog.updateItem("TEST_1", { msg: "1" });
      await delay(50);
      expect(visList).toEqual(["TEST_1: 1"]);
    });

    it("should not start spinner if item type is not normal", () => {
      visLog.setItemType("simple");
      visLog.addItem({ name: "S", spinner: "[]" });
      expect((visLog as any)._itemOptions.S.spinTimer).toBeUndefined();
    });

    it("should freeze/unfreeze items and circular through them", async () => {
      visList = [];
      visLog.addItem({ name: "T", spinner: "abc", color: "blue" });
      visLog.updateItem("T", "foo");
      await delay(350);
      expect(visList.slice(0, 3)).toEqual([
        "TEST_1: \na T: foo",
        "TEST_1: \na T: foo",
        "TEST_1: \nb T: foo"
      ]);
      visList = [];
      visLog.freezeItems();
      await delay(150);
      expect(visList).toEqual([]);
      visLog.unfreezeItems();
      visLog.unfreezeItems();
      await delay(500);
      expect(visList.slice(0, 4)).toEqual([
        "TEST_1: \na T: foo",
        "TEST_1: \nb T: foo",
        "TEST_1: \nc T: foo",
        "TEST_1: \na T: foo"
      ]);
    });

    it("should reset item spin index to 0 in addItem", async () => {
      visList = [];
      visLog.addItem({ name: "T", spinner: "abc", color: "blue" });
      visLog.updateItem("T", "foo");
      await delay(300);
      expect(visList.slice(0, 3)).toEqual([
        "TEST_1: \na T: foo",
        "TEST_1: \na T: foo",
        "TEST_1: \nb T: foo"
      ]);
      visLog.addItem({ name: "R", spinner: "xyz" });
      await delay(100);
      expect(visList.slice(0, 4)).toEqual([
        "TEST_1: \na T: foo",
        "TEST_1: \na T: foo",
        "TEST_1: \nb T: foo",
        "TEST_1: \na T: foo\nx R: "
      ]);
    });

    it("should support independent spin timer for different interval", async () => {
      visList = [];
      visLog.addItem({ name: "R", spinner: "xyz", color: "blue" });
      visLog.addItem({ name: "T", spinner: "abc", color: "blue", spinInterval: 50 });
      visLog.updateItem("T", "foo");
      await delay(200);
      expect(visList.slice(0, 4)).toEqual([
        "TEST_1: \nx R: \na T: foo",
        "TEST_1: \nx R: \na T: foo",
        "TEST_1: \nx R: \nb T: foo",
        "TEST_1: \nx R: \nc T: foo"
      ]);
      visLog.removeItem("T");
      await delay(150);
      expect(visList.slice(0, 6)).toEqual([
        "TEST_1: \nx R: \na T: foo",
        "TEST_1: \nx R: \na T: foo",
        "TEST_1: \nx R: \nb T: foo",
        "TEST_1: \nx R: \nc T: foo",
        "TEST_1: \ny R: ",
        "TEST_1: \nz R: "
      ]);
    });

    it("should freeze items and show correct current render when item type is simple", async () => {
      visLog.addItem({ name: "T", spinner: VisualLogger.spinners[0], color: "blue" });
      visLog.setItemType("simple");
      visLog.updateItem("T", "hello world");
      visLog.freezeItems(true);
      await delay(50);
      expect(out).toEqual([".\n", "TEST_1: \nT: hello world\n"]);
    });

    it("should use display from data when updateItem", async () => {
      await update1();
      visLog.updateItem("TEST_1", { msg: "foo", display: "bar" });
      await delay(50);
      expect(vis).toBe("bar: foo");
    });

    it("should not save to log data if it's off", async () => {
      (visLog as any)._options.saveLogs = false;
      await update1();
      expect(visLog.logData).toEqual([]);
    });

    it("should not log item if type is none", async () => {
      visLog.setItemType("none");
      visLog.updateItem("TEST_1", "hello");
      await delay(50);
      expect(out).toEqual([]);
      expect(visList).toEqual([]);
    });

    it("should log dots if item type is simple", async () => {
      visLog = make({ maxDots: 10 });
      visLog.addItem(itemOpt);
      visLog.setItemType("simple");
      visLog.updateItem("TEST_1", "hello");
      await delay(50);
      expect(out).toEqual(["."]);
      expect(visList).toEqual([]);
      out = [];
      visLog.clearItems();
      await delay(50);
      expect(out).toEqual([]);
      expect(visList).toEqual([]);
      for (let i = 0; i < 15; i++) {
        visLog.updateItem("TEST_1", `${i}`);
      }
      await delay(50);
      expect(out).toEqual([".........\n", "......"]);
    });

    it("should log less dots if updatesPerDot is > 1", async () => {
      visLog = make({ maxDots: 10, updatesPerDot: undefined });
      visLog.addItem(itemOpt);
      visLog.setItemType("simple");
      visLog.updateItem("TEST_1", "hello");
      await delay(50);
      expect(out).toEqual([]);
      expect(visList).toEqual([]);
      out = [];
      visLog.clearItems();
      await delay(150);
      expect(out).toEqual([]);
      expect(visList).toEqual([]);
      for (let i = 0; i < 15; i++) {
        visLog.updateItem("TEST_1", `${i}`);
      }
      await delay(150);
      expect(out).toEqual(["..."]);
    });

    it("should not save to log data if flag is false", async () => {
      visLog.updateItem("TEST_1", { msg: "blah", _save: false });
      expect(visLog.logData).toEqual([]);
      visLog.addItem({ name: "B", save: false });
      visLog.updateItem("B", "hello");
      await delay(150);
      expect(visList).toEqual(["TEST_1: blah\nB: hello"]);
      expect(visLog.logData).toEqual([]);
    });

    it("should render if _render flag is false", async () => {
      visLog.updateItem("TEST_1", { msg: "blah", _save: false, _render: false });
      expect(visLog.logData).toEqual([]);
      visLog.addItem({ name: "B", save: false });
      visLog.updateItem("B", "hello");
      await delay(50);
      expect(visList).toEqual(["TEST_1: \nB: hello"]);
      expect(visLog.logData).toEqual([]);
    });
  });
});
