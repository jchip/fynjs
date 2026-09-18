import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualLogger, type OutputInterface } from "../../src/index.js";

describe("render boundaries", () => {
  let logger: VisualLogger;
  let output: OutputInterface;

  beforeEach(() => {
    vi.useFakeTimers();
    output = {
      isTTY: vi.fn(() => true),
      write: vi.fn(() => true),
      visual: { write: vi.fn(), clear: vi.fn() }
    };
    logger = new VisualLogger({ output, color: false });
  });

  afterEach(() => {
    logger.shutdown();
    vi.useRealTimers();
  });

  it.each([0, 1000])("rejects renderFps %s outside the supported range", (renderFps) => {
    expect(() => new VisualLogger({ output, renderFps })).toThrow(
      "VisualLogger renderFps must be >= 1 and < 1000"
    );
  });

  it("keeps the current frame when the item type is unchanged", () => {
    logger.addItem({ name: "task" }).updateItem("task", "working");
    vi.advanceTimersByTime(34);
    expect(output.visual.write).toHaveBeenCalledExactlyOnceWith("task: working");

    expect(logger.setItemType("normal")).toBe(logger);
    vi.advanceTimersByTime(34);

    expect(output.visual.clear).not.toHaveBeenCalled();
    expect(output.visual.write).toHaveBeenCalledTimes(1);
  });

  it("does not draw a pending frame after the output stops being a TTY", () => {
    logger.addItem({ name: "task" }).updateItem("task", "working");
    output.isTTY = () => false;

    vi.advanceTimersByTime(34);

    expect(output.visual.write).not.toHaveBeenCalled();
    expect(output.visual.clear).not.toHaveBeenCalled();

    output.isTTY = () => true;
    logger.updateItem("task", "resumed");
    vi.advanceTimersByTime(34);
    expect(output.visual.write).toHaveBeenCalledExactlyOnceWith("task: resumed");
  });

  it("renders and saves a display-only update with an empty message", () => {
    logger.addItem({ name: "task" }).updateItem("task", { display: "Renamed" });
    vi.advanceTimersByTime(34);

    expect(output.visual.write).toHaveBeenCalledExactlyOnceWith("Renamed: ");
    expect(logger.logData).toEqual(["Renamed: "]);
  });
});
