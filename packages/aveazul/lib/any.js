"use strict";

const { toArray, isPromise } = require("./util");
const { AggregateError } = require("@jchip/error");

function addStaticAny(AveAzul, force = false) {
  if (force || !AveAzul.any) {
    AveAzul.any = function (args) {
      try {
        args = toArray(args);
      } catch (error) {
        return AveAzul.reject(error);
      }

      if (args.length === 0) {
        return AveAzul.reject(
          new RangeError(
            "Input array must contain at least 1 items but contains only 0 items"
          )
        );
      }

      return new AveAzul((resolve, reject) => {
        const len = args.length;
        let settled = false;
        const errors = [];

        const doFinish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        const addError = (err) => {
          errors.push(err);
          if (!settled && errors.length >= len) {
            settled = true;
            reject(new AggregateError(errors));
          }
        };

        for (let i = 0; i < len; i++) {
          const arg = args[i];
          if (isPromise(arg)) {
            arg.then(doFinish, addError);
          } else {
            doFinish(arg);
          }
        }
      });
    };
  }
}

module.exports.addStaticAny = addStaticAny;
