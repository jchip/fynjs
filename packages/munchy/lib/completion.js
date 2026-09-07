"use strict";

/* eslint-disable no-magic-numbers */

// Node <= 8 doesn't emit close upon calling destroy but Node 10 does!
// so on node > 8 avoid emitting a close manually.

const _noOp = () => undefined;

module.exports = nodeVersion => {
  const shouldEmitClose = nodeVersion < 10;
  // node.js 14+ calls destroy after no more data to read
  const shouldDestroy = nodeVersion < 14;

  const _realEmit = ee => ee.emit("close");
  const _realDestroy = mm => mm.destroy();

  /* istanbul ignore next */
  const emitClose = shouldEmitClose ? _realEmit : _noOp;
  const destroy = shouldDestroy ? _realDestroy : _noOp;

  return {
    destroy,
    emitClose,
    _realEmit,
    _realDestroy,
    _noOp
  };
};
