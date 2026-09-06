import logger from "../../lib/logger.js";
import xstdout from "xstdout";
import { expect } from "vitest";

describe("logger", function() {
  beforeEach(() => {
    logger.resetBuffer();
    logger.coloring(false);
    logger.buffering(false);
    logger.quiet(false);
  });

  it("should log to stdout in coloring off", () => {
    const intercept = xstdout.intercept(true);

    try {
      logger.coloring(false);
      logger.log("test", "hello", 1, "world");
    } finally {
      intercept.restore();
    }

    expect(intercept.stdout.join("")).toContain("test hello 1 world");
  });

  it("should not log to stdout when buffering in coloring off", () => {
    const intercept = xstdout.intercept(true);

    try {
      logger.coloring(false);
      logger.buffering(true);
      logger.log("test", "hello", 1, "world");
    } finally {
      intercept.restore();
    }

    expect(intercept.stdout.join("")).not.toContain("test hello 1 world");
    expect(logger.buffer.join("")).toContain("test hello 1 world");
  });

  it("should log to stdout in coloring on", () => {
    const intercept = xstdout.intercept(true);

    try {
      logger.coloring(true);
      logger.log("test", "hello", 1, "world");
      // second call to coloring with same value should have no effect
      logger.coloring(true);
    } finally {
      intercept.restore();
    }

    expect(intercept.stdout.join("")).toContain("test hello 1 world");
    expect(intercept.stdout.join("")).toContain("test hello 1 world");
  });

  it("should pad2 1 to 01", () => {
    expect(logger.pad2(1)).toBe("01");
  });

  it("should pad2 12 to 12", () => {
    expect(logger.pad2(12)).toBe("12");
  });

  it("formatElapse should format msec to minutes", () => {
    expect(logger.formatElapse(60000)).toBe("1.00 min");
    expect(logger.formatElapse(692384)).toBe("11.54 min");
  });

  it("formatElapse should format msec to seconds", () => {
    expect(logger.formatElapse(1000)).toBe("1.00 sec");
    expect(logger.formatElapse(14534)).toBe("14.53 sec");
  });

  it("formatElapse should format msec ", () => {
    expect(logger.formatElapse(999)).toBe("999 ms");
    expect(logger.formatElapse(163)).toBe("163 ms");
  });

  it("should log nothing in quiet mode", () => {
    logger.quiet(true);
    const intercept = xstdout.intercept(true);

    try {
      logger.log("test");
    } finally {
      intercept.restore();
    }

    expect(logger.buffer).toStrictEqual([]);
    expect(intercept.stdout).toHaveLength(0);
    expect(intercept.stderr).toHaveLength(0);
    logger.quiet(false);
  });

  it("should log error even in quiet mode", () => {
    logger.quiet(true);
    const intercept = xstdout.intercept(true);

    try {
      logger.error("test");
    } finally {
      intercept.restore();
    }

    expect(intercept.stdout.join("")).toContain("test");
    logger.quiet(false);
  });

  it("should save to buffer in quiet mode", () => {
    logger.quiet(true);
    logger.buffering(true);

    const intercept = xstdout.intercept(true);

    try {
      logger.log("test", 1, "hello", "world");
      logger.log("test", 2, "hello", "world");
      logger.log("test", 3, "hello", "world");
      logger.log("test", 4, "hello", "world");

      // test second calls
      logger.buffering(true);
    } finally {
      intercept.restore();
    }

    expect(intercept.stdout).toHaveLength(0);
    expect(intercept.stderr).toHaveLength(0);

    const buf = logger.buffer;
    for (let i = 1; i <= 4; i++) {
      expect(buf[i - 1]).toContain(`test ${i} hello world`);
    }

    logger.resetBuffer();
    expect(logger.buffer).toStrictEqual([]);

    logger.quiet(false);
  });

  it("should flush buffer when reset", () => {
    logger.quiet(true);
    logger.buffering(true);

    let intercept = xstdout.intercept(true);

    try {
      logger.log("test", 1, "hello", "world");
      logger.log("test", 2, "hello", "world");
      logger.log("test", 3, "hello", "world");
      logger.log("test", 4, "hello", "world");
    } finally {
      intercept.restore();
    }

    expect(intercept.stdout).toHaveLength(0);
    expect(intercept.stderr).toHaveLength(0);

    const verify = buf => {
      for (let i = 1; i <= 4; i++) {
        expect(buf[i - 1]).toContain(`test ${i} hello world`);
      }
    };
    verify(logger.buffer);

    intercept = xstdout.intercept(true);
    try {
      logger.quiet(false);
      logger.resetBuffer(true);
    } finally {
      intercept.restore();
    }

    expect(logger.buffer).toStrictEqual([]);
    verify(intercept.stdout);

    logger.quiet(false);
  });
});
