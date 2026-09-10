/**
 * An explicit, fully typed step chain built on top of the positional runner.
 *
 * `verify(config).step(fn).step(fn)` is the same pipeline as
 * `asyncVerify(fn, fn)`, with each step explicitly added instead of implied by
 * its position. There is one step primitive. Everything that changes how a step
 * behaves is a modifier on that step, and everything that is not part of the
 * sequence lives in the config.
 *
 * ```ts
 * const count = await verify({ timeout: 500 })
 *   .step(() => 2)
 *   .step(value => value * 3)     // gets 2, finishes with 6
 *   .keep.step(value => assert.equal(value, 6))  // asserts, forwards 6
 *   .step(value => `count=${value}`);            // resolves "count=6"
 * ```
 *
 * The chain is immutable, so a prefix is a reusable value and a modifier getter
 * returns a new chain rather than flagging the current one. It is thenable, so
 * `await` starts the run and there is no terminal call to forget.
 *
 * Each step is wrapped at a fixed arity with a neutral parameter name before it
 * reaches the runner, so the runner never inspects a caller's function source.
 * That makes the chain immune to the parameter-name inference described in
 * `./index.ts`.
 */

import {
  _asyncVerifyFrom,
  expectError as wrapExpectError,
  expectErrorHas as wrapExpectErrorHas,
  expectErrorToBe as wrapExpectErrorToBe,
  runDefer,
  runFinally,
  runTimeout,
  type DeferObject
} from "./index.js";

/** Unwraps a Promise or any other thenable, leaving other types alone. */
type Await<T> = Awaited<T>;

/**
 * What an {@link Chain.asyncStep} resolves to. An array resolves element-wise,
 * keeping its tuple positions, the way `Promise.all` does. Anything else is
 * awaited, which leaves a non-thenable as it is.
 */
type ValueOut<V> = V extends readonly any[]
  ? { -readonly [K in keyof V]: Await<V[K]> }
  : Await<V>;

/** The `next` callback given to a `callbackStep`. */
export type StepCallback<T> = (err?: Error | null, value?: T) => void;

/** Which modifiers are active for the next step. Internal to the types. */
interface Mods {
  err?: true;
  keep?: true;
  /** Required error message, with `errMode` deciding how it is compared. */
  errMsg?: string;
  errMode?: "has" | "toBe";
}

/**
 * A signal for work that completes outside the sequence, such as an event.
 *
 * Declare it in `config.signals` to register it, which makes it an obligation:
 * the run cannot finish until it settles. Wait for it with `.awaiting(name)`.
 */
export interface Signal<T = unknown> {
  /** Settle the signal with a value. */
  resolve(value: T): void;
  /** Settle the signal with a failure, which fails the run. */
  reject(err: Error): void;
  /** True until the signal settles. */
  pending(): boolean;
  /** The underlying defer, for interop with the positional API. */
  readonly defer: DeferObject;
}

/**
 * Create a {@link Signal}.
 *
 * @param timeout - optional deadline in ms for this signal alone
 */
export function signal<T = unknown>(timeout?: number): Signal<T> {
  const defer = runDefer(timeout);
  return {
    defer,
    resolve: value => defer.resolve(value),
    reject: err => defer.reject(err),
    pending: () => defer.pending()
  };
}

/**
 * Whether a value is a {@link Signal} rather than a name in `config.signals`.
 *
 * Structural, because the two forms `awaiting` accepts are a string key and a
 * signal object, and nothing else needs to be told apart.
 */
const isSignal = (v: unknown): v is Signal<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Signal<unknown>).resolve === "function" &&
  typeof (v as Signal<unknown>).pending === "function";

export type SignalMap = Record<string, Signal<any>>;

type SignalValue<S> = S extends Signal<infer T> ? T : never;

/** Configuration for concerns that are not part of the step sequence. */
export interface ChainConfig<S extends SignalMap = SignalMap> {
  /** Deadline in ms for the whole run. There is no default. */
  timeout?: number;
  /** Cleanup that always runs once the run ends, whether it passed or failed. */
  cleanup?: (() => unknown) | (() => unknown)[];
  /** Signals that must settle before the run can finish. */
  signals?: S;
}

