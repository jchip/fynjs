# AveAzul

AveAzul ("Blue Bird" in Spanish) is a Promise library that extends native Promises with Bluebird-like utility methods. Built on top of native Promises, it provides a familiar API for Node.js developers who are used to working with [Bluebird](https://github.com/petkaantonov/bluebird) ([npm](https://www.npmjs.com/package/bluebird)).

## Installation

```bash
npm install aveazul
```

## Usage

```javascript
const AveAzul = require('aveazul');

// Basic Promise usage
const promise = new AveAzul((resolve) => resolve(42));
promise.then(value => console.log(value)); // 42

// Utility methods
AveAzul.resolve([1, 2, 3])
  .map(x => x * 2)
  .filter(x => x > 2)
  .then(result => console.log(result)); // [4, 6]

// Promisify callback-style functions
const fs = require('fs');
const readFile = AveAzul.promisify(fs.readFile);
readFile('file.txt').then(content => console.log(content));

// Promisify all methods of an object
const obj = {
  method(cb) { cb(null, 'result'); }
};
AveAzul.promisifyAll(obj);
obj.methodAsync().then(result => console.log(result)); // 'result'
```

## API

### Instance Methods

- `tap(fn)` - Execute side effects and return original value
- `filter(fn)` - Filter array elements
- `map(fn)` - Transform array elements
- `return(value)` - Inject a new value
- `each(fn)` - Iterate over array elements
- `delay(ms)` - Delay resolution
- `timeout(ms, message?)` - Reject after specified time
- `try(fn)` - Wrap sync/async functions
- `props(obj)` - Resolve object properties
- `catchIf(predicate, fn)` - Catch specific errors
- `tapCatch(fn)` - Execute side effects on rejection
- `reduce(fn, initialValue?)` - Reduce array elements
- `throw(reason)` - Return rejected promise
- `catchThrow(reason)` - Catch and throw new error
- `catchReturn(value)` - Catch and return value
- `get(propertyPath)` - Retrieve property value

### Static Methods

- `delay(ms, value?)` - Resolve after specified time
- `map(value, fn)` - Transform array elements
- `try(fn)` - Wrap sync/async functions
- `props(obj)` - Resolve object properties
- `defer()` - Create a deferred promise
- `promisify(fn, options?)` - Convert callback-style functions to promises
- `each(items, fn)` - Iterate over array elements
- `reduce(array, fn, initialValue?)` - Reduce array elements
- `throw(reason)` - Return rejected promise
- `promisifyAll(target, options?)` - Convert all methods of an object/class to promises

### PromisifyAll Options

- `suffix` (default: 'Async') - Suffix to append to promisified method names
- `filter` - Filter function to determine which methods to promisify
- `promisifier` - Custom function to handle promisification
- `multiArgs` (default: false) - Whether to support multiple callback arguments
- `excludeMain` (default: false) - Whether to exclude promisifying the main object/class
- `context` - The context (this) to use when calling methods

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test
npm run test:watch
npm run test:coverage
```

## License

Apache-2.0

## Author

Joel Chen
