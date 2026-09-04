/**
 * The global `Promise`, named so the modules that shadow it can still refer to it.
 *
 * `lib/pkg-*.ts` do `import Promise from "aveazul"`, so `Promise<T>` inside them means
 * `AveAzul<T>` (FPO-41). That made every view of a collaborator's plain `async` method
 * describe the wrong type, and `PromiseLike<T>` is not a substitute where the caller goes
 * on to use `.catch` or another native method. This alias is declared here, in a module
 * that does not shadow `Promise`, so those views can say what they actually mean.
 */
export type NativePromise<T> = Promise<T>;
