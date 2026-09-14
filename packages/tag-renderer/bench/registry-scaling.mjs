import { performance } from "node:perf_hooks";

import {
  RegisterTokenIds,
  TagRenderer,
  Token,
  createTemplateTagsFromArray,
} from "../dist/index.js";

const sizes = [1_000, 2_000, 4_000, 8_000];

for (const size of sizes) {
  const tags = [];
  for (let index = 0; index < size; index++) {
    tags.push(RegisterTokenIds(() => ({ [`TOKEN_${index}`]: String(index) })));
  }
  tags.push(Token(`TOKEN_${size - 1}`));

  const renderer = new TagRenderer({ templateTags: createTemplateTagsFromArray(tags) });
  const start = performance.now();
  await renderer.initializeRenderer();
  const elapsed = performance.now() - start;
  const result = await renderer.render({});

  if (result.result !== String(size - 1)) {
    throw new Error(`registry benchmark produced the wrong result for ${size} providers`);
  }
  console.log(`${size}\t${elapsed.toFixed(2)} ms`);
}
