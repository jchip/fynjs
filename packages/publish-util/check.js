//
// Guard against publish-util being published by a bare `npm publish` typed in this directory.
// It has to go through a publisher that runs the prepack/postpack package.json dance:
//
//   BY_PUBLISH_UTIL - set by npmPublish() in src/npm-publish.ts, i.e. bin/do-publish
//   FYNPO_PUBLISH   - set by `fynpo publish` around every lifecycle script it runs, which
//                     invokes prepublishOnly and then `npm pack` (FPO-55)
//
// Neither present means a human ran `npm publish` here, which is the case this exists to stop.
//
if (!process.env.BY_PUBLISH_UTIL && !process.env.FYNPO_PUBLISH) {
  console.error("publish using bin/do-publish");
  process.exit(1);
}
