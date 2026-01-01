# xflight

**Avoid redundant async calls by sharing inflight promises for the same key.**

## Description

`xflight` is a lightweight Node.js utility that manages inflight promises by key. It ensures that only one asynchronous operation per key is running at a time, returning the same promise for concurrent requests. This is useful for avoiding duplicate network or resource-intensive calls.

## Features
- Prevents duplicate async operations for the same key
- Tracks start and check times for inflight items
- Cleans up after promise resolution or rejection
- 100% test coverage

## Installation

```bash
npm install xflight
```

## Requirements

This package requires **Node.js >= 20**.

## Usage

```js
const Xflight = require("xflight");
const xfl = new Xflight();

function fetchData(url) {
  return xfl.promise(url, () => fetch(url));
}

// Multiple calls with the same URL will share the same promise if still pending
fetchData("https://api.example.com/data").then(console.log);
fetchData("https://api.example.com/data").then(console.log);
```

## Usage in ESM and CommonJS

### ESM (ECMAScript Modules)
```ts
import Inflight from "xflight";

const inflight = new Inflight();
const key = "resource-1";

// Deduplicate async calls
const resultPromise = inflight.promise(key, () => fetch("https://api.example.com/data"));
```

### CommonJS
```js
const Inflight = require("xflight").default;

const inflight = new Inflight();
// ... use as shown in examples above
```

## API

### `new Xflight([PromiseImpl])`
- `PromiseImpl` (optional): Custom Promise implementation (e.g., Bluebird, Aveazul, or native Promise).

**Note:** By default, the constructor will try to use Bluebird or Aveazul as the Promise implementation if they are available. If you want to always use the native Promise and skip these checks, pass the global Promise as the argument:

```ts
const inflight = new Inflight(Promise);
```

### Methods

#### `promise(key, promiseFactory)`
- `key`: Unique identifier for the inflight operation.
- `promiseFactory`: Function that returns a promise.
- **Returns:** The promise from `promiseFactory`, or the existing inflight promise for the key.

#### `add(key, value, [now])`
- Manually add an inflight item. `value` should be a promise.

#### `get(key)`
- Get the current inflight promise for a key, or `undefined`.

#### `remove(key)`
- Remove an inflight item by key.

#### `isEmpty`
- Boolean: true if no inflight items.

#### `count`
- Number of inflight items.

#### Timing Methods
- `getStartTime(key)`: Get start time (ms since epoch) for a key.
- `time(key, [now])` / `elapseTime(key, [now])`: Elapsed time since start.
- `getCheckTime(key)`: Get last check time for a key.
- `lastCheckTime(key, [now])` / `elapseCheckTime(key, [now])`: Elapsed time since last check.
- `resetCheckTime(key, [now])`: Reset last check time to now.

## Testing

To run tests:

```bash
npm test
```

Test coverage is enforced at 100% using `nyc`.


## Examples

### Basic Usage with `promise`
```ts
import Inflight from "xflight";

const inflight = new Inflight();
const key = "resource-1";

// Deduplicate async calls
const resultPromise = inflight.promise(key, () => fetch("https://api.example.com/data"));
// or, for clarity:
const resultPromise2 = inflight.promise(key, function promiseFactory() {
  return fetch("https://api.example.com/data");
});
```

### Manually Add and Get an Inflight Promise
```ts
const promise = new Promise((resolve) => setTimeout(() => resolve("done"), 100));
inflight.add("manual-key", promise);
const inflightPromise = inflight.get("manual-key"); // Promise<string> | undefined
```

### Remove an Inflight Item
```ts
inflight.remove("manual-key");
```

### Check if Inflight is Empty and Get Count
```ts
console.log(inflight.isEmpty); // true or false
console.log(inflight.count);   // number of inflight items
```

### Timing Methods
```ts
inflight.add("timed-key", new Promise(() => {}));
const start = inflight.getStartTime("timed-key");
const elapsed = inflight.time("timed-key");
const elapsedAlias = inflight.elapseTime("timed-key");
```

### Check Time Methods
```ts
const check = inflight.getCheckTime("timed-key");
const sinceLastCheck = inflight.lastCheckTime("timed-key");
const sinceLastCheckAlias = inflight.elapseCheckTime("timed-key");
```

### Reset Check Time
```ts
// Reset for a specific key
inflight.resetCheckTime("timed-key");
// Reset for all inflight items
inflight.resetCheckTime();
```


## License

Apache-2.0

---

© Joel Chen
