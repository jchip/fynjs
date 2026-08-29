import { describe, it, expect, vi, beforeEach } from "vitest";
import minimatch from "minimatch";

vi.mock("../src/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const execSync = vi.fn();
vi.mock("../src/child-process", () => ({
  execSync: (...args: any[]) => execSync(...args),
}));

import {
  defaultTagTemplate,
  makePublishTag,
  makePublishTagSearchTerm,
  makeSelectiveTagTemplate,
  makePublishCommitSubject,
  parsePublishedPackageNames,
  expandSelection,
  selectivePublishSubject,
} from "../src/utils";
import { collectSelectiveBaselines } from "../src/utils/git-list-commits";

describe("selective release tag namespace", () => {
  //
  // This is the invariant the whole feature rests on: getLatestTag matches with the
  // full-release search term, and git anchors --match against the whole tag name. If a
  // selective tag ever matched that term, a selective release would move the changelog
  // boundary and silently drop every other package's commits.
  //
  const fullTerm = makePublishTagSearchTerm(defaultTagTemplate);
  const selectiveTmpl = makeSelectiveTagTemplate(defaultTagTemplate);

  const fullTag = makePublishTag(defaultTagTemplate, {
    date: new Date(2026, 7, 29),
    gitHash: "abcdef1234",
  });
  const selectiveTag = makePublishTag(selectiveTmpl, {
    date: new Date(2026, 7, 29),
    gitHash: "abcdef1234",
  });

  it("puts selective tags in a distinct namespace", () => {
    expect(fullTag).toBe("fynpo-rel-20260829-abcdef12");
    expect(selectiveTag).toBe("selective-fynpo-rel-20260829-abcdef12");
  });

  it("full-release search term does NOT match a selective tag", () => {
    expect(minimatch(fullTag, fullTerm)).toBe(true);
    expect(minimatch(selectiveTag, fullTerm)).toBe(false);
  });

  it("selective search term matches only selective tags", () => {
    const selectiveTerm = makePublishTagSearchTerm(selectiveTmpl);
    expect(minimatch(selectiveTag, selectiveTerm)).toBe(true);
    expect(minimatch(fullTag, selectiveTerm)).toBe(false);
  });

  it("keeps the namespaces apart for a custom tag template", () => {
    const custom = "rel-{YYYY}-{COMMIT}";
    const customFull = makePublishTag(custom, { date: new Date(2026, 0, 1), gitHash: "0badc0de" });
    const customSel = makePublishTag(makeSelectiveTagTemplate(custom), {
      date: new Date(2026, 0, 1),
      gitHash: "0badc0de",
    });
    const term = makePublishTagSearchTerm(custom);
    expect(minimatch(customFull, term)).toBe(true);
    expect(minimatch(customSel, term)).toBe(false);
  });
});

describe("makePublishCommitSubject", () => {
  it("marks selective releases while staying a [Publish] commit", () => {
    expect(makePublishCommitSubject(false)).toBe("[Publish]");
    expect(makePublishCommitSubject(true)).toBe(selectivePublishSubject);
    // publish.ts identifies publish commits with includes("[Publish]") and commitlint
    // ignores commits starting with it - both must keep working for selective releases
    expect(selectivePublishSubject.startsWith("[Publish]")).toBe(true);
  });
});

describe("parsePublishedPackageNames", () => {
  it("reads the names out of a publish commit body", () => {
    const body = ["[Publish]", "", " - @fynpo/base@1.1.23", " - fyn@2.1.6", " - fynpo@2.1.6"].join(
      "\n"
    );
    expect(parsePublishedPackageNames(body)).toEqual(["@fynpo/base", "fyn", "fynpo"]);
  });

  it("keeps the scope on scoped names", () => {
    expect(parsePublishedPackageNames(" - @scope/thing@0.1.2")).toEqual(["@scope/thing"]);
  });

  it("ignores lines that are not package entries", () => {
    const body = ["[Publish]", "some prose", "- not-a-version", "", " - ok@1.0.0"].join("\n");
    expect(parsePublishedPackageNames(body)).toEqual(["ok"]);
  });
});

describe("expandSelection", () => {
  it("returns undefined when nothing is selected", () => {
    expect(expandSelection([])).toBeUndefined();
    expect(expandSelection(undefined)).toBeUndefined();
  });

  it("expands a version lock group when any member is selected", () => {
    const sel = expandSelection(["fyn"], [["fynpo", "fyn"]]);
    expect([...sel].sort()).toEqual(["fyn", "fynpo"]);
  });

  it("leaves unrelated lock groups alone", () => {
    const sel = expandSelection(["optional-import"], [["fynpo", "fyn"]]);
    expect([...sel]).toEqual(["optional-import"]);
  });

  it("handles multiple groups and repeated names", () => {
    const sel = expandSelection(["a", "a"], [
      ["a", "b"],
      ["c", "d"],
    ]);
    expect([...sel].sort()).toEqual(["a", "b"]);
  });
});

describe("collectSelectiveBaselines", () => {
  beforeEach(() => {
    execSync.mockReset();
  });

  // git log is newest first, so entries after a selective publish commit are older than it
  const lines = (...rows: string[]) => rows;

  it("excludes a package's commits that predate its selective release", () => {
    execSync.mockReturnValue("[Publish][Selective]\n\n - optional-import@1.0.0");

    const baselines = collectSelectiveBaselines(
      lines(
        "aaa newer work on chalker",
        `bbb ${selectivePublishSubject}`,
        "ccc older work on optional-import",
        "ddd older work on chalker"
      ),
      { cwd: "." }
    );

    // optional-import already shipped everything older than bbb
    expect([...baselines["optional-import"]].sort()).toEqual(["ccc", "ddd"]);
    // chalker was not part of that release, so nothing is excluded for it
    expect(baselines.chalker).toBeUndefined();
  });

  it("returns nothing when there is no selective release in range", () => {
    const baselines = collectSelectiveBaselines(
      lines("aaa some work", "bbb [Publish]", "ccc more work"),
      { cwd: "." }
    );
    expect(baselines).toEqual({});
    expect(execSync).not.toHaveBeenCalled();
  });

  it("accumulates across more than one selective release", () => {
    execSync
      .mockReturnValueOnce("[Publish][Selective]\n\n - pkg-a@1.0.0")
      .mockReturnValueOnce("[Publish][Selective]\n\n - pkg-b@2.0.0");

    const baselines = collectSelectiveBaselines(
      lines(
        `aaa ${selectivePublishSubject}`,
        "bbb work",
        `ccc ${selectivePublishSubject}`,
        "ddd older work"
      ),
      { cwd: "." }
    );

    expect([...baselines["pkg-a"]].sort()).toEqual(["bbb", "ccc", "ddd"]);
    expect([...baselines["pkg-b"]].sort()).toEqual(["ddd"]);
  });
});
