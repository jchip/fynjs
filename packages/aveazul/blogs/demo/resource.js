const Bluebird = require("bluebird");

/**
 * Resource class that implements the disposer pattern required by Bluebird's using
 */
class Resource {
  constructor(name = "unnamed") {
    this.name = name;
    this.isInitialized = false;
    this.isDisposed = false;
  }

  async initialize() {
    if (this.isInitialized) return this;
    console.log(`Initializing ${this.name} resource...`);
    this.isInitialized = true;
    return this;
  }

  async dispose() {
    if (this.isDisposed) return;
    console.log(`\x1b[32m✓ Disposing ${this.name} resource...\x1b[0m`);
    this.isDisposed = true;
  }

  // Returns the disposer for Bluebird's using
  disposer() {
    return Bluebird.resolve(this).disposer((resource) => {
      return resource.dispose();
    });
  }

  async doSomething() {
    if (!this.isInitialized) throw new Error("Resource not initialized");
    if (this.isDisposed) throw new Error("Resource already disposed");
    console.log(`Doing something with ${this.name} resource...`);
    return `Result from ${this.name}`;
  }

  // Specialized methods for different resource types
  async query(sql) {
    if (this.name === "db") {
      console.log(`Executing query on ${this.name}: ${sql}`);
      return `Results from query: ${sql}`;
    }
    throw new Error(
      `Query method not available for resource type: ${this.name}`
    );
  }

  async get(key) {
    if (this.name === "cache") {
      console.log(`Getting value from ${this.name} for key: ${key}`);
      return `Cached value for: ${key}`;
    }
    throw new Error(`Get method not available for resource type: ${this.name}`);
  }

  async read(path) {
    if (this.name === "file") {
      console.log(`Reading file from ${this.name}: ${path}`);
      return `Contents of file: ${path}`;
    }
    throw new Error(
      `Read method not available for resource type: ${this.name}`
    );
  }

  async fetch(url) {
    if (this.name === "network") {
      console.log(`Fetching data from ${this.name} for URL: ${url}`);
      return `Data from URL: ${url}`;
    }
    throw new Error(
      `Fetch method not available for resource type: ${this.name}`
    );
  }
}

module.exports = Resource;
