# AveAzul

AveAzul ("Blue Bird" in Spanish) is a Promise extension library that provides Bluebird-like utility methods built on top of native Promises. The name is a Spanish play on words referencing Bluebird.

## Requirements

- Node.js 16 or higher

## Features

- Extends native Promise with Bluebird-like utility methods
- Built on top of the efficient `xaa` library for async operations
- Zero external runtime dependencies (other than `xaa`)
- TypeScript-friendly
- Familiar Bluebird-style API

## Installation

```bash
npm install aveazul
```

## Usage

```javascript
const AveAzul = require('aveazul');

// Create a new promise
const promise = new AveAzul((resolve, reject) => {
  setTimeout(() => resolve('result'), 1000);
});

// Use Bluebird-style methods
promise
  .tap(value => console.log('Got:', value))
  .delay(500)
  .then(value => console.log('After delay:', value));

// Static helpers
AveAzul.delay(1000, 'hello')
  .then(value => console.log(value));

// Array operations
AveAzul.resolve([1, 2, 3])
  .map(x => x * 2)
  .filter(x => x > 4)
  .then(result => console.log(result)); // [6]
```

## API

### Instance Methods

- `tap(fn)` - Execute side effects in a chain
- `filter(fn)` - Filter array elements
- `map(fn)` - Map array elements
- `return(value)` - Inject a value into the chain
- `each(fn)` - Iterate over array elements
- `delay(ms)` - Delay execution
- `timeout(ms, message?)` - Set operation timeout
- `try(fn)` - Wrap sync/async functions
- `props(obj)` - Handle object properties
- `reduce(fn, initialValue?)` - Reduce array
- `throw(reason)` - Return rejected promise
- `catchThrow(reason)` - Catch and throw new error
- `catchReturn(value)` - Catch and return value
- `get(propertyPath)` - Get nested property

### Static Methods

- `AveAzul.delay(ms, value?)` - Create delayed promise
- `AveAzul.map(array, fn)` - Map array elements
- `AveAzul.try(fn)` - Wrap function execution
- `AveAzul.props(obj)` - Handle object properties
- `AveAzul.defer()` - Create deferred promise
- `AveAzul.promisify(fn, options?)` - Promisify callback functions
- `AveAzul.each(items, fn)` - Iterate over items
- `AveAzul.reduce(array, fn, initialValue?)` - Reduce array
- `AveAzul.throw(reason)` - Create rejected promise

## License

Apache 2.0

## Dependencies

- [xaa](https://github.com/jchip/xaa) - Efficient async/await helpers
