# Resource Management with Bluebird's `using` Method

Resource management is a critical aspect of software development, especially when dealing with resources that need to be properly released after use. In JavaScript, this often involves careful handling of cleanup operations to prevent resource leaks. Bluebird's `using` method provides a clean, effective solution to this common problem.

## What's Bluebird?

Bluebird emerged in the early 2010s during a critical period in JavaScript's evolution, when native Promises were still years away from widespread adoption. Created by Petka Antonov with performance as a primary concern, Bluebird consistently outperformed other Promise libraries and became the go-to choice for many Node.js applications. It pioneered features like sophisticated error handling, utility methods (many of which later became standard in native Promises), and resource management patterns like the `using` method. Even though native Promises now provide many of Bluebird's core features, its influence persists in the patterns and practices that continue to shape JavaScript development today. And some of its innovations like cancellation is still not available in native Promise.

## What is `using`?

The `using` method in Bluebird is a utility for managing resources that need to be disposed of after use. It ensures that resources are properly cleaned up regardless of whether the code succeeds or fails.

To work with Bluebird's `using`, you need to create a disposer using the `.disposer()` method:

```javascript
// Example usage
Bluebird.using(new Resource().disposer(), async (r) => {
  // Use the resource
  await r.doSomething();
  // Resource will be automatically disposed when this function completes
});
```

One of `using`'s convenient features is its flexibility with resources. It accepts both disposers and regular promises, automatically awaiting any promises and passing their resolved values to the handler function. This flexibility goes even further - `using` can also handle promises that resolve to disposers, which is useful when you need to asynchronously create a disposer:

```javascript
// Function that asynchronously creates a disposer
async function getAsyncDisposer() {
  const resource = await createResourceAsynchronously();
  return resource.disposer((r) => r.close());
}

// Multiple resource types and promise-to-disposer example
Bluebird.using(
  getDBConnection(), // Returns a promise that resolves to a connection
  getFTPClient().disposer((client) => client.close()),
  getAsyncDisposer(), // Returns a promise that resolves to a disposer
  async (dbConnection, ftpClient, asyncResource) => {
    // All resources are ready to use
    // The FTP client and async resource will be automatically disposed
    // Regular promises (like dbConnection) have no dispose mechanism
    // so you must manually cleanup the DB connection yourself
  }
);
```

Bluebird's doc on `using` can be found [here](http://bluebirdjs.com/docs/api/promise.using.html).

## The Key Benefits

This abstraction utility API provides several important benefits:

1. **Automatic Cleanup**: Resources are automatically disposed of when the handler function completes, regardless of whether it succeeds or fails.

2. **Mental Freedom**: You can focus on your core business logic without being distracted by resource management details.

3. **Error Handling**: Errors are properly propagated while still ensuring resource cleanup.

4. **Consistency**: You don't need to remember to call `dispose()` in every code path.

5. **Multiple Resources**: It handles multiple resources in a single call, maintaining proper cleanup order and tracking which resources were successfully acquired.

```javascript
// Multiple resources example
Bluebird.using(
  new Resource().disposer(),
  new Resource().disposer(),
  async (r1, r2) => {
    // Use both resources
    await r1.doSomething();
    await r2.doSomething();
    // Both resources will be automatically disposed
  }
);
```

The most significant advantage of Bluebird's `using` method is that it **completely abstracts away the cleanup process**. As a developer, you don't have to think about when, how, or even if resources should be cleaned up - the `using` method handles all of this automatically.

This mental freedom is perhaps the most valuable aspect of `using` - it allows you to write code that's more focused on what you're trying to accomplish rather than on the mechanics of resource management.

## Examples - Resource Implementation

Below we will go into more elaborated and concrete examples to demonstrate `using` and compare it to other approaches. To demonstrate this effectively, we'll create a simple `Resource` class that mimics real-world resources like database connections or file handles:

```javascript
const Bluebird = require("bluebird");

class Resource {
  constructor(name = "unnamed") {
    this.name = name;
    this.isInitialized = false;
    this.isDisposed = false;
  }

  async initialize() {
    if (this.isInitialized) return this;
    this.isInitialized = true;
    return this;
  }

  async dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
  }

  // Method to create a disposer for use with Bluebird.using
  disposer() {
    return Bluebird.resolve(this).disposer((resource) => {
      return resource.dispose();
    });
  }

  async doSomething() {
    if (!this.isInitialized) throw new Error("Resource not initialized");
    if (this.isDisposed) throw new Error("Resource already disposed");
    return `Result from ${this.name}`;
  }

  // Specialized methods for different resource types
  async query(sql) {
    if (this.name === "db") return `Results from query: ${sql}`;
    throw new Error(
      `Query method not available for resource type: ${this.name}`
    );
  }

  async get(key) {
    if (this.name === "cache") return `Cached value for: ${key}`;
    throw new Error(`Get method not available for resource type: ${this.name}`);
  }

  async read(path) {
    if (this.name === "file") return `Contents of file: ${path}`;
    throw new Error(
      `Read method not available for resource type: ${this.name}`
    );
  }

  async fetch(url) {
    if (this.name === "network") return `Data from URL: ${url}`;
    throw new Error(
      `Fetch method not available for resource type: ${this.name}`
    );
  }
}
```

