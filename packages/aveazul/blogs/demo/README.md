# Bluebird `using()` Method Demo

This demo showcases the usage of Bluebird's `using()` method for resource management in JavaScript. It provides practical examples of how to use this method to manage resources that need to be properly initialized and disposed of.

## How Bluebird's Disposer Pattern Works

Bluebird uses a pattern called "disposers" for resource management. A disposer is created by calling `.disposer()` on a promise. The disposer function is responsible for cleaning up resources when they're no longer needed.

For example:

```javascript
// Create a resource
const resource = new Resource();

// Create a disposer for the resource
const resourceDisposer = Promise.resolve(resource).disposer((resource) => {
  // Clean up code here
  return resource.dispose();
});

// Use the resource with Bluebird.using
Bluebird.using(resourceDisposer, async (resource) => {
  // Use the resource
  await resource.doSomething();
  // When this block exits, resource.dispose() will be called automatically
});
```

## Examples Included

1. **Basic Example**: Simple usage with a single resource
2. **Multiple Resources**: Managing multiple resources in a single `using()` call
3. **Error Handling**: Demonstrating how errors are handled and resources are still properly disposed
4. **Complex Resource Management**: Managing multiple resources of different types in a complex scenario

## Setup

1. Install dependencies:

```bash
npm install
```

2. Run the demo:

```bash
npm start
```

## Resource Types

The demo includes a `Resource` class that simulates different types of resources:

- Database connections
- Cache systems
- File handles
- Network connections
- Memory resources

Each resource type has specialized methods that demonstrate different use cases.

## Expected Output

The demo will show:

- Resource initialization
- Resource usage
- Resource disposal
- Error handling
- Results of operations

## Key Features Demonstrated

- Automatic resource cleanup
- Multiple resource management
- Error propagation
- Resource initialization
- Specialized resource methods

## Notes

- This is a demonstration of Bluebird's `using()` method, not a production-ready implementation
- The Resource class is simplified for demonstration purposes
- Error handling is basic and would need to be enhanced for production use
- The `Resource` class implements the disposer pattern required by Bluebird's `using()`
- Each resource has a `disposer()` method that returns a disposer for use with `Bluebird.using()`
- Resource disposal occurs automatically when the handler function completes or throws an error
- The demo verifies disposal by checking the `isDisposed` property of each resource after use
