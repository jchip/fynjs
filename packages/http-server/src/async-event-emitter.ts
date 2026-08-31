/**
 * A handler for a lifecycle event. Call `next` to continue, or `next(err)` to fail
 * the startup. Returning a promise is also supported - it is awaited, and a
 * rejection is treated the same as calling `next(err)`.
 */
export type EventHandler = (context: any, next: (err?: any) => void) => void | Promise<any>;

/**
 * A minimal sequential async event emitter.
 *
 * This replaces the unmaintained `async-eventemitter` used by electrode-server.
 * Handlers for the same event run one after another, and `emit` invokes `done`
 * only after every handler has settled. The first error stops the chain.
 */
export class AsyncEventEmitter {
  private _handlers: Map<string, EventHandler[]> = new Map();

  /** register a handler for `event` */
  on(event: string, handler: EventHandler): this {
    const list = this._handlers.get(event);
    if (list) {
      list.push(handler);
    } else {
      this._handlers.set(event, [handler]);
    }
    return this;
  }

  /** register a handler for `event` that removes itself after running once */
  once(event: string, handler: EventHandler): this {
    const wrapped: EventHandler = (context, next) => {
      this.off(event, wrapped);
      return handler(context, next);
    };
    return this.on(event, wrapped);
  }

  /** remove a previously registered handler */
  off(event: string, handler: EventHandler): this {
    const list = this._handlers.get(event);
    /* istanbul ignore else */
    if (list) {
      const ix = list.indexOf(handler);
      /* istanbul ignore else */
      if (ix >= 0) {
        list.splice(ix, 1);
      }
      if (list.length === 0) {
        this._handlers.delete(event);
      }
    }
    return this;
  }

  /** number of handlers registered for `event` */
  listenerCount(event: string): number {
    const list = this._handlers.get(event);
    return list ? list.length : 0;
  }

  /**
   * Run every handler for `event` in order, then call `done`.
   *
   * A handler signals completion by calling `next`, by returning a promise, or
   * both - whichever settles first wins, so a handler that does neither is what
   * the caller's event timeout is there to catch.
   */
  emit(event: string, context: any, done: (err?: any) => void): void {
    const list = this._handlers.get(event);
    if (!list || list.length === 0) {
      done();
      return;
    }

    // snapshot so a handler removing itself mid-emit doesn't skip the next one
    const handlers = list.slice();

    const runOne = (ix: number): void => {
      if (ix >= handlers.length) {
        done();
        return;
      }

      let settled = false;
      const next = (err?: any) => {
        if (settled) return;
        settled = true;
        if (err) {
          done(err);
        } else {
          runOne(ix + 1);
        }
      };

      let result: void | Promise<any>;
      try {
        result = handlers[ix](context, next);
      } catch (err) {
        next(err);
        return;
      }

      if (result && typeof (result as Promise<any>).then === "function") {
        (result as Promise<any>).then(() => next(), next);
      }
    };

    runOne(0);
  }
}