This implementation:

- Tracks initialization and disposal state
- Provides a basic `doSomething` method
- Includes specialized methods for different resource types (db, cache, file, network)
- Implements the required `dispose` method for Bluebird's `using`
- Includes a `disposer()` method to create disposers for use with `Bluebird.using`

## Comparison with Alternatives

### With Promise.finally

```javascript
const resource = new Resource();
try {
  await resource.doSomething();
} catch (error) {
  // Handle error
} finally {
  await resource.dispose();
}
```

**Pros:**

- Works with native Promises
- No additional library required

**Cons:**

- More verbose
- Requires explicit try/catch/finally blocks
- Error handling is more complex
- Doesn't handle multiple resources elegantly
- **Requires you to remember to call dispose()** in every code path

### With try/catch/finally

```javascript
const resource = new Resource();
try {
  await resource.doSomething();
} catch (error) {
  // Handle error
} finally {
  await resource.dispose();
}
```

**Pros:**

- Works with any JavaScript code
- No Promise required

**Cons:**

- Most verbose option
- Requires explicit error handling
- Doesn't handle multiple resources elegantly
- Can lead to nested try/catch blocks in complex scenarios
- **Requires you to remember to call dispose()** in every code path

## The Complexity of Managing Multiple Resources

While managing a single resource with try/catch/finally is straightforward, the complexity grows significantly with multiple resources. Let's examine how this complexity manifests with three or more resources.

### Managing Three Resources with try/catch/finally

```javascript
const resource1 = new Resource();
const resource2 = new Resource();
const resource3 = new Resource();

try {
  // Initialize resources
  await resource1.initialize();
  await resource2.initialize();
  await resource3.initialize();

  // Use resources
  const result1 = await resource1.doSomething();
  const result2 = await resource2.doSomethingElse(result1);
  const result3 = await resource3.process(result2);

  return result3;
} catch (error) {
  // Handle error
  console.error("Error occurred:", error);
  throw error;
} finally {
  // Cleanup in reverse order
  try {
    await resource3.dispose();
  } catch (disposeError) {
    console.error("Error disposing resource3:", disposeError);
  }

  try {
    await resource2.dispose();
  } catch (disposeError) {
    console.error("Error disposing resource2:", disposeError);
  }

  try {
    await resource1.dispose();
  } catch (disposeError) {
    console.error("Error disposing resource1:", disposeError);
  }
}
```

### Managing Five Resources with try/catch/finally

```javascript
const resources = [
  new Resource("db"),
  new Resource("cache"),
  new Resource("file"),
  new Resource("network"),
  new Resource("memory"),
];

try {
  // Initialize all resources
  for (const resource of resources) {
    await resource.initialize();
  }

  // Use resources
  const dbResult = await resources[0].query("SELECT * FROM users");
  const cachedData = await resources[1].get("user-data");
  const fileContent = await resources[2].read("config.json");
  const networkData = await resources[3].fetch("https://api.example.com/data");
  const processedData = await resources[4].process(networkData);

  return processedData;
} catch (error) {
  // Handle error
  console.error("Error occurred:", error);
  throw error;
} finally {
  // Cleanup in reverse order
  for (let i = resources.length - 1; i >= 0; i--) {
    try {
      await resources[i].dispose();
    } catch (disposeError) {
      console.error(`Error disposing resource ${i}:`, disposeError);
    }
  }
}
```

### Error Handling Edge Cases With Multiple Resources

Even these examples don't fully capture the complexity of error handling with multiple resources. Let's look at two common edge cases:

#### Partial Resource Acquisition

In real-world scenarios, resource acquisition itself can fail. Consider this scenario:

```javascript
let db, cache, file;
try {
  db = await connectToDB();
  cache = await connectToCache(); // Might throw error
  file = await openFile(); // Won't execute if cache fails

  // Use resources
} finally {
  // Have to manually check which resources were created
  if (file) await file.close();
  if (cache) await cache.release();
  if (db) await db.disconnect();
}
```

