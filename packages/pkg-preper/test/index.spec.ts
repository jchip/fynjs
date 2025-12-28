import { describe, it, expect } from "vitest";
import PkgPreper from "../src/index.ts";
import type { PkgPreperOptions } from "../src/index.ts";

describe("PkgPreper", () => {
  it("should create an instance", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    expect(preper).toBeInstanceOf(PkgPreper);
  });

  it("should have packDirectory method", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    expect(typeof preper.packDirectory).toBe("function");
  });

  it("should have depDirPacker method", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    expect(typeof preper.depDirPacker).toBe("function");
  });

  it("should have getDirPackerCb method", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    expect(typeof preper.getDirPackerCb).toBe("function");
  });

  it("getDirPackerCb should return a function", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    const cb = preper.getDirPackerCb();
    expect(typeof cb).toBe("function");
  });
});
