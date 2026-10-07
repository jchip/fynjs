import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPkgNewVersionEngine } from "check-pkg-new-version-engine";
import { checkPkgNewVersion } from "../../src/index.js";
import { internalCheckIsNewer } from "../../src/check-is-newer.js";
import { internalFetchJSON } from "../../src/fetch-json.js";
import { getNpmRcConfig } from "../../src/npm-config.js";
import { verify } from "run-verify";

vi.mock("check-pkg-new-version-engine", () => ({ checkPkgNewVersionEngine: vi.fn() }));
vi.mock("../../src/npm-config.js", () => ({ getNpmRcConfig: vi.fn() }));

afterEach(() => vi.resetAllMocks());

describe("checkPkgNewVersion", () => {
  const pkg = { name: "test-package", version: "1.0.0" };

  it("loads npm configuration and supplies the default fetcher and version comparison", async () => {
    const npmConfig = { registry: "https://registry.example.test/" };
    vi.mocked(getNpmRcConfig).mockResolvedValue(npmConfig);
    vi.mocked(checkPkgNewVersionEngine).mockResolvedValue(true);

    expect(await checkPkgNewVersion({ pkg })).toBe(true);

    expect(getNpmRcConfig).toHaveBeenCalledOnce();
    expect(checkPkgNewVersionEngine).toHaveBeenCalledExactlyOnceWith({
      pkg,
      npmConfig,
      fetchJSON: internalFetchJSON,
      checkIsNewer: internalCheckIsNewer
    });
  });

  it("preserves supplied configuration and callbacks and returns the engine result", async () => {
    const options = {
      pkg,
      npmConfig: {},
      fetchJSON: vi.fn(),
      checkIsNewer: vi.fn(),
      notifyNewVersion: vi.fn(),
      checkTag: "next",
      checkInterval: 1000,
      saveMetaDir: "/custom-cache"
    };
    vi.mocked(checkPkgNewVersionEngine).mockResolvedValue(false);

    expect(await checkPkgNewVersion(options)).toBe(false);

    expect(getNpmRcConfig).not.toHaveBeenCalled();
    expect(checkPkgNewVersionEngine).toHaveBeenCalledExactlyOnceWith(options);
    expect(options.fetchJSON).not.toHaveBeenCalled();
  });

  it("falls back to defaults for option keys set to undefined", () => {
    const npmConfig = { registry: "https://registry.example.test/" };
    const passed = () => vi.mocked(checkPkgNewVersionEngine).mock.calls[0][0];
    return verify({ timeout: 1000 })
      .step(() => {
        vi.mocked(getNpmRcConfig).mockResolvedValue(npmConfig);
        vi.mocked(checkPkgNewVersionEngine).mockResolvedValue(true);
      })
      .step(() =>
        checkPkgNewVersion({ pkg, npmConfig: undefined, fetchJSON: undefined, checkIsNewer: undefined })
      )
      .keep.step(() => expect(getNpmRcConfig).toHaveBeenCalledOnce())
      .keep.step(() => expect(passed().npmConfig).toBe(npmConfig))
      .keep.step(() => expect(passed().fetchJSON).toBe(internalFetchJSON))
      .step(() => expect(passed().checkIsNewer).toBe(internalCheckIsNewer));
  });
});
