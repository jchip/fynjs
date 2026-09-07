"use strict";

/* eslint-disable max-statements, complexity */

//
// https://nodejs.org/docs/latest-v10.x/api/stream.html#stream_implementing_a_readable_stream
//

const { Readable } = require("stream");
const completion = require("./completion")(parseInt(process.versions.node.split(".")[0]));
const DrainQueue = require("./drain-queue");
const isReadable = x => Boolean(x && x.pipe && x.on && x._readableState);

class Munchy extends Readable {
  constructor(opts, ...sources) {
    super(opts);
    this._resetSources(sources);
    this._error = null;
    // has anyone started reading from this Readable?
    this._started = false;
    // data from actively draining a stream
    this._draining = new DrainQueue();
    // actively reading? need for Node8
    this._reading = false;
    // manually start read event already triggered
    this._triggered = false;
    this._handleStreamError = (opts && opts.handleStreamError) || (() => {});
  }

  _moreSources() {
    return this._sources.length > 0 && this._sources.length > this._index;
  }

  _triggerRead() {
    if (!this._started || this._triggered) return;

    if (this._draining.hasMore() || this._moreSources()) {
      this._triggered = true;
      process.nextTick(() => {
        this._triggered = false;
        if (this._sources.length > 0) {
          this._read();
        }
      });
    }
  }

  _resetSources(sources = []) {
    const x = this._index;
    this._index = 0;
    this._sources = sources;

    if (x > 0) {
      this.emit("munched");
    }
  }

  destroy() {
    if (this._sources.length > 0) {
      this._resetSources();
    }
    super.destroy();
  }

  _read() {
    if (this.destroyed) {
      this.emit("error", new Error("munchy _read called after destroy"));
      return;
    } else if (this._reading) {
      // Node 8 calls _read from push
      return;
    }

    this._started = true;
    this._reading = true;

    if (this._draining.active()) {
      while (this._draining.hasMore() && this.push(this._draining.get()) !== false);

      if (this._draining.drained === false) {
        this._reading = false;
        return;
      } else {
        const stream = this._draining._stream;
        this._draining.reset();
        this.emit("drained", { stream });
      }
    }

    while (this._index < this._sources.length) {
      const source = this._sources[this._index];
      this._sources[this._index++] = undefined; // unref data
      if (source === null) {
        // force to end of sources
        this._index = this._sources.length;
        // Push EOF-signaling `null` chunk
        // Per doc: Passing chunk as null signals the end of the stream (EOF), after which no more data can be written.
        // https://nodejs.org/docs/latest-v12.x/api/stream.html#stream_readable_push_chunk_encoding
        this.push(null);
        process.nextTick(() => {
          completion.destroy(this);
          // In case we need to manually emit a close event (node.js <= 8 only)
          completion.emitClose(this);
        });
        break;
      } else if (isReadable(source)) {
        this._setupStream(source);
        break;
      } else if (this.push(source) === false) {
        break;
      }
    }

    if (!this._moreSources()) {
      this._resetSources();
    }

    this._reading = false;
  }

  _nextSource() {
    this._draining.drained = true;
    this._triggerRead();
  }

  _setupStream(stream) {
    this._draining.reset(stream);

    let remove; // eslint-disable-line prefer-const

    const onData = data => {
      this._draining.add(data);
      this._triggerRead();
    };

    const onEnd = err => {
      remove();
      this._error = err;
      if (!err) {
        this._nextSource();
      } else {
        const errorOutput = this._handleStreamError(err) || {};
        if (errorOutput.result) {
          onData(errorOutput.result);
        }

        if (errorOutput.remit !== false) {
          this.emit("error", err);
          this.destroy();
        } else {
          this._nextSource();
        }
      }
    };

    const onError = err => {
      onEnd(err || new Error("munchy - source stream emitted error"));
    };

    stream.on("data", onData);
    stream.once("error", onError);
    stream.once("end", onEnd);

    remove = () => {
      stream.removeListener("data", onData);
      stream.removeListener("error", onError);
      stream.removeListener("end", onEnd);
    };

    this.emit("draining", { stream });
  }

  munch(...sources) {
    this._sources.push(...sources);
    this._triggerRead();
    return this;
  }
}

module.exports = Munchy;
