import updateEnv from "../../lib/util/update-env.js";
import { expect } from "vitest";

describe("update env", function() {
  it("should handle falsy value", () => {
    expect(updateEnv(null, { a: 1 })).toStrictEqual({ a: 1 });
  });

  it("should update and delete entries", () => {
    expect(
      updateEnv(
        { A: 50, B: null, C: undefined, D: 90 },
        {
          A: 1,
          B: 3,
          C: 4
        }
      )
    ).toStrictEqual({ A: 50, D: 90 });
  });

  it("should update process.env by default", () => {
    process.env.H = "O";
    updateEnv({ FOO: "bar", H: undefined });
    expect(process.env.FOO).toBe("bar");
    expect(process.env.H).toBe(undefined);
    delete process.env.FOO;
  });

  it("should avoid replacing if override is false", () => {
    const target = { FOO: "blah", TEST: "xyz" };
    updateEnv({ HELLO: "world", FOO: "bar", TEST: null }, target, false);
    expect(target).toStrictEqual({
      FOO: "blah",
      TEST: "xyz",
      HELLO: "world"
    });
  });
});
