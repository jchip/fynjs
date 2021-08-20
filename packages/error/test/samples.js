"use strict";

/* eslint-disable @typescript-eslint/no-var-requires */

const { cleanErrorStack, AggregateError, aggregateErrorStack } = require("..");

console.log(aggregateErrorStack(new AggregateError([new Error("error 1")], "test")));

try {
  require("oops");
} catch (err) {
  console.log(cleanErrorStack(err));
}

try {
  require("bad");
} catch (err) {
  console.log(cleanErrorStack(new AggregateError([err], "require failed")));
}