/**
 * Overloaded `callbackStep` signatures are what let one method accept a
 * function of either arity with both fully typed.
 *
 * The parameter types have to stay concrete for that to work. A conditional
 * type in parameter position, or a union of signatures with differing arity,
 * stops TypeScript contextually typing the lambda and its parameters silently
 * become `any`. Only the return type may be conditional.
 */

/**
 * Blocks a function from resolving to the value overload, so functions keep
 * being called and a mismatched lambda stays a compile error instead of being
 * silently accepted as a value.
 *
 * A rest parameter rather than a conditional on `value`, because a conditional
 * type in that position would stop `V` being inferable at all.
 */
type NotAFunction<V> = V extends (...args: any[]) => any ? [never] : [];

/** What the chain's value becomes after an ordinary step. */
type StepOut<In, N, M extends Mods> = M["err"] extends true
  ? unknown
  : M["keep"] extends true
    ? In
    : Await<N>;

/**
 * What it becomes after a callback step. The callback's value is passed on as
 * it is, so unlike a returned value it is not awaited.
 */
type CallbackOut<In, N, M extends Mods> = M["err"] extends true
  ? unknown
  : M["keep"] extends true
    ? In
    : N;

/**
 * An ordered sequence of steps. Immutable and thenable.
 *
 * @typeParam Out - the value the next step will receive
 */
