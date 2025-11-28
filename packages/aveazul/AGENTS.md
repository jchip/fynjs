## For AI Assistants (Claude, GitHub Copilot, etc.)

When working with this codebase, please adhere to these guidelines:

1. SIMPLICITY: Keep implementations simple - don't over-engineer solutions
2. NO ASSUMPTIONS: Do not make assumptions about implementation details that aren't explicitly in the code
3. TEST COMPATIBILITY: Tests should be implementation-agnostic and work with both AveAzul and Bluebird
4. MINIMAL CHANGES: When fixing issues, make the smallest possible changes necessary
5. DON'T ALTER CORE FILES: Don't modify core implementation files without explicit permission
6. TEST FIRST: Always run tests before and after changes to verify functionality

### Testing

The tests should work with both AveAzul and the actual Bluebird in a generic mannter without special detection for one or the other, except those in `test/only-aveazul`, which are for AveAzul only.

To run specific test file with AveAzul implementation:

```bash
npm jest -- test/[test-file].js
```

To run specific test file against Bluebird:

```bash
npm run jest:bluebird -- test/[test-file].js
```

To run all tests against AveAzul implementation:

```bash
npm run test
```

To run all tests against Bluebird:

```
npm run test:bluebird
```

### Methods already in native Promise

Note that native Promise already have some of the methods, instance or static, like `race`, `any`, `all`, `allSettled`.

To find not implemented methods in AveAzul:

```js
const AA = require("./lib/aveazul");
console.log("Not implemented Instance methods", AA.__notImplementedInstance);
console.log("Not implemented Static methods", AA.__notImplementedStatic);
```

Bluebird special methods that can't be implemented:

- Instance: `isFulfilled`, `isRejected`, `isPending`, `isCancelled`, `value`, `reason`, `cancel`, `reflect`, `suppressUnhandledRejections`, `bind`

- Static: `coroutine`, `getNewLibraryCopy`, `noConflict`, `setScheduler`

Methods won't implement:

- `done`, `error`

The unimplemented methods are detected in the file not-implemented.js. It goes through all Bluebird APIs and detect the ones that AveAzul doesn't have, there's no need to remove one after it's implemented.
