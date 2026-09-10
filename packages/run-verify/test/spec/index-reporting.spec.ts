import { describe, it, expect } from "vitest";
import { asyncVerify, expectError, runDefer, runFinally, runTimeout } from "../../src/index.js";

/**
 * Regression tests for step-index reporting.
 *
 * A failure message names the step by number. That number must be the step's
 * 0-based position in the argument list as the caller wrote it, which is the
 * base the rest of the suite already pins in "check function number 0" and
 * "runVerify param 0 is not a function".
 *
 * Two things used to break that. `checkFuncs` is the argument list with the
 * `runFinally` entries filtered out, and the number was an index into that, so
 * a step behind a `runFinally` reported a position the caller could not count
 * to. Separately the timeout message used `index + 1` while `index` had already
 * moved past the stalled step, so the two messages disagreed by two.
 */

const failureMessage = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("expected the run to fail, but it resolved");
};

describe("step index reporting", () => {
  it("names the argument position of the failing step, not the filtered position", async () => {
    // the expectError step is written at argument position 2
    const message = await failureMessage(() =>
      asyncVerify(
        runFinally(() => {}),
        runFinally(() => {}),
        expectError(() => "does not throw")
      )
    );
    // reported "number 0" before the fix, because both runFinally entries were
    // filtered out of checkFuncs before the index was taken
    expect(message).toContain("check function number 2");
  });

  it("distinguishes two steps that sit at different argument positions", async () => {
    const atPosition0 = await failureMessage(() =>
      asyncVerify(expectError(() => "does not throw"))
    );
    const atPosition2 = await failureMessage(() =>
      asyncVerify(
        runFinally(() => {}),
        runFinally(() => {}),
        expectError(() => "does not throw")
      )
    );
    // identical before the fix, so the number could not locate the step
    expect(atPosition2).not.toEqual(atPosition0);
  });

  it("reports a timeout against the stalled step on the same base", async () => {
    // runTimeout is argument 0, the stalling step is argument 2
    const message = await failureMessage(() =>
      asyncVerify(
        runTimeout(40),
        () => "first",
        (_value: unknown, _next: unknown) => {
          /* never calls next, so the run stalls here */
        }
      )
    );
    // reported "number 4" before the fix: the message used `index + 1` while
    // `index` had already moved past the stalled step
    expect(message).toContain("check function number 2");
  });

  it("names the argument position of a stalled step behind a runFinally", async () => {
    const message = await failureMessage(() =>
      asyncVerify(
        runTimeout(40),
        runFinally(() => {}),
        () => "first",
        (_value: unknown, _next: unknown) => {
          /* stalls here: argument 3 */
        }
      )
    );
    expect(message).toContain("check function number 3");
  });

  it("names the argument position of a non-function behind a runFinally", async () => {
    const message = await failureMessage(() =>
      asyncVerify(
        runFinally(() => {}),
        () => "first",
        "not-a-function" as unknown as () => void
      )
    );
    expect(message).toContain("runVerify param 2 is not a function: type string");
  });

  it("keeps the reported number inside the caller's argument range", async () => {
    // Known limitation: when the sequence has run out and the wait is on an
    // outstanding defer, the number names the last step reached rather than the
    // defer itself. It must at least stay within range, which it did not before:
    // the old `index + 1` pointed past the last argument, at the done callback.
    const pending = runDefer();
    const message = await failureMessage(() =>
      asyncVerify(runTimeout(40), pending, () => "first")
    );
    const reported = Number(/number (\d+)/.exec(message)?.[1]);
    // asyncVerify appends done, so the caller's own arguments are 0..2
    expect(reported).toBeLessThanOrEqual(2);
    expect(reported).toBeGreaterThanOrEqual(0);
  });

  it("uses one base for both messages", async () => {
    const fromExpectError = await failureMessage(() =>
      asyncVerify(
        () => "first",
        expectError(() => "does not throw")
      )
    );
    const fromTimeout = await failureMessage(() =>
      asyncVerify(
        runTimeout(40),
        () => "first",
        (_value: unknown, _next: unknown) => {
          /* stalls */
        }
      )
    );
    const numberIn = (msg: string) => Number(/number (\d+)/.exec(msg)?.[1]);
    // both failing steps are the last argument in their own call, so if the
    // base agreed these would differ by exactly the extra runTimeout argument
    expect(numberIn(fromTimeout) - numberIn(fromExpectError)).toBe(1);
  });
});