export interface Chain<Out, M extends Mods = {}, S extends SignalMap = SignalMap>
  extends PromiseLike<Out> {
  /**
   * Add a step. It receives the previous step's value, and the value it
   * finishes with goes on to the next step.
   *
   * A step that returns nothing finishes with `undefined`. Use `.keep.step` to
   * assert on the value and pass it through instead.
   *
   * A returned Promise is awaited. A returned array is passed on exactly as it
   * is, even when it holds promises; {@link asyncStep} is what resolves those.
   *
   * An ordinary step's output is inferred from what it returns. A
   * `callbackStep`'s output cannot be inferred, because it only appears in the
   * callback's parameter position, so it defaults to `unknown`. Pass it
   * explicitly, as `.callbackStep<string>(...)`, only where a later step needs
   * the value's type.
   */
  step<N = unknown>(fn: (input: Out) => N): Chain<StepOut<Out, N, M>, {}, S>;

  /**
   * Add a step that is a value rather than a function.
   *
   * A Promise, or any thenable, is adopted: the run waits for it and its
   * settled value goes on to the next step. Any other value, an array
   * included, is passed straight on. So `.expectError.step(save(bad))` reads
   * as well as wrapping it in an arrow, and `.step(41)` seeds a chain.
   *
   * An array is deliberately not resolved here; see {@link asyncStep}.
   *
   * Everything except a function is detected from the value itself. A bare
   * function is the one ambiguous case, since nothing distinguishes a step that
   * returns a value from one that wants a callback, which is why
   * {@link callbackStep} is a separate method rather than a detected shape.
   *
   * A value passed this way is already running, unlike a function, which the
   * runner does not call until the sequence reaches it.
   *
   * Declared after the function form so a lambda is still contextually typed
   * against that signature.
   */
  step<V>(value: V, ...notAFunction: NotAFunction<V>): Chain<StepOut<Out, Await<V>, M>, {}, S>;

  /**
   * Add a step that waits for async work, whether it is already running or the
   * function starts it.
   *
   * A **function** is called with the previous value when the sequence reaches
   * it, and what it returns is handled exactly as a value passed here would be.
   * A Promise, or any thenable, is awaited. An **array** resolves element-wise,
   * like `Promise.all`, keeping its tuple positions.
   *
   * This is separate from `.step()` because an array's intention cannot be
   * known: `[p1, p2]` may be work to wait for, or may be a value the next step
   * wants to hold on to and race or inspect itself. That is just as true of an
   * array a function returns, so `.step()` passes an array on untouched in
   * either form, and `.asyncStep()` is how you ask for it to be resolved.
   *
   * The function form is also what defers the work. `.asyncStep([f(), g()])`
   * starts both before the chain runs, while `.asyncStep(() => [f(), g()])`
   * starts them when the step is reached.
   */
  asyncStep<N = unknown>(fn: (input: Out) => N): Chain<StepOut<Out, ValueOut<N>, M>, {}, S>;

  /**
   * Add an async step that is a value rather than a function.
   *
   * Declared after the function form so a lambda is still contextually typed
   * against that signature.
   */
  asyncStep<V>(value: V, ...notAFunction: NotAFunction<V>): Chain<StepOut<Out, ValueOut<V>, M>, {}, S>;

  /**
   * Add a step that finishes by calling an error-first callback rather than by
   * returning.
   *
   * How many parameters the function declares decides what it receives. One is
   * the callback alone, which is the usual shape for adapting a callback API.
   * Two are the previous value and the callback. This mirrors the positional
   * API, where a single callback-named parameter also receives only the
   * callback.
   *
   * The function's return value is ignored, so a Promise it happens to return
   * is not a second completion path.
   *
   * Two overloads rather than one flexible signature: a union of signatures
   * with differing arity, or a conditional type in parameter position, stops
   * TypeScript contextually typing the lambda and its parameters silently
   * become `any`.
   */
  // The one-parameter form is declared first because it is 107 of the 108 real
  // uses in this repo, and TypeScript contextually types a lambda against the
  // first overload only. A two-parameter function still works, but must
  // annotate its parameters to be checked under --strict.
  callbackStep<N = unknown>(
    fn: (next: StepCallback<N>) => void
  ): Chain<CallbackOut<Out, N, M>, {}, S>;
  callbackStep<N = unknown>(
    fn: (input: Out, next: StepCallback<N>) => void
  ): Chain<CallbackOut<Out, N, M>, {}, S>;

  /**
   * The next step must fail. A throw, a rejection and `next(err)` all satisfy
   * it, and the error becomes the value for the following step. Successful
   * completion fails the run. The value is typed `unknown`, because a rejection
   * value can be anything.
   */
  readonly expectError: Chain<Out, M & { err: true }, S>;

  /**
   * Like {@link expectError}, and also require the error message to equal
   * `message`. A shorthand for expecting the failure and checking its message
   * in one step, matching `expectErrorToBe` in the positional API.
   */
  expectErrorToBe(message: string): Chain<Out, M & { err: true }, S>;

  /**
   * Like {@link expectError}, and also require the error message to contain
   * `message`.
   */
  expectErrorHas(message: string): Chain<Out, M & { err: true }, S>;

  /**
   * The next step passes its input through, whatever it returns. Use it for
   * assertions that should not consume the value.
   */
  readonly keep: Chain<Out, M & { keep: true }, S>;

  /**
   * Wait here until the named signal settles. Its value goes to the next step,
   * replacing the current one.
   *
   * @param name - a key of `config.signals`
   * @param ms - optional deadline for this wait
   */
  awaiting<K extends keyof S>(name: K, ms?: number): Chain<SignalValue<S[K]>, {}, S>;

  /**
   * Wait for a signal passed by value rather than by name.
   *
   * The signal still has to be declared in `config.signals`, since that is what
   * makes it an obligation; this form only avoids restating its name as a
   * string. Prefer it wherever the name is not type-checked, such as a plain
   * `.js` spec, because a typo there is otherwise caught only at runtime.
   *
   * @param sig - a signal declared in `config.signals`
   * @param ms - optional deadline for this wait
   */
  awaiting<T>(sig: Signal<T>, ms?: number): Chain<T, {}, S>;

  then<R1 = Out, R2 = never>(
    onfulfilled?: ((value: Out) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2>;

  /** Attach a rejection handler, like a Promise. */
  catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<Out | R>;
}


/** A short description of a value, for a misuse message. */
const describeValue = (x: unknown): string => {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (isThenable(x)) return "a promise";
  return `a ${typeof x}`;
};

const isThenable = (x: unknown): x is Promise<unknown> =>
  !!x && typeof (x as Promise<unknown>).then === "function";

/**
 * `asyncStep`'s one rule, applied to a value it is given and to whatever a
 * function it is given returns: an array resolves element-wise, and anything
 * else is left for the runner to await.
 */
const resolveArray = (x: unknown): unknown => (Array.isArray(x) ? Promise.all(x) : x);

const toArray = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

function build(fn: (...args: any[]) => any, mods: Mods, isCallback: boolean): unknown {
  let step: (...args: any[]) => any;

  // Every wrapper declares a fixed arity with a neutral parameter name, so the
  // runner's own parameter inspection always sees what the modifier intended,
  // whatever the caller wrote. A callback wrapper always declares two, so the
  // runner always reads it as a callback step.
  // How many parameters the caller declared decides what a callback step gets:
  // one is the callback alone, two are the previous value and the callback.
  // Function.length is a language-level property, so unlike parsing the source
  // it is not affected by the body or by renamed parameters.
  const wantsInput = isCallback && fn.length >= 2;

  if (isCallback && mods.keep) {
    // forward the input, but still complete through the callback
    step = (input: any, next: StepCallback<any>) => {
      const cb = (err?: Error | null) => next(err, input);
      return wantsInput ? fn(input, cb) : fn(cb);
    };
  } else if (isCallback) {
    step = (input: any, next: StepCallback<any>) => (wantsInput ? fn(input, next) : fn(next));
  } else if (mods.keep) {
    step = (input: any) => {
      const r = fn(input);
      return isThenable(r) ? r.then(() => input) : input;
    };
  } else {
    step = (input: any) => fn(input);
  }

  if (!mods.err) return step;
  if (mods.errMode === "toBe") return wrapExpectErrorToBe(step, mods.errMsg!);
  if (mods.errMode === "has") return wrapExpectErrorHas(step, mods.errMsg!);
  return wrapExpectError(step);
}

/**
 * Signal maps a run has already consumed.
 *
 * The config is shared by reference with every chain derived from a prefix, and
 * the defer behind a signal is single use. So a prefix that declares signals
 * cannot be branched or run twice, and this is what detects the attempt.
 */
const consumedSignals = new WeakSet<object>();

/** Everything a chain carries. Immutable: each link builds a new one. */
interface ChainState<S extends SignalMap> {
  steps: readonly unknown[];
  config: ChainConfig<S>;
  mods: Mods;
  /** Stack frames captured where `verify()` was called. */
  callSite: string | undefined;
  /** Signal names already awaited, so a repeat can be reported. */
  awaited: readonly string[];
}

function makeChain<Out, M extends Mods, S extends SignalMap>(
  state: ChainState<S>
): Chain<Out, M, S> {
  const { steps, config, mods } = state;
  let promise: Promise<Out> | undefined;

  const derive = <O, N extends Mods>(patch: Partial<ChainState<S>>): Chain<O, N, S> =>
    makeChain<O, N, S>({ ...state, ...patch });

  const run = (): Promise<Out> => {
    if (promise) return promise;

    const signals = config.signals ?? ({} as S);
    const names = Object.keys(signals);
    if (names.length > 0) {
      if (consumedSignals.has(signals)) {
        promise = Promise.reject(
          new Error(
            `verify: these signals were already used by another run. A signal stands for one ` +
              `occurrence, so a chain that declares signals cannot be branched or run twice. ` +
              `Create the signals and the chain inside each test.`
          )
        ) as Promise<Out>;
        return promise;
      }
      consumedSignals.add(signals);
    }

    const args: unknown[] = [];
    if (config.timeout !== undefined) args.push(runTimeout(config.timeout));
    for (const fn of toArray(config.cleanup)) args.push(runFinally(fn));
    // registered before any step, so a signal is an obligation from the start
    for (const name of names) args.push(signals[name].defer);
    args.push(...steps);

    if (args.length === 0) {
      promise = Promise.resolve(undefined) as Promise<Out>;
      return promise;
    }

    // a fresh error per run: the runner mutates it to report its own failures
    const at = new Error();
    if (state.callSite !== undefined) {
      at.stack = state.callSite;
    } else if (Error.captureStackTrace) {
      Error.captureStackTrace(at, run);
    }

    promise = _asyncVerifyFrom(at, args as any[]) as Promise<Out>;
    return promise;
  };

  const chain: Chain<Out, M, S> = {
    step(fn: any) {
      if (typeof fn !== "function") {
        // Adopt the value as it is. A thenable is awaited by the runner; an
        // array is passed on untouched, since whether its elements should be
        // resolved is not knowable here. Use .asyncStep() to resolve them.
        const value = fn;
        return derive<any, {}>({
          steps: [...steps, build(() => value, mods, false)],
          mods: {}
        }) as any;
      }
      return derive<any, {}>({ steps: [...steps, build(fn, mods, false)], mods: {} }) as any;
    },
    asyncStep(value: any, ..._guard: any[]) {
      const produce =
        typeof value === "function"
          ? (input: any) => resolveArray(value(input))
          : () => resolveArray(value);
      void _guard;
      return derive<any, {}>({ steps: [...steps, build(produce, mods, false)], mods: {} }) as any;
    },
    callbackStep(fn: any) {
      if (typeof fn !== "function") {
        throw new Error(
          `verify: .callbackStep() needs a function to receive the callback, but it was ` +
            `given ${describeValue(fn)}. Use .step() to adopt a value.`
        );
      }
      return derive<any, {}>({ steps: [...steps, build(fn, mods, true)], mods: {} }) as any;
    },
    get expectError() {
      return derive<Out, M & { err: true }>({ mods: { ...mods, err: true } });
    },
    expectErrorToBe(message: string) {
      return derive<Out, M & { err: true }>({
        mods: { ...mods, err: true, errMode: "toBe", errMsg: message }
      });
    },
    expectErrorHas(message: string) {
      return derive<Out, M & { err: true }>({
        mods: { ...mods, err: true, errMode: "has", errMsg: message }
      });
    },
    get keep() {
      return derive<Out, M & { keep: true }>({ mods: { ...mods, keep: true } });
    },
    awaiting(name: any, ms?: number) {
      const signals = config.signals ?? ({} as S);
      // A signal is resolved back to the name it was declared under, so both
      // forms share one code path and one set of guards below.
      let key: string;
      if (isSignal(name)) {
        const declared = Object.keys(signals).find(k => signals[k] === name);
        if (declared === undefined) {
          throw new Error(
            `verify: awaiting() was given a signal that is not in config.signals. Declaring ` +
              `it there is what makes it an obligation, so it has to be declared to be awaited.`
          );
        }
        key = declared;
      } else {
        key = String(name);
        if (!signals[key]) {
          throw new Error(`verify: awaiting("${key}") but no such signal in config.signals`);
        }
      }
      const sig = signals[key];
      if (state.awaited.includes(key)) {
        throw new Error(
          `verify: awaiting("${key}") more than once in one chain. A signal settles once, ` +
            `so it can only be awaited once. Declare a second signal if the test needs to ` +
            `wait twice.`
        );
      }
      return derive<any, {}>({
        steps: [...steps, sig.defer.wait(ms)],
        mods: {},
        awaited: [...state.awaited, key]
      }) as any;
    },
    then(onfulfilled?: any, onrejected?: any) {
      return run().then(onfulfilled, onrejected);
    },
    catch(onrejected?: any) {
      return run().catch(onrejected);
    }
  };

  return chain;
}

function startChain<S extends SignalMap = {}>(
  config: ChainConfig<S> = {}
): Chain<undefined, {}, S> {
  // captured here so the runner's own messages, such as a timeout, name the
  // line that started the chain instead of this module
  const callSite = new Error();
  if (Error.captureStackTrace) {
    Error.captureStackTrace(callSite, startChain);
  }

  return makeChain<undefined, {}, S>({
    steps: [],
    config,
    mods: {},
    callSite: callSite.stack,
    awaited: []
  });
}

/**
 * The type of {@link verify}: callable to start a chain, and carrying the
 * chain's only standalone helper as a property.
 *
 * Declared rather than inferred because a generic call signature and a property
 * cannot both come from a `function` declaration. The generic parameters here
 * have to stay identical to `startChain`'s, since restating them is what would
 * silently degrade inference through the chain.
 */
export interface VerifyFn {
  <S extends SignalMap = {}>(config?: ChainConfig<S>): Chain<undefined, {}, S>;

  /**
   * {@link signal}, reachable from the chain's entry point.
   *
   * The bare `signal` export stays, and both are the same function. This exists
   * because `signal` is a common local name — Node's own `(code, signal)` exit
   * handler shadows it — so a caller that collides has somewhere to go without
   * renaming the import.
   */
  signal: typeof signal;
}

/**
 * Start a step chain.
 *
 * @param config - deadline, cleanup and signals. All optional.
 */
export const verify: VerifyFn = Object.assign(startChain, { signal });
