export type ErrorCode = string | number;
export type ErrorClass = abstract new (...args: any[]) => object;
export type ErrorClasses = ErrorClass | readonly [ErrorClass, ...ErrorClass[]];
export type ErrorMatcher = string | RegExp;
export type ErrorClassOf<C extends ErrorClasses> = C extends readonly ErrorClass[]
  ? C[number]
  : Extract<C, ErrorClass>;

/** Constructors within one requirement are alternatives; separate requirements all apply. */
export interface ErrorMatchRequirement {
  classes?: readonly ErrorClass[];
  matcher?: ErrorMatcher;
  code?: ErrorCode;
}

export function instanceRequirement(
  types: ErrorClasses,
  matcher?: ErrorMatcher,
  code?: ErrorCode
): ErrorMatchRequirement {
  const classes = typeof types === "function" ? [types] : [...types];
  if (classes.length === 0) {
    throw new TypeError("expectErrorInstanceMatch requires at least one constructor");
  }
  return { classes, matcher, code };
}

/** Return a mismatch description; the runner owns failure and cleanup. */
export function errorMatchFailure(
  error: unknown,
  requirement: ErrorMatchRequirement
): string | undefined {
  const { classes, matcher, code } = requirement;
  if (classes && !classes.some(type => error instanceof type)) {
    return `runVerify expecting error to be instance of '${classes.map(type => type.name).join(" or ")}'`;
  }
  if (matcher !== undefined) {
    const message = (error as Error | null | undefined)?.message;
    const matches =
      typeof message === "string" &&
      (typeof matcher === "string"
        ? message.includes(matcher)
        : new RegExp(matcher.source, matcher.flags).test(message));
    if (!matches) return `runVerify expecting error with message matching '${matcher}'`;
  }
  if (code !== undefined) {
    const actual = (error as { code?: unknown } | null | undefined)?.code;
    if (actual !== code)
      return `runVerify expecting error with code to be '${code}' but got '${String(actual)}'`;
  }
  return undefined;
}
