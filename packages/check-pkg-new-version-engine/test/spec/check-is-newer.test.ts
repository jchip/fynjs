import { describe, it, expect } from "vitest";
import { internalCheckIsNewer } from "../../src/check-is-newer.ts";

const check = (current: string, latest: string, tag = "latest") =>
  internalCheckIsNewer({ name: "test", version: current } as any, { latest }, tag);

describe("internalCheckIsNewer", () => {
  it("reports a newer version, and returns it", () => {
    for (const [current, latest] of [
      ["1.0.0", "2.0.0"],
      ["1.0.0", "1.1.0"],
      ["1.0.0", "1.0.1"],
      ["1.9.9", "2.0.0"],
    ]) {
      expect(check(current, latest), `${current} -> ${latest}`).toEqual({
        isNewer: true,
        version: latest,
      });
    }
  });

  it("reports nothing for the same version", () => {
    expect(check("2.3.4", "2.3.4")).toEqual({ isNewer: false });
  });

  //
  // FJM-19. The old implementation asked whether ANY component grew, so an older release
  // whose minor or patch happened to be larger was reported as an upgrade. Every case here
  // returned isNewer: true before the fix.
  //
  it("does not report an older version as newer when a lower component is larger", () => {
    for (const [current, latest] of [
      ["2.0.0", "1.9.9"],
      ["3.0.0", "2.9.9"],
      ["1.5.0", "1.4.9"],
      ["1.0.0", "0.9.9"],
    ]) {
      expect(check(current, latest), `${current} -> ${latest}`).toEqual({ isNewer: false });
    }
  });

  it("does not report an older version as newer in the simple case", () => {
    expect(check("1.1.0", "1.0.0")).toEqual({ isNewer: false });
    expect(check("2.0.1", "2.0.0")).toEqual({ isNewer: false });
  });

  // parseInt("0-beta") is 0, so the old code compared 1.0.0-beta equal to 1.0.0
  it("orders prereleases below their release", () => {
    expect(check("1.0.0-beta", "1.0.0")).toEqual({ isNewer: true, version: "1.0.0" });
    expect(check("1.0.0", "1.0.0-beta")).toEqual({ isNewer: false });
    expect(check("1.0.0-alpha", "1.0.0-beta")).toEqual({ isNewer: true, version: "1.0.0-beta" });
  });

  it("defaults to the latest tag", () => {
    expect(
      internalCheckIsNewer({ name: "test", version: "1.0.0" } as any, { latest: "1.2.0" })
    ).toEqual({ isNewer: true, version: "1.2.0" });
  });

  it("reads the requested tag, not just latest", () => {
    const distTags = { latest: "1.0.0", next: "2.0.0-rc.1" };
    const pkg = { name: "test", version: "1.0.0" } as any;

    expect(internalCheckIsNewer(pkg, distTags, "next")).toEqual({
      isNewer: true,
      version: "2.0.0-rc.1",
    });
    expect(internalCheckIsNewer(pkg, distTags, "latest")).toEqual({ isNewer: false });
  });

  //
  // This runs in the background of someone else's CLI. Bad input means "cannot tell", not
  // "crash the host process" - the old code asserted and threw.
  //
  it("returns false rather than throwing on unusable input", () => {
    const pkg = { name: "test", version: "1.0.0" } as any;

    expect(internalCheckIsNewer(pkg, { latest: "not-a-version" })).toEqual({ isNewer: false });
    expect(internalCheckIsNewer(pkg, {})).toEqual({ isNewer: false });
    expect(internalCheckIsNewer(pkg, { latest: undefined } as any)).toEqual({ isNewer: false });
    expect(internalCheckIsNewer(pkg, { latest: "2.0.0" }, "missing-tag")).toEqual({
      isNewer: false,
    });
    expect(
      internalCheckIsNewer({ name: "test", version: "garbage" } as any, { latest: "2.0.0" })
    ).toEqual({ isNewer: false });
    expect(internalCheckIsNewer({ name: "test" } as any, { latest: "2.0.0" })).toEqual({
      isNewer: false,
    });
  });
});