If `connectToCache()` fails with an error:

1. You need to manually track which resources were successfully acquired
2. You must carefully check each variable before attempting to dispose it
3. You must ensure proper disposal order despite partial acquisition

#### Errors During Disposal

Another edge case is handling errors that occur during disposal itself:

```javascript
try {
  const resource1 = await getResource1();
  const resource2 = await getResource2();
  // Use resources
} finally {
  try {
    await resource1.dispose(); // Might throw error
  } catch (disposeError1) {
    console.error("Error disposing resource1:", disposeError1);
  }

  try {
    await resource2.dispose(); // Might also throw error
  } catch (disposeError2) {
    console.error("Error disposing resource2:", disposeError2);
  }
}
```

This raises several questions:

- What if both the main code and disposals throw errors?
- Which error should be propagated?
- How to preserve information about all errors?

### The Same with Bluebird's `using`

Bluebird's `using` method solves all these issues nicely:

```javascript
return Bluebird.using(
  connectToDB().disposer((db) => db.disconnect()),
  connectToCache().disposer((cache) => cache.release()),
  openFile().disposer((file) => file.close()),
  async (db, cache, file) => {
    // Use resources
    const dbResult = await db.query("SELECT * FROM users");
    const cachedData = await cache.get("user-data");
    const fileContent = await file.read("config.json");

    return { dbResult, cachedData, fileContent };
  }
);
```

If any resource acquisition fails:

1. Bluebird automatically tracks which resources were successfully acquired
2. It disposes only those resources that were acquired
3. It disposes them in the correct order
4. It properly preserves and propagates the original error

Similarly, with multiple resources:

```javascript
return Bluebird.using(
  new Resource("db").disposer(),
  new Resource("cache").disposer(),
  new Resource("file").disposer(),
  new Resource("network").disposer(),
  new Resource("memory").disposer(),
  async (db, cache, file, network, memory) => {
    // Initialize all resources (if needed)
    await db.initialize();
    await cache.initialize();
    await file.initialize();
    await network.initialize();
    await memory.initialize();

    // Use resources
    const dbResult = await db.query("SELECT * FROM users");
    const cachedData = await cache.get("user-data");
    const fileContent = await file.read("config.json");
    const networkData = await network.fetch("https://api.example.com/data");
    const processedData = await memory.process(networkData);

    return processedData;
  }
);
```

### Custom Abstraction Complexity

Creating a custom utility to handle all these edge cases would require substantial code:

```javascript
async function withResources(resourceFactories, fn) {
  const acquiredResources = [];
  let mainError = null;

  try {
    // Acquire resources
    const resources = [];
    for (const factory of resourceFactories) {
      try {
        const resource = await factory();
        acquiredResources.push(resource);
        resources.push(resource);
      } catch (error) {
        mainError = error;
        break;
      }
    }

    if (mainError) throw mainError;

    // Execute function with resources
    return await fn(resources);
  } catch (error) {
    mainError = error;
    throw error;
  } finally {
    // Clean up only acquired resources in reverse order
    const disposalErrors = [];
    for (let i = acquiredResources.length - 1; i >= 0; i--) {
      try {
        await acquiredResources[i].dispose();
      } catch (error) {
        disposalErrors.push(error);
      }
    }

    // Log disposal errors but preserve the main error
    if (disposalErrors.length > 0) {
      console.error("Errors during resource disposal:", disposalErrors);
    }
  }
}
```

### How `using` Helps for Multiple Resources

1. **Cleaner Code**: The `using` approach is significantly more concise and readable, especially with multiple resources.

2. **Proper Cleanup Order**: `using` automatically handles the cleanup order, ensuring resources are disposed of in the correct sequence.

3. **Error Handling**: With `using`, if an error occurs during disposal, it's properly propagated without requiring additional try/catch blocks.

4. **Partial Acquisition**: Bluebird intelligently tracks which resources were successfully acquired and only disposes of those.

5. **Resource Initialization**: While `using` doesn't automatically initialize resources, it provides a clean structure for doing so.

6. **Scalability**: As the number of resources grows, the `using` approach scales well without becoming unwieldy.

7. **Maintainability**: The code is easier to maintain and modify, as adding or removing resources requires minimal changes.

8. **Mental Freedom**: You don't have to think about cleanup at all - it's completely abstracted away, allowing you to focus on your core business logic.

## When to Use `using`

`using` is particularly useful in scenarios where:

