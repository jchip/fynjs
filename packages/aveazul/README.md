# AveAzul.js

AveAzul ("Blue Bird" in Spanish) serves as a near drop-in replacement for Bluebird. It's built on native Promise, by extending it with the familiar utility methods from Bluebird.

## Purpose

The primary goal is to help migrate legacy code, that uses Bluebird APIs extensively, to native Promises. While not a 100% drop-in replacement (some aspects of Bluebird simply can't be replicated), it offers a practical migration path with minimal changes for most cases.

Further, if you like Bluebird's API but want to use native Promises, AveAzul gives you both - familiar Bluebird methods built on native Promise.

## Features

- Built on native Promises
- Implements most commonly used Bluebird methods
- Comprehensive test suite ensuring compatibility

## Requirements

- node.js version >= 12

## Installation

```bash
npm install aveazul
```

## Usage

```javascript
const AveAzul = require("aveazul");

// Basic Promise usage
const promise = new AveAzul((resolve) => resolve(42));
promise.then((value) => console.log(value)); // 42

// Utility methods
AveAzul.resolve([1, 2, 3])
  .map((x) => x * 2)
  .filter((x) => x > 2)
  .then((result) => console.log(result)); // [4, 6]

// Wait for at least 2 promises to be fulfilled
const fetchUrls = [
  fetch("https://api.example.com/data1"),
  fetch("https://api.example.com/data2"),
  fetch("https://api.example.com/data3"),
  fetch("https://api.example.com/data4"),
];
AveAzul.some(fetchUrls, 2).then((results) =>
  console.log(`Got the first 2 successful results`)
);

// Process items sequentially with mapSeries
AveAzul.resolve([1, 2, 3])
  .mapSeries(async (x) => {
    // Each item is processed only after the previous one completes
    await new Promise((resolve) => setTimeout(resolve, 100));
    return x * 2;
  })
  .then((result) => console.log(result)); // [2, 4, 6]

// Promisify callback-style functions
const fs = require("fs");
const readFile = AveAzul.promisify(fs.readFile);
readFile("file.txt").then((content) => console.log(content));
// Properties from the original function are preserved
console.log(readFile.length); // Original function's length property

// Promisify all methods of an object
const obj = {
  method(cb) {
    cb(null, "result");
  },
};
AveAzul.promisifyAll(obj);
obj.methodAsync().then((result) => console.log(result)); // 'result'

// Resource management with disposer and using
const getResource = () => {
  return AveAzul.resolve({
    data: "important data",
    close: () => console.log("Resource closed!"),
  }).disposer((resource) => resource.close());
};

AveAzul.using(getResource(), (resource) => {
  console.log(resource.data); // "important data"
  return AveAzul.resolve("operation completed");
}).then((result) => {
  console.log(result); // "operation completed"
  // Resource is automatically closed here, even if an error occurred
});

// Using spread to apply array results as arguments
AveAzul.all([getUser(1), getPosts(1), getComments(1)]).spread(
  (user, posts, comments) => {
    // Instead of using .then(([user, posts, comments]) => {...})
    console.log(
      `User ${user.name} has ${posts.length} posts and ${comments.length} comments`
    );
    return { user, activity: { posts, comments } };
  }
);
```

## Migration from Bluebird

For most applications, migrating from Bluebird to AveAzul should be as simple as:

```javascript
// From
const Promise = require("bluebird");

// To
const Promise = require("aveazul");
```

Key differences to be aware of:

- Some advanced debugging features are not available
- Performance characteristics may differ
- A few very specialized methods not available

## API

### Instance Methods

- `tap(fn)` - Execute side effects and return original value
- `filter(fn)` - Filter array elements
- `map(fn)` - Transform array elements
- `mapSeries(fn)` - Transform array elements sequentially
- `return(value)` - Inject a new value
- `each(fn)` - Iterate over array elements
- `delay(ms)` - Delay resolution
- `timeout(ms, message?)` - Reject after specified time
- `props(obj)` - Resolve object properties
- `spread(fn)` - Apply array values as arguments to function
- `tapCatch(fn)` - Execute side effects on rejection
- `reduce(fn, initialValue?)` - Reduce array elements
- `some(count)` - Resolves when a specified number of promises in the array have resolved
- `throw(reason)` - Return rejected promise
- `catchThrow(reason)` - Catch and throw new error
- `catchReturn(value)` - Catch and return value
- `get(propertyPath)` - Retrieve property value
- `disposer(fn)` - Create a disposer for use with AveAzul.using() for resource cleanup
- `any()` - Resolves when any promise in the iterable resolves, rejecting if all reject
- `all()` - Like Promise.all(), resolves when all promises resolve, rejects if any reject
- `call(propertyName, ...args)` - Call a method on the resolved value with the provided arguments
- `asCallback(callback, options?)` - Register a Node-style callback that handles the resolution or rejection

### Static Methods

- `delay(ms, value?)` - Resolve after specified time
- `map(value, fn)` - Transform array elements
- `mapSeries(value, fn)` - Transform array elements one at a time in sequence
- `try(fn)` - Wrap sync/async functions
- `props(obj)` - Resolve object properties
- `defer()` - Create a deferred promise
- `promisify(fn, options?)` - Convert callback-style functions to promises (preserves original function properties)
- `fromNode(fn, options?)` - Convert Node-style callback functions to promise-returning functions
- `fromCallback(fn, options?)` - Alias for fromNode
- `each(items, fn)` - Iterate over array elements
- `reduce(array, fn, initialValue?)` - Reduce array elements
- `some(promises, count)` - Wait for a specified number of promises to be fulfilled
- `method(fn)` - Creates a method that returns a promise resolving to the value returned by the original function
- `throw(reason)` - Return rejected promise
- `promisifyAll(target, options?)` - Convert all methods of an object/class to promises
- `using(resources, fn)` - Manage resources with automatic cleanup
- `join(...values, handler?)` - Wait for multiple promises and pass their resolved values as separate arguments to the handler function. If no handler is provided, behaves like Promise.all

### PromisifyAll Options

- `suffix` (default: 'Async') - Suffix to append to promisified method names
- `filter` - Filter function to determine which methods to promisify
- `promisifier` - Custom function to handle promisification
- `multiArgs` (default: false) - Whether to support multiple callback arguments

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Test against Bluebird for compatibility
npm run jest:bluebird -- test/[name].test.js
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Apache-2.0

## Author

Joel Chen, with assistant from Cursor Claude-3.7-sonnet
