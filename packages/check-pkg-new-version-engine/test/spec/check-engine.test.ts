import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as Fs } from "fs";
import os from "os";
import { checkPkgNewVersionEngine } from "../../src/index.js";
import type { CheckNewVersionOptions } from "../../src/index.js";
import { internalNotify } from "../../src/notify-new-version.js";

const environment = vi.hoisted(() => ({ isCI: false }));
vi.mock("ci-info", () => ({ get isCI() { return environment.isCI; } }));
vi.mock("fs", () => ({ promises: { mkdir: vi.fn(), readFile: vi.fn(), writeFile: vi.fn() } }));
vi.mock("../../src/notify-new-version.js", () => ({ internalNotify: vi.fn() }));

describe("checkPkgNewVersionEngine", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 20 * day;
  const pkg = { name: "test-package", version: "1.0.0" };
  const distTags = { latest: "2.0.0" };
  let options: CheckNewVersionOptions;

  beforeEach(() => {
    vi.resetAllMocks();
    environment.isCI = false;
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.spyOn(os, "tmpdir").mockReturnValue("/mock-temp");
    vi.mocked(Fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(Fs.readFile).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(Fs.writeFile).mockResolvedValue(undefined);
    options = {
      pkg,
      npmConfig: {},
      fetchDistTags: vi.fn().mockResolvedValue(distTags),
      checkIsNewer: vi.fn().mockReturnValue({ isNewer: true, version: "2.0.0" }),
      notifyNewVersion: vi.fn(),
    };
  });

  afterEach(() => vi.restoreAllMocks());

  const cache = (meta: Record<string, unknown>) =>
    vi.mocked(Fs.readFile).mockResolvedValue(JSON.stringify(meta));
  const saved = () => JSON.parse(String(vi.mocked(Fs.writeFile).mock.calls[0][1]));

  it("fetches the default registry, notifies, and records cache and notification times", async () => {
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(Fs.mkdir).toHaveBeenCalledWith("/mock-temp/check-pkg-new-version", { recursive: true });
    expect(Fs.readFile).toHaveBeenCalledWith(
      "/mock-temp/check-pkg-new-version/test-package-latest-meta.json", "utf-8"
    );
    expect(options.fetchDistTags).toHaveBeenCalledWith("https://registry.npmjs.org/", "", pkg);
    expect(options.checkIsNewer).toHaveBeenCalledWith(pkg, distTags, "latest");
    expect(options.notifyNewVersion).toHaveBeenCalledWith({ ...pkg, newVersion: "2.0.0" });
    expect(saved()).toEqual({ ...pkg, distTags, time: now, notifiedVersion: "2.0.0", notifiedTime: now });
  });

  it("skips all work in CI", async () => {
    environment.isCI = true;
    expect(await checkPkgNewVersionEngine(options)).toBe(false);
    expect(Fs.mkdir).not.toHaveBeenCalled();
    expect(options.fetchDistTags).not.toHaveBeenCalled();
  });

  it("reuses fresh metadata without fetching, checking, notifying, or rewriting it", async () => {
    cache({ time: now - day + 1, distTags });
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(options.fetchDistTags).not.toHaveBeenCalled();
    expect(options.checkIsNewer).not.toHaveBeenCalled();
    expect(options.notifyNewVersion).not.toHaveBeenCalled();
    expect(Fs.writeFile).not.toHaveBeenCalled();
  });

  it("fetches fresh metadata when cached dist tags are missing", async () => {
    cache({ time: now });
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(options.fetchDistTags).toHaveBeenCalledOnce();
  });

  it("honors a custom directory, tag, interval, registry, and global auth token", async () => {
    options.saveMetaDir = "/custom";
    options.checkTag = "next";
    options.checkInterval = 100;
    options.npmConfig = { unrelated: "value", registry: "https://registry.example/", _authToken: "token" };
    cache({ time: now - 100, distTags, notifiedVersion: 123 });
    vi.mocked(options.checkIsNewer).mockReturnValue({ isNewer: false });

    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(Fs.writeFile).toHaveBeenCalledWith(
      "/custom/check-pkg-new-version/test-package-next-meta.json", expect.any(String)
    );
    expect(options.fetchDistTags).toHaveBeenCalledWith("https://registry.example/", "token", pkg);
    expect(options.checkIsNewer).toHaveBeenCalledWith(pkg, distTags, "next");
    expect(saved()).toEqual({ ...pkg, distTags, time: now, notifiedVersion: "", notifiedTime: 0 });
    expect(options.notifyNewVersion).not.toHaveBeenCalled();
  });

  it("uses a matching scoped registry and host-specific token", async () => {
    options.pkg = { ...pkg, name: "@scope/package" };
    options.npmConfig = {
      registry: "https://registry.example/",
      "@other:registry": "https://other.example/",
      "@scope:registry": "https://scope.example/",
      "//other.example/:_authToken": "other-token",
      "//scope.example/:_authToken": "scoped-token",
      _authToken: "fallback-token",
    };
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(options.fetchDistTags).toHaveBeenCalledWith(
      "https://scope.example/", "scoped-token", options.pkg
    );
  });

  it("falls back to the general registry when no scoped registry matches", async () => {
    options.pkg = { ...pkg, name: "@scope/package" };
    options.npmConfig = { registry: "https://registry.example/" };
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(options.fetchDistTags).toHaveBeenCalledWith("https://registry.example/", "", options.pkg);
  });

  it("fetches packuments through fetchJSON with an encoded package name and request headers", async () => {
    options.pkg = { ...pkg, name: "@scope/package" };
    delete options.fetchDistTags;
    options.fetchJSON = vi.fn().mockResolvedValue({ "dist-tags": distTags });
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(options.fetchJSON).toHaveBeenCalledWith("https://registry.npmjs.org/%40scope%2Fpackage", {
      headers: {
        "user-agent": "check-pkg-new-version-fetch",
        accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*",
      },
    });
    expect(options.checkIsNewer).toHaveBeenCalledWith(options.pkg, distTags, "latest");
  });

  it("treats a failed JSON fetch as empty dist tags", async () => {
    delete options.fetchDistTags;
    options.fetchJSON = vi.fn().mockRejectedValue(new Error("offline"));
    vi.mocked(options.checkIsNewer).mockReturnValue({ isNewer: false });
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(options.checkIsNewer).toHaveBeenCalledWith(pkg, {}, "latest");
    expect(saved().distTags).toEqual({});
  });

  it.each([
    ["missing fetch method", (value: CheckNewVersionOptions) => { delete value.fetchDistTags; }],
    ["failed dist-tag fetch", (value: CheckNewVersionOptions) => {
      value.fetchDistTags = vi.fn().mockRejectedValue(new Error("offline"));
    }],
    ["invalid registry", (value: CheckNewVersionOptions) => { value.npmConfig = { registry: "invalid" }; }],
  ])("returns false on %s without leaking an exception", async (_name, setup) => {
    setup(options);
    expect(await checkPkgNewVersionEngine(options)).toBe(false);
    expect(options.notifyNewVersion).not.toHaveBeenCalled();
    expect(Fs.writeFile).not.toHaveBeenCalled();
  });

  it("continues after directory creation and metadata parse errors", async () => {
    vi.mocked(Fs.mkdir).mockRejectedValue(new Error("EEXIST"));
    vi.mocked(Fs.readFile).mockResolvedValue("invalid JSON");
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(options.fetchDistTags).toHaveBeenCalledOnce();
    expect(Fs.writeFile).toHaveBeenCalledOnce();
  });

  it("returns false when saving metadata fails", async () => {
    vi.mocked(Fs.writeFile).mockRejectedValue(new Error("EACCES"));
    expect(await checkPkgNewVersionEngine(options)).toBe(false);
  });

  it.each([
    ["already notified", "2.0.0", now - 7 * day, false],
    ["notification expired", "2.0.0", now - 7 * day - 1, true],
    ["different release", "1.5.0", now - day, true],
  ])("applies the notification cooldown (%s)", async (_name, version, time, notify) => {
    cache({ time: now - day, distTags, notifiedVersion: version, notifiedTime: time });
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(options.notifyNewVersion).toHaveBeenCalledTimes(notify ? 1 : 0);
    expect(saved()).toMatchObject({ notifiedVersion: "2.0.0", notifiedTime: notify ? now : time });
  });

  it("uses the default notifier when no callback is supplied", async () => {
    delete options.notifyNewVersion;
    expect(await checkPkgNewVersionEngine(options)).toBe(true);
    expect(internalNotify).toHaveBeenCalledWith({ ...pkg, newVersion: "2.0.0" });
  });
});
