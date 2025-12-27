import { describe, it, expect } from "vitest";
import { greet, add, greetWithOptions } from "../../src/index.ts";

describe("dual-mode-template", () => {
  describe("greet", () => {
    it("should return greeting with name", () => {
      expect(greet("World")).toBe("Hello, World!");
    });
  });

  describe("add", () => {
    it("should add two numbers", () => {
      expect(add(2, 3)).toBe(5);
    });

    it("should handle negative numbers", () => {
      expect(add(-1, 1)).toBe(0);
    });
  });

  describe("greetWithOptions", () => {
    it("should use default greeting", () => {
      expect(greetWithOptions({ name: "Alice" })).toBe("Hello, Alice!");
    });

    it("should use custom greeting", () => {
      expect(greetWithOptions({ name: "Bob", greeting: "Hi" })).toBe("Hi, Bob!");
    });
  });
});