1. You're working with resources that need explicit cleanup (database connections, file handles, etc.)
2. You want to ensure resources are always cleaned up, even in error scenarios
3. You're dealing with multiple resources that need to be managed together
4. You want to write cleaner, more maintainable code
5. You want to focus on your business logic without worrying about resource management details

## Other Resource Management Alternatives

While Bluebird's `using` method is convenient, there are several other approaches to resource management in JavaScript:

### Using Decorators (TypeScript)

TypeScript decorators can be used to create a more declarative approach to resource management:

```typescript
function using(resource: Resource) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        await resource.initialize();
        return await originalMethod.apply(this, args);
      } finally {
        await resource.dispose();
      }
    };

    return descriptor;
  };
}

class UserService {
  @using(new DatabaseResource())
  async getUser(id: string) {
    // Database will be automatically initialized and disposed
    return await this.db.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}
```

**Pros:**

- Declarative syntax
- Integrates well with TypeScript
- Can be combined with other decorators

**Cons:**

- Requires TypeScript
- Less flexible than `using` for multiple resources
- Decorator syntax can be unfamiliar

### Using Context Managers (Python-style)

Some libraries implement Python-style context managers in JavaScript:

```javascript
import { withResource } from "context-manager";

// Using async/await
async function processData() {
  await withResource(new Resource(), async (resource) => {
    await resource.doSomething();
  });
}

// Using generators
function* processData() {
  yield* withResource(new Resource(), function* (resource) {
    yield resource.doSomething();
  });
}
```

**Pros:**

- Familiar pattern for Python developers
- Works with both async/await and generators
- Can be extended to support other context manager patterns

**Cons:**

- Less common in JavaScript ecosystem
- Generator syntax can be confusing
- Limited support in some environments

### Using RAII Pattern with Classes

The Resource Acquisition Is Initialization (RAII) pattern can be implemented using classes:

```javascript
class ResourceScope {
  constructor(resource) {
    this.resource = resource;
  }

  async execute(callback) {
    try {
      await this.resource.initialize();
      return await callback(this.resource);
    } finally {
      await this.resource.dispose();
    }
  }
}

// Usage
const scope = new ResourceScope(new Resource());
await scope.execute(async (resource) => {
  await resource.doSomething();
});
```

**Pros:**

- Object-oriented approach
- Can be extended with additional functionality
- Works with any JavaScript environment

**Cons:**

- More verbose than `using`
- Requires creating a new class
- Less streamlined for multiple resources

### Using Async Iterators

Async iterators can be used to manage resources that need to be processed in sequence:

```javascript
async function* resourceIterator(resource) {
  try {
    await resource.initialize();
    yield resource;
  } finally {
    await resource.dispose();
  }
}

// Usage
for await (const resource of resourceIterator(new Resource())) {
  await resource.doSomething();
}
```

**Pros:**

- Native JavaScript feature
- Works well with streaming data
- Can be combined with other async iterator patterns

**Cons:**

- Less intuitive for simple resource management
- Overkill for basic cleanup scenarios
- Limited support in older environments

Each of these alternatives has its own strengths and use cases. Bluebird's `using` method remains one of the most intuitive and widely adopted solutions, but these alternatives offer different approaches that might better suit specific project requirements or developer preferences.

## Modern Alternatives: AveAzul

Recently I was working on some large legacy code that uses Bluebird APIs extensively. After some attempts to rewrite much of the code to use native Promise, I realized that it was a fairly large effort. So I decided to create a near drop-in replacement for Bluebird that uses native Promise. Even though Bluebird still has a few things that can't be replicated, I managed to create one that's quite close to a drop-in replacement. It's available as [AveAzul](https://www.npmjs.com/package/aveazul), which is Spanish for "Blue Bird" (as suggested by Cursor :D).

AveAzul also supports the disposer/using pattern:

```javascript
// Using AveAzul with disposers
const AveAzul = require("aveazul");

AveAzul.using(new Resource().disposer(), async (r) => {
  await r.doSomething();
  // Resource automatically disposed
});
```

## Conclusion

Bluebird's `using` method provides a powerful and well-designed solution for resource management in JavaScript. Its greatest strength is that it completely abstracts away the cleanup process, allowing you to focus on what your code is trying to accomplish rather than on the mechanics of resource management.

While alternatives like `Promise.finally` or try/catch/finally blocks can achieve the same result, `using` offers a more concise and maintainable approach, especially when dealing with multiple resources. For projects that already use Bluebird, leveraging `using` for resource management is a no-brainer. It aligns with the library's philosophy of providing thoughtful solutions to common programming challenges while maintaining compatibility with native Promises.
