# item-queue

An item processing queue using Promise.

[**API Reference**](https://jchip.github.io/item-queue/index.html)

## Features

- incrementally add items
- concurrent processing
- pause and resume processing
- automatic watch timer for long pending items

## Usage

Simple Example:

```ts
import { ItemQueue } from "item-queue";

async function test() {
  let total = 0;

  const queue = new ItemQueue<number>({
    // processItem can be an async or sync function
    async processItem(delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      total = total + delay;
    },
    itemQ: [10, 20, 30, 40, 50, 60, 70, 80, 90],
    concurrency: 2,
  });

  const waiting = queue.start().wait();
  queue.addItem(75); // add one item while queue in progress
  queue.addItems([55, 45, 35]); // can add multiple items also
  await waiting;

  console.log("result:", total);
}
```

## Demo

More Examples:

See [sample](./samples/example1.js) for a demo usage with [visual-logger].

![item-queue demo][example1-demo-image]

[example1-demo-image]: ./samples/example1.gif
[visual-logger]: https://www.npmjs.com/package/visual-logger
