/* eslint-disable @typescript-eslint/no-explicit-any */
import { toArray, isPromise } from "./util.ts";
import { AggregateError } from "@jchip/error";
import type { AveAzulClass } from "./aveazul.ts";

export function addStaticAny(AveAzul: AveAzulClass, force = false): void {
  if (force || !AveAzul.any) {
    AveAzul.any = function <T>(args: Iterable<T | PromiseLike<T>>): any {
      let argsArray: (T | PromiseLike<T>)[];
      try {
        argsArray = toArray(args);
      } catch (error) {
        return AveAzul.reject(error as Error);
      }

      if (argsArray.length === 0) {
        return AveAzul.reject(
          new RangeError(
            "Input array must contain at least 1 items but contains only 0 items"
          )
        );
      }

      return new AveAzul((resolve, reject) => {
        const len = argsArray.length;
        let settled = false;
        const errors: Error[] = [];

        const doFinish = (value: T): void => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        const addError = (err: Error): void => {
          errors.push(err);
          if (!settled && errors.length >= len) {
            settled = true;
            reject(new AggregateError(errors));
          }
        };

        for (let i = 0; i < len; i++) {
          const arg = argsArray[i];
          if (isPromise(arg)) {
            (arg as Promise<T>).then(doFinish, addError);
          } else {
            doFinish(arg as T);
          }
        }
      });
    };
  }
}
