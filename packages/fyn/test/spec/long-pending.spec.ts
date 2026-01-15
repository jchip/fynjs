/* eslint-disable prefer-spread, max-len */

import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { vi } from "vitest";
import chalk from "chalk";
import logger from "../../lib/logger";
import longPending from "../../lib/long-pending";

describe("long-pending", function() {
  chalk.level = 0;
  let logItems;
  let logs;
  beforeEach(() => {
    logs = [];
    logItems = {};
    vi.spyOn(logger, "addItem").mockImplementation(o => {
      logItems[o.name] = o;
    });
    vi.spyOn(logger, "updateItem").mockImplementation((name, data) => {
      logs.push(`${name}: ${data.msg}`);
    });
    vi.spyOn(logger, "removeItem").mockImplementation(name => {
      delete logItems[name];
    });
    vi.spyOn(logger, "hasItem").mockImplementation(name => {
      return logItems[name];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should add long wait items to logger", () => {
    longPending.onWatch({ total: 1, watched: [{ item: "test", time: 50 }], still: [] });
    expect(logItems).to.deep.equal({
      "package pending fetch": {
        name: "package pending fetch",
        display: undefined,
        color: "yellow"
      }
    });
    expect(logs).to.deep.equal(["package pending fetch: test (0.050secs)"]);
  });

  it("should remove long wait items that finish", () => {
    longPending.onWatch({ total: 1, watched: [{ item: "test", time: 50 }], still: [] });
    expect(logItems).to.deep.equal({
      "package pending fetch": {
        name: "package pending fetch",
        display: undefined,
        color: "yellow"
      }
    });
    expect(logs).to.deep.equal(["package pending fetch: test (0.050secs)"]);
    longPending.onWatch({ total: 0 });
    expect(logItems).to.deep.equal({});
  });

  it("should update existing items", () => {
    longPending.onWatch({ total: 1, watched: [{ item: "test", time: 50 }], still: [] });
    expect(logItems).to.deep.equal({
      "package pending fetch": {
        name: "package pending fetch",
        display: undefined,
        color: "yellow"
      }
    });
    expect(logs).to.deep.equal(["package pending fetch: test (0.050secs)"]);
    longPending.onWatch({ total: 1, watched: [], still: [{ item: "test", time: 150 }] });
    expect(logs).to.deep.equal([
      "package pending fetch: test (0.050secs)",
      "package pending fetch: test (0.150secs)"
    ]);
  });

  it("should crop extra items beyond max", () => {
    const watched = Array.apply(null, { length: 8 }).map((v, ix) => {
      return { item: `i${ix}`, time: 50 };
    });
    const still = Array.apply(null, { length: 5 }).map((v, ix) => {
      return { item: ix, time: 150 };
    });
    longPending.onWatch({ total: 13, watched, still }, { makeId: ix => `s${ix}` });
    expect(logs).to.deep.equal([
      "package pending fetch: Total: 13, first 10: i0 (0.050secs), i1 (0.050secs), i2 (0.050secs), i3 (0.050secs), i4 (0.050secs), i5 (0.050secs), i6 (0.050secs), i7 (0.050secs), s0 (0.150secs), s1 (0.150secs)"
    ]);
  });
});
