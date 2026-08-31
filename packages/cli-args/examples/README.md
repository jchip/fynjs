# Examples

Each file here is a runnable CLI built with `@fynjs/cli-args`. They import the package by name,
the same way your own code would:

```ts
import { NixClap } from "@fynjs/cli-args";
```

Run one with [tsx](https://www.npmjs.com/package/tsx):

```bash
tsx quick-start.ts --help
tsx numbers.ts sum 1 2 3
```

Inside this repo the import resolves back to this package through node's self-reference, which
goes through `exports` - so run `npm run build` first, or the examples won't find `dist`.
