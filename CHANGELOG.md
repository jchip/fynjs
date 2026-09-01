# 9/1/2026

## Packages

-   `@fynpo/base@2.0.2` `(2.0.1 => 2.0.2)`
-   `fyn@3.0.3` `(3.0.2 => 3.0.3)`
-   `fynpo@3.0.3` `(3.0.2 => 3.0.3)`
-   `fynpo-cli@3.0.3` `(3.0.2 => 3.0.3)`

## Commits

-   `packages/fynpo-base`

    -   FPO-58: dep graph rejects self dependency in addDep [commit](https://github.com/jchip/fynjs/commit/9b6a2b03a8cb8a57411d5a9dc2c8f40ef4af379f)

-   `packages/bluebird`

    -   Update fyn and fynpo devDeps to 3.0.2 [commit](https://github.com/jchip/fynjs/commit/9c0a6d01267159e4fc7cfcee969dba2bb82325e8)

-   `packages/fyn`

    -   FPM-73: dont record dep relation from a fynpo package to itself [commit](https://github.com/jchip/fynjs/commit/3ff1b970b2641e586ec527aa0c9eb14c6f23c58b)
    -   Update fyn and fynpo devDeps to 3.0.2 [commit](https://github.com/jchip/fynjs/commit/9c0a6d01267159e4fc7cfcee969dba2bb82325e8)

# 8/31/2026

## Packages

-   `fyn@3.0.2` `(3.0.1 => 3.0.2)`
-   `fynpo@3.0.2` `(3.0.1 => 3.0.2)`
-   `fynpo-cli@3.0.2` `(3.0.1 => 3.0.2)`
-   `visual-exec@1.0.2` `(1.0.1 => 1.0.2)`
-   `visual-logger@2.0.1` `(2.0.0 => 2.0.1)`

## Commits

-   `packages/fynpo`

    -   FPO-57: fynpo releases every version-lock member on an indirect bump [commit](https://github.com/jchip/fynjs/commit/11b0f19d8c18eccbe35ad438b80c241ace843eca)

-   `packages/visual-exec`

    -   VEX-10: visual-exec covers nF/C1 escapes and sanitizes logFinalOutput [commit](https://github.com/jchip/fynjs/commit/280df9ad128763e389aa13cfd14b91f5abd0189f)
    -   VEX-9: visual-exec strips terminal control codes from child output shown in progress lines [commit](https://github.com/jchip/fynjs/commit/945046af29dc0951422eaf8667b4c66deb61832b)

-   `packages/visual-logger`

    -   FJM-147: visual-logger does not render item animation to a non-TTY output [commit](https://github.com/jchip/fynjs/commit/db1fa934c5b395df3afff08037b4de114a7c4014)
    -   FJM-145: visual-logger tears down the frame when the item display is toggled [commit](https://github.com/jchip/fynjs/commit/db82bbdc54e577843d2cd7d312a2d9d23c473614)
    -   FJM-144: visual-logger cancels a pending render before clearing items [commit](https://github.com/jchip/fynjs/commit/9d7f608489aab12e9f83a16d87ade15ce259c4ce)
    -   FJM-143: visual-logger spin-reset test finds the addItem render by content [commit](https://github.com/jchip/fynjs/commit/48f891cfd6658df418e651b1c351552196c37da1)

# 8/31/2026

## Packages

### Directly Updated

-   `@fynjs/cli-args@1.0.1` `(1.0.0 => 1.0.1)`
-   `@fynjs/run@1.0.1` `(1.0.0 => 1.0.1)`
-   `aveazul@2.0.1` `(2.0.0 => 2.0.1)`
-   `fyn@3.0.1` `(3.0.0 => 3.0.1)`
-   `fynpo@3.0.1` `(3.0.0 => 3.0.1)`
-   `fynpo-cli@3.0.1` `(3.0.0 => 3.0.1)`
-   `item-queue@2.0.1` `(2.0.0 => 2.0.1)`
-   `optional-import@1.0.2` `(1.0.1 => 1.0.2)`
-   `pkg-preper@0.2.1` `(0.2.0 => 0.2.1)`
-   `xflight@3.0.1` `(3.0.0 => 3.0.1)`

### Fynpo Updated

-   `@fynpo/base@2.0.1` `(2.0.0 => 2.0.1)`
-   `chalker@2.0.1` `(2.0.0 => 2.0.1)`
-   `filter-scan-dir@2.0.1` `(2.0.0 => 2.0.1)`
-   `visual-exec@1.0.1` `(1.0.0 => 1.0.1)`
-   `xsh@1.0.1` `(1.0.0 => 1.0.1)`

## Commits

-   `packages/cli-args`

    -   FJM-137: cli-args default command pre-scan skips option values [commit](https://github.com/jchip/fynjs/commit/efb3fe975380ff7d4743ab4532d3d7aceca939ef)

-   `packages/confippet`

    -   FCP-1: @fynjs/confippet recreates electrode-confippet on current dependencies [commit](https://github.com/jchip/fynjs/commit/d6f88f49fb8fbbb803c0f961277d44459d239046)

-   `packages/http-server`

    -   FHS-2: @fynjs/http-server composes config through @fynjs/confippet [commit](https://github.com/jchip/fynjs/commit/6fcb7f88207b152944d62438685f1cf2059d345d)
    -   FHS-1: @fynjs/http-server serves tests on fastify, with electrode-servers surface [commit](https://github.com/jchip/fynjs/commit/d7f2fda980bdcfc0f20f6e60187395261dcc73ff)

-   `packages/xarc-run`

    -   FJM-139: xarc-run runs every stdout-intercepting spec with vitest console interception off [commit](https://github.com/jchip/fynjs/commit/5f525b3e299b773d5e28b2c18e4638b21b642e39)

-   `packages/aveazul`

    -   FJM-138: refresh lock files so audits resolve the patched dependency versions [commit](https://github.com/jchip/fynjs/commit/44fde9753e634569fc5e801de63674d6b9897d56)
    -   FJM-135: CI runs fynpo from the top-level install, root devDeps on fyn/fynpo v3 [commit](https://github.com/jchip/fynjs/commit/8cd6dfdb56c843a61c4481ed1a63329c28538156)

-   `packages/bluebird`

    -   FJM-135: CI runs fynpo from the top-level install, root devDeps on fyn/fynpo v3 [commit](https://github.com/jchip/fynjs/commit/8cd6dfdb56c843a61c4481ed1a63329c28538156)

-   `packages/fyn`

    -   FPM-70: fyn tests move to js-yaml 5, replacing the 3.x safeLoad API [commit](https://github.com/jchip/fynjs/commit/54e2df5d0964282d5998ba4b7bb04bd874687447)
    -   FPM-69: fyn audit --omit skips paths and advisories that only reach omitted dep types [commit](https://github.com/jchip/fynjs/commit/a1fe0923d1d59ab28eaa1c8441e4189ae21f78c7)
    -   FPM-68: mock npm registry runs on node:http, dropping the EOL hapi 18 tree [commit](https://github.com/jchip/fynjs/commit/4dc5c59e094a4a63f3ada99988569f942693fa4c)
    -   FJM-138: refresh lock files so audits resolve the patched dependency versions [commit](https://github.com/jchip/fynjs/commit/44fde9753e634569fc5e801de63674d6b9897d56)
    -   FJM-135: CI runs fynpo from the top-level install, root devDeps on fyn/fynpo v3 [commit](https://github.com/jchip/fynjs/commit/8cd6dfdb56c843a61c4481ed1a63329c28538156)

-   `packages/fynpo`

    -   FJM-140: fynpo-cli joins fyn and fynpos version lock group [commit](https://github.com/jchip/fynjs/commit/08d837171f0c786bd3b6e35df5b0355a936faa5d)
    -   FPO-56: publish exits non-zero on real failures, and an already-published version keeps the tag [commit](https://github.com/jchip/fynjs/commit/685c4c3afa00e0db5d5f2cc1e83b9d47e5c344e5)

-   `packages/fynpo-cli`

    -   FJM-141: fynpo-cli 3.0.0 aligns with fyn and fynpo in the lock group [commit](https://github.com/jchip/fynjs/commit/6c6e38f51e755fdc18cad2349feddbba309149f9)
    -   FJM-136: launcher test asserts against the fynpo it resolves, not the workspace source [commit](https://github.com/jchip/fynjs/commit/19719c48cce2f144d1965b95cb37e70b492e02ac)

-   `packages/item-queue`

    -   FJM-138: refresh lock files so audits resolve the patched dependency versions [commit](https://github.com/jchip/fynjs/commit/44fde9753e634569fc5e801de63674d6b9897d56)
    -   FJM-135: CI runs fynpo from the top-level install, root devDeps on fyn/fynpo v3 [commit](https://github.com/jchip/fynjs/commit/8cd6dfdb56c843a61c4481ed1a63329c28538156)

-   `packages/optional-import`

    -   OPI-3: windows drive paths import as file: URLs instead of a c: scheme [commit](https://github.com/jchip/fynjs/commit/c102269f78f3671eea2d47619b67c4ab49e35f02)

-   `packages/pkg-preper`

    -   FJM-138: refresh lock files so audits resolve the patched dependency versions [commit](https://github.com/jchip/fynjs/commit/44fde9753e634569fc5e801de63674d6b9897d56)
    -   FJM-135: CI runs fynpo from the top-level install, root devDeps on fyn/fynpo v3 [commit](https://github.com/jchip/fynjs/commit/8cd6dfdb56c843a61c4481ed1a63329c28538156)

-   `packages/xflight`

    -   FJM-142: xflight check-time test stamps add() with the time it asserts against [commit](https://github.com/jchip/fynjs/commit/c4393e4719e2ce8f45f4e96cae9a52448b65f020)

-   `.github`

    -   FJM-135: CI runs fyn bootstrap, and the root script spells out fynpo bootstrap [commit](https://github.com/jchip/fynjs/commit/9b3330d36dfa87f0133ddc6f5498de24591beff1)
    -   FJM-135: CI runs fynpo from the top-level install, root devDeps on fyn/fynpo v3 [commit](https://github.com/jchip/fynjs/commit/8cd6dfdb56c843a61c4481ed1a63329c28538156)
    -   FJM-135: CI installs fyn@v3 and bootstraps with fynpo@v3 [commit](https://github.com/jchip/fynjs/commit/c0b049646b9a6d8b8fed6052ce006d3f635bc12b)

-   `MISC`

    -   docs: root README describes fynjs, not fynpo [commit](https://github.com/jchip/fynjs/commit/6fd7f76037785e563a5153a58a63e73564bc1e8c)

# 8/30/2026

## Packages

-   `@fynjs/cli-args@1.0.0` `(0.0.1 => 1.0.0)`
-   `@fynjs/run@1.0.0` `(0.0.1 => 1.0.0)`
-   `@fynpo/base@2.0.0` `(1.1.23 => 2.0.0)`
-   `@jchip/error@2.0.0` `(1.0.3 => 2.0.0)`
-   `aveazul@2.0.0` `(1.1.0 => 2.0.0)`
-   `chalker@2.0.0` `(1.3.1 => 2.0.0)`
-   `check-pkg-new-version@1.0.0` `(0.0.1 => 1.0.0)`
-   `check-pkg-new-version-engine@2.0.0` `(1.0.3 => 2.0.0)`
-   `filter-scan-dir@2.0.0` `(1.6.0 => 2.0.0)`
-   `fyn@3.0.0` `(2.1.6 => 3.0.0)`
-   `fynpo@3.0.0` `(2.1.6 => 3.0.0)`
-   `fynpo-cli@2.0.0` `(1.0.3 => 2.0.0)`
-   `item-queue@2.0.0` `(1.1.2 => 2.0.0)`
-   `optional-import@1.0.1` `(1.0.0 => 1.0.1)`
-   `pkg-preper@0.2.0` `(0.1.8 => 0.2.0)`
-   `publish-util@3.0.0` `(2.1.0 => 3.0.0)`
-   `run-verify@2.0.0` `(1.2.7 => 2.0.0)`
-   `string-array@2.0.0` `(1.0.1 => 2.0.0)`
-   `unwrap-npm-cmd@2.0.0` `(1.1.2 => 2.0.0)`
-   `visual-exec@1.0.0` `(0.2.0 => 1.0.0)`
-   `visual-logger@2.0.0` `(1.1.3 => 2.0.0)`
-   `xaa@3.0.0` `(2.0.0 => 3.0.0)`
-   `xenv-config@2.0.0` `(1.3.1 => 2.0.0)`
-   `xflight@3.0.0` `(2.0.2 => 3.0.0)`
-   `xsh@1.0.0` `(0.4.6 => 1.0.0)`

## Commits

-   `packages/cli-args`

    -   FJM-134: drop docs generation from prepublishOnly in xaa and cli-args [commit](https://github.com/jchip/fynjs/commit/e1a8c00c2cd7db4bff0d48d3791362d14809f16d)
    -   FJM-132: cli-args prepublishOnly runs npm scripts, dropping the @fynjs/run devDep that closed a cycle [commit](https://github.com/jchip/fynjs/commit/2fd4a00df7e3dc0a61d4248f9f631369dac1df7f)
    -   FJM-129: cli-args examples import the package by name, so the published ones actually run [commit](https://github.com/jchip/fynjs/commit/c8d4d66ae0023de7227a9ba8d29afe2172beff0b)
    -   FJM-128: finish the nix-clap rename - create-monorepo, demos, docs and comments now say @fynjs/cli-args [commit](https://github.com/jchip/fynjs/commit/8a7884f5aef2d94bf52c8aa87da04fb0eb104c01)
    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-65: @fynjs/cli-args and check-pkg-new-version start at 0.0.1 so their first publish is 1.0.0 [commit](https://github.com/jchip/fynjs/commit/f7f3797d49b55ae909089570b94a88e1577f3b49)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-112: warn when a sync runExec invokes an exec handler that returns a promise [commit](https://github.com/jchip/fynjs/commit/d72377db6e2a25667a80a38098a70e1a0406a870)
    -   FJM-112: rename the misnamed idempotently test to say it re-executes [commit](https://github.com/jchip/fynjs/commit/9573d3b04f5be75fa2e339d8ef06a192f5f22783)
    -   FJM-112: drop the dead execCmd guard in runExec/runExecAsync root path, single-run is the only supported use [commit](https://github.com/jchip/fynjs/commit/40680a5d5bea9b61da8df9cd13e41349719e2409)
    -   FJM-112: document that runExec/runExecAsync re-run every handler, warn against parse() followed by runExecAsync [commit](https://github.com/jchip/fynjs/commit/252f0b4629bad963fc58d7eaebbd7b5ce0ec1bb8)
    -   FJM-111: cover the 4 remaining cli-args guard branches, restore its 100% branch threshold [commit](https://github.com/jchip/fynjs/commit/880a326a1c5274870f864e589996be374c984b43)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-25: drop @xarc/module-dev from all packages, inline docs and drop dead lint/test scripts [commit](https://github.com/jchip/fynjs/commit/87f52f8b508ef2fe4a52435370da3369333849e5)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-60: add publishConfig.access=public to @fynjs/cli-args [commit](https://github.com/jchip/fynjs/commit/3153c6bfacb84b915d9783f48b5e47bd6a190139)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/create-monorepo`

    -   FJM-128: finish the nix-clap rename - create-monorepo, demos, docs and comments now say @fynjs/cli-args [commit](https://github.com/jchip/fynjs/commit/8a7884f5aef2d94bf52c8aa87da04fb0eb104c01)
    -   FJM-126: drop opfs - fyns file-ops is built on fs.promises, pkg-preper and create-monorepo use node fs directly [commit](https://github.com/jchip/fynjs/commit/fc8d983f3b16c31d0fc45fff6c520ccb2547db73)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-105: [maj] xsh stays 0.4.6 for fynpo prepare to bump 1.0.0 at release, revert manual range pre-bumps, monorepo-test path dep for unpublished xsh [commit](https://github.com/jchip/fynjs/commit/b824b80798f82fbf5ec8ae46ad0a6d148826630c)
    -   FJM-106: fynpo and create-monorepo dep shelljs 0.10 directly, drop shcmd [commit](https://github.com/jchip/fynjs/commit/18b81932e7ac5451230b6044280fa8baaec9c397)
    -   FJM-105: bump fyn, fynpo, create-monorepo, xarc-run, visual-exec to local xsh ^1.0.0, drop visual-exec xsh ambient types [commit](https://github.com/jchip/fynjs/commit/a6c722b7428b0d8695a08b9acf111ccbbc485d83)
    -   FJM-100: create-monorepo drop unused prettier dependency [commit](https://github.com/jchip/fynjs/commit/b52d5b3aaf344d378b08cb4f7b9706c675ee829a)
    -   FJM-97: [maj] create-monorepo ESM-only, nix-clap 2, prettier 3, native mkdir replaces mkdirp [commit](https://github.com/jchip/fynjs/commit/dc5ce75f8e7a70a8b2358e4d0ed70cd26ffbc7bc)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-32: drop dangling main from fynpo and create-monorepo, both bin-only [commit](https://github.com/jchip/fynjs/commit/26771c9467672fc7b26a14c7dd1c07f54ca89e26)
    -   FJM-20: drop internal registry and strict-ssl=false from create-monorepo npmrc template [commit](https://github.com/jchip/fynjs/commit/879b25e67452879f6b47451f8bfe1574398334bc)
    -   FPO-29: fix dead create-monorepo bin - lazy-load ESM chalker, fix nix-clap require [commit](https://github.com/jchip/fynjs/commit/a7bf0ea05a793bc8d1e275c98734a79329b2a1a8)
    -   FPO-28: restore create-monorepo build devDeps, fixing bootstrap tsc failure [commit](https://github.com/jchip/fynjs/commit/cffbc2d4b5e4d3bbc473da82d4d9a939b2c286fc)
    -   FPO-25: drop @xarc/module-dev from all packages, inline docs and drop dead lint/test scripts [commit](https://github.com/jchip/fynjs/commit/87f52f8b508ef2fe4a52435370da3369333849e5)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   create-monorepo: load own package.json with file read instead of createRequire [commit](https://github.com/jchip/fynjs/commit/fccee783997975fc326fb2c724bf08571154dae0)
    -   FJM-81: bump create-monorepo typescript for chalker 2.x declaration compat [commit](https://github.com/jchip/fynjs/commit/3a35c2e803e71800c11bc262802f57bea1ab2a08)
    -   FJM-69: publish-util pack hooks for visual-exec and xflight, bump fynpo-cli and create-monorepo to ^2.1.0 [commit](https://github.com/jchip/fynjs/commit/3078d85c4c0dd82450a8f706f11745ff1d4c3cbf)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)

-   `packages/dual-mode-template`

    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-63: dual-mode-template ESM-only reference implementation [min] [commit](https://github.com/jchip/fynjs/commit/2df56e64e670c0d9ef11dea7f77303c3620e5369)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/xarc-run`

    -   FJM-130: xarc-run design.md names @fynjs/cli-args as the parser it actually uses [commit](https://github.com/jchip/fynjs/commit/c7e73dc756ff3ed3554e0665c0d7fb64f8f7a3b7)
    -   FJM-130: @fynjs/run parses argv with @fynjs/cli-args instead of the old nix-clap package [commit](https://github.com/jchip/fynjs/commit/7ae9a28ea76da00bd171feaef4a9eaaf85458c22)
    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-111: one prettier range across the repo, fynpo off its pinned prettier 2 with an awaited format [commit](https://github.com/jchip/fynjs/commit/dcfd8fd03107f57c749aa7b8b8185fd626fbf620)
    -   FJM-118: activate the inert coverage thresholds in xarc-run and fyn, xarc-run to 100% statements functions lines [commit](https://github.com/jchip/fynjs/commit/277bf635a15bda047e8dd50b5e17702c87d242ee)
    -   FJM-117: load task files via import() so top-level await works, add cts, document every format [commit](https://github.com/jchip/fynjs/commit/2df171725b14fb9526ffc5d6deb0951e0bad5985)
    -   FJM-116: xarc-run is ESM - all 26 spec files and the repo ci:check green [commit](https://github.com/jchip/fynjs/commit/969db5574ab4f89c0e01b05e74c6682d3e1078fd)
    -   FJM-116: WIP migrate xarc-run to ESM - source and specs converted, 305/321 tests passing [commit](https://github.com/jchip/fynjs/commit/dee81876c96efe666fd9622928a4215a61344f82)
    -   FJM-115: flush the logger before the no-tasks exit, and name top-level await as the cause when a task file cannot load [commit](https://github.com/jchip/fynjs/commit/cc6be7269aa554f3f56e0eb2b77b94aa170c2812)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-105: [maj] xsh stays 0.4.6 for fynpo prepare to bump 1.0.0 at release, revert manual range pre-bumps, monorepo-test path dep for unpublished xsh [commit](https://github.com/jchip/fynjs/commit/b824b80798f82fbf5ec8ae46ad0a6d148826630c)
    -   FJM-105: bump fyn, fynpo, create-monorepo, xarc-run, visual-exec to local xsh ^1.0.0, drop visual-exec xsh ambient types [commit](https://github.com/jchip/fynjs/commit/a6c722b7428b0d8695a08b9acf111ccbbc485d83)
    -   FJM-90: move remaining chalk dependents to ESM chalk 6 [commit](https://github.com/jchip/fynjs/commit/1688fb35223ee3b3585e51f53db150cc763e3234)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-27: resolve xrun cli from one base in bin, fixing MODULE_NOT_FOUND [commit](https://github.com/jchip/fynjs/commit/9ae6a1d6bb24b03c86631699e5502ae86f36a28c)
    -   FPO-25: drop @xarc/module-dev from xarc-run demos, align @fynjs/run version [commit](https://github.com/jchip/fynjs/commit/4bfa4e2971c1bb48dae7c354644ba2afd421391d)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   FJM-87: convert fynpo bundle to rolldown ESM, fix CJS demos and xrun entry [commit](https://github.com/jchip/fynjs/commit/71bbbe9cd55ff2b6cbecde804c80fdaa0ee97bee)
    -   FJM-88: xrun load chalker asynchronously via ck proxy [commit](https://github.com/jchip/fynjs/commit/311de40628e339921df5d7558404063bd7174ad9)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   FJM-57: @fynjs/run - detect providers by both @xarc/run and @fynjs/run, accept nix-clap v2 number coercion in tests [commit](https://github.com/jchip/fynjs/commit/2e37bedb5d022f2de9d8e625a5a914099ed1474e)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/fynpo-base`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FPO-43: processIndirectDeps walks iteratively with set membership, and cycles now name the packages they cost [commit](https://github.com/jchip/fynjs/commit/319a7347b276da76505f71b6da62410e40fa21dc)
    -   FJM-114: fynpo-base config loading to optional-import, json branch reads as json, first FynpoConfigManager tests [commit](https://github.com/jchip/fynjs/commit/9eec4b28874a8beaf98a14afae03aa904c756b6d)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-94: fynpo-base minimatch 10, optional-require 2, native isPathInside replaces is-path-inside [commit](https://github.com/jchip/fynjs/commit/7fbc812d722aa2ffa37fd6ad2ff64514b9dab076)
    -   FPO-37: honor --scope for bootstrap, local and run [commit](https://github.com/jchip/fynjs/commit/ce11f5cf4413a0b6e42f42b89f4341771da60872)
    -   FPO-17: array packages config feeds both discovery filter and publish allow list [commit](https://github.com/jchip/fynjs/commit/382871ab28dd3dd8b80c0ce3c1e413e27336e9cd)
    -   FPO-17: separate package discovery from fynpo publish jurisdiction [commit](https://github.com/jchip/fynjs/commit/04796abae42b12e4ddac6fe3828001eff72576d6)
    -   FPO-25: drop @xarc/module-dev from all packages, inline docs and drop dead lint/test scripts [commit](https://github.com/jchip/fynjs/commit/87f52f8b508ef2fe4a52435370da3369333849e5)
    -   FPO-19: fix infinite recursion in processIndirectDeps for cycles between other packages [commit](https://github.com/jchip/fynjs/commit/7038961c3a0a44249a0158b3d469a2f16d8ef432)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/error`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-25: drop @xarc/module-dev from all packages, inline docs and drop dead lint/test scripts [commit](https://github.com/jchip/fynjs/commit/87f52f8b508ef2fe4a52435370da3369333849e5)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/aveazul`

    -   Revert FJM-133: refresh tracked fyn-locks - drop stale nix-clap, xarc-run and opfs entries, expand cross-platform optional deps [commit](https://github.com/jchip/fynjs/commit/2efe49a045b0c8429dffd187978242a017074898)
    -   FJM-133: refresh tracked fyn-locks - drop stale nix-clap, xarc-run and opfs entries, expand cross-platform optional deps [commit](https://github.com/jchip/fynjs/commit/2f5aec85cbc8ee53a572ac7be8f41c643378ef3c)
    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-122: xsh, chalker, xaa and aveazul stop devDepending on @fynjs/run, removing every dependency cycle [commit](https://github.com/jchip/fynjs/commit/0793c2f9b8db33deb09622c316fa5b955d1fc0db)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-101: remove unpatched _w/xsh mirror, resolve xsh from registry [commit](https://github.com/jchip/fynjs/commit/bf47c754860130ef0d6ed4a26afcee7763e26ea8)
    -   FPM-60: modernize fyn deps: arborist 10, pacote 22, cacache 21, mfh 16, nrf 20, run-script 11, tar 7, minimatch 10, ini 7, strip-bom 5, source-map 0.8, drop mississippi [commit](https://github.com/jchip/fynjs/commit/ec751fc88aafc0e3260a50347ec7cf304371044e)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   chore: refresh fynpo data and lockfiles from local installs [commit](https://github.com/jchip/fynjs/commit/e32314e725f9cc81d4850934a5083c9770f7c570)
    -   FJM-84: refresh fynpo-data and dependent lockfiles for optional-require updates [commit](https://github.com/jchip/fynjs/commit/834d4986cb0bce77ea16d0c7b68bdbab5bb28add)
    -   FJM-81: refresh fyn lockfiles for local ESM-only dep links [commit](https://github.com/jchip/fynjs/commit/7da9fa3d3e12bbe10985cb918057db293acee43f)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/bluebird`

    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-55: point bluebird files at index.js [commit](https://github.com/jchip/fynjs/commit/21ca910010e208262028c53225391cf6c053f0e6)
    -   chore: refresh fynpo data and lockfiles from local installs [commit](https://github.com/jchip/fynjs/commit/e32314e725f9cc81d4850934a5083c9770f7c570)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)

-   `packages/chalker`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-122: xsh, chalker, xaa and aveazul stop devDepending on @fynjs/run, removing every dependency cycle [commit](https://github.com/jchip/fynjs/commit/0793c2f9b8db33deb09622c316fa5b955d1fc0db)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: one prettier range across the repo, fynpo off its pinned prettier 2 with an awaited format [commit](https://github.com/jchip/fynjs/commit/dcfd8fd03107f57c749aa7b8b8185fd626fbf620)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-89: [maj] add chalker/chalk and chalker/ansi-colors static entries with a makeChalker factory [commit](https://github.com/jchip/fynjs/commit/340274d3de3a12d0b42450164e60b1a9f03b00b5)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   [Publish][Selective] [commit](https://github.com/jchip/fynjs/commit/b8f6b3be337f3b4a0c5e199ead9a674d8b879453)
    -   OPI-1: start optional-import at 0.0.1 for its first publish [maj] [commit](https://github.com/jchip/fynjs/commit/8898d22ab663f4be2afc800ae96d0a37ac046c36)
    -   FJM-87: convert fynpo bundle to rolldown ESM, fix CJS demos and xrun entry [commit](https://github.com/jchip/fynjs/commit/71bbbe9cd55ff2b6cbecde804c80fdaa0ee97bee)
    -   FJM-86: chalker load optional colors with optional-import [maj] [commit](https://github.com/jchip/fynjs/commit/3bfafc168cd468dffa1968ff74c2e42114bbe369)
    -   FJM-82: chalker use optional-require 2.x instead of hand-rolled createRequire loading [commit](https://github.com/jchip/fynjs/commit/7c52add37c33130a67591305d8230041e536a56a)
    -   FJM-79: modernize chalker to ESM-only TypeScript with require(esm) interop export [maj] [commit](https://github.com/jchip/fynjs/commit/aa924ec705279ae8ab09465667a9c7ade37020bf)
    -   FJM-73: point chalker repository at fynjs and add publish-util pack hooks [commit](https://github.com/jchip/fynjs/commit/c8b94aaaa56ddfcb9e85b761e271da2840192eb6)
    -   git url [commit](https://github.com/jchip/fynjs/commit/d3843610ab92413e454784065dc03fa435edb246)
    -   1.3.1 [commit](https://github.com/jchip/fynjs/commit/b7c8faab0a24e43f9217c7e2450904913cd9d818)
    -   fallback to chalk [commit](https://github.com/jchip/fynjs/commit/3c14bac17618895fe3089661896636342c537ff5)
    -   1.3.0 [commit](https://github.com/jchip/fynjs/commit/38bc8d9634b2e61a1732e85fbb0a4e4ee8b7c09d)
    -   updates [commit](https://github.com/jchip/fynjs/commit/5b3c8a78e740e9d756e5e1a4413ef47a98aaa440)
    -   1.2.0 [commit](https://github.com/jchip/fynjs/commit/cf137ace67f1d856531edff7e615516f56055026)
    -   update README [commit](https://github.com/jchip/fynjs/commit/8dd1c4196a609fab50b5bd983f82fce533597be5)
    -   Create nodejs.yml [commit](https://github.com/jchip/fynjs/commit/a8a7459a108f2d902d32827f5a9c2b6b31863c43)
    -   update to chalk@4.0.0 [commit](https://github.com/jchip/fynjs/commit/59e66b0407868ee5461534984ea282434b81629e)
    -   1.1.2 [commit](https://github.com/jchip/fynjs/commit/631774f1cd33f1abb6c0c9761a2336ef9e843a7f)
    -   update readme [commit](https://github.com/jchip/fynjs/commit/9953305b6e788197473436a86e9ef5b0e067887d)
    -   skip applying chalk if supportsColor is false [commit](https://github.com/jchip/fynjs/commit/17b59c5c4383565dd8eac1b4eb9195baaef17a73)
    -   Update .travis.yml [commit](https://github.com/jchip/fynjs/commit/9bf78d9951df46c8296363045705b636fbc7cf21)
    -   1.1.1 [commit](https://github.com/jchip/fynjs/commit/d740779f3375807117a6251414e8554f5efa0e49)
    -   depend on chalk@2 [commit](https://github.com/jchip/fynjs/commit/4d28ed9c1d0761f43b680fdfbc72ff22dd0ebb91)
    -   1.1.0 [commit](https://github.com/jchip/fynjs/commit/220175d8030f31b6ef4a53e618153e50bc8d509f)
    -   support template string tagging [commit](https://github.com/jchip/fynjs/commit/48925e64ad8c89a0fd6c1808c24a23a7d0d58b4b)
    -   1.0.1 [commit](https://github.com/jchip/fynjs/commit/9364f79425786a9db822adecafe4b00b532e8c7e)
    -   handle unmatched strings [commit](https://github.com/jchip/fynjs/commit/b3eab9b782395c8938f33706bb790b1fd859f3bd)
    -   update description [commit](https://github.com/jchip/fynjs/commit/d4a986124edd1d9dc65e92db5b0a742f58dc9884)
    -   keep everything in a single array [commit](https://github.com/jchip/fynjs/commit/45549f17ea5476bf0a8870fe85bc6dd84b076a5c)
    -   use single string to keep result at each level [commit](https://github.com/jchip/fynjs/commit/5ae1cdeccbd62ae734d42d82a2705a4dc2305fdf)
    -   check unbalanced error before mismatch [commit](https://github.com/jchip/fynjs/commit/74b610c2d5895703403bcd6d05c9cfbfa484adbe)
    -   test chalk api throws [commit](https://github.com/jchip/fynjs/commit/e36cf47a0b85c79b551120edfe476d0205779604)
    -   adjust unbalanced error message [commit](https://github.com/jchip/fynjs/commit/0473a66f4a8870b44665d60a1e9449e2ce2ce6b6)
    -   check that markers matched [commit](https://github.com/jchip/fynjs/commit/93c17f593811b959a7a093a70ab908193914470e)
    -   update demo [commit](https://github.com/jchip/fynjs/commit/51c3fd2afd8838c3d0965abdf751e6eeee2d3cba)
    -   update .gitignore [commit](https://github.com/jchip/fynjs/commit/808de7d1dc10aedf93d4f1358685747341e4b3d6)
    -   show unbalanced open marker [commit](https://github.com/jchip/fynjs/commit/6ddc19f25d67ea2dfbdce86b758decd5ecf2324b)
    -   update README [commit](https://github.com/jchip/fynjs/commit/03a00145a93499309c455c7659a7b76acf3c72cf)
    -   support nesting markers [commit](https://github.com/jchip/fynjs/commit/1f0a7a5125d25b20131b76938e706fee37fe2719)
    -   comment on chalk hex API [commit](https://github.com/jchip/fynjs/commit/be56656e922f4509734f9bdd045b12baeca83d2a)
    -   update README [commit](https://github.com/jchip/fynjs/commit/dfe76da1ad4a0f4408fd76f682f51a0e365b7404)
    -   default remove to decode html escapes [commit](https://github.com/jchip/fynjs/commit/c3ce0d82b8d6ae4fc06c3590c2a77a7ba0d3de85)
    -   decode code points in HTML escapes [commit](https://github.com/jchip/fynjs/commit/87d3425b1dd88a0780f11d7f7c55eb61c5eaa57c)
    -   allow bg-# and bg # for hex [commit](https://github.com/jchip/fynjs/commit/0b0afa62072a420b6b614385531ea81b22e53dc2)
    -   update demo [commit](https://github.com/jchip/fynjs/commit/237611d86604e7f872eb5fa9140b91ada3552112)
    -   add html entities decoding [commit](https://github.com/jchip/fynjs/commit/297d048249d84513c9ca563610f335a98279cc81)
    -   first commit [commit](https://github.com/jchip/fynjs/commit/6886edc15927b7754c82a77c5020469a400fedfa)

-   `packages/check-pkg-new-version`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-65: @fynjs/cli-args and check-pkg-new-version start at 0.0.1 so their first publish is 1.0.0 [commit](https://github.com/jchip/fynjs/commit/f7f3797d49b55ae909089570b94a88e1577f3b49)
    -   FJM-119: skipLibCheck in check-pkg-new-version, type-fest 5.9.0 broke its build under lib ES2018 [commit](https://github.com/jchip/fynjs/commit/2c52b56b4ab3993c85815d74e539734039b06dce)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-93: check-pkg-new-version got 15 and ini 7 [commit](https://github.com/jchip/fynjs/commit/efe218cf058e654595e8c52842198115c605b0ee)
    -   FPO-25: drop @xarc/module-dev from all packages, inline docs and drop dead lint/test scripts [commit](https://github.com/jchip/fynjs/commit/87f52f8b508ef2fe4a52435370da3369333849e5)
    -   FJM-66: add publish-util pack hooks to check-pkg-new-version packages [commit](https://github.com/jchip/fynjs/commit/602905c4ec1d3db4be13be1d99e96194963d3f88)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/check-pkg-new-version-engine`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-36: check-pkg-new-version-engine drop mkdirp for native fs.mkdir recursive [commit](https://github.com/jchip/fynjs/commit/723a00866c7a713577bab6e8559057a59d801650)
    -   FJM-92: bump drop-in stale deps: ci-info 4, is-installed-globally 1, has-ansi 6, strip-ansi 7, log-update 8, which 7, find-up 8 [commit](https://github.com/jchip/fynjs/commit/b791be2c98272a80b91ebd60165efa6576234a92)
    -   FJM-19: use semver for version comparison in internalCheckIsNewer [commit](https://github.com/jchip/fynjs/commit/d3f3b232fc646d351cbfd8830f4d6b1aa1b3b675)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-25: drop @xarc/module-dev from all packages, inline docs and drop dead lint/test scripts [commit](https://github.com/jchip/fynjs/commit/87f52f8b508ef2fe4a52435370da3369333849e5)
    -   FJM-66: add publish-util pack hooks to check-pkg-new-version packages [commit](https://github.com/jchip/fynjs/commit/602905c4ec1d3db4be13be1d99e96194963d3f88)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/filter-scan-dir`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: one prettier range across the repo, fynpo off its pinned prettier 2 with an awaited format [commit](https://github.com/jchip/fynjs/commit/dcfd8fd03107f57c749aa7b8b8185fd626fbf620)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/fyn`

    -   FPM-67: a lockfile optFailed=platform is re-checked on machines whose os/cpu actually match [commit](https://github.com/jchip/fynjs/commit/8a5538cd85c1dceafd4d56c06c408bf828a17b10)
    -   Revert FJM-133: refresh tracked fyn-locks - drop stale nix-clap, xarc-run and opfs entries, expand cross-platform optional deps [commit](https://github.com/jchip/fynjs/commit/2efe49a045b0c8429dffd187978242a017074898)
    -   FJM-133: refresh tracked fyn-locks - drop stale nix-clap, xarc-run and opfs entries, expand cross-platform optional deps [commit](https://github.com/jchip/fynjs/commit/2f5aec85cbc8ee53a572ac7be8f41c643378ef3c)
    -   FJM-128: finish the nix-clap rename - create-monorepo, demos, docs and comments now say @fynjs/cli-args [commit](https://github.com/jchip/fynjs/commit/8a7884f5aef2d94bf52c8aa87da04fb0eb104c01)
    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-126: drop opfs - fyns file-ops is built on fs.promises, pkg-preper and create-monorepo use node fs directly [commit](https://github.com/jchip/fynjs/commit/fc8d983f3b16c31d0fc45fff6c520ccb2547db73)
    -   FPO-51: fyn and fynpo publish under the v3 dist-tag, matching their 3.0.0 bump [commit](https://github.com/jchip/fynjs/commit/4d8fd63127b6243d5caaed40118646d4a190b2cb)
    -   FPM-64: fyn specs get a unique temp dir per worker, no longer colliding on Date.now() [commit](https://github.com/jchip/fynjs/commit/79592baa69a720253bb7eea47c968e0976f575f4)
    -   FPM-63: lock churn from installs - item-queue platform-optional entries dropped again, fyn lock adjusted [commit](https://github.com/jchip/fynjs/commit/84413881e9dba32f103ad53ebf672183f3045594)
    -   FJM-111: one prettier range across the repo, fynpo off its pinned prettier 2 with an awaited format [commit](https://github.com/jchip/fynjs/commit/dcfd8fd03107f57c749aa7b8b8185fd626fbf620)
    -   FJM-118: activate the inert coverage thresholds in xarc-run and fyn, xarc-run to 100% statements functions lines [commit](https://github.com/jchip/fynjs/commit/277bf635a15bda047e8dd50b5e17702c87d242ee)
    -   FJM-114: fynpo-base config loading to optional-import, json branch reads as json, first FynpoConfigManager tests [commit](https://github.com/jchip/fynjs/commit/9eec4b28874a8beaf98a14afae03aa904c756b6d)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-105: restore fyn lock platform-optional entries via repo ci:check flow (FPM-63 flap), settle fynpo-data on xsh 0.4.6 [commit](https://github.com/jchip/fynjs/commit/37f28a4a1d9b01b63cec3a11e447dd0f4e9cf3ae)
    -   FJM-105: [maj] xsh stays 0.4.6 for fynpo prepare to bump 1.0.0 at release, revert manual range pre-bumps, monorepo-test path dep for unpublished xsh [commit](https://github.com/jchip/fynjs/commit/b824b80798f82fbf5ec8ae46ad0a6d148826630c)
    -   FJM-106: fynpo and create-monorepo dep shelljs 0.10 directly, drop shcmd [commit](https://github.com/jchip/fynjs/commit/18b81932e7ac5451230b6044280fa8baaec9c397)
    -   FJM-105: bump fyn, fynpo, create-monorepo, xarc-run, visual-exec to local xsh ^1.0.0, drop visual-exec xsh ambient types [commit](https://github.com/jchip/fynjs/commit/a6c722b7428b0d8695a08b9acf111ccbbc485d83)
    -   FJM-101: remove unpatched _w/xsh mirror, resolve xsh from registry [commit](https://github.com/jchip/fynjs/commit/bf47c754860130ef0d6ed4a26afcee7763e26ea8)
    -   FPM-61: fyn npm-packlist 11 via _w fork v11 branch with includeSymlinks, ignore-walk 9 fork v9 branch [commit](https://github.com/jchip/fynjs/commit/3ebb53ab4dbf1eacf22161a171fa204579ca6f29)
    -   FPM-62: neutralize inherited FORCE_COLOR in fyn vitest setup [commit](https://github.com/jchip/fynjs/commit/ae1221cb0e3fd97775debace55c78c1d648b5121)
    -   FPM-60: modernize fyn deps: arborist 10, pacote 22, cacache 21, mfh 16, nrf 20, run-script 11, tar 7, minimatch 10, ini 7, strip-bom 5, source-map 0.8, drop mississippi [commit](https://github.com/jchip/fynjs/commit/ec751fc88aafc0e3260a50347ec7cf304371044e)
    -   FPM-58: use chalker/chalk and move fyn to ESM chalk 6 [commit](https://github.com/jchip/fynjs/commit/510907ee9cac9a8fae58e027ec5a9e5226152eec)
    -   FPM-59: drop the require-at stub and alias, optional-require@2.1.1 fixes it upstream [commit](https://github.com/jchip/fynjs/commit/e59d756d7a010229625202d0e1903ea8ac9046f6)
    -   FPM-57: use an absolute target for Windows global bin wrappers [commit](https://github.com/jchip/fynjs/commit/360c3ab3730264dd58c58edc93d98f7881fd69d1)
    -   FPM-56: resolve global bins to the packages declared bin file, as a normal install does [commit](https://github.com/jchip/fynjs/commit/9fb2595aa4376e30770561ff1843a28572c757fe)
    -   FPM-55: normalize file:// URLs in the require-at stub so fyn starts on Windows [commit](https://github.com/jchip/fynjs/commit/fc751a0149c36393f538aed548820e68580edea4)
    -   FPM-53: drop duplicate enquirer devDependency from fyn [commit](https://github.com/jchip/fynjs/commit/00fb07514e62ca85407012b2091e495dec5d979b)
    -   FPM-52: never write through an existing hardlink when replicating files [commit](https://github.com/jchip/fynjs/commit/2d06096cd1219e712faebcdbbda7c45412dd824e)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-25: drop @xarc/module-dev from all packages, inline docs and drop dead lint/test scripts [commit](https://github.com/jchip/fynjs/commit/87f52f8b508ef2fe4a52435370da3369333849e5)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   chore: refresh fynpo data and lockfiles from local installs [commit](https://github.com/jchip/fynjs/commit/e32314e725f9cc81d4850934a5083c9770f7c570)
    -   OPI-1: start optional-import at 0.0.1 for its first publish [maj] [commit](https://github.com/jchip/fynjs/commit/8898d22ab663f4be2afc800ae96d0a37ac046c36)
    -   FJM-87: convert fynpo bundle to rolldown ESM, fix CJS demos and xrun entry [commit](https://github.com/jchip/fynjs/commit/71bbbe9cd55ff2b6cbecde804c80fdaa0ee97bee)
    -   FJM-87: fyn build ESM bundle with rolldown, drop require-at usage [commit](https://github.com/jchip/fynjs/commit/f9741d6a66477190683709885201dc500d5f8614)
    -   FJM-87: add rolldown ESM bundle config for fyn [commit](https://github.com/jchip/fynjs/commit/8035b06986d2a881845ba00241ccf310e989c4f8)
    -   FJM-86: chalker load optional colors with optional-import [maj] [commit](https://github.com/jchip/fynjs/commit/3bfafc168cd468dffa1968ff74c2e42114bbe369)
    -   FJM-84: refresh fynpo-data and dependent lockfiles for optional-require updates [commit](https://github.com/jchip/fynjs/commit/834d4986cb0bce77ea16d0c7b68bdbab5bb28add)
    -   FJM-83: fyn use optional-require 2.x directly, drop createRequire wrappers [commit](https://github.com/jchip/fynjs/commit/33616bfddfde0a52d9167c7abdc269d58e3b2f14)
    -   FJM-81: refresh fyn lockfiles for local ESM-only dep links [commit](https://github.com/jchip/fynjs/commit/7da9fa3d3e12bbe10985cb918057db293acee43f)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/fynpo`

    -   FPO-55: fynpo publish sets FYNPO_PUBLISH so a packages hand-publish guard accepts it [commit](https://github.com/jchip/fynjs/commit/abf38c4fb78d8fe61a6f9a0f424327ce895fb742)
    -   FPO-54: publish resolves the tag remote instead of requiring a branch upstream [commit](https://github.com/jchip/fynjs/commit/393fd3d8999ddcb99f6d3171456a6a00764de1dc)
    -   FPO-53: a failed package install names the package and points at its fyn debug log [commit](https://github.com/jchip/fynjs/commit/49ca1e5e8ed698ff0a2e0634d05c93713b9e1926)
    -   FPO-52: private packages get their workspace dep ranges rewritten at release [commit](https://github.com/jchip/fynjs/commit/1bcfb09ace57eff267e59edf415e8e7255ec7464)
    -   FJM-128: finish the nix-clap rename - create-monorepo, demos, docs and comments now say @fynjs/cli-args [commit](https://github.com/jchip/fynjs/commit/8a7884f5aef2d94bf52c8aa87da04fb0eb104c01)
    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FPO-51: fyn and fynpo publish under the v3 dist-tag, matching their 3.0.0 bump [commit](https://github.com/jchip/fynjs/commit/4d8fd63127b6243d5caaed40118646d4a190b2cb)
    -   FJM-124: fynpos CI notice goes to stderr, and the launcher test reads the version off the last line [commit](https://github.com/jchip/fynjs/commit/08a3712e3ea616aee866cc083144b03119ab15a2)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FPO-50: publishUtil.keep is the source of truth for bundle externals, adding the undeclared resolve-from [commit](https://github.com/jchip/fynjs/commit/86bfc603b5c351e5a96f52f30108b6242afa2552)
    -   FPO-41: clear fynpos type errors and put tsc --noEmit back in ci:check [commit](https://github.com/jchip/fynjs/commit/2516413e693517aa27d9a9ac35533b39688b4bee)
    -   FPO-49: prepare reports what it actually did instead of always claiming an update and a commit [commit](https://github.com/jchip/fynjs/commit/73d88f750345073846f9069137994b09897a2c95)
    -   FPO-48: implicit-discovery notice tells the truth about a declared packages array and points at autoSearch false [commit](https://github.com/jchip/fynjs/commit/d79469651549f441a7f08dab8dd00f8625b1d4eb)
    -   FPO-46: fall back to a wider git describe when the release tag is off the first-parent line [commit](https://github.com/jchip/fynjs/commit/ef8b5fdaf90f452119265462d31a86de77833535)
    -   FPO-47: resolve package paths against the repo, change detection no longer reports nothing from a subdirectory [commit](https://github.com/jchip/fynjs/commit/6f6cabb07a791465f6b2a89b6bb8e883449c3053)
    -   FPO-45: cascaded version bumps demote to patch, devDependencies never cascade a bump type [commit](https://github.com/jchip/fynjs/commit/d9c10f35185f763b545dfb45edea3e893b88d6fd)
    -   FPO-44: only lockAll builds a repo-wide version lock group, no tag no longer majors every package [commit](https://github.com/jchip/fynjs/commit/16da4b043e7b85085a32a49a5907c3760d6f2e18)
    -   FJM-111: fynpo no longer ships prettier - optional at runtime, config left unformatted when absent [commit](https://github.com/jchip/fynjs/commit/7c3c55b98c34d428103836d9d0b138fc0f90227f)
    -   FJM-111: one prettier range across the repo, fynpo off its pinned prettier 2 with an awaited format [commit](https://github.com/jchip/fynjs/commit/dcfd8fd03107f57c749aa7b8b8185fd626fbf620)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-105: [maj] xsh stays 0.4.6 for fynpo prepare to bump 1.0.0 at release, revert manual range pre-bumps, monorepo-test path dep for unpublished xsh [commit](https://github.com/jchip/fynjs/commit/b824b80798f82fbf5ec8ae46ad0a6d148826630c)
    -   FJM-106: fynpo and create-monorepo dep shelljs 0.10 directly, drop shcmd [commit](https://github.com/jchip/fynjs/commit/18b81932e7ac5451230b6044280fa8baaec9c397)
    -   FJM-105: bump fyn, fynpo, create-monorepo, xarc-run, visual-exec to local xsh ^1.0.0, drop visual-exec xsh ambient types [commit](https://github.com/jchip/fynjs/commit/a6c722b7428b0d8695a08b9acf111ccbbc485d83)
    -   FPO-42: modernize fynpo deps: execa 10, boxen 8, fs-extra 11, get-stdin 10, env-paths 4, slash 5, undici 8, minimatch 10, optional-require 2, drop mkdirp and regenerator-runtime [commit](https://github.com/jchip/fynjs/commit/b6a8eab5a1f01124e3174192e9c494a56561e4ea)
    -   FJM-90: move remaining chalk dependents to ESM chalk 6 [commit](https://github.com/jchip/fynjs/commit/1688fb35223ee3b3585e51f53db150cc763e3234)
    -   FPO-39: attach pkg to a resolved failure so --no-bail names the package [commit](https://github.com/jchip/fynjs/commit/afea5e1cb412065a99021f8f14d4f7d1b3db9aec)
    -   FJM-54: fix recommands typo in fynpo bootstrap message [commit](https://github.com/jchip/fynjs/commit/5def0f5699b9427bca02e7295e8b5173661f1d9c)
    -   FPO-40: drop jest from fynpo tsconfig types [commit](https://github.com/jchip/fynjs/commit/4082d93aec1a7ef5ce42923e3dbcb14ebda10dab)
    -   FJM-64: warn when a workspace package.json is stale in a consumer [commit](https://github.com/jchip/fynjs/commit/dd7d2a8d87a1ec073e5a652c6981225ee8699968)
    -   FPO-36: drop chalker from fynpo, use chalk for its one message [commit](https://github.com/jchip/fynjs/commit/c4aff1dfe2b8c52cc8521c885b7ba2bcdc304294)
    -   FPO-37: honor --scope for bootstrap, local and run [commit](https://github.com/jchip/fynjs/commit/ce11f5cf4413a0b6e42f42b89f4341771da60872)
    -   FPO-35: apply --only/--ignore for all fynpo run dispatch paths [commit](https://github.com/jchip/fynjs/commit/5bd905ea8f7da116bdbba190e4ca6d80196b1a43)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-17: array packages config feeds both discovery filter and publish allow list [commit](https://github.com/jchip/fynjs/commit/382871ab28dd3dd8b80c0ce3c1e413e27336e9cd)
    -   FPO-17: separate package discovery from fynpo publish jurisdiction [commit](https://github.com/jchip/fynjs/commit/04796abae42b12e4ddac6fe3828001eff72576d6)
    -   FPO-1: add tests for bootstrap audit aggregation [commit](https://github.com/jchip/fynjs/commit/f06f945d11e96bb5f565d52de7b1f11cadfa297f)
    -   FPO-31: make bootstrap e2e test assert exit code and linked output [commit](https://github.com/jchip/fynjs/commit/903a606484ec267f8cef306dd9d46954d8010ed0)
    -   FPO-14: isolate mutating fynpo tests from the shared test/sample fixture [commit](https://github.com/jchip/fynjs/commit/babbe605e09d5cf399da11fc552a516ed00b802f)
    -   FPO-32: drop dangling main from fynpo and create-monorepo, both bin-only [commit](https://github.com/jchip/fynjs/commit/26771c9467672fc7b26a14c7dd1c07f54ca89e26)
    -   FPO-34: report packages that actually ran in fynpo run summary [commit](https://github.com/jchip/fynjs/commit/9fc14cc61a1befded6c521ae2227a311bc48c4d1)
    -   FPO-30: merge duplicate fynpo --only option, restoring -o and bootstrap/local/run [commit](https://github.com/jchip/fynjs/commit/72a06e19e2948bf9ab075b406f6a02c36877f726)
    -   FPO-25: drop @xarc/module-dev from all packages, inline docs and drop dead lint/test scripts [commit](https://github.com/jchip/fynjs/commit/87f52f8b508ef2fe4a52435370da3369333849e5)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   FPO-19: rewrite dependency ranges of non-released dependents on selective publish [commit](https://github.com/jchip/fynjs/commit/c8e121f9fef34b1af3196747a9e6744c78b3e086)
    -   FPO-19: apply --only when collating commits so changelog matches the selection [commit](https://github.com/jchip/fynjs/commit/470324c7ca757d4127d234b995d927662f6903f0)
    -   FPO-19: support selective publishing without nullifying other packages commits [commit](https://github.com/jchip/fynjs/commit/d9d58f54b3789c8d42b6a311da435fa24a5baf1b)
    -   FJM-87: convert fynpo bundle to rolldown ESM, fix CJS demos and xrun entry [commit](https://github.com/jchip/fynjs/commit/71bbbe9cd55ff2b6cbecde804c80fdaa0ee97bee)
    -   FJM-87: add rolldown ESM bundle config for fynpo [commit](https://github.com/jchip/fynjs/commit/f1eaf5ba42b7334f177dee70075d345cf462b70f)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/fynpo-cli`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-124: fynpos CI notice goes to stderr, and the launcher test reads the version off the last line [commit](https://github.com/jchip/fynjs/commit/08a3712e3ea616aee866cc083144b03119ab15a2)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: one prettier range across the repo, fynpo off its pinned prettier 2 with an awaited format [commit](https://github.com/jchip/fynjs/commit/dcfd8fd03107f57c749aa7b8b8185fd626fbf620)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-99: fynpo-cli remove dangling main index.js [commit](https://github.com/jchip/fynjs/commit/98225e96ea7eb90fac3d1e8c15e09714703e1b5d)
    -   FJM-96: [maj] fynpo-cli ESM-only launcher with createRequire resolve and dynamic import handoff [commit](https://github.com/jchip/fynjs/commit/e155b3346e8fa970a8ece705a902c6c97d2ee825)
    -   FJM-85: resolve fynpo through its bin field instead of a stale dist path [commit](https://github.com/jchip/fynjs/commit/fb79e3967f8ffcdc4f61ce95f00a0c5171b9df68)
    -   FPO-25: drop @xarc/module-dev from all packages, inline docs and drop dead lint/test scripts [commit](https://github.com/jchip/fynjs/commit/87f52f8b508ef2fe4a52435370da3369333849e5)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   FPO-20: fix CI - run monorepo-test fyn via vite-node, local cli-args, drop xrun from fynpo-cli ci:check [commit](https://github.com/jchip/fynjs/commit/568fb1aa898821abaf70c7240c541563aab2df7c)
    -   FJM-84: fynpo-cli use optional-require 2.x instead of hand-rolled MODULE_NOT_FOUND check [commit](https://github.com/jchip/fynjs/commit/8df507c2ad514d7ee1bad3125cf79c71bd4bc92e)
    -   FJM-69: publish-util pack hooks for visual-exec and xflight, bump fynpo-cli and create-monorepo to ^2.1.0 [commit](https://github.com/jchip/fynjs/commit/3078d85c4c0dd82450a8f706f11745ff1d4c3cbf)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/init-package`

    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-45: move enquirer to dependencies in init-package [commit](https://github.com/jchip/fynjs/commit/d850e95daecf3b3b5ee6d894f639589a1fdf3908)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/item-queue`

    -   Revert FJM-133: refresh tracked fyn-locks - drop stale nix-clap, xarc-run and opfs entries, expand cross-platform optional deps [commit](https://github.com/jchip/fynjs/commit/2efe49a045b0c8429dffd187978242a017074898)
    -   FJM-133: refresh tracked fyn-locks - drop stale nix-clap, xarc-run and opfs entries, expand cross-platform optional deps [commit](https://github.com/jchip/fynjs/commit/2f5aec85cbc8ee53a572ac7be8f41c643378ef3c)
    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FPM-63: lock churn from installs - item-queue platform-optional entries dropped again, fyn lock adjusted [commit](https://github.com/jchip/fynjs/commit/84413881e9dba32f103ad53ebf672183f3045594)
    -   FPM-63: restore item-queue lock platform-optional entries dropped by an install [commit](https://github.com/jchip/fynjs/commit/9c253b3ad1c3f1e3e714eb1414bb6813b160095e)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-101: remove unpatched _w/xsh mirror, resolve xsh from registry [commit](https://github.com/jchip/fynjs/commit/bf47c754860130ef0d6ed4a26afcee7763e26ea8)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/optional-import`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   OPI-2: existence-check path and file URL specifiers so an absent file is notFound, not a fail [commit](https://github.com/jchip/fynjs/commit/73f1a6b0f2abc431aa02b19425d81ad488622e9d)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   [Publish][Selective] [commit](https://github.com/jchip/fynjs/commit/b8f6b3be337f3b4a0c5e199ead9a674d8b879453)

-   `packages/pacote-jchip`

    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)

-   `packages/pkg-preper`

    -   Revert FJM-133: refresh tracked fyn-locks - drop stale nix-clap, xarc-run and opfs entries, expand cross-platform optional deps [commit](https://github.com/jchip/fynjs/commit/2efe49a045b0c8429dffd187978242a017074898)
    -   FJM-133: refresh tracked fyn-locks - drop stale nix-clap, xarc-run and opfs entries, expand cross-platform optional deps [commit](https://github.com/jchip/fynjs/commit/2f5aec85cbc8ee53a572ac7be8f41c643378ef3c)
    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-126: drop opfs - fyns file-ops is built on fs.promises, pkg-preper and create-monorepo use node fs directly [commit](https://github.com/jchip/fynjs/commit/fc8d983f3b16c31d0fc45fff6c520ccb2547db73)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-95: pkg-preper tar 7, npm-packlist 11 arborist-tree stub, cacache 21, stream/promises pipeline replaces mississippi [commit](https://github.com/jchip/fynjs/commit/f46f524a7213101f801130c92ea8dafa2e352d70)
    -   FJM-63: ESM-only build for pkg-preper and visual-exec [min] [commit](https://github.com/jchip/fynjs/commit/12fcb8a99d197e800261a94aaa922c5001a12d6a)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/publish-util`

    -   FPO-55: fynpo publish sets FYNPO_PUBLISH so a packages hand-publish guard accepts it [commit](https://github.com/jchip/fynjs/commit/abf38c4fb78d8fe61a6f9a0f424327ce895fb742)
    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-92: bump drop-in stale deps: ci-info 4, is-installed-globally 1, has-ansi 6, strip-ansi 7, log-update 8, which 7, find-up 8 [commit](https://github.com/jchip/fynjs/commit/b791be2c98272a80b91ebd60165efa6576234a92)
    -   FJM-68: cover peerDependenciesMeta retention in prepack spec [commit](https://github.com/jchip/fynjs/commit/d513476e08c706a07ee8e95a04f1b4787f95a7d3)
    -   FJM-68: keep sideEffects, typesVersions, typings, libc, unpkg, jsdelivr in published package.json [commit](https://github.com/jchip/fynjs/commit/0669aff62ebce1cb6be015407baf475bca870e7d)
    -   FJM-67: fix publish-util bin imports for dist-esm to dist rename [commit](https://github.com/jchip/fynjs/commit/daffa22a4b33891e42047d212a97c943ca62deb8)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/run-verify`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/string-array`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/unwrap-npm-cmd`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-92: bump drop-in stale deps: ci-info 4, is-installed-globally 1, has-ansi 6, strip-ansi 7, log-update 8, which 7, find-up 8 [commit](https://github.com/jchip/fynjs/commit/b791be2c98272a80b91ebd60165efa6576234a92)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/visual-exec`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-123: visual-exec waits for the output file to close before execute resolves [commit](https://github.com/jchip/fynjs/commit/01ec8f7f39ad51c5b7cdfa3f185185778cad1fd1)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-105: [maj] xsh stays 0.4.6 for fynpo prepare to bump 1.0.0 at release, revert manual range pre-bumps, monorepo-test path dep for unpublished xsh [commit](https://github.com/jchip/fynjs/commit/b824b80798f82fbf5ec8ae46ad0a6d148826630c)
    -   FJM-105: bump fyn, fynpo, create-monorepo, xarc-run, visual-exec to local xsh ^1.0.0, drop visual-exec xsh ambient types [commit](https://github.com/jchip/fynjs/commit/a6c722b7428b0d8695a08b9acf111ccbbc485d83)
    -   FJM-92: bump drop-in stale deps: ci-info 4, is-installed-globally 1, has-ansi 6, strip-ansi 7, log-update 8, which 7, find-up 8 [commit](https://github.com/jchip/fynjs/commit/b791be2c98272a80b91ebd60165efa6576234a92)
    -   FJM-90: move remaining chalk dependents to ESM chalk 6 [commit](https://github.com/jchip/fynjs/commit/1688fb35223ee3b3585e51f53db150cc763e3234)
    -   FJM-69: publish-util pack hooks for visual-exec and xflight, bump fynpo-cli and create-monorepo to ^2.1.0 [commit](https://github.com/jchip/fynjs/commit/3078d85c4c0dd82450a8f706f11745ff1d4c3cbf)
    -   FJM-63: ESM-only build for pkg-preper and visual-exec [min] [commit](https://github.com/jchip/fynjs/commit/12fcb8a99d197e800261a94aaa922c5001a12d6a)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/visual-logger`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-92: bump drop-in stale deps: ci-info 4, is-installed-globally 1, has-ansi 6, strip-ansi 7, log-update 8, which 7, find-up 8 [commit](https://github.com/jchip/fynjs/commit/b791be2c98272a80b91ebd60165efa6576234a92)
    -   FJM-90: move remaining chalk dependents to ESM chalk 6 [commit](https://github.com/jchip/fynjs/commit/1688fb35223ee3b3585e51f53db150cc763e3234)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/xaa`

    -   FJM-134: drop docs generation from prepublishOnly in xaa and cli-args [commit](https://github.com/jchip/fynjs/commit/e1a8c00c2cd7db4bff0d48d3791362d14809f16d)
    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-122: xsh, chalker, xaa and aveazul stop devDepending on @fynjs/run, removing every dependency cycle [commit](https://github.com/jchip/fynjs/commit/0793c2f9b8db33deb09622c316fa5b955d1fc0db)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-113: xaa delay assertions allow for Date.now ms truncation [commit](https://github.com/jchip/fynjs/commit/fccd5bc4067e0a895f4552af9c77fb2deff267be)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   FJM-80: xaa ESM-only build, drop dual CJS output and ts2mjs [maj] [commit](https://github.com/jchip/fynjs/commit/3f886364e16f4d838988fbae0b58a60aba14fbda)
    -   FJM-72: point xaa repository at fynjs [commit](https://github.com/jchip/fynjs/commit/c2e90ce64796566b386ac1bb8bcaf283e7b7cb9e)
    -   2.0.0 [commit](https://github.com/jchip/fynjs/commit/d873c514d09cdf4e9d619445ab9d1e5e67e33994)
    -   convert to vitest, dual CJS/ESM exports, add demos [commit](https://github.com/jchip/fynjs/commit/baf52f9e85b4e79029af7e5ad1de45582bdff833)
    -   docs [commit](https://github.com/jchip/fynjs/commit/14499819fae7008d90044b0cd2e6cc6597598a72)
    -   chore: formatting and docs [commit](https://github.com/jchip/fynjs/commit/c6c6d30196bd771d1554da78ba1b7e6177c23482)
    -   1.8.0 [commit](https://github.com/jchip/fynjs/commit/b222728c259e1a54130674770ade656707f0c682)
    -   docs [commit](https://github.com/jchip/fynjs/commit/7b6b134083cc7f62a1298f2c807b122a124026f3)
    -   isPromise check for function types [commit](https://github.com/jchip/fynjs/commit/6e55ea5d2007e72141ae5ca7b3c7d631d8c3dd2f)
    -   handle iterator [commit](https://github.com/jchip/fynjs/commit/d16f1d690e85818e87556342db7bd4bc5972fbf7)
    -   update ci [commit](https://github.com/jchip/fynjs/commit/f49a07a3c2c6e45989cc3592c4730c78ad6645b5)
    -   take in custom TimeoutError and Promise [commit](https://github.com/jchip/fynjs/commit/eaa8598a9803f7df56f97a4c465a1eb689760f5d)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/69b6714bc156e8544fc28f52572d8426606a9585)
    -   1.7.3 [commit](https://github.com/jchip/fynjs/commit/4bb5586fc232ac6d6c72ca41ae1c460927c29b08)
    -   backfill Awaited type for typescript below 4.5 [commit](https://github.com/jchip/fynjs/commit/b54538f96fd68be6b9a4aab5a773435d7d2431f0)
    -   1.7.2 [commit](https://github.com/jchip/fynjs/commit/7ed883086583317d0ac1ae7abb3522edfcf8f313)
    -   add test [commit](https://github.com/jchip/fynjs/commit/13a2d873b795490db2ababa9a26431fe62a7d814)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/01988ddf741d0f865a14be5cac923b964aa624ca)
    -   minor fixes and relaxing types a bit [commit](https://github.com/jchip/fynjs/commit/f11ec71d8cc013c2125e8336cd097fb349ddfbf0)
    -   1.7.1 [commit](https://github.com/jchip/fynjs/commit/e888098ef2c4e311edcdc5597985519146c1045e)
    -   update readme [commit](https://github.com/jchip/fynjs/commit/73635203f19af344687b052c7826543e8c556bf5)
    -   update autogen docs [commit](https://github.com/jchip/fynjs/commit/7cb1403f05f5b9daf3678a0a3bfbba50ff98c711)
    -   1.7.0 [commit](https://github.com/jchip/fynjs/commit/eb778333cd469b2336ffcf962870bbe5342fedaa)
    -   update comments [commit](https://github.com/jchip/fynjs/commit/0a278c97cbf7502451dd2295fd459e2f220cf286)
    -   update module-dev [commit](https://github.com/jchip/fynjs/commit/08a4c49eb8d969dbd43cb5e0dedc69d992b8ffef)
    -   map resolve promise items [commit](https://github.com/jchip/fynjs/commit/01b977efcd939dd7dae6b53ab6af287244aa7074)
    -   1.6.2 [commit](https://github.com/jchip/fynjs/commit/15212208d6eab5e6c337638ca23f733c2bebda79)
    -   update generated docs [commit](https://github.com/jchip/fynjs/commit/eb212c7af69f1b22d3464f39b410d4bd5936f29b)
    -   update try optional param [commit](https://github.com/jchip/fynjs/commit/be59b0d34cf7b24936f9b02c76f7d3db19a61cf1)
    -   1.6.1 [commit](https://github.com/jchip/fynjs/commit/6e6e89d2602c68ac0d6b0180be96f45b12c91e0e)
    -   generate docs [commit](https://github.com/jchip/fynjs/commit/8e8fb4ebf8b48a0c952f29b693050d6c0865fe5e)
    -   fix lint [commit](https://github.com/jchip/fynjs/commit/704829f9f23b26b55733b4141059976ea2623623)
    -   dep: @xarc/module-dev@3 [commit](https://github.com/jchip/fynjs/commit/1714514807c5268adfe0a4081276e645430e88fa)
    -   1.6.0 [commit](https://github.com/jchip/fynjs/commit/a6eef22682e14f66b0ad61804e3f5a01101957d4)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/724bb38147c29a09795433e0334955f3ac6b27d5)
    -   add assertNoFailure to MapContext [commit](https://github.com/jchip/fynjs/commit/ad0fa5f3e6f712af12fadf08f571d7519ec5fa62)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/074140bde995afc66e3cd7bf973456cc03af496e)
    -   1.5.0 [commit](https://github.com/jchip/fynjs/commit/c46fb5993c9ea9c8622c9f9c002fd655bf230d25)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/2ede1965627a4c520f1c3a2adaa1fe67a87f2d1a)
    -   Create nodejs.yml [commit](https://github.com/jchip/fynjs/commit/7147864c8080d9b66e4a50d5495c7b502a345228)
    -   add homepage [commit](https://github.com/jchip/fynjs/commit/fb0cedcae8a9a9493c7e5abc7253bbf17581ad9b)
    -   forgot to add this change in ([#3](https://github.com/jchip/fynjs/pull/3)) [commit](https://github.com/jchip/fynjs/commit/9675306966d4c1672d8f875b0976e914153e3514)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/73cddc94f1203f01a64ee2162a9296b56461095e)
    -   udpate typedoc comments [commit](https://github.com/jchip/fynjs/commit/8308b3fef58f89e5e99bd9741642758e9c6aeb1c)
    -   module-dev update [commit](https://github.com/jchip/fynjs/commit/c1f91844db2202d0889a40db6fea5120981fc88c)
    -   prettier 2 [commit](https://github.com/jchip/fynjs/commit/811ce26771d9d2d7a00d0c365f162aca7fc9e55b)
    -   fix TS types ([#2](https://github.com/jchip/fynjs/pull/2)) [commit](https://github.com/jchip/fynjs/commit/87eddf8f82c54dc734922e208171adba170b8506)
    -   update docs after publish [commit](https://github.com/jchip/fynjs/commit/7cf4966fae6681e72956f5017ddf6465183a95ea)
    -   1.4.0 [commit](https://github.com/jchip/fynjs/commit/c2b6af057089d4ab314e1cc21dcbdb8535923297)
    -   allow map callback to observe failure in concucrent ops ([#1](https://github.com/jchip/fynjs/pull/1)) [commit](https://github.com/jchip/fynjs/commit/8fb4af2c1519fce338d67fd3ed0dacd4b33d6cfc)
    -   1.3.1 [commit](https://github.com/jchip/fynjs/commit/5eefaaedf337b917e5254190b6d7c019f1d8010d)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/909dea1db5cabc3705cee46ce3276c85e366b549)
    -   add types to package.json [commit](https://github.com/jchip/fynjs/commit/8706bba05fcf7e7f940cd9e93c72955f94596873)
    -   1.3.0 [commit](https://github.com/jchip/fynjs/commit/7e3b1582715c1934f5b42cd1bd091b168327ef95)
    -   typescript [commit](https://github.com/jchip/fynjs/commit/452b8a36af59f8431d0fc5e5b7c4dad75c331b2f)
    -   change dep to @xarc/module-dev [commit](https://github.com/jchip/fynjs/commit/070d8c125e182fb9cd38fd2173a74e99486627b5)
    -   1.2.2 [commit](https://github.com/jchip/fynjs/commit/5ebf11f4243bf9a98324f8c37c82473bc8216d5b)
    -   fix async behavior and done callback args [commit](https://github.com/jchip/fynjs/commit/095db137f6962756b4c9fa020f495be154141b83)
    -   update test [commit](https://github.com/jchip/fynjs/commit/ca2480c377c03eec287442cad3cda351dc447ca9)
    -   1.2.1 [commit](https://github.com/jchip/fynjs/commit/caa0605224f72dfae19f5665b4e30fad0411e243)
    -   avoid referencing null/undefined [commit](https://github.com/jchip/fynjs/commit/c91c148bd12779cb882997ca74aa2a994ab8575c)
    -   1.2.0 [commit](https://github.com/jchip/fynjs/commit/642e3292c69ef609f7b83cf8e2d69f75db699f9f)
    -   add defer.done [commit](https://github.com/jchip/fynjs/commit/43753df355344ffcb840e322a066af4464d732b5)
    -   1.1.5 [commit](https://github.com/jchip/fynjs/commit/0662de8d8c306c347c1d915691bc2ce8732bd28d)
    -   avoid rejecting multiple times [commit](https://github.com/jchip/fynjs/commit/9653d618699c6dc6144f70d097747a5a0fa66919)
    -   1.1.4 [commit](https://github.com/jchip/fynjs/commit/b69fb441d90004ed344bd7118b8cc636a3175737)
    -   handle empty array in map [commit](https://github.com/jchip/fynjs/commit/45539fb921b9b8cfe6cd2cb91f78bf40c12d2bbe)
    -   1.1.3 [commit](https://github.com/jchip/fynjs/commit/c92107c1cd327fe32721932fcfc408175b56c867)
    -   refactor test [commit](https://github.com/jchip/fynjs/commit/dbc7069c1fa7c9eb2e4c85a7c4eb330b2d84c6a0)
    -   refactor multiMap [commit](https://github.com/jchip/fynjs/commit/b3f5acacff840a3cf951c0b95fdbb37c34cbea81)
    -   update test to ensure cancel is called [commit](https://github.com/jchip/fynjs/commit/950ae71a07cda63f0fdf9ee006aba61ff3705332)
    -   1.1.2 [commit](https://github.com/jchip/fynjs/commit/0e5d7ee3521894e3376cf1fd88d8017c289f2a7b)
    -   cancel for timeout [commit](https://github.com/jchip/fynjs/commit/41da86356b12b6bbcbed68d436a5c721bf11a874)
    -   1.1.1 [commit](https://github.com/jchip/fynjs/commit/37e97880dc9e0ea2c021b256fd86a778fe3da712)
    -   use hasOwnProperty to check timeout resolved result [commit](https://github.com/jchip/fynjs/commit/b362cda7b45af6142118a73034fcffff50949ad3)
    -   use defer [commit](https://github.com/jchip/fynjs/commit/f45ee7b5bd30c84e86bc6002ba70ceaff08a2d7c)
    -   1.1.0 [commit](https://github.com/jchip/fynjs/commit/4a9ee456030f5f81ccbf3659eeca5d6d076a8e59)
    -   defer and timeout [commit](https://github.com/jchip/fynjs/commit/67327164455ad74f0f3ced2ed1fbd8263b3aac2e)
    -   fix typo [commit](https://github.com/jchip/fynjs/commit/11ae3f0459d1feec68c50899268670954a6e61dc)
    -   tests [commit](https://github.com/jchip/fynjs/commit/345cec332dc3b1d62e9019b3371e2447023a670c)
    -   1.0.2 [commit](https://github.com/jchip/fynjs/commit/5ac96f1358c56eb6d08d4ff44c0cdc5ae91680d9)
    -   wrap [commit](https://github.com/jchip/fynjs/commit/04ab6f7402ee406f1680cef81ca533a4c71c173d)
    -   add npm script [commit](https://github.com/jchip/fynjs/commit/3f9ce44f7c3a2a9efe8acd157549f0795ec80122)
    -   1.0.1 [commit](https://github.com/jchip/fynjs/commit/b7c5034d3a1a5e380147f10a38a149a691f3bd2c)
    -   update map to use full concurrency slots [commit](https://github.com/jchip/fynjs/commit/0109f4823be7f9ec9ad542154757731d2a60f9b0)
    -   Create .travis.yml [commit](https://github.com/jchip/fynjs/commit/43d286dc24d3d8858ae5f4445aa9a66e6c9aaa8f)
    -   1.0.0 [commit](https://github.com/jchip/fynjs/commit/bbc434029e1d3ec3440ddb8303976084b1ac21ba)
    -   first commit [commit](https://github.com/jchip/fynjs/commit/7caf9d55a36237de289f15ebbbb1478d086cf8b9)

-   `packages/xenv-config`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FPO-26: remove all eslint remnants - configs, deps, scripts and inline comments [commit](https://github.com/jchip/fynjs/commit/f439aa491a039199bab6e6cc3baa3b2c2545d260)
    -   FJM-78: modernize xenv-config to ESM-only TypeScript [maj] [commit](https://github.com/jchip/fynjs/commit/4792cb8f230b091a67bdb1fe583af25e8689c8c8)
    -   FJM-77: modernize xenv-config test harness to vitest and add publish-util pack hooks [commit](https://github.com/jchip/fynjs/commit/7be3b9159829b1ffad40b2a4882b4c466e0a6b02)
    -   1.3.1 [commit](https://github.com/jchip/fynjs/commit/3b1e7c8877d894ae43254717e101d85ecc6adc8f)
    -   add envMap option to map env value to another value [commit](https://github.com/jchip/fynjs/commit/6ac9a3a55ddc3559228d92ed0765e0cd2e39e47d)
    -   update electrode-archetype-njs-module-dev to v3 [commit](https://github.com/jchip/fynjs/commit/6b74bc04825db9004e3b311e06493a8846c36dff)
    -   1.3.0 [commit](https://github.com/jchip/fynjs/commit/80f7d53b6bc9ae9cdf3b56985fe5f96c7837fbdf)
    -   add node 10 to CI [commit](https://github.com/jchip/fynjs/commit/c30938267ce3fe44ff8d03575576f2fb409145ae)
    -   add support for json type [commit](https://github.com/jchip/fynjs/commit/84830683e22f724ea65038ecb55c26c5679df534)
    -   1.2.3 [commit](https://github.com/jchip/fynjs/commit/df416e6848a33aed166dccea84f172e315551257)
    -   clean up getting default value [commit](https://github.com/jchip/fynjs/commit/4044f0bbba71d46fb37c62e44a538de8db2aa56e)
    -   add test to ensure default cb is not call if env exist [commit](https://github.com/jchip/fynjs/commit/9159d2a2c876206d002777d3ce0cb2aa61ac6c55)
    -   1.2.2 [commit](https://github.com/jchip/fynjs/commit/ea7a3e40f5b985db6e2a412df91e55ce1f3d7069)
    -   update .npmignore [commit](https://github.com/jchip/fynjs/commit/4ebf81825336bf949dadfe7ceb0d538599995d73)
    -   support default as a function [commit](https://github.com/jchip/fynjs/commit/3025bda9d010c617de2571a8aa4aa7be57cbdb3e)
    -   1.2.1 [commit](https://github.com/jchip/fynjs/commit/b165a500707106812bcf2b9bb3a3905248e0128f)
    -   refactor to support sources [commit](https://github.com/jchip/fynjs/commit/2f859528be2c799e9d731edfb3f7eeda634b51bb)
    -   remove xclap-cli dep [commit](https://github.com/jchip/fynjs/commit/e8d50566cae9ffb7941d96053ea2d354d2701efc)
    -   1.2.0 [commit](https://github.com/jchip/fynjs/commit/60b3a1db9ba617c8c2027b90f0230175c918264f)
    -   add a post callback for extra processing [commit](https://github.com/jchip/fynjs/commit/256e58dc8978479703fa2c5aaa6b35fb1d93f128)
    -   1.1.2 [commit](https://github.com/jchip/fynjs/commit/a3fbcda749171b9ff1fc882c56082bb4b3b47b32)
    -   allow env as true to use option key as env var name [commit](https://github.com/jchip/fynjs/commit/f773380f1f42f282dddbf01c06b1ceecc312b533)
    -   add test case [commit](https://github.com/jchip/fynjs/commit/68e55d279ab635c6ddb77a9b7f6dc1032c8c14db)
    -   1.0.1 [commit](https://github.com/jchip/fynjs/commit/2886d0a715795a07c05bd8ad9d3cdca030cb7de4)
    -   first commit [commit](https://github.com/jchip/fynjs/commit/7a49da501d3b664989eee0d9e408d87911671554)
    -   Initial commit [commit](https://github.com/jchip/fynjs/commit/c01fe8034c360414599de6353493616a80fd8b42)

-   `packages/xflight`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-125: xflight timing assertions no longer race the clock they measure [commit](https://github.com/jchip/fynjs/commit/4637d6cf796d916c51995b734d4efaa60ed18af4)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-110: give 23 packages a ci:check so the repo-wide gate covers 29 instead of 6 [commit](https://github.com/jchip/fynjs/commit/2d89219736ac22fd9037e3acc6fb68c76c1a42cd)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FPO-21: wire monorepo to local @fynjs/run at 0.0.1, fix xrun ESM chalker break [commit](https://github.com/jchip/fynjs/commit/93171e879ddc0f32fec88e7fd19fb69a6340f9ef)
    -   FJM-69: publish-util pack hooks for visual-exec and xflight, bump fynpo-cli and create-monorepo to ^2.1.0 [commit](https://github.com/jchip/fynjs/commit/3078d85c4c0dd82450a8f706f11745ff1d4c3cbf)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)

-   `packages/xsh`

    -   FJM-127: release metadata sweep - bugs/homepage/repository.directory/keywords, LICENSE for 9 packages, dead badges, and real READMEs for 6 [commit](https://github.com/jchip/fynjs/commit/ebf4fb54da6b47c61aa49488fe7dc1040e98ba46)
    -   FJM-122: xsh, chalker, xaa and aveazul stop devDepending on @fynjs/run, removing every dependency cycle [commit](https://github.com/jchip/fynjs/commit/0793c2f9b8db33deb09622c316fa5b955d1fc0db)
    -   FJM-121: xsh ci:check stops rebuilding dist, which raced every concurrent xrun startup [commit](https://github.com/jchip/fynjs/commit/f14def015a56a240a3f9de5266194a896dcb35f0)
    -   FJM-120: skipLibCheck in every package tsconfig, so a dependencys types cannot break our builds [commit](https://github.com/jchip/fynjs/commit/5de314eaf9509ca3a0884dd1897483ea2e0f24c9)
    -   FJM-111: vitest v4 across all packages, xarc-run onto local xaa 2.0.0, npm-packlist off git URL onto local fork with call sites on the v10 tree API, drop stale noFynLocal and webpack configs [commit](https://github.com/jchip/fynjs/commit/fd25806593c7269044aaeff1e07d58ed34c20a01)
    -   FJM-109: xsh exec dispatch args on typeof instead of constructor.name [commit](https://github.com/jchip/fynjs/commit/b356046f9e139ab3fcb82051ac3a0c80e6d05f47)
    -   FJM-108: xsh escape cwd before RegExp construction, replacing escBs with escapeRegExp [commit](https://github.com/jchip/fynjs/commit/7350cbd0c870666f7acabc52a021931b2e0807e8)
    -   FJM-107: dep coherence sweep - drop tslib from 18 pkgs with importHelpers off, add missing fyn ssri, prune dead webpack/babel devDeps, align @types/node and xsh/chalker/typedoc ranges, xsh test bluebird to aveazul [commit](https://github.com/jchip/fynjs/commit/829604013916b40b6d5d2452c269426499d31332)
    -   FJM-105: [maj] xsh stays 0.4.6 for fynpo prepare to bump 1.0.0 at release, revert manual range pre-bumps, monorepo-test path dep for unpublished xsh [commit](https://github.com/jchip/fynjs/commit/b824b80798f82fbf5ec8ae46ad0a6d148826630c)
    -   FJM-104: put promise-form exec overload first so untyped args resolve to ExecResult [commit](https://github.com/jchip/fynjs/commit/ab1e6463323747f41a15f24417eb0ace4f33545d)
    -   FJM-104: exec overloads so promise form types as ExecResult, callback form as ChildProcess [commit](https://github.com/jchip/fynjs/commit/60da842902c46ceef5ba82d9022135c1448a8c0a)
    -   FJM-104: modernize xsh to TypeScript ESM with vitest, v1.0.0, require(esm) compatible via module.exports export [commit](https://github.com/jchip/fynjs/commit/f19f6b7d299f7a55628025d79abf3f75dbd6457c)
    -   FJM-103: xsh dep on shelljs 0.10 directly, retire shcmd fork [commit](https://github.com/jchip/fynjs/commit/e514dbfbda56a051478cf2f3255431fe6edf5397)
    -   FJM-71: adapt xsh for monorepo: engines node >=22.12, fynjs repository, modern mocha/chai devDeps, drop travis [commit](https://github.com/jchip/fynjs/commit/7120c67d358a4ae836e172b08387c2f8ec0dcc2e)

-   `.github`

    -   FPO-23: clone _w/* jchip forks in CI so it tests the same npm-packlist dev links [commit](https://github.com/jchip/fynjs/commit/c07b716aa5ef9b2c0c8090c0e8a77fee85d51c24)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)

-   `docusaurus`

    -   FPO-45: cascaded version bumps demote to patch, devDependencies never cascade a bump type [commit](https://github.com/jchip/fynjs/commit/d9c10f35185f763b545dfb45edea3e893b88d6fd)

-   `lib`

    -   fix: addToFront should always deduplicate PATH entries [commit](https://github.com/jchip/fynjs/commit/c8dccd664744b7cf2615b2eaade80b495dbbcc45)
    -   exec take options at end and update README about it [commit](https://github.com/jchip/fynjs/commit/5dc3d074f9b12eb1fd075a0c713fe8f2b6063d95)
    -   update to be windows compatible [commit](https://github.com/jchip/fynjs/commit/9e2ed3bb7d24957eb7ac2c4e8c9a2a425a71ec8a)
    -   add then and catch wrapper [commit](https://github.com/jchip/fynjs/commit/618f430549ef1ef0f26ddb81f1efd0d1bf5947b8)
    -   [major] exec returns child [commit](https://github.com/jchip/fynjs/commit/f76a2b44d31c1dc9b3656771cea860db318d380d)
    -   take user options in exec [commit](https://github.com/jchip/fynjs/commit/c9519cd97a78df4572bd5543e72fadab9ead9d6a)
    -   env-path support modifying user data [commit](https://github.com/jchip/fynjs/commit/c42550403e8c5df5280a4c678e309a9af9aeb04d)
    -   fix on windows [commit](https://github.com/jchip/fynjs/commit/0a2ba68f0895f8aa46c58ab94337ad48b9271871)
    -   add env.get methods [commit](https://github.com/jchip/fynjs/commit/72b1c8ec639182232b8f98dcafe4fbad6808d45b)
    -   cwd remove can remove leading / [commit](https://github.com/jchip/fynjs/commit/e0543e657763d3391b791138de9d199956b1e42b)
    -   fix nm replace [commit](https://github.com/jchip/fynjs/commit/eda6aeb35e0af1184720ec98250922f982ab0b9e)
    -   clearer exec error message [commit](https://github.com/jchip/fynjs/commit/d01ee695bad8a32bd8bab46da5b38332f972404c)
    -   remove/replace CWD and node_modules in paths [commit](https://github.com/jchip/fynjs/commit/c0e6c0a5fa079c958d31e55c9c80200eda44d6f2)
    -   first commit [commit](https://github.com/jchip/fynjs/commit/dc07de5ba502492329e4f32d61b5182d5fab6bfa)

-   `notes`

    -   FJM-64: warn when a workspace package.json is stale in a consumer [commit](https://github.com/jchip/fynjs/commit/dd7d2a8d87a1ec073e5a652c6981225ee8699968)
    -   FPO-17: record bootstrap scope decision in notes [commit](https://github.com/jchip/fynjs/commit/8bf346fe2ba6a7499d54f1fbf54f7c8b064be118)
    -   FPO-17: array packages config feeds both discovery filter and publish allow list [commit](https://github.com/jchip/fynjs/commit/382871ab28dd3dd8b80c0ce3c1e413e27336e9cd)
    -   FPO-17: separate package discovery from fynpo publish jurisdiction [commit](https://github.com/jchip/fynjs/commit/04796abae42b12e4ddac6fe3828001eff72576d6)
    -   FJM-63: dual-mode-template ESM-only reference implementation [min] [commit](https://github.com/jchip/fynjs/commit/2df56e64e670c0d9ef11dea7f77303c3620e5369)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)

-   `test`

    -   fix: addToFront should always deduplicate PATH entries [commit](https://github.com/jchip/fynjs/commit/c8dccd664744b7cf2615b2eaade80b495dbbcc45)
    -   exec take options at end and update README about it [commit](https://github.com/jchip/fynjs/commit/5dc3d074f9b12eb1fd075a0c713fe8f2b6063d95)
    -   update to be windows compatible [commit](https://github.com/jchip/fynjs/commit/9e2ed3bb7d24957eb7ac2c4e8c9a2a425a71ec8a)
    -   add tests [commit](https://github.com/jchip/fynjs/commit/e4890ee195699f1ed97556a566d4284f13723f2f)
    -   add then and catch wrapper [commit](https://github.com/jchip/fynjs/commit/618f430549ef1ef0f26ddb81f1efd0d1bf5947b8)
    -   [major] exec returns child [commit](https://github.com/jchip/fynjs/commit/f76a2b44d31c1dc9b3656771cea860db318d380d)
    -   take user options in exec [commit](https://github.com/jchip/fynjs/commit/c9519cd97a78df4572bd5543e72fadab9ead9d6a)
    -   env-path support modifying user data [commit](https://github.com/jchip/fynjs/commit/c42550403e8c5df5280a4c678e309a9af9aeb04d)
    -   fix on windows [commit](https://github.com/jchip/fynjs/commit/0a2ba68f0895f8aa46c58ab94337ad48b9271871)
    -   add env.get methods [commit](https://github.com/jchip/fynjs/commit/72b1c8ec639182232b8f98dcafe4fbad6808d45b)
    -   cwd remove can remove leading / [commit](https://github.com/jchip/fynjs/commit/e0543e657763d3391b791138de9d199956b1e42b)
    -   fix nm replace [commit](https://github.com/jchip/fynjs/commit/eda6aeb35e0af1184720ec98250922f982ab0b9e)
    -   remove/replace CWD and node_modules in paths [commit](https://github.com/jchip/fynjs/commit/c0e6c0a5fa079c958d31e55c9c80200eda44d6f2)
    -   first commit [commit](https://github.com/jchip/fynjs/commit/dc07de5ba502492329e4f32d61b5182d5fab6bfa)

-   `testing`

    -   FJM-105: [maj] xsh stays 0.4.6 for fynpo prepare to bump 1.0.0 at release, revert manual range pre-bumps, monorepo-test path dep for unpublished xsh [commit](https://github.com/jchip/fynjs/commit/b824b80798f82fbf5ec8ae46ad0a6d148826630c)
    -   FPO-20: fix CI - run monorepo-test fyn via vite-node, local cli-args, drop xrun from fynpo-cli ci:check [commit](https://github.com/jchip/fynjs/commit/568fb1aa898821abaf70c7240c541563aab2df7c)

-   `MISC`

    -   FJM-72: update fynpo indirect dep data after migrated package installs [commit](https://github.com/jchip/fynjs/commit/1be52bbf4aa97f7e57ab2f5f3a2e27a5a81c20a9)
    -   FJM-59: exclude vendored _w clones from the monorepo test run [commit](https://github.com/jchip/fynjs/commit/fbbcefd99a986ca3f3766196b153508cf601bd00)
    -   FPO-19: drop root prepublishOnly release gate - ci:check already runs the same test [commit](https://github.com/jchip/fynjs/commit/fff2ef95aaafa471415316d5ed4df4886a74c732)
    -   FJM-87: add node engines baseline to monorepo root package.json [commit](https://github.com/jchip/fynjs/commit/ec10c0ce800568a6c4628d8bf0819e5e5ac83b0e)
    -   0.4.6 [commit](https://github.com/jchip/fynjs/commit/b0b504dd190708e69874a1ffecf6dccdc9d1ce48)
    -   0.4.5 [commit](https://github.com/jchip/fynjs/commit/b267f65aa981c2893a558027854c286bf126b801)
    -   shcmd@0.8.4 [commit](https://github.com/jchip/fynjs/commit/547f5e5878928157a13cb113928e485030c89f38)
    -   0.4.4 [commit](https://github.com/jchip/fynjs/commit/cc947e246efb5804f7549b5f1bfda26b40dc736e)
    -   use files in package.json over .npmignore [commit](https://github.com/jchip/fynjs/commit/93aeeaf317256bacc26b26051728941b57f7ae67)
    -   0.4.3 [commit](https://github.com/jchip/fynjs/commit/5c4180ef49a2e29659374af31b52021eef3c634e)
    -   0.4.2 [commit](https://github.com/jchip/fynjs/commit/3e6b9a71d409aab14c0c28c7c6c83c5446306bbc)
    -   0.4.0 [commit](https://github.com/jchip/fynjs/commit/20503c8a2eff90a0fb91f6150ba97f8c4b217def)
    -   0.3.7 [commit](https://github.com/jchip/fynjs/commit/295cc3b59c91de79e148fd0692171806a27791ab)
    -   0.3.6 [commit](https://github.com/jchip/fynjs/commit/b4af12c6affb416f3f710a1e375056459742f269)
    -   0.3.3 [commit](https://github.com/jchip/fynjs/commit/c41c210488cd31ddc8c8c38e96c175bb7edd3f9c)
    -   0.3.2 [commit](https://github.com/jchip/fynjs/commit/f449b5dcd6379e7c4c26dc911fb1a74a557f18ce)
    -   0.3.1 [commit](https://github.com/jchip/fynjs/commit/c62bd7a33e19ef9d5fb00d7dfd49f75be2f71153)
    -   0.3.0 [commit](https://github.com/jchip/fynjs/commit/552b74d0c56209dfe7a98b3e409042bb65f82b16)
    -   0.2.0 [commit](https://github.com/jchip/fynjs/commit/e007a6f470b4ef8823408e5ffacdfb3acf5254fe)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/1df3a2ab15abc6408fb3e94a160afad656223c72)
    -   update CI [commit](https://github.com/jchip/fynjs/commit/2b809e5296dd188113c993f19a18ec968f4e6abe)
    -   add more info for exec to README [commit](https://github.com/jchip/fynjs/commit/7794b149d5e7dc2a7d0b0d489852afd9c29c2f55)
    -   update README [commit](https://github.com/jchip/fynjs/commit/e7880d24ffd3be4474e19fa965513f35da429964)
    -   add badges [commit](https://github.com/jchip/fynjs/commit/ecab915b551e2d48f7f01b66d5aa3af7e1d90267)
    -   Initial commit [commit](https://github.com/jchip/fynjs/commit/4055856917d859fdaeb867749424bfa5ab7b313c)

# 8/29/2026

## Packages

-   `optional-import@1.0.0` `(0.0.1 => 1.0.0)`

## Commits

-   `packages/optional-import`

    -   OPI-1: start optional-import at 0.0.1 for its first publish [maj] [commit](https://github.com/jchip/fynjs/commit/8898d22ab663f4be2afc800ae96d0a37ac046c36)
    -   OPI-1: add optional-import package for ESM optional dependencies [commit](https://github.com/jchip/fynjs/commit/30f50a1e6c36364a1d4f866b40786508243ce289)

-   `.github`

    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FPM-46: CI - drop node 18/20, add node 26 [commit](https://github.com/jchip/fynjs/commit/bf65116dd9c452a64251c3d6cc0d52be4cbd9a10)
    -   chore: update ci [commit](https://github.com/jchip/fynjs/commit/aa6083895b00aa73a40f55d6590c41049814b89b)
    -   FPM-39: update fyn/fynpo to ^2.1.0 and CI to use fyn@v2 [commit](https://github.com/jchip/fynjs/commit/639012ae64410cbe049685160c1bed5cb1e0f9bf)
    -   update CI node versions [commit](https://github.com/jchip/fynjs/commit/eeb421fd0b4911f78d76529daaa21fcf2daf82b6)
    -   chore: update ci script [commit](https://github.com/jchip/fynjs/commit/6270b5be973961bf81fc488d972f3e203ff829a5)
    -   add node 16 to ci [commit](https://github.com/jchip/fynjs/commit/404e3be99b237fc804d58638ccb6ba3e04e70d07)
    -   [chore]: fix ci [commit](https://github.com/jchip/fynjs/commit/e8825278acaf65c3d991766143a7cac79354e84f)
    -   Update GitHub workflows ([#22](https://github.com/jchip/fynjs/pull/22)) [commit](https://github.com/jchip/fynjs/commit/d5d25e6f3e3263182f1da9154985dd3b0eb54000)
    -   [chore] update github workflow branch [commit](https://github.com/jchip/fynjs/commit/cbdf7272d8dee44d6518d7d04d222ce3520fa177)
    -   Create node.js.yml [commit](https://github.com/jchip/fynjs/commit/3ce3e756a07507f87c492d998646b549992f575e)
    -   test need tty but cant get it with github action [commit](https://github.com/jchip/fynjs/commit/86ced2a7e3fb9ce632e3f30655104ed24db3b881)
    -   Create nodejs.yml [commit](https://github.com/jchip/fynjs/commit/fd6b77452218f08d633746c3ab2c2324b3ec7729)

-   `bin`

    -   use env XRUN_QUIET to propagate the quiet flag [commit](https://github.com/jchip/fynjs/commit/3ce0c9de804eb0c0f0c6ff46d563b8941c0ea887)
    -   update bin startup [commit](https://github.com/jchip/fynjs/commit/754a03cd19a3f8b614d64a6b9a528f776a455638)
    -   remove clap mode [commit](https://github.com/jchip/fynjs/commit/3874b7a3e95e79aec001f57caa4c1a318469a606)
    -   handle nodes preserve-symlinks flag [commit](https://github.com/jchip/fynjs/commit/3007e057dbe505953cb9f62e27160eb181b8c192)
    -   rename to @xarc/run [commit](https://github.com/jchip/fynjs/commit/578698c061998f299d5acb29aa821312c8104248)
    -   fix namespace display for task that has it already [commit](https://github.com/jchip/fynjs/commit/eb1a21706cd2966ac003b286fa339e76557b2cea)
    -   check install path ends with lib for global install [commit](https://github.com/jchip/fynjs/commit/4e0725085889173e66503ffce75dfcd1181a6a18)
    -   check and warn if installed globally [commit](https://github.com/jchip/fynjs/commit/b2722c08f1acdf2d54e5cc1bc22b47e2abeee6ac)
    -   offer bin commands [commit](https://github.com/jchip/fynjs/commit/3587bbaa3b571f18551750a97766984192143596)

-   `cli`

    -   search scripts, tools, build, tasks dir for task script [commit](https://github.com/jchip/fynjs/commit/f3ae107737f3a419020471d4ddd8221bdc518cdd)
    -   vitest [commit](https://github.com/jchip/fynjs/commit/ddc2c8cda751d0b12d6d0842ed3530e48d3f8184)
    -   fix path added detection [commit](https://github.com/jchip/fynjs/commit/8eee9b0275b12c8179d7e38334e3f79c16320330)
    -   new --env option [commit](https://github.com/jchip/fynjs/commit/67991a45c141c817657f585f3e13a7e69692b047)
    -   fix load provider failing [commit](https://github.com/jchip/fynjs/commit/1eec314fa08e54e05000e4c98d52435b81c19753)
    -   avoid failure requiring package.json thats not exported [commit](https://github.com/jchip/fynjs/commit/c9a95c9c45d06dab4a2fe3fc1020baa65d6340d7)
    -   update tests and nyc [commit](https://github.com/jchip/fynjs/commit/dac6ed68b188f46089acc8d54ad68e51a20a153f)
    -   handle parsing cli and task argv [commit](https://github.com/jchip/fynjs/commit/b1e23d0d300c76ea3f164b4f04579faf012f096c)
    -   fix checking for cli missing task [commit](https://github.com/jchip/fynjs/commit/99439d438507646fe1c33b1861293e02ef71e1a2)
    -   fix propagate quiet flag [commit](https://github.com/jchip/fynjs/commit/e9eced695400851ee959cbc3388a233e2109f73e)
    -   export function that are for testing under INTERNALS symbol [commit](https://github.com/jchip/fynjs/commit/36725cab4f362e9975210f78db400dc0783ea552)
    -   use env XRUN_QUIET to propagate the quiet flag [commit](https://github.com/jchip/fynjs/commit/3ce0c9de804eb0c0f0c6ff46d563b8941c0ea887)
    -   add place holder cli/check-global.js for backward compatible [commit](https://github.com/jchip/fynjs/commit/7de319ab30fb6b638e733e4a7fe348d7781493af)
    -   show ts runner path [commit](https://github.com/jchip/fynjs/commit/30faf0f0ed4def1cdd13398000d017a07374ae6b)
    -   handle package.json missing [commit](https://github.com/jchip/fynjs/commit/4944d29d1fa6953e7eaaefe0a9dab46d633cfbf1)
    -   tests for cli/xrun.js [commit](https://github.com/jchip/fynjs/commit/f3745a28d925c8a7d5e216ad78b8fd14b6d6fb86)
    -   more tests for cli/task-file.js [commit](https://github.com/jchip/fynjs/commit/0ba68720a95d30ce2bfbc724453838eedae5f076)
    -   some minor cleanups [commit](https://github.com/jchip/fynjs/commit/f9ac55405fbbffae38ccac8d40a38708fc2d1a78)
    -   add more cli tests [commit](https://github.com/jchip/fynjs/commit/0ccbc881968f659bd0d017ecd6bb4223cb16de60)
    -   some logging fixes [commit](https://github.com/jchip/fynjs/commit/9f1ff16bcc7185b999ef6b32dea6ad670c13d7df)
    -   more tests for cli [commit](https://github.com/jchip/fynjs/commit/3322bb9652228ff079bc1687f1379b0b00449ca6)
    -   update bin startup [commit](https://github.com/jchip/fynjs/commit/754a03cd19a3f8b614d64a6b9a528f776a455638)
    -   remove clap mode [commit](https://github.com/jchip/fynjs/commit/3874b7a3e95e79aec001f57caa4c1a318469a606)
    -   updating cli [commit](https://github.com/jchip/fynjs/commit/7be69c593432dcd388a23222fda1c2c743127a47)
    -   update nix-clap and optional-require [commit](https://github.com/jchip/fynjs/commit/ffe710ac685c713aef0880b08046c1b415bed4f0)
    -   use tsx instead of ts-node for better esm compat [commit](https://github.com/jchip/fynjs/commit/0b4c8be40def680d2cb89ff868f88575f2515fd5)
    -   add coveralls and eslint [commit](https://github.com/jchip/fynjs/commit/825cce71aa62d0f96bf02198db546fe66f17b196)
    -   load tasks from provider modules [commit](https://github.com/jchip/fynjs/commit/77eed003dc166126b3728401d6916de93c60a412)
    -   run npm scripts even if no xrun-tasks file exist [commit](https://github.com/jchip/fynjs/commit/70bdfaf65a8c06729b765918db613add961c45d2)
    -   log error even in quiet mode [commit](https://github.com/jchip/fynjs/commit/54fabf64040fb6e3327438e9070b7223ca2e9b33)
    -   handle pkg mgr installing with symlinks [commit](https://github.com/jchip/fynjs/commit/44e233d6062229b9406cf45961f6d68fb5571f57)
    -   check default export for --require tasks [commit](https://github.com/jchip/fynjs/commit/7cdb7a0455d5c3ddb8f860fe7de4fefda925c335)
    -   convert to monorepo [commit](https://github.com/jchip/fynjs/commit/952e06d7b09e5dfface72e8311f1d96ba8ff8874)
    -   fix: make error output sane [commit](https://github.com/jchip/fynjs/commit/5c6abf595dcb7bc42b3fbb7541a6b429da42eff3)
    -   allow skip bootstrapping package [commit](https://github.com/jchip/fynjs/commit/08ef613057bb47050f839831087d51d5bb8b23d4)
    -   do transpile only if .ts task file detected [commit](https://github.com/jchip/fynjs/commit/fa98a6a57ce85225a32247e9980564ab8151376d)
    -   fix loading namespace pkg tasks from package.json [commit](https://github.com/jchip/fynjs/commit/116c333c2ac3beb7ed7b0bcb413398a79b7d8732)
    -   fix --list option [commit](https://github.com/jchip/fynjs/commit/bcd89e537dc3588f670a96c513921877ccd69e69)
    -   rename to @xarc/run [commit](https://github.com/jchip/fynjs/commit/578698c061998f299d5acb29aa821312c8104248)
    -   add --only option for bootstrap [commit](https://github.com/jchip/fynjs/commit/1f72125b966417735268a416b2d2ce9ce1952374)
    -   -s for serial, -e for stop on error [commit](https://github.com/jchip/fynjs/commit/ab67952847b6a56efe332cd5bf54f9dcbd354e3b)
    -   fix: paren [commit](https://github.com/jchip/fynjs/commit/5134f377e9a7309470b982b0c1f123e87824b744)
    -   add --require option [commit](https://github.com/jchip/fynjs/commit/b74e04436b7113e0aad74be5bdf6cf4f0f10483d)
    -   log error if xclap.js not found [commit](https://github.com/jchip/fynjs/commit/a6e33dbf0594b38ba3482a39529f8a9983aef6f1)
    -   fix ignore opts passing [commit](https://github.com/jchip/fynjs/commit/6871f30f0bb19678f49e5fffd8327ee3d3752b1f)
    -   search xclap file in defined order [commit](https://github.com/jchip/fynjs/commit/30cd21b5acc52b52f80a403d350339cd7230339e)
    -   load ts-node/register for .ts file [commit](https://github.com/jchip/fynjs/commit/b78325abd9c0643d45ea46dbd7efbba0cdc79afd)
    -   avoid overriding FORCE_COLOR env [commit](https://github.com/jchip/fynjs/commit/eb3411316f613f042d17f6830035593172077abf)
    -   handle packages with scopes [commit](https://github.com/jchip/fynjs/commit/34bbc95b7a5744074ace6fe9d1f8e90533f372a3)
    -   preserve node_modules and use . for CWD in paths in logs [commit](https://github.com/jchip/fynjs/commit/5adfa0c48b48ddabbccd90da72903ff60d16d77c)
    -   [fix] avoid overriding stopOnError set by user [commit](https://github.com/jchip/fynjs/commit/90b3efa334aa0ffa8b24be4642fd555afe57356d)
    -   execute npm scripts pre/post steps and with tty/sync flags [commit](https://github.com/jchip/fynjs/commit/fb06e46a977d17ebb8265bdce9459380bac56a06)
    -   use jaro-winkler dist to suggest closest task names when not found [commit](https://github.com/jchip/fynjs/commit/4a11aad5c072998a519e03aa7a7a396d7fb59779)
    -   only add node_modules/.bin if PATH doesnt contain it [commit](https://github.com/jchip/fynjs/commit/31b7141026ae904f328f21c00af174ae45e20f8a)
    -   add concurrency option for bootstrap [commit](https://github.com/jchip/fynjs/commit/e35c83706b383a16ec847691a74995e970073a13)
    -   support passing fynOpts in through config file [commit](https://github.com/jchip/fynjs/commit/524097dfa0a13f7a004956531286add985c6bc49)
    -   run build script [commit](https://github.com/jchip/fynjs/commit/22b5ed2abadf429abdd7255bc4caa674d5cbf14e)
    -   do not load clap file when searching for it [commit](https://github.com/jchip/fynjs/commit/e941a52d15ed6214380e85727823b68c6e65d042)
    -   auto search for clap file [commit](https://github.com/jchip/fynjs/commit/a9cc500fbd782208a56b513dbfe47e89b92fdf2f)
    -   implement finally hook [commit](https://github.com/jchip/fynjs/commit/6b94cabb46c6c00682f78ac5dabbba9d74846380)
    -   log bootstrap errors [commit](https://github.com/jchip/fynjs/commit/a5831e1b15745e4fa09dbe1e0351db222dd3ba7a)
    -   prepare for publish [commit](https://github.com/jchip/fynjs/commit/0a6a8d3baf4159c8ef4f97c632cef00e627ed02c)
    -   fynpo [commit](https://github.com/jchip/fynjs/commit/2f2010bb1e0e173eec9680c0b939f3af72836269)
    -   process task options and pass as argv [commit](https://github.com/jchip/fynjs/commit/1682c5a4ccc98ae693f3f51559e587beec22760b)
    -   nix clap [commit](https://github.com/jchip/fynjs/commit/6ad6f017b9335fb4f2eb8231d7f3121024dc1901)
    -   support directly passing array from command line [commit](https://github.com/jchip/fynjs/commit/e9ddce85adce40687155208955eda4e009d6e30b)
    -   add option to run command line tasks serially [commit](https://github.com/jchip/fynjs/commit/89ce6e9bf67113ee9242e8c448d39463ede5890a)
    -   show xclap loc with CWD abbreviated [commit](https://github.com/jchip/fynjs/commit/2f847fa4527147235304bbbba57740029c990a5e)
    -   check and warn if installed globally [commit](https://github.com/jchip/fynjs/commit/b2722c08f1acdf2d54e5cc1bc22b47e2abeee6ac)
    -   log xclap location and CWD [commit](https://github.com/jchip/fynjs/commit/efd63f36e0ee860bada2cb0e14178b6757f45ef8)
    -   remove console.log [commit](https://github.com/jchip/fynjs/commit/ae357ffc4643043b22308b575f2887510c99677f)
    -   add --options for autocompletion [commit](https://github.com/jchip/fynjs/commit/f52227a9b88415a4add9e3e6e37ffa1802e32511)
    -   update task invoking to help auto completion [commit](https://github.com/jchip/fynjs/commit/8973d493fe3f948e6d70937ce4befc5bd64ccc75)
    -   make xclap.js the default task file [commit](https://github.com/jchip/fynjs/commit/202656958d468c986f759dcc9764a7f141428fa3)
    -   update how tasks are specified in package.json [commit](https://github.com/jchip/fynjs/commit/5928efe25353dc0b36eb92836a50da693492f8c4)
    -   handle namespace not found error [commit](https://github.com/jchip/fynjs/commit/49f9f853e1067f7f65496646e28236ee27b0d520)
    -   use path.join [commit](https://github.com/jchip/fynjs/commit/157c6f6bc5b051b192c7d96390ce43c9dfd24f64)
    -   fix applying pkg options [commit](https://github.com/jchip/fynjs/commit/3b37004ecea5e9534e32f7d12d1898079d380cae)
    -   -q supress usage output [commit](https://github.com/jchip/fynjs/commit/22b2d813228e80ac06bfeadb2d2852efad4f28f4)
    -   add example to usage [commit](https://github.com/jchip/fynjs/commit/c9dc2e363d0c922e78d085cb03938b96742711cc)
    -   default npm to false [commit](https://github.com/jchip/fynjs/commit/7869cc0f432736d53ee4eb6ba07ee05df69bb3a0)
    -   --cwd and --dir requiresArg [commit](https://github.com/jchip/fynjs/commit/8c3d47cbd7b428cb372e1dd7d0c6f3548c5e82fa)
    -   rearrange order of options [commit](https://github.com/jchip/fynjs/commit/9f64ada911b8356c8f510a016795a6b5ad02f0f0)
    -   add --cwd [commit](https://github.com/jchip/fynjs/commit/df317ce5336bae9ff5457ec68c45efec34bcd30e)
    -   update loading clapfile [commit](https://github.com/jchip/fynjs/commit/1712082ea916a179a2ddc4f8f5056c4defa05a02)
    -   update listing options [commit](https://github.com/jchip/fynjs/commit/c4f701ca7421b79c0ee0125a5b18b0262625f981)
    -   nicer fail error output [commit](https://github.com/jchip/fynjs/commit/0ac51e558d68f5622b42e08ad35485c730cf0ab7)
    -   fix findCutOff [commit](https://github.com/jchip/fynjs/commit/ffbc9a4883cda55a47b46140de112f600f89d67f)
    -   update clapfile searching logic [commit](https://github.com/jchip/fynjs/commit/ec8087bcfa530dc1d829e9dac840c572b8ffc57e)
    -   new options: soe, list, list-full, quiet [commit](https://github.com/jchip/fynjs/commit/a8b0f4d4de2260ef2b6606f6c47212dca15aeee4)
    -   add --version options [commit](https://github.com/jchip/fynjs/commit/66b55364192838a806cd906b40b0d20c7f545230)
    -   update help messages [commit](https://github.com/jchip/fynjs/commit/2581c56341a5d54bc22ab85e077f9da6a0991425)
    -   update nmbin alias to b [commit](https://github.com/jchip/fynjs/commit/bc13689f7f1f9664a548b114208a51f1a8b567f9)
    -   continue w/o clap.js [commit](https://github.com/jchip/fynjs/commit/3307ef89ff7ae90962db36698d81c8117a120133)
    -   enforce strict command line options [commit](https://github.com/jchip/fynjs/commit/8d1b315aaab15d6e1d83f4821a02b9a0abbf99fa)
    -   add --dir option [commit](https://github.com/jchip/fynjs/commit/913d83fd647dfb38723e9c0803af176f08196494)
    -   display searched namespace [commit](https://github.com/jchip/fynjs/commit/89b5213acc3b1b624a84ebfa3553c78587a26247)
    -   apply options from package.json to yargs [commit](https://github.com/jchip/fynjs/commit/b6caecee8b77de0f6f4483df1d78102e6e88f8cf)
    -   load scripts, tasks, & config from package.json [commit](https://github.com/jchip/fynjs/commit/b80022bf377be5a7893f20b7b22dbceda482e495)
    -   log version in cli when startup [commit](https://github.com/jchip/fynjs/commit/54a2bba62773e10913b08acf4684e41113418e71)
    -   updating help option [commit](https://github.com/jchip/fynjs/commit/21c542709b5fd10d4b50d55ab4299e2f0dd69a3f)
    -   add option to turn off add node_modules/.bin to PATH [commit](https://github.com/jchip/fynjs/commit/a6994a5ea89d7280010e5ad5e298e4f3f051039d)
    -   check user task count in cli [commit](https://github.com/jchip/fynjs/commit/061e00815e152fd4abb9519bd39ee070f582db30)
    -   add node_modules/.bin to path if it exists [commit](https://github.com/jchip/fynjs/commit/8a14ac38445253b9e4045581e448e3b64fe022dd)
    -   NixClap [commit](https://github.com/jchip/fynjs/commit/a185f4165acffda83c1ad75ff00c06debc906fb3)

-   `demos`

    -   additional npm scripts for testing [commit](https://github.com/jchip/fynjs/commit/374c8558368056df538bddc8804563590860e167)
    -   add src/index.ts for demos/pkg1 [commit](https://github.com/jchip/fynjs/commit/90c1c25a03dbe0fce7ad86f9b7b9dd71adc8e8c2)
    -   more tasks for demos/cjs1 [commit](https://github.com/jchip/fynjs/commit/59bd57371702fcf237aa1f576a51547bd34e0c9b)
    -   show ts runner path [commit](https://github.com/jchip/fynjs/commit/30faf0f0ed4def1cdd13398000d017a07374ae6b)
    -   add typescript type definitions [commit](https://github.com/jchip/fynjs/commit/2ee8ae97e268133a38a85e2d5e35a697a90c5cb2)
    -   update bin startup [commit](https://github.com/jchip/fynjs/commit/754a03cd19a3f8b614d64a6b9a528f776a455638)
    -   use tsx instead of ts-node for better esm compat [commit](https://github.com/jchip/fynjs/commit/0b4c8be40def680d2cb89ff868f88575f2515fd5)

-   `docs`

    -   update docs [commit](https://github.com/jchip/fynjs/commit/8d453bc3cd0da5d7553bed62c6750120af5fc103)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/881c28ff28d09f6922201c5dd77b81458eff19c4)
    -   update readme and docs [commit](https://github.com/jchip/fynjs/commit/ebe1506d98d59e7e3b40ce1a63c435df40d46abb)
    -   docs: update description [commit](https://github.com/jchip/fynjs/commit/4d5a42dc9e529da5bec858510f7a0f69afaf52e2)
    -   [chore] docs add debugging to sidebar ([#21](https://github.com/jchip/fynjs/pull/21)) [commit](https://github.com/jchip/fynjs/commit/10b0e2a4430f19500bb88fe7faa21e25337f0ade)
    -   [chore] add docs about debugging with source maps ([#20](https://github.com/jchip/fynjs/pull/20)) [commit](https://github.com/jchip/fynjs/commit/32196e7fe420da780306082bbb8963d97832bef4)
    -   doc updates ([#30](https://github.com/jchip/fynjs/pull/30)) [commit](https://github.com/jchip/fynjs/commit/acde2eed6843c4acd55e77102ce655690303c3eb)
    -   docusaurus guide ([#29](https://github.com/jchip/fynjs/pull/29)) [commit](https://github.com/jchip/fynjs/commit/db3ee8151a2d862b78f05e18dd37b2a25e760aea)

-   `docusaurus`

    -   FPO-16: document publish package filter and nested repo skipping [commit](https://github.com/jchip/fynjs/commit/131da9ec1854a8a3ec2bd0bd9b5c6e94d380a92d)
    -   rename create-fynpo [commit](https://github.com/jchip/fynjs/commit/2fb3bcc42afbcd66eabbb8cdf83e6dbd9fb78dd0)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/8d453bc3cd0da5d7553bed62c6750120af5fc103)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/881c28ff28d09f6922201c5dd77b81458eff19c4)
    -   update fynpo docs [commit](https://github.com/jchip/fynjs/commit/df5e2ecebecf3608682f2f2c2e72feada69a071c)
    -   update readme and docs [commit](https://github.com/jchip/fynjs/commit/ebe1506d98d59e7e3b40ce1a63c435df40d46abb)
    -   docs: update description [commit](https://github.com/jchip/fynjs/commit/4d5a42dc9e529da5bec858510f7a0f69afaf52e2)
    -   [chore] docs add debugging to sidebar ([#21](https://github.com/jchip/fynjs/pull/21)) [commit](https://github.com/jchip/fynjs/commit/10b0e2a4430f19500bb88fe7faa21e25337f0ade)
    -   [chore] add docs about debugging with source maps ([#20](https://github.com/jchip/fynjs/pull/20)) [commit](https://github.com/jchip/fynjs/commit/32196e7fe420da780306082bbb8963d97832bef4)
    -   doc updates ([#30](https://github.com/jchip/fynjs/pull/30)) [commit](https://github.com/jchip/fynjs/commit/acde2eed6843c4acd55e77102ce655690303c3eb)
    -   docusaurus guide ([#29](https://github.com/jchip/fynjs/pull/29)) [commit](https://github.com/jchip/fynjs/commit/db3ee8151a2d862b78f05e18dd37b2a25e760aea)

-   `lib`

    -   minor cleanup in tests [commit](https://github.com/jchip/fynjs/commit/adbf1b69a9e0b21a9fac470ec2265d1bf7287e53)
    -   ensure child process killed on exit [commit](https://github.com/jchip/fynjs/commit/17b19d083108e3ba6ba85bb6fbf1afaf26b93bab)
    -   vitest [commit](https://github.com/jchip/fynjs/commit/ddc2c8cda751d0b12d6d0842ed3530e48d3f8184)
    -   common code to kill child process tree [commit](https://github.com/jchip/fynjs/commit/533a1250c1e2c0ecad425ef4a3703b5b478395ec)
    -   new --env option [commit](https://github.com/jchip/fynjs/commit/67991a45c141c817657f585f3e13a7e69692b047)
    -   fix: dont fail if a child process was killed by xrun [commit](https://github.com/jchip/fynjs/commit/b30b52bc90ad1e87950b1577f432ca0c0d58e79e)
    -   fix: use taskkill to stop process on windows [commit](https://github.com/jchip/fynjs/commit/1ec6e4719e3588d3a1995f2fbdf08651a2c6605b)
    -   update tests and nyc [commit](https://github.com/jchip/fynjs/commit/dac6ed68b188f46089acc8d54ad68e51a20a153f)
    -   handle parsing cli and task argv [commit](https://github.com/jchip/fynjs/commit/b1e23d0d300c76ea3f164b4f04579faf012f096c)
    -   export function that are for testing under INTERNALS symbol [commit](https://github.com/jchip/fynjs/commit/36725cab4f362e9975210f78db400dc0783ea552)
    -   add typescript type definitions [commit](https://github.com/jchip/fynjs/commit/2ee8ae97e268133a38a85e2d5e35a697a90c5cb2)
    -   some logging fixes [commit](https://github.com/jchip/fynjs/commit/9f1ff16bcc7185b999ef6b32dea6ad670c13d7df)
    -   update bin startup [commit](https://github.com/jchip/fynjs/commit/754a03cd19a3f8b614d64a6b9a528f776a455638)
    -   updating cli [commit](https://github.com/jchip/fynjs/commit/7be69c593432dcd388a23222fda1c2c743127a47)
    -   update nix-clap and optional-require [commit](https://github.com/jchip/fynjs/commit/ffe710ac685c713aef0880b08046c1b415bed4f0)
    -   add coveralls and eslint [commit](https://github.com/jchip/fynjs/commit/825cce71aa62d0f96bf02198db546fe66f17b196)
    -   log error even in quiet mode [commit](https://github.com/jchip/fynjs/commit/54fabf64040fb6e3327438e9070b7223ca2e9b33)
    -   convert to monorepo [commit](https://github.com/jchip/fynjs/commit/952e06d7b09e5dfface72e8311f1d96ba8ff8874)
    -   update to fyn 0.4.5 [commit](https://github.com/jchip/fynjs/commit/4cbf43ad06c43582d74161b0e3d7a7bba6101944)
    -   search for config and create it if not found [commit](https://github.com/jchip/fynjs/commit/4da5c5b92243ce6ec9cbc397ec9f47f5adcba1e5)
    -   package fyn in case its not installed globally [commit](https://github.com/jchip/fynjs/commit/36c1b311016ca273dd3247f53a9036a4cb7af7be)
    -   update for latest fyn [commit](https://github.com/jchip/fynjs/commit/9088bf4016d49a1962edb511fbd6747e61454ac0)
    -   fix: make error output sane [commit](https://github.com/jchip/fynjs/commit/5c6abf595dcb7bc42b3fbb7541a6b429da42eff3)
    -   set FYN_CENTRAL_DIR for bootstrapping with fyn [commit](https://github.com/jchip/fynjs/commit/de99420a8a48c33b228a228aef35d99f23d33c1e)
    -   allow skip bootstrapping package [commit](https://github.com/jchip/fynjs/commit/08ef613057bb47050f839831087d51d5bb8b23d4)
    -   rename to @xarc/run [commit](https://github.com/jchip/fynjs/commit/578698c061998f299d5acb29aa821312c8104248)
    -   add --only option for bootstrap [commit](https://github.com/jchip/fynjs/commit/1f72125b966417735268a416b2d2ce9ce1952374)
    -   add updateEnv API [commit](https://github.com/jchip/fynjs/commit/4c23884b023488d799293254c05260dd9cabf01f)
    -   support override flag for env [commit](https://github.com/jchip/fynjs/commit/0c4dd89da2e8054e55f83ad80b0ee02f60a9495d)
    -   nix-clap [commit](https://github.com/jchip/fynjs/commit/81fb1c4692b8a88b6c1bf4c636aeb56964d2c139)
    -   allow using load standalone [commit](https://github.com/jchip/fynjs/commit/0c2f300d7d4e15729c59e9c482d8026589883841)
    -   use a symbol to trigger execution engine to stop [commit](https://github.com/jchip/fynjs/commit/a47d27c88aa921f562993a3b3d8b1cbd552c53c8)
    -   add parallel alias for concurrent [commit](https://github.com/jchip/fynjs/commit/4688f215000b14c972c8d5eca26a01f6e2fca3e9)
    -   handle ChildProcess returned from a function [commit](https://github.com/jchip/fynjs/commit/d46f6b319794feb1004e9dfad5c6b45c9a233d55)
    -   add this.args for tasks as arguments w/o task name [commit](https://github.com/jchip/fynjs/commit/145a7dbbf22d7e6b31b1644cf8ef1625b6dbdfd0)
    -   add xclap.stop [commit](https://github.com/jchip/fynjs/commit/6389ab1cbc57aef737cebfb2f98cb323f1bf5efd)
    -   preserve initial ordering value [commit](https://github.com/jchip/fynjs/commit/ab4672f96bdef2d810adfbd1ed6f7134ba0044dd)
    -   allow adding namespace with search priority [commit](https://github.com/jchip/fynjs/commit/9819674150b3a67963e505b2b1d8b2dd73fdc172)
    -   clean up error stack trace for output [commit](https://github.com/jchip/fynjs/commit/3b1a9aa8300ec061be6e3f34458f1b379bbed62f)
    -   add ~@ as shell script signature [commit](https://github.com/jchip/fynjs/commit/ac035d94439cd90e7f6de5af4f626c49f54390ce)
    -   handle packages with scopes [commit](https://github.com/jchip/fynjs/commit/34bbc95b7a5744074ace6fe9d1f8e90533f372a3)
    -   preserve node_modules and use . for CWD in paths in logs [commit](https://github.com/jchip/fynjs/commit/5adfa0c48b48ddabbccd90da72903ff60d16d77c)
    -   test task spec APIs without instance [commit](https://github.com/jchip/fynjs/commit/bb7aea9689ece641fcb33ffff9e627ad33ab68a9)
    -   tests for env task spec [commit](https://github.com/jchip/fynjs/commit/2f62890e6531b2acfff95a793ab51fdf2ccc3b0c)
    -   allow delete env using undefined or null [commit](https://github.com/jchip/fynjs/commit/8f14ee266c7de304094a079c2eddfcece7dd92f5)
    -   add xclap.env task spec [commit](https://github.com/jchip/fynjs/commit/60478c29f97b773f3df8421c7fc9fa753a68b1d7)
    -   handle XTaskSpec returned from functions [commit](https://github.com/jchip/fynjs/commit/2bea669864f771829618e879fead08849194de62)
    -   simplify exec params [commit](https://github.com/jchip/fynjs/commit/dd9fd425564b91996ca229df4b88edb8c4eacb71)
    -   allow short cut to set xclap.exec env [commit](https://github.com/jchip/fynjs/commit/41bd44ee2e86ccb41fc457d97d4307d748c31bb0)
    -   unwrap npm js bin batch cmd on Windows [commit](https://github.com/jchip/fynjs/commit/e460ed528102ad2cef4bb01a03562a350e67b47b)
    -   no array for err [commit](https://github.com/jchip/fynjs/commit/fef0537db689252dd94f4bbf572ba45ddfedc3b7)
    -   handle streams [commit](https://github.com/jchip/fynjs/commit/8ca67074a582ac6c7d3991b27ab33beba924c285)
    -   [fix] avoid overriding stopOnError set by user [commit](https://github.com/jchip/fynjs/commit/90b3efa334aa0ffa8b24be4642fd555afe57356d)
    -   scan dir [commit](https://github.com/jchip/fynjs/commit/246c9999d587ec30c02e7c3c8985461a74932951)
    -   execute npm scripts pre/post steps and with tty/sync flags [commit](https://github.com/jchip/fynjs/commit/fb06e46a977d17ebb8265bdce9459380bac56a06)
    -   update comments [commit](https://github.com/jchip/fynjs/commit/3d2669ceac7915a236035d158816692a03fb86e2)
    -   tasks flow decorators: serial or concurrent [commit](https://github.com/jchip/fynjs/commit/b377ccf2b07722c6548381d2a68ecf8ba3396bea)
    -   add a XTaskSpec and xclap.exec for exec shell cmd [commit](https://github.com/jchip/fynjs/commit/d36c543c73fbfa046141910da5901f9e40cd0d12)
    -   use jaro-winkler dist to suggest closest task names when not found [commit](https://github.com/jchip/fynjs/commit/4a11aad5c072998a519e03aa7a7a396d7fb59779)
    -   update logger [commit](https://github.com/jchip/fynjs/commit/f50617d6bfa9a590ba4ba44e992e6177eedcd4e4)
    -   add version tagging [commit](https://github.com/jchip/fynjs/commit/fce8217634a4a8adf76b42c6d5cc50f7379f27ec)
    -   use version from changelog verbatim [commit](https://github.com/jchip/fynjs/commit/e42728ae2934e7c283d2abbd50cd9efccb50f35b)
    -   handle tag turned off in config [commit](https://github.com/jchip/fynjs/commit/a7d9dd6372c760a693fbb2459de27e37b8c4ee7b)
    -   handle npm tag specified in lerna.json [commit](https://github.com/jchip/fynjs/commit/fa94cb722f2588a33988a70000abf80d162fddee)
    -   handle private packages [commit](https://github.com/jchip/fynjs/commit/656920fe2f8bdf6b59bd9cbaaea2e2d98be83b94)
    -   default fyn log level to debug [commit](https://github.com/jchip/fynjs/commit/140edf5a5a75358ae5308ffc87856596ed31f9da)
    -   default concurrency 3 [commit](https://github.com/jchip/fynjs/commit/273a4e8f79ec335a8a892fcd6144164d083438e1)
    -   add concurrency option for bootstrap [commit](https://github.com/jchip/fynjs/commit/e35c83706b383a16ec847691a74995e970073a13)
    -   support passing fynOpts in through config file [commit](https://github.com/jchip/fynjs/commit/524097dfa0a13f7a004956531286add985c6bc49)
    -   log total time took to bootstrap [commit](https://github.com/jchip/fynjs/commit/46c8e3f66473bea8bf402589cb94040f1d2a9183)
    -   run build script [commit](https://github.com/jchip/fynjs/commit/22b5ed2abadf429abdd7255bc4caa674d5cbf14e)
    -   use visual-exec pkg [commit](https://github.com/jchip/fynjs/commit/dd78ff7a8f4d4c41d32d8af2313aff07e90a4b2a)
    -   lookup local package dir by its name [commit](https://github.com/jchip/fynjs/commit/98c066f8a08955fff05ab9821ccbe845e7508d66)
    -   fix _.each bailing on false [commit](https://github.com/jchip/fynjs/commit/027c2936aa00afb08d1ca36989a62e916bf547ef)
    -   remove fyn setup thats no longer needed [commit](https://github.com/jchip/fynjs/commit/ea0afece879e85bc45388d650077015469c4225f)
    -   fix: remove pkg scope name when use for dir [commit](https://github.com/jchip/fynjs/commit/8ddb84164930a175dcfb906542d2371f71fabcd1)
    -   set local deps into fyn section [commit](https://github.com/jchip/fynjs/commit/500da609394422bdac7af900575c0cd2bdfa287b)
    -   check for unknown shell flags [commit](https://github.com/jchip/fynjs/commit/1cd70804791611c386a1df59a42915cc1a7cb132)
    -   support async functions [commit](https://github.com/jchip/fynjs/commit/6180962d8869d5f74bdead8b9caf0da5c733379f)
    -   support spawn/tty for shell tasks [commit](https://github.com/jchip/fynjs/commit/3b1b1de93c36db0ea6dc5816f6f4c9dc43337143)
    -   use string-array module [commit](https://github.com/jchip/fynjs/commit/343f77a97143f31f7dfaa5f7e68621b432c35c91)
    -   handle windows [commit](https://github.com/jchip/fynjs/commit/35ba3c319d1aeda88e31acd4a426ef825c764ebb)
    -   check env CI [commit](https://github.com/jchip/fynjs/commit/6cc81636c00686b647a02f597cd22a5ded50237b)
    -   fix namespace display for task that has it already [commit](https://github.com/jchip/fynjs/commit/eb1a21706cd2966ac003b286fa339e76557b2cea)
    -   implement finally hook [commit](https://github.com/jchip/fynjs/commit/6b94cabb46c6c00682f78ac5dabbba9d74846380)
    -   add brief summary of how the executor work [commit](https://github.com/jchip/fynjs/commit/961ef2797d5bb7fc2c9ea038e1c228c5f431cf62)
    -   allow soft stop so pending task can complete [commit](https://github.com/jchip/fynjs/commit/1c159929a6a924a9efd17bec7c8fb93080cf6454)
    -   return this for api chaining [commit](https://github.com/jchip/fynjs/commit/57084fe16a641a87004bc9396eb3ddc3a4f5b592)
    -   log bootstrap errors [commit](https://github.com/jchip/fynjs/commit/a5831e1b15745e4fa09dbe1e0351db222dd3ba7a)
    -   prepare for publish [commit](https://github.com/jchip/fynjs/commit/0a6a8d3baf4159c8ef4f97c632cef00e627ed02c)
    -   fynpo [commit](https://github.com/jchip/fynjs/commit/2f2010bb1e0e173eec9680c0b939f3af72836269)
    -   remove empty task argv options [commit](https://github.com/jchip/fynjs/commit/74d9a4493d09e6de78b150e1c8d95367f3096328)
    -   process task options and pass as argv [commit](https://github.com/jchip/fynjs/commit/1682c5a4ccc98ae693f3f51559e587beec22760b)
    -   support specifying optionally execute task [commit](https://github.com/jchip/fynjs/commit/58af87cf25ed2400e68980f3c083f8cbab6247de)
    -   parse and execute array in a string [commit](https://github.com/jchip/fynjs/commit/3db34f63c817874d6f6c1ae999f6e5839ccc3553)
    -   support adding namespace with orders [commit](https://github.com/jchip/fynjs/commit/5380fab050a98027b17345acdfdbc35d251be81a)
    -   support directly passing array from command line [commit](https://github.com/jchip/fynjs/commit/e9ddce85adce40687155208955eda4e009d6e30b)
    -   abbreviate with CWD in reporter output [commit](https://github.com/jchip/fynjs/commit/4b3f1a618b1c9f05e84bd0a5f79c0383b5dee26c)
    -   clean up windows backslashes [commit](https://github.com/jchip/fynjs/commit/5cb3f9fbf6c3d5031f3e2b68cc4a11e34af3e8f4)
    -   handle namespace not found error [commit](https://github.com/jchip/fynjs/commit/49f9f853e1067f7f65496646e28236ee27b0d520)
    -   show implicit namespace with same color but dimmed [commit](https://github.com/jchip/fynjs/commit/de2e35b0de79df35cecb5187fdff544cf04b0bbb)
    -   change namespace sep to / [commit](https://github.com/jchip/fynjs/commit/33089346656bec5eae9a12a31c0933bdffaa2199)
    -   assert task name is not empty [commit](https://github.com/jchip/fynjs/commit/7c48b88cd15b2b45848b1d9a4d03a57e07d30682)
    -   use xsh nm replace [commit](https://github.com/jchip/fynjs/commit/e97895a7c474530d97a6fafe9a63022468eea72d)
    -   update loading clapfile [commit](https://github.com/jchip/fynjs/commit/1712082ea916a179a2ddc4f8f5056c4defa05a02)
    -   update listing options [commit](https://github.com/jchip/fynjs/commit/c4f701ca7421b79c0ee0125a5b18b0262625f981)
    -   nicer fail error output [commit](https://github.com/jchip/fynjs/commit/0ac51e558d68f5622b42e08ad35485c730cf0ab7)
    -   new options: soe, list, list-full, quiet [commit](https://github.com/jchip/fynjs/commit/a8b0f4d4de2260ef2b6606f6c47212dca15aeee4)
    -   use NAMESPACE [commit](https://github.com/jchip/fynjs/commit/ee1735c29a33911f4d3fb0d3dc8196c50d2cd336)
    -   display searched namespace [commit](https://github.com/jchip/fynjs/commit/89b5213acc3b1b624a84ebfa3553c78587a26247)
    -   update task lookup to return all info [commit](https://github.com/jchip/fynjs/commit/28a4f1347263c5fac158533d1b125b46b01b8aee)
    -   count tasks [commit](https://github.com/jchip/fynjs/commit/1149f5d7a529b5d81e720745d088ffed7a230625)
    -   use xsh [commit](https://github.com/jchip/fynjs/commit/362b86ead6bb9c2b028932feda64cf48e7b31ab0)
    -   shcmd [commit](https://github.com/jchip/fynjs/commit/380a96b0ba0d51051bf95f8cd6e0aec68eb37440)
    -   format elapse time to min/sec/msec [commit](https://github.com/jchip/fynjs/commit/29c04e1b39c9699877a917883e647a7726b92508)
    -   0.1.5 [commit](https://github.com/jchip/fynjs/commit/35b6d075a9c8ec057c5d99fbabe474b14661064a)
    -   cleanup dir with CWD [commit](https://github.com/jchip/fynjs/commit/041da4921815324642a7bca3fb856b9055887484)
    -   catch empty namespace [commit](https://github.com/jchip/fynjs/commit/df916b49530183a96409057cf534cc943e5cb10b)
    -   specify namespace with leading : [commit](https://github.com/jchip/fynjs/commit/88186e49a39c60163ee42f713897f7d304504c9e)
    -   NixClap [commit](https://github.com/jchip/fynjs/commit/a185f4165acffda83c1ad75ff00c06debc906fb3)
    -   pretty print tasks to console [commit](https://github.com/jchip/fynjs/commit/bf5182898c6bc472d3bd64d79e6fe2062d7ae9d6)
    -   remove uneccessary nextTick calls [commit](https://github.com/jchip/fynjs/commit/9ce8685f179921ed471fbef01af39b61ea9a7c83)
    -   add hr timing [commit](https://github.com/jchip/fynjs/commit/9f1ee82c7a2bccf37ee50b37bdcc694cddf00b8a)
    -   fix elapse logging [commit](https://github.com/jchip/fynjs/commit/499c8dd9dada187ef3063f639103a0d8223eabea)
    -   tweak timestamp and indent colors [commit](https://github.com/jchip/fynjs/commit/a19ca896f3fa306caebd2ba2cc0f5eac4b91bb60)
    -   make sure concurrent array are executed in order [commit](https://github.com/jchip/fynjs/commit/ad4a8e4a9ab17da3452cb6a0488beff0c180e16c)
    -   tweak console reporter output [commit](https://github.com/jchip/fynjs/commit/9df34a30896882ea1074121d3804aae3b1a87022)
    -   refactor execution pipeline [commit](https://github.com/jchip/fynjs/commit/29ae0f351ecc72ff65f53831e44f0e186c6c205a)
    -   supply context with run to task function [commit](https://github.com/jchip/fynjs/commit/c2abf15b1fd3f78ad356b1a075cd31650cb0a2aa)
    -   travis [commit](https://github.com/jchip/fynjs/commit/b6a1622d06e5624b2bd025fe3dd40905ae8a32bc)
    -   red fail [commit](https://github.com/jchip/fynjs/commit/b4a620de14ac977aa858935c7a28d8f5b6f8d1ee)
    -   nextTick [commit](https://github.com/jchip/fynjs/commit/d50650ee5382f98be849487df7e6f837f60e45ac)
    -   fix dependency processing [commit](https://github.com/jchip/fynjs/commit/f1a817cb8387cb9e0f5809fb77c5d0b1bfb3c83c)
    -   refactor moreFromFn [commit](https://github.com/jchip/fynjs/commit/085aaf6f9380538a49eff99f54e8d80b36efc182)
    -   refactor xqtor execute [commit](https://github.com/jchip/fynjs/commit/ce3c3c9956749f58125291b30f9604c9354d5579)
    -   refactor how qitem value is lookup from name [commit](https://github.com/jchip/fynjs/commit/8e01e150a35078f01b259515a34e0f927452800b)
    -   add console reporter [commit](https://github.com/jchip/fynjs/commit/d50ed7dd7563c3b3e7303e72dff561e1ea839784)
    -   add wait for pending async [commit](https://github.com/jchip/fynjs/commit/fcd41ad1a52cefdc804dfdff93b1569bb08e8016)
    -   adding tests [commit](https://github.com/jchip/fynjs/commit/5b640dc30ef42a696486c25c60d6f24d4019d1ba)
    -   emit events instead of logging directly [commit](https://github.com/jchip/fynjs/commit/11308faa6d8997d929feccfdc882ffe754f336dd)
    -   process value returned from function task [commit](https://github.com/jchip/fynjs/commit/7c7ec35d9a5ff3ab642cbe3e35e525fb00dab279)
    -   formatting [commit](https://github.com/jchip/fynjs/commit/cc4da9a952c02fa459b3cfbee35ac7be195188b3)
    -   tweak and improve logging [commit](https://github.com/jchip/fynjs/commit/5e90b155547dc87b174aa9c663feb6b515afbba4)
    -   xq shell cmd [commit](https://github.com/jchip/fynjs/commit/3d11fd3a2b139f4cf0418fbe9a563db52108f50a)
    -   add xqTree [commit](https://github.com/jchip/fynjs/commit/d39606f33c6e7521ee7d46986e2ab55fcb508f1b)
    -   Initial commit [commit](https://github.com/jchip/fynjs/commit/a998af3849ba608c03b3bf07c96b4d8b6939b1da)

-   `notes`

    -   FJM-63: dual-mode-template ESM-only reference implementation [min] [commit](https://github.com/jchip/fynjs/commit/2df56e64e670c0d9ef11dea7f77303c3620e5369)
    -   FJM-62: raise node floor to >=22.12.0 and pin CI matrix to the floor [commit](https://github.com/jchip/fynjs/commit/cf000d60b54af871a8d8857a0cbaa12de1dd38e0)
    -   FJM-58: set minimum node version to >=22.0.0 across all packages [commit](https://github.com/jchip/fynjs/commit/0596e06e366d73c40be5bcae36004f012f8a1fa3)
    -   FPO-16: add publish-scoped package filter and fix layout-bound release paths [commit](https://github.com/jchip/fynjs/commit/02436877d03bde3a0378775a1d6ccd221d6be7ee)
    -   feat(fyn): add live local source exports [commit](https://github.com/jchip/fynjs/commit/e93d0b58dffb2904c48f647ef167d10dc2d7c61b)
    -   fyn(fix): package dir should always have node_modules prefix [commit](https://github.com/jchip/fynjs/commit/eead8c3ec502842889f78680b981560aacd88905)

-   `packages`

    -   rename create-fynpo [commit](https://github.com/jchip/fynjs/commit/2fb3bcc42afbcd66eabbb8cdf83e6dbd9fb78dd0)
    -   fix deps ands build [commit](https://github.com/jchip/fynjs/commit/8ca4b45298b7ed1554403a5d64df5c12017fedf1)
    -   FPM-40: update repository and homepage URLs to jchip/fynjs [commit](https://github.com/jchip/fynjs/commit/9fba4f2053dd30044ad8140057948ea9d8d64417)
    -   FPM-38: fix TS2441 require reserved name in create-fynpo [commit](https://github.com/jchip/fynjs/commit/c86ba4b334d7b200ab5d73be4c6e0e88389b8667)
    -   FPM-30: convert remaining require() calls to createRequire pattern [commit](https://github.com/jchip/fynjs/commit/6768a8112a502d06a7d25f6f5c825746f9d238d3)
    -   FPM-29: migrate test spec and package files to ES module imports [commit](https://github.com/jchip/fynjs/commit/c0e3c957bf7fd7ba3d6c4cd5412ca5d7b65aa7bb)
    -   create-fynpo: make private [commit](https://github.com/jchip/fynjs/commit/c46ec537b30aa8517d06f994b6a8e626c8ddcd77)
    -   [Publish] [commit](https://github.com/jchip/fynjs/commit/e8d8e5afde377cecdea0d448ac686781c2083210)
    -   fix fynpo publish [commit](https://github.com/jchip/fynjs/commit/3085e89683fc3748167e12f9f85dfc4b3ff442a1)
    -   chore: update xsh 0.4.6 [commit](https://github.com/jchip/fynjs/commit/6e6671d794ca863913ad366e6d3ee70a60e73baf)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/3764dc95ca92f33adbf5a84c981889f749b2cfa9)
    -   [Publish] [commit](https://github.com/jchip/fynjs/commit/a052b33a81ca5984a34a20ad5338246149d11c7b)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/881c28ff28d09f6922201c5dd77b81458eff19c4)
    -   chore: update docs [commit](https://github.com/jchip/fynjs/commit/b1a49fc349f4be0192dfb0f18bbb045b7df37507)
    -   chore: update license and homepage [commit](https://github.com/jchip/fynjs/commit/19823db5801cdfdf8db3d4b8127084627e6d8184)
    -   [chore] update dep publish-util [commit](https://github.com/jchip/fynjs/commit/5eed0fead5e9b5c014d039efc22e7f98184d3066)
    -   [Publish] [commit](https://github.com/jchip/fynjs/commit/5e42a4b89511abf32d27fa8d53cc9211a64805fe)
    -   [chore] update publish info [commit](https://github.com/jchip/fynjs/commit/176737ea80a1b087589b40b6c51fee8ee3ed6af8)
    -   create-fynpo@1.0.3 [commit](https://github.com/jchip/fynjs/commit/ba06d91241afec9794f9a4af7fc1facac6615829)
    -   Add README to create-fynpo pckage ([#26](https://github.com/jchip/fynjs/pull/26)) [commit](https://github.com/jchip/fynjs/commit/21e3bbcafd6bde19f5b87bbfdd7c2d663ec2bf85)
    -   create-fynpo@1.0.2 [commit](https://github.com/jchip/fynjs/commit/2de3ab4c5baab5373ef09bf053c7a2d58bc1b95f)
    -   create-fynpo@1.0.1 [commit](https://github.com/jchip/fynjs/commit/fd3167810cc31361206c7a47f2a48ded7187154e)
    -   fix: create-fynpo copy packages ([#25](https://github.com/jchip/fynjs/pull/25)) [commit](https://github.com/jchip/fynjs/commit/bc0ad387f731743a6eabab47080f720626369606)
    -   create-fynpo package ([#23](https://github.com/jchip/fynjs/pull/23)) [commit](https://github.com/jchip/fynjs/commit/2aaf32a66ce0b055d25d7e2e10941ef5b2c30dfd)

-   `test`

    -   minor cleanup in tests [commit](https://github.com/jchip/fynjs/commit/adbf1b69a9e0b21a9fac470ec2265d1bf7287e53)
    -   search scripts, tools, build, tasks dir for task script [commit](https://github.com/jchip/fynjs/commit/f3ae107737f3a419020471d4ddd8221bdc518cdd)
    -   vitest [commit](https://github.com/jchip/fynjs/commit/ddc2c8cda751d0b12d6d0842ed3530e48d3f8184)
    -   fix tests [commit](https://github.com/jchip/fynjs/commit/cbf1404a65d30352cafcc8cc4a06bd6a93dd1a23)
    -   new --env option [commit](https://github.com/jchip/fynjs/commit/67991a45c141c817657f585f3e13a7e69692b047)
    -   update tests and nyc [commit](https://github.com/jchip/fynjs/commit/dac6ed68b188f46089acc8d54ad68e51a20a153f)
    -   handle parsing cli and task argv [commit](https://github.com/jchip/fynjs/commit/b1e23d0d300c76ea3f164b4f04579faf012f096c)
    -   export function that are for testing under INTERNALS symbol [commit](https://github.com/jchip/fynjs/commit/36725cab4f362e9975210f78db400dc0783ea552)
    -   use env XRUN_QUIET to propagate the quiet flag [commit](https://github.com/jchip/fynjs/commit/3ce0c9de804eb0c0f0c6ff46d563b8941c0ea887)
    -   tests for cli/xrun.js [commit](https://github.com/jchip/fynjs/commit/f3745a28d925c8a7d5e216ad78b8fd14b6d6fb86)
    -   more tests for cli/task-file.js [commit](https://github.com/jchip/fynjs/commit/0ba68720a95d30ce2bfbc724453838eedae5f076)
    -   some minor cleanups [commit](https://github.com/jchip/fynjs/commit/f9ac55405fbbffae38ccac8d40a38708fc2d1a78)
    -   add more cli tests [commit](https://github.com/jchip/fynjs/commit/0ccbc881968f659bd0d017ecd6bb4223cb16de60)
    -   some logging fixes [commit](https://github.com/jchip/fynjs/commit/9f1ff16bcc7185b999ef6b32dea6ad670c13d7df)
    -   more tests for cli [commit](https://github.com/jchip/fynjs/commit/3322bb9652228ff079bc1687f1379b0b00449ca6)
    -   update bin startup [commit](https://github.com/jchip/fynjs/commit/754a03cd19a3f8b614d64a6b9a528f776a455638)
    -   updating cli [commit](https://github.com/jchip/fynjs/commit/7be69c593432dcd388a23222fda1c2c743127a47)
    -   update nix-clap and optional-require [commit](https://github.com/jchip/fynjs/commit/ffe710ac685c713aef0880b08046c1b415bed4f0)
    -   add coveralls and eslint [commit](https://github.com/jchip/fynjs/commit/825cce71aa62d0f96bf02198db546fe66f17b196)
    -   run npm scripts even if no xrun-tasks file exist [commit](https://github.com/jchip/fynjs/commit/70bdfaf65a8c06729b765918db613add961c45d2)
    -   convert to monorepo [commit](https://github.com/jchip/fynjs/commit/952e06d7b09e5dfface72e8311f1d96ba8ff8874)
    -   delay for test [commit](https://github.com/jchip/fynjs/commit/50e62dbd7f04f96d90a1601d840c91a74b651f53)
    -   rename to @xarc/run [commit](https://github.com/jchip/fynjs/commit/578698c061998f299d5acb29aa821312c8104248)
    -   update tests [commit](https://github.com/jchip/fynjs/commit/52c70e21e0b21d4ed3f6aa26c413c5949cd4ce6a)
    -   add updateEnv API [commit](https://github.com/jchip/fynjs/commit/4c23884b023488d799293254c05260dd9cabf01f)
    -   support override flag for env [commit](https://github.com/jchip/fynjs/commit/0c4dd89da2e8054e55f83ad80b0ee02f60a9495d)
    -   update chalk@4.0.0 [commit](https://github.com/jchip/fynjs/commit/19998837d649ac0a0d2552931756b0287a9c6022)
    -   nix-clap [commit](https://github.com/jchip/fynjs/commit/81fb1c4692b8a88b6c1bf4c636aeb56964d2c139)
    -   increase timeout for tests [commit](https://github.com/jchip/fynjs/commit/445c4d729edd5b95c7030807406f5676f71b4157)
    -   use a symbol to trigger execution engine to stop [commit](https://github.com/jchip/fynjs/commit/a47d27c88aa921f562993a3b3d8b1cbd552c53c8)
    -   add parallel alias for concurrent [commit](https://github.com/jchip/fynjs/commit/4688f215000b14c972c8d5eca26a01f6e2fca3e9)
    -   handle ChildProcess returned from a function [commit](https://github.com/jchip/fynjs/commit/d46f6b319794feb1004e9dfad5c6b45c9a233d55)
    -   add xclap.stop [commit](https://github.com/jchip/fynjs/commit/6389ab1cbc57aef737cebfb2f98cb323f1bf5efd)
    -   drop node 8 from CI [commit](https://github.com/jchip/fynjs/commit/4768d4ec859f0595b0863bdf56474fe28a68e4d9)
    -   test task spec APIs without instance [commit](https://github.com/jchip/fynjs/commit/bb7aea9689ece641fcb33ffff9e627ad33ab68a9)
    -   tests for env task spec [commit](https://github.com/jchip/fynjs/commit/2f62890e6531b2acfff95a793ab51fdf2ccc3b0c)
    -   allow delete env using undefined or null [commit](https://github.com/jchip/fynjs/commit/8f14ee266c7de304094a079c2eddfcece7dd92f5)
    -   no array for err [commit](https://github.com/jchip/fynjs/commit/fef0537db689252dd94f4bbf572ba45ddfedc3b7)
    -   handle streams [commit](https://github.com/jchip/fynjs/commit/8ca67074a582ac6c7d3991b27ab33beba924c285)
    -   execute npm scripts pre/post steps and with tty/sync flags [commit](https://github.com/jchip/fynjs/commit/fb06e46a977d17ebb8265bdce9459380bac56a06)
    -   tasks flow decorators: serial or concurrent [commit](https://github.com/jchip/fynjs/commit/b377ccf2b07722c6548381d2a68ecf8ba3396bea)
    -   add a XTaskSpec and xclap.exec for exec shell cmd [commit](https://github.com/jchip/fynjs/commit/d36c543c73fbfa046141910da5901f9e40cd0d12)
    -   use jaro-winkler dist to suggest closest task names when not found [commit](https://github.com/jchip/fynjs/commit/4a11aad5c072998a519e03aa7a7a396d7fb59779)
    -   update logger [commit](https://github.com/jchip/fynjs/commit/f50617d6bfa9a590ba4ba44e992e6177eedcd4e4)
    -   check for unknown shell flags [commit](https://github.com/jchip/fynjs/commit/1cd70804791611c386a1df59a42915cc1a7cb132)
    -   support async functions [commit](https://github.com/jchip/fynjs/commit/6180962d8869d5f74bdead8b9caf0da5c733379f)
    -   support spawn/tty for shell tasks [commit](https://github.com/jchip/fynjs/commit/3b1b1de93c36db0ea6dc5816f6f4c9dc43337143)
    -   use string-array module [commit](https://github.com/jchip/fynjs/commit/343f77a97143f31f7dfaa5f7e68621b432c35c91)
    -   fix namespace display for task that has it already [commit](https://github.com/jchip/fynjs/commit/eb1a21706cd2966ac003b286fa339e76557b2cea)
    -   implement finally hook [commit](https://github.com/jchip/fynjs/commit/6b94cabb46c6c00682f78ac5dabbba9d74846380)
    -   allow soft stop so pending task can complete [commit](https://github.com/jchip/fynjs/commit/1c159929a6a924a9efd17bec7c8fb93080cf6454)
    -   fynpo [commit](https://github.com/jchip/fynjs/commit/2f2010bb1e0e173eec9680c0b939f3af72836269)
    -   process task options and pass as argv [commit](https://github.com/jchip/fynjs/commit/1682c5a4ccc98ae693f3f51559e587beec22760b)
    -   support specifying optionally execute task [commit](https://github.com/jchip/fynjs/commit/58af87cf25ed2400e68980f3c083f8cbab6247de)
    -   parse and execute array in a string [commit](https://github.com/jchip/fynjs/commit/3db34f63c817874d6f6c1ae999f6e5839ccc3553)
    -   support adding namespace with orders [commit](https://github.com/jchip/fynjs/commit/5380fab050a98027b17345acdfdbc35d251be81a)
    -   support directly passing array from command line [commit](https://github.com/jchip/fynjs/commit/e9ddce85adce40687155208955eda4e009d6e30b)
    -   fix test for node 4 [commit](https://github.com/jchip/fynjs/commit/ec891e395f619c683ce38780722b9ec48b4a548d)
    -   change namespace sep to / [commit](https://github.com/jchip/fynjs/commit/33089346656bec5eae9a12a31c0933bdffaa2199)
    -   update loading clapfile [commit](https://github.com/jchip/fynjs/commit/1712082ea916a179a2ddc4f8f5056c4defa05a02)
    -   nicer fail error output [commit](https://github.com/jchip/fynjs/commit/0ac51e558d68f5622b42e08ad35485c730cf0ab7)
    -   new options: soe, list, list-full, quiet [commit](https://github.com/jchip/fynjs/commit/a8b0f4d4de2260ef2b6606f6c47212dca15aeee4)
    -   display searched namespace [commit](https://github.com/jchip/fynjs/commit/89b5213acc3b1b624a84ebfa3553c78587a26247)
    -   update task lookup to return all info [commit](https://github.com/jchip/fynjs/commit/28a4f1347263c5fac158533d1b125b46b01b8aee)
    -   count tasks [commit](https://github.com/jchip/fynjs/commit/1149f5d7a529b5d81e720745d088ffed7a230625)
    -   use xstdout [commit](https://github.com/jchip/fynjs/commit/35e5509212dd8945fdb0dbdbec0acf543683de4f)
    -   use xsh [commit](https://github.com/jchip/fynjs/commit/362b86ead6bb9c2b028932feda64cf48e7b31ab0)
    -   format elapse time to min/sec/msec [commit](https://github.com/jchip/fynjs/commit/29c04e1b39c9699877a917883e647a7726b92508)
    -   0.1.5 [commit](https://github.com/jchip/fynjs/commit/35b6d075a9c8ec057c5d99fbabe474b14661064a)
    -   cleanup dir with CWD [commit](https://github.com/jchip/fynjs/commit/041da4921815324642a7bca3fb856b9055887484)
    -   specify namespace with leading : [commit](https://github.com/jchip/fynjs/commit/88186e49a39c60163ee42f713897f7d304504c9e)
    -   NixClap [commit](https://github.com/jchip/fynjs/commit/a185f4165acffda83c1ad75ff00c06debc906fb3)
    -   pretty print tasks to console [commit](https://github.com/jchip/fynjs/commit/bf5182898c6bc472d3bd64d79e6fe2062d7ae9d6)
    -   remove uneccessary nextTick calls [commit](https://github.com/jchip/fynjs/commit/9ce8685f179921ed471fbef01af39b61ea9a7c83)
    -   tweak timestamp and indent colors [commit](https://github.com/jchip/fynjs/commit/a19ca896f3fa306caebd2ba2cc0f5eac4b91bb60)
    -   add tests [commit](https://github.com/jchip/fynjs/commit/f139b1d280aae8f093ce1bc102e9e0a3b482615a)
    -   make sure concurrent array are executed in order [commit](https://github.com/jchip/fynjs/commit/ad4a8e4a9ab17da3452cb6a0488beff0c180e16c)
    -   tweak console reporter output [commit](https://github.com/jchip/fynjs/commit/9df34a30896882ea1074121d3804aae3b1a87022)
    -   handle error from shell command [commit](https://github.com/jchip/fynjs/commit/23c6ccd28540d43602df920d006d274e84c8abe9)
    -   refactor execution pipeline [commit](https://github.com/jchip/fynjs/commit/29ae0f351ecc72ff65f53831e44f0e186c6c205a)
    -   supply context with run to task function [commit](https://github.com/jchip/fynjs/commit/c2abf15b1fd3f78ad356b1a075cd31650cb0a2aa)
    -   tests for serial and concurrent tasks [commit](https://github.com/jchip/fynjs/commit/522f1adb5475c290c74b99bebb79b2831b3d1809)
    -   travis [commit](https://github.com/jchip/fynjs/commit/b6a1622d06e5624b2bd025fe3dd40905ae8a32bc)
    -   fix dependency processing [commit](https://github.com/jchip/fynjs/commit/f1a817cb8387cb9e0f5809fb77c5d0b1bfb3c83c)
    -   refactor how qitem value is lookup from name [commit](https://github.com/jchip/fynjs/commit/8e01e150a35078f01b259515a34e0f927452800b)
    -   add console reporter [commit](https://github.com/jchip/fynjs/commit/d50ed7dd7563c3b3e7303e72dff561e1ea839784)
    -   adding tests [commit](https://github.com/jchip/fynjs/commit/5b640dc30ef42a696486c25c60d6f24d4019d1ba)
    -   Initial commit [commit](https://github.com/jchip/fynjs/commit/a998af3849ba608c03b3bf07c96b4d8b6939b1da)

-   `testing`

    -   [Publish] [commit](https://github.com/jchip/fynjs/commit/120b63a74a741f94261056dbaed10e3842aaf1d2)
    -   FPM-46: opt monorepo-test out of default-on enforceRegistryDeps (--no-enforce-registry-deps) [commit](https://github.com/jchip/fynjs/commit/c4d7cc0a51fd26c7991795e8631bb355cdd6d6c3)
    -   [Publish] [commit](https://github.com/jchip/fynjs/commit/c1639544f0b03627658437cfb85922f31eca5ff0)
    -   [Publish] [commit](https://github.com/jchip/fynjs/commit/4e31938e17156536901f8fd8c6e622cf055d3e82)
    -   fix: run testing in ci check [commit](https://github.com/jchip/fynjs/commit/310d86ceb71de3e66aeaa23d5567e77e463e3516)
    -   update deps [commit](https://github.com/jchip/fynjs/commit/534a482c2086a3aeeefd2d0f03616aab307ca143)
    -   [Publish] [commit](https://github.com/jchip/fynjs/commit/e92c7164c9139c9d16d48f6f9acb0ff214516ab4)
    -   add separate monorepo testing [commit](https://github.com/jchip/fynjs/commit/5295d9f92cf5659292fbf074f1ed0170daebb9ed)

-   `MISC`

    -   FPO-19: drop root prepublishOnly release gate - ci:check already runs the same test [commit](https://github.com/jchip/fynjs/commit/fff2ef95aaafa471415316d5ed4df4886a74c732)
    -   FJM-87: add node engines baseline to monorepo root package.json [commit](https://github.com/jchip/fynjs/commit/ec10c0ce800568a6c4628d8bf0819e5e5ac83b0e)
    -   chore: update top level dep [commit](https://github.com/jchip/fynjs/commit/1f247991de7eb6567d7ae73c237b253310d726e8)
    -   chore: update dep [commit](https://github.com/jchip/fynjs/commit/e968c7389fbd44a8fbb9320122540452d5ccd5c5)
    -   chore: update dep [commit](https://github.com/jchip/fynjs/commit/f7d8d8a39928e78ff3b6d26f1db309f27574fc4a)
    -   chore: update dep [commit](https://github.com/jchip/fynjs/commit/d3a6dc66b004aa0dbfa182f3c676439f631cbfa5)
    -   update to fynpo,fyn v2 [commit](https://github.com/jchip/fynjs/commit/1eed0a41118d83863899c0797479665a8366da1c)
    -   fynpo: update tests [commit](https://github.com/jchip/fynjs/commit/0ce4c1a4227160f88c4b87cedcc216ab6caa8255)
    -   chore: update deps [commit](https://github.com/jchip/fynjs/commit/951c3a29f75ad51903bf8237108da770a6045e06)
    -   fynpo: use tsx to execute .ts directly [commit](https://github.com/jchip/fynjs/commit/5208b18be65dab11e4bc4b3a6dae2f8d1f7c8fda)
    -   tests for fetching packages from git repo [commit](https://github.com/jchip/fynjs/commit/71d9c0508897adf7fec3ba425542bfdb894b14a7)
    -   2.3.0 [commit](https://github.com/jchip/fynjs/commit/43692dd31b79eaecfa9fbb4ff037331e5e2e1395)
    -   Update nix-clap from v1.3 to v2.3 and fix import/args format [commit](https://github.com/jchip/fynjs/commit/cd7497c8e2e1ace93e8c6617d45eb1f65de06844)
    -   2.2.0 [commit](https://github.com/jchip/fynjs/commit/7512e8c88a1ca5d2b2fe0cb4531c5655d64de091)
    -   2.1.5 [commit](https://github.com/jchip/fynjs/commit/70b15b7398faa49db3a6a93e659afec676f73487)
    -   2.1.4 [commit](https://github.com/jchip/fynjs/commit/5b1bd68f46d23b5fa448614955e7adee949638f5)
    -   2.1.3 [commit](https://github.com/jchip/fynjs/commit/fbd972f25395387a32a0dec9a79a571f022e489e)
    -   2.1.2 [commit](https://github.com/jchip/fynjs/commit/8b4e17d0441cfd800f315c4a7ad339dbb5f6422d)
    -   update dep and publish tag [commit](https://github.com/jchip/fynjs/commit/50d45bbcb7a544c34c3b010646d79f6dc8592fb5)
    -   chore: update deps [commit](https://github.com/jchip/fynjs/commit/8b6e538c2eefe1feb3d0bc9450ae8c7d94fbc46a)
    -   2.1.1 [commit](https://github.com/jchip/fynjs/commit/0167ed1eda58777c53979b522d8caf2cfbd0d686)
    -   2.1.0 [commit](https://github.com/jchip/fynjs/commit/1d102daf48675dbd2ffba61be0f1935e05bd55a5)
    -   2.0.3 [commit](https://github.com/jchip/fynjs/commit/af6f557a83ab871d52cad8285e0b0a1489cd1eae)
    -   2.0.2 [commit](https://github.com/jchip/fynjs/commit/16799ea0b1e1110e72db24e1a61c5e7f8b21fb3f)
    -   2.0.1 [commit](https://github.com/jchip/fynjs/commit/24bbf1e5dfa5377116f767fb016edc183bdb5c4d)
    -   2.0.0 [commit](https://github.com/jchip/fynjs/commit/6011bf30dcc45607ccd910d295999b96e9dc7cd7)
    -   fyn: update publish-util [commit](https://github.com/jchip/fynjs/commit/39cb037f0f58ccb0509eedbdbff5ba005c9eadd2)
    -   1.1.2 [commit](https://github.com/jchip/fynjs/commit/43edbcc6c80602abf640fbac06f635bfe38d099f)
    -   chore: update fynpo to 1.1.43 [commit](https://github.com/jchip/fynjs/commit/22e57cef41c4f0042346628cf61e06cb8e2db2f2)
    -   update fynpo version [commit](https://github.com/jchip/fynjs/commit/f667bd7ec7d429e4dc1471c87f9c05b19f8ec82e)
    -   update dep fynpo@1.1.35 [commit](https://github.com/jchip/fynjs/commit/656f0273902d62fcdae7e3763222971653caed4a)
    -   update dep and lockfiles [commit](https://github.com/jchip/fynjs/commit/ee8996250b921529d1f293f21730958b23f7c073)
    -   update deps [commit](https://github.com/jchip/fynjs/commit/893deb5e3f68a7920ed82866044a5d85f84d6546)
    -   fynpo run with stream [commit](https://github.com/jchip/fynjs/commit/94607ee0ac03825fde27c133a733bc4b707f25ba)
    -   fix init-package test [commit](https://github.com/jchip/fynjs/commit/fab42128c92642ec984894760e8a42136cbc441d)
    -   1.1.1 [commit](https://github.com/jchip/fynjs/commit/c6efd335a3335998472f45c191551bf9365da8b4)
    -   release fynpo with webpack bundled code [commit](https://github.com/jchip/fynjs/commit/4170a78e08f25f221840ab643c4380a046f91b12)
    -   chore: update top dep [commit](https://github.com/jchip/fynjs/commit/52adc247e2de7667a4f596b4618f77291ca94b8e)
    -   chore: update top dep [commit](https://github.com/jchip/fynjs/commit/2d6342ee0ec9ecdf582acc84ba0000a9244f8500)
    -   chore: update top dep [commit](https://github.com/jchip/fynjs/commit/d77734a6285ac3e595da78f37963311bb232f5b1)
    -   chore: update top dep [commit](https://github.com/jchip/fynjs/commit/9b95b57faf2e87528668bb640c7189d31cb2f790)
    -   chore: update dep [commit](https://github.com/jchip/fynjs/commit/7370f7849bbc0deabb3a314b661bf52c9488cc1a)
    -   chore: update top dep [commit](https://github.com/jchip/fynjs/commit/5242e55d0d3e59257a23f94e1cad982472974930)
    -   chore: update top lockfile [commit](https://github.com/jchip/fynjs/commit/4cd219b29a9d03b2e344fb7121ffbf0c7b620509)
    -   chore: update lockfile [commit](https://github.com/jchip/fynjs/commit/78e947b060f6c17c5192dfd3854f87711072ca60)
    -   1.1.0 [commit](https://github.com/jchip/fynjs/commit/a98bc311dfc8d65c204ea29beb1b5ec6ebd90e97)
    -   chore: update dep [commit](https://github.com/jchip/fynjs/commit/062132fff7dc2fa6b083684ee8a79f6b5ec36ffa)
    -   chore: add badges [commit](https://github.com/jchip/fynjs/commit/0c49668e2ba93a95b2f102098f6f0eb6d64e5b53)
    -   [chore] update fynpo to 0.4.1 [commit](https://github.com/jchip/fynjs/commit/4bab8320766901ed3f59644240354adbf9fe4240)
    -   [chore] update dep fynpo [commit](https://github.com/jchip/fynjs/commit/b5bb13f27bc916b2fa2977707f625debacfde69e)
    -   [chore] update top lockfile [commit](https://github.com/jchip/fynjs/commit/93b3bc09f6d6576e9bdd1c8a805a9056c8651f5d)
    -   [chore] update top level dep and lockfile [commit](https://github.com/jchip/fynjs/commit/ba91ff1193ac92f3c55ea15f6aa02c40c5bc6494)
    -   [fix] bootstrap should not add local deps ([#16](https://github.com/jchip/fynjs/pull/16)) [commit](https://github.com/jchip/fynjs/commit/9ca5158ebe9c438f2a322ca93aeed6a3fbc33bf2)
    -   Revert 1.0.1 [commit](https://github.com/jchip/fynjs/commit/37cf719a69cc0093b35cd15b99ca347ab6c69c65)
    -   1.0.1 [commit](https://github.com/jchip/fynjs/commit/0a03948a02f32b5b6a2894392a5b186466192ed4)
    -   fix publish config [commit](https://github.com/jchip/fynjs/commit/7a2e89b9f2c79efd887cf348efdbeb13da6e5309)
    -   1.0.5 [commit](https://github.com/jchip/fynjs/commit/81eeefc9e4b2f6dc15b83ea59ce04c68d432182e)
    -   update dep [commit](https://github.com/jchip/fynjs/commit/2837b7562c1e617c301d2b1b778057660151bc0e)
    -   1.0.4 [commit](https://github.com/jchip/fynjs/commit/17051e171a11d4fdfbda1256575befc27b782998)
    -   0.1.32 [commit](https://github.com/jchip/fynjs/commit/02cc6bd5da0fcb8c9e68ed56ca496e65f433df29)
    -   0.1.31 [commit](https://github.com/jchip/fynjs/commit/cb542f9159bfeb25da29c29fc433653dba4e9054)
    -   0.1.30 [commit](https://github.com/jchip/fynjs/commit/b60e0e5a23e71a4ea1465092798aeab7abd36e3e)
    -   0.1.29 [commit](https://github.com/jchip/fynjs/commit/52296f853b1009862c57cfac5e9369ae05f83f34)
    -   0.1.28 [commit](https://github.com/jchip/fynjs/commit/7902e8c174f464df8a454df5f32d7c5e97d5da5a)
    -   1.0.3 [commit](https://github.com/jchip/fynjs/commit/1f1ecc7f674576ab0e4435a9f8a09888e71309db)
    -   1.0.2 [commit](https://github.com/jchip/fynjs/commit/4220ebc001af7692d2e0234f99f86216e3f29f9e)
    -   1.0.1 [commit](https://github.com/jchip/fynjs/commit/ca5f2ba29e72201fcd01ef0a34e59b08b60cefbc)
    -   1.0.0 [commit](https://github.com/jchip/fynjs/commit/d0873849d5e21bf6410ac59a7cd072fd8be2f538)
    -   update publish config [commit](https://github.com/jchip/fynjs/commit/dea2587f4b1354b10fd1336c52f1cf1e0685e6dc)
    -   update deps [commit](https://github.com/jchip/fynjs/commit/75099322fcfd9ac4e95e5092d3194926d7757a40)
    -   0.1.27 [commit](https://github.com/jchip/fynjs/commit/7736791df9c65b270f928167d288666bd5f79e6a)
    -   0.2.51 [commit](https://github.com/jchip/fynjs/commit/e3c1660ecbd6045b225f4faba47305cace4dbe6a)
    -   0.2.50 [commit](https://github.com/jchip/fynjs/commit/f0352307db1ec3cbf0addf41dd13a28d54512f8d)
    -   0.2.49 [commit](https://github.com/jchip/fynjs/commit/9f50d6b99bdd5eece304e0c5cc8ea66551a1ebd7)
    -   0.1.26 [commit](https://github.com/jchip/fynjs/commit/e62a38f2ea9ed496933103717c00d3ebf59a1554)
    -   0.2.48 [commit](https://github.com/jchip/fynjs/commit/e45653c2631e99e28742a27f8fbf3546bbee7074)
    -   0.2.47 [commit](https://github.com/jchip/fynjs/commit/fa510ce9b75b469c8a7451d6c2ab1aa4f3667ea2)
    -   0.2.46 [commit](https://github.com/jchip/fynjs/commit/46197567fc63989ec4dbcebc22c802b96aa0f21e)
    -   0.2.45 [commit](https://github.com/jchip/fynjs/commit/3fff97077aebead0f507a7aeb499d6de78cf6a18)
    -   0.2.44 [commit](https://github.com/jchip/fynjs/commit/c44ae5b1a380fdeefc25497b8ca92664df991137)
    -   0.2.43 [commit](https://github.com/jchip/fynjs/commit/3a46069f30d27025761167e612ce68e7566d0f43)
    -   0.2.42 [commit](https://github.com/jchip/fynjs/commit/33d9685bfb8580b85a8f86e70bd40fea2c7b5bc9)
    -   0.1.25 [commit](https://github.com/jchip/fynjs/commit/a95a8b7878e257e47fd7fab71482bec17f675746)
    -   0.2.41 [commit](https://github.com/jchip/fynjs/commit/959276a9c67d0ece8795bb770a236e0a95885340)
    -   0.2.40 [commit](https://github.com/jchip/fynjs/commit/d6be1942dadb32f924b40d95e7e1c41070387e93)
    -   0.2.39 [commit](https://github.com/jchip/fynjs/commit/35f4bd24e3de22aea795e42c9f4c64ed9571c357)
    -   0.2.38 [commit](https://github.com/jchip/fynjs/commit/c2f050062a0e291a97ec91ed408f8aa119c67a0e)
    -   0.1.24 [commit](https://github.com/jchip/fynjs/commit/2690ecf99458c7d9b017e3ee5cc390146dcd89ce)
    -   0.2.37 [commit](https://github.com/jchip/fynjs/commit/d0e849c8f0e2d61e0ca0a23690570b84773d1211)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/da65f59c1fc46d159e17ed39ffe22ed192e34a6d)
    -   0.2.36 [commit](https://github.com/jchip/fynjs/commit/2dc037ec402afd3ead68d707fe2dc1349d22f07d)
    -   0.2.35 [commit](https://github.com/jchip/fynjs/commit/70fb7ce199b3123067d11bcd4ee386fd79dcfdb9)
    -   0.2.34 [commit](https://github.com/jchip/fynjs/commit/380ffe11222cda906af6ca3d2eb75af2329e0808)
    -   0.2.33 [commit](https://github.com/jchip/fynjs/commit/a70f0d85bda34696ce4065b364d8bdac2adeb81e)
    -   0.2.32 [commit](https://github.com/jchip/fynjs/commit/18b36dfbbfc0f07f7428c978759d3ccedd75f716)
    -   0.2.31 [commit](https://github.com/jchip/fynjs/commit/32c4182a6fd1614e5de10561869e5c742fc96c4a)
    -   0.1.23 [commit](https://github.com/jchip/fynjs/commit/56cff9f9d5ef50b2329f672c2fd7b74cee5e2122)
    -   0.2.30 [commit](https://github.com/jchip/fynjs/commit/20562ce7be4a2862a94598c74146b8aa363b00d4)
    -   0.2.28 [commit](https://github.com/jchip/fynjs/commit/39cb598455af0686d877c05a13ff8f41678c1aee)
    -   0.2.27 [commit](https://github.com/jchip/fynjs/commit/3ad989a81fef2aeb9827aacb12e8e6c82a185387)
    -   0.2.26 [commit](https://github.com/jchip/fynjs/commit/d584784d44b746d9899e8e2a9dd56acf79a28e20)
    -   0.2.25 [commit](https://github.com/jchip/fynjs/commit/15c20ebcdd15a2933650c91c41c5b7e0278d6ec1)
    -   0.1.22 [commit](https://github.com/jchip/fynjs/commit/5c034203ead149fa28c272997735e3f792adb79a)
    -   0.1.21 [commit](https://github.com/jchip/fynjs/commit/4bff1dd3ac357882a9e50bd852af865cc9b7ebc9)
    -   0.1.20 [commit](https://github.com/jchip/fynjs/commit/2bea3ae1a2c4290225b959925fe9944d246d2f41)
    -   0.1.19 [commit](https://github.com/jchip/fynjs/commit/50f056fbb97256c739408c5512e9d5cdf6735328)
    -   0.1.17 [commit](https://github.com/jchip/fynjs/commit/994797865cd61973bc6df7e23f29308cfbf920ea)
    -   0.1.16 [commit](https://github.com/jchip/fynjs/commit/5e4daa8d8263c8b294db5e3182dfa731cda7ae15)
    -   0.1.15 [commit](https://github.com/jchip/fynjs/commit/ea9b1608f16109cfab2f46f71f3c1e2470aa13d8)
    -   0.1.14 [commit](https://github.com/jchip/fynjs/commit/7dfd41da9364eeface07aff1c8fe019a2118ee3b)
    -   0.1.13 [commit](https://github.com/jchip/fynjs/commit/4d37402fb3395ff889fa39e8985404c388f7e9fa)
    -   0.1.12 [commit](https://github.com/jchip/fynjs/commit/b4c8204e58e573b109ec26307e6f7fb2a53cb96e)
    -   0.1.11 [commit](https://github.com/jchip/fynjs/commit/94a72bf15e5da7eb0a5ba983b5f816b22fa5fe55)
    -   0.1.10 [commit](https://github.com/jchip/fynjs/commit/8bf6c7e24c1a2f82902592bab7e048bdcb2af14a)
    -   0.1.9 [commit](https://github.com/jchip/fynjs/commit/84a98fd5e1c402a29d02091bb0b6f1de3f3f46c4)
    -   0.1.8 [commit](https://github.com/jchip/fynjs/commit/ce05e7b035db0ce5ba6fa990e280d30388a91c1e)
    -   0.1.7 [commit](https://github.com/jchip/fynjs/commit/d8f986f75bd5b6ef57e8060d62159e56d8a0d0e1)
    -   0.1.6 [commit](https://github.com/jchip/fynjs/commit/adf875961b187b4a80c349d2fbdd9f50cdab615b)
    -   0.2.24 [commit](https://github.com/jchip/fynjs/commit/7cb3b5e10e20a6664b7c360a522812fbc1b98580)
    -   0.2.23 [commit](https://github.com/jchip/fynjs/commit/6f2e2e3fd54d8ee9ca546f04ad8f252a0870422a)
    -   use files in package.json over .npmignore [commit](https://github.com/jchip/fynjs/commit/7268a7be0acb5cc05d2e4644ae7f846c40a85b16)
    -   0.2.22 [commit](https://github.com/jchip/fynjs/commit/f320519b1f000daa43780c88c1db8ced68254758)
    -   0.1.5 [commit](https://github.com/jchip/fynjs/commit/bd8b7620f01a7eff78be8af85a9248d21fadf38a)
    -   0.2.21 [commit](https://github.com/jchip/fynjs/commit/aca2152740d6c00b29bb9ed584e8775984958e84)
    -   0.1.4 [commit](https://github.com/jchip/fynjs/commit/7072ddc38702198412b1490a6de7b78053d573f2)
    -   0.2.20 [commit](https://github.com/jchip/fynjs/commit/84ba09fcaf35a6a59eeccfb8ec14db7d768ed8e2)
    -   0.1.3 [commit](https://github.com/jchip/fynjs/commit/b26f29228c8352da8f829f166760cca1718e9d53)
    -   add repository to package.json [commit](https://github.com/jchip/fynjs/commit/776d3ef8e187ae1727c7b094b535f23b5fdda28a)
    -   0.1.2 [commit](https://github.com/jchip/fynjs/commit/c4c8be8432fcb42c5312f2d13d3cb5a8bd7ae935)
    -   0.2.19 [commit](https://github.com/jchip/fynjs/commit/064db16610d8dc60aa3b10d5a46788f81aaa39b0)
    -   0.2.18 [commit](https://github.com/jchip/fynjs/commit/56813d9739ce889175f86d9e0569ad36a165a78d)
    -   0.2.17 [commit](https://github.com/jchip/fynjs/commit/a59cb7bc5a3283f779779bd5bd5a3ad8e1553dc7)
    -   0.2.16 [commit](https://github.com/jchip/fynjs/commit/9678b1462c85371b9066d798a1d7dadac92e5a36)
    -   0.2.15 [commit](https://github.com/jchip/fynjs/commit/69c4161196ff73de89f7b062601895e0df6efb5e)
    -   0.2.14 [commit](https://github.com/jchip/fynjs/commit/978fec37214ff79aa8037c7dd6ec81614fa9cf71)
    -   update xsh [commit](https://github.com/jchip/fynjs/commit/73d16556de16c21895458447baf4df363df37480)
    -   0.2.13 [commit](https://github.com/jchip/fynjs/commit/6b5d430df4a7462ca4c219638c277997598a52c0)
    -   0.2.12 [commit](https://github.com/jchip/fynjs/commit/c47d7414429f654288c7c03a6e0bd48bd46c9e05)
    -   0.2.11 [commit](https://github.com/jchip/fynjs/commit/3984e821454a6dbace915c46ec5d1435a6c973d3)
    -   0.2.10 [commit](https://github.com/jchip/fynjs/commit/5bb22f1c718673c174c4edf23103248181964b8d)
    -   0.2.9 [commit](https://github.com/jchip/fynjs/commit/fe0f0a47f6113681613a27e2acd0ab752aa51bf6)
    -   0.2.8 [commit](https://github.com/jchip/fynjs/commit/1c45ebec39e7d1e155172d439216192cc681b368)
    -   update to chalk@2 [commit](https://github.com/jchip/fynjs/commit/177d04f80b346678f0f08b71e85fa47eca94a423)
    -   0.2.7 [commit](https://github.com/jchip/fynjs/commit/ad98295f7c6b10c5ac31c264b8cb9519d6cc47f9)
    -   update readme [commit](https://github.com/jchip/fynjs/commit/895c0cff8fa561ca8eea6dfe6e274f59f227813b)
    -   0.2.5 [commit](https://github.com/jchip/fynjs/commit/42c5311100ea2393bb5c13d2e312aa74f15a1e52)
    -   0.2.4 [commit](https://github.com/jchip/fynjs/commit/b500cb71c6cd2f72d74ba039abd40954d4ff4e03)
    -   ignore bin in cover [commit](https://github.com/jchip/fynjs/commit/758bca6d445c5002acf207737e648f2ba509e68e)
    -   0.2.3 [commit](https://github.com/jchip/fynjs/commit/8d0690406b78a162ef95bd42b0e681764477333e)
    -   0.2.2 [commit](https://github.com/jchip/fynjs/commit/cd14d9a2707d2472db1121d3c030438c4fbfb10c)
    -   0.2.1 [commit](https://github.com/jchip/fynjs/commit/a0139c36ffdfc0cc8e6109eaa03b661abfe78b77)
    -   0.2.0 [commit](https://github.com/jchip/fynjs/commit/ce788755d614913a437f4a8c118158c69548cd5c)
    -   0.1.9 [commit](https://github.com/jchip/fynjs/commit/d76d4830a9780a2fe23bdf5fcf31af87efcb5df7)
    -   0.1.8 [commit](https://github.com/jchip/fynjs/commit/a3688c52efc8e21c041295569af0dbb4686e2ef2)
    -   update nyc [commit](https://github.com/jchip/fynjs/commit/f5b5b1dbb9008df515cc8358f5137eef428144dc)
    -   0.1.7 [commit](https://github.com/jchip/fynjs/commit/5efb6bb9554866f016b9f936effb21ac0ec53dfd)
    -   0.1.6 [commit](https://github.com/jchip/fynjs/commit/40a9d7372a4bafc9771bb0d0c44a2e6f09cb2927)
    -   0.1.2 [commit](https://github.com/jchip/fynjs/commit/746ea7776911c171e1a0f1f3e65d2c9e8e35eced)
    -   check coverage for CI [commit](https://github.com/jchip/fynjs/commit/55946fb658639bae005a841c1ac510738b7f2cf2)
    -   0.1.1 [commit](https://github.com/jchip/fynjs/commit/2a6f62ce742d6bf7cc972ac462238dfa43c34f65)
    -   .npmignore [commit](https://github.com/jchip/fynjs/commit/8fe86ddc3edeae487ece78b12eaec380626d4081)
    -   FJM-84: refresh fynpo-data and dependent lockfiles for optional-require updates [commit](https://github.com/jchip/fynjs/commit/834d4986cb0bce77ea16d0c7b68bdbab5bb28add)
    -   FJM-81: bump create-monorepo typescript for chalker 2.x declaration compat [commit](https://github.com/jchip/fynjs/commit/3a35c2e803e71800c11bc262802f57bea1ab2a08)
    -   FJM-72: update fynpo indirect dep data after migrated package installs [commit](https://github.com/jchip/fynjs/commit/1be52bbf4aa97f7e57ab2f5f3a2e27a5a81c20a9)
    -   FJM-69: publish-util pack hooks for visual-exec and xflight, bump fynpo-cli and create-monorepo to ^2.1.0 [commit](https://github.com/jchip/fynjs/commit/3078d85c4c0dd82450a8f706f11745ff1d4c3cbf)
    -   FJM-63: ESM-only build, drop dual CJS output and fix .ts import specifiers [maj] [commit](https://github.com/jchip/fynjs/commit/e4b1cb60a4bbcda8a378fa3423af2bfacd4b8149)
    -   release audit: fix repo/engines/prepublish metadata, migrate nix-clap imports to @fynjs/cli-args, fix fynpo-base topo snapshots [commit](https://github.com/jchip/fynjs/commit/adff353c535521353e33131b6741ea791b4ac084)
    -   chore: update dep data [commit](https://github.com/jchip/fynjs/commit/11c9cf8a22e03fc4e26e678d2102180efbe75c97)
    -   fyn: fix pacote cache key [commit](https://github.com/jchip/fynjs/commit/b87afcad3be8674479391ca8d6ea9d3cf945872f)
    -   update deps [commit](https://github.com/jchip/fynjs/commit/2eb6923f0fe823d232702e7145f1723f37ecbd07)
    -   fyn: helpful error formating [commit](https://github.com/jchip/fynjs/commit/fca4737a7cfbb9731e3ab0a7a81908d5f62cbda9)
    -   fyn: update deps and update fynpo.json [commit](https://github.com/jchip/fynjs/commit/8f85582ed04cdd2e7cbeaad3047e90ea78508b60)
    -   fyn: detect Bun runtime for global package version directories [commit](https://github.com/jchip/fynjs/commit/3ee576f2d8385b52492c10735aa2167fc3068049)
    -   fyn: support overrides [commit](https://github.com/jchip/fynjs/commit/c0f3084050ca04d3c94eccaca6ac5dd019bd3fcf)
    -   update lock files [commit](https://github.com/jchip/fynjs/commit/66b18317c964bab057ec5760c11f4dc701a8c83b)
    -   fynpo: fix tests and flag default [commit](https://github.com/jchip/fynjs/commit/f0c1f1a33c5019b0582617efb01f84b53bf4cf2f)
    -   update lock files [commit](https://github.com/jchip/fynjs/commit/d299a1753f723b0b3e66aa04ba2f512786721d15)
    -   fynpo,fyn: [major] bump to v2 [commit](https://github.com/jchip/fynjs/commit/40bc40fd3cdb5ee06c71f4bd58fb4f1069cc6126)
    -   chore: update deps [commit](https://github.com/jchip/fynjs/commit/d95d9845c9ad1c8bd01905995c9124bc115c15c4)
    -   chore: update lock and meta files [commit](https://github.com/jchip/fynjs/commit/f1cac5ad77dbbb357ef3bc91260502e8065244fd)
    -   3 [commit](https://github.com/jchip/fynjs/commit/d33c5c6e823524982f5842f7c905ea3142749fa8)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/c449920e90d5dddcd50a908749397a0c33285510)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/6618f84ac90e646b9a8ec219723ab3fb1df59b8c)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/424fa9150795e25ebe71f54df162ee3ac62dbd58)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/5cdffd4d6f36116ec3023f91984a72e96baf3af4)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/e8d6d04fa82c58acdba2b2ce7c423ad0d4703d2e)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/4d15027178ddf9fc87c1bff8733856e7b87760e0)
    -   update CHANGELOG [commit](https://github.com/jchip/fynjs/commit/05a6a3dc31906ffd7379f998d0432a41e19a0238)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/03e6dc8057da0dfa8b0d822d7545bd3e4a7d5891)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/f25c56a9e6d86224ca8c0bb3a41e31c60252fe2b)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/9892d06539275db1a6d6cac695f21125c6337676)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/f4f9b0b88c33c2ba7717448a448574793f5c9ee4)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/de5ce7f30f492fbcf7a60b10f16e775982685b7e)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/f1cd228e6045d0bff3955941c20941371c1827f5)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/6a9a54d8b6862d8aad14df83245140831f792156)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/05590bc1f68948fd909de0f33585db42a24123e6)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/fbd197b1fe3364f85e61f6e21683e602496c42fc)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/19969c6069fa9872872da92e62034f539d521792)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/dab77b34f7c14d0f17e671fea63eda6d265ce1f8)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/9fd2fe031a1d6793fab13c0ca1fb84a7440ec12f)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/2bc7c8e773910faf6123de74cd1f1f98c99c5eb7)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/55f214783e325d6fc0fed909c8b88e5a01d98e0f)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/585cd9f3ca1ef98764fe0b96b0c1685099d0eec9)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/9e5771814a370bd55923cd4af5923d860cfda970)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/53aacfb80c65005f3d0f9360711831eb01ef0ed4)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/c99c2187f1640bc59e82ca060d1e44ff33f05186)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/23ef3a687584b5197c5460d1fe605a94421ce9e5)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/4ec04e92f171980323ca5b5065e5cec34460fff7)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/068f09d44193a666be65af442e33fe62a76a7cca)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/61151c40cb1916d774fe63fdf5ee91b68f22a299)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/48c169e5abd611ad9b31ba8946dfb967c6aa5a29)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/68536765ef7937f06b23a1ddea972ba3a6dac0c9)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/e7bb60d293e77cf13d4267293533fc16abe4f52b)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/742f17edecb651a2a5b35b8196fd922f9f03308b)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/94199f554206ee4e34b746d2eb6118851abd4a0b)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/f8ea9b6fb930a457ab54b2db932cdc9e876eae65)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/890615cf2b693cb078676010fd2c1cc0da6b6e3d)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/6ca09d0292ad3e851c9ed02452f7f9c94b971099)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/5d2e8ba2578c56b44d360906d3421f3861c3acfb)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/5be60cc5d1bed1728c6501d3c455f1ce7e26bba3)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/c73630ffb77351e25fb6d1e07e27ad66069a6363)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/f1823155851c722585d9829d501d4767c81d81fe)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/eba48fdc39d0b1f9aa0648308d906f68e5267c65)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/ecdc9b7095e34aa216022d561da00fb64b4faee8)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/5563feabf5de054a9d3952afed6f443ad6c5b8c5)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/a8df4e303c8a697817f256b78af36f869880feea)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/b8af29fb55ee34560451937f10a47a81420bf891)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/6314b23ccded45191b71a1568a972fc859a461a9)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/5922ba4a88a949695a8dae3a7963281d70612e66)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/8ab1ce9ac27aab04d87b1ba74f2647dc0197e32a)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/6bf12320d4fe73ff3d0af4337c110998f3e0c6e3)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/02e09232bf1620bdfb4e0ef838126441301cde64)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/c4d5661dfb227cb208f08f68b9fa29eaf06a6ac0)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/0c48868fece9602fb9267b5717a1b78dfa3330ac)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/c4092315af4aaa78e8299101dc6a89981092dd87)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/1a6d42883564691932c34c8aedbaa38b9ad57e06)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/abf64e80618ea3048256050bd383ae22e65442b2)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/eaab1942441c25b644882dcc7e7b81a9f4315199)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/5ac20d2943a7952ead2975be1ba630b14d71c3a3)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/dfdd32ba6630548fc273ef99b325422bf8d59094)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/d07d1cc5b50acad53ceb1a8e7269764a258a9cbf)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/33a628d0dbb8c48575cf90662e51486f4e625c34)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/3a88004f9dba5e33a8cde9e3072072f69281b51a)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/2e744ce2839f981d268051325f79d465c5b55ced)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/98190b83d556a083ea53c8cd4a8c19d5e63eeaea)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/ecfaa1608d67431a8a45da5aab95600cc4ce92c4)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/2901ebd3ee5aa0d9df415035b181eb6bb98eefd8)
    -   Update changelog ([#24](https://github.com/jchip/fynjs/pull/24)) [commit](https://github.com/jchip/fynjs/commit/be5b39352eba12f629163029523f0c0ecb0dda15)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/f52521f520e2e15159473be706099caba0c732f2)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/b744a387360db06103a5000288ce517008c00cfc)
    -   Update changelog [commit](https://github.com/jchip/fynjs/commit/dbc14d2aeff733c341640abb24c75a564c6ac3bd)
    -   FPO-16: version lock fynpo and fyn together [commit](https://github.com/jchip/fynjs/commit/ac50252289681dd5b8111beec7aef668e47938d8)
    -   FPO-16: drop _w exclusion, nested-repo detection covers it [commit](https://github.com/jchip/fynjs/commit/88f2ba1d52a768012a7f0b578a03acab3c7b87a7)
    -   FPO-16: keep _w vendored forks out of the publish set [commit](https://github.com/jchip/fynjs/commit/9d38f0fb5ce14cc0e85689c3ba48762d07fca0a7)
    -   fynpo: add noFynLocal support to skip local package resolution [commit](https://github.com/jchip/fynjs/commit/e4957db668019c74767472c1c60c8ba64cd6fe8f)
    -   polyfill hash digest base64url for older node versions [commit](https://github.com/jchip/fynjs/commit/4f9a2e213ffed00d3874e6f29499dcaaa4eeba2a)
    -   implement caching [commit](https://github.com/jchip/fynjs/commit/7223d3718ec4df4e419753e141c20d01d53d35ad)
    -   feat: support multiple node_modules layout [commit](https://github.com/jchip/fynjs/commit/12575a143b3b125db434deec534677f06c41e686)
    -   fix: default pseudo source maps off ([#26](https://github.com/jchip/fynjs/pull/26)) [commit](https://github.com/jchip/fynjs/commit/0b7108f75c8085c783d8d66267a63995da980413)
    -   chore: update .gitignore [commit](https://github.com/jchip/fynjs/commit/0bd7b26ba0dd4f7878749d851b15c60e4dc2993a)
    -   unwrap-npm-cmd: fix export [commit](https://github.com/jchip/fynjs/commit/7d3d0bc32073627d08ed5d36eec96cca1057de1e)
    -   1 [commit](https://github.com/jchip/fynjs/commit/764e97ad46f060c448836d7c685c6a6ef8874553)
    -   remove lockfile [commit](https://github.com/jchip/fynjs/commit/6fb23231d08b281ad607b7a60aa741272752b743)
    -   chore: npmjs.org [commit](https://github.com/jchip/fynjs/commit/acacfa128d764943b61053e41edb2120152bef4a)
    -   fix local publish util [commit](https://github.com/jchip/fynjs/commit/504b7178b873f2c1fb2eeee11f2ee7daf3138e23)
    -   fynpo: fix makeOpts to merge root command opts with subcommand opts [commit](https://github.com/jchip/fynjs/commit/038eb1abc8bb556780a601d8626ab7e4ef7221e1)
    -   fyn: improve global commands - cleanup, update, and display fixes [commit](https://github.com/jchip/fynjs/commit/bef672cc84e082bd8a057ed580ef3d4c3c266ec7)
    -   update deps [commit](https://github.com/jchip/fynjs/commit/ae32ffafef7231fac4ac0a2dbf3eb2a42889ca58)
    -   fix: add test for fynpo-base [commit](https://github.com/jchip/fynjs/commit/916c78c27977d3d19ba6ceb3e3817836cba03315)
    -   dep: visual-exec 0.1.14 [commit](https://github.com/jchip/fynjs/commit/2f43075b66023ddbc14931bf60d72ef7a454eb32)
    -   chore: update lockfile [commit](https://github.com/jchip/fynjs/commit/87be9f29552ed6f2fb6e40150ce3fc3385994bc3)
    -   fix: use dep graph for update changelog [commit](https://github.com/jchip/fynjs/commit/b86f54a0ed047f0dff545e884f1f78f0e8611fe8)
    -   [minor]: fyn help save fynpo local package indirect dep relations [commit](https://github.com/jchip/fynjs/commit/11ea2e26de254aaeaeb3e468e0fc76f5683c20f0)
    -   update dep [commit](https://github.com/jchip/fynjs/commit/60e258ce0409cf1eeda657504088431bb4480fb7)
    -   chore: update lockfile [commit](https://github.com/jchip/fynjs/commit/6b6279c2d4d36d0afa31e14091815fa0ec08702f)
    -   chore: update lockfile [commit](https://github.com/jchip/fynjs/commit/e6938aed7e5350bc8d6905d2aa2813b5d816bf20)
    -   make minor and major types configurable ([#23](https://github.com/jchip/fynjs/pull/23)) [commit](https://github.com/jchip/fynjs/commit/ffc44fed23792ee470f84699e7cc8ef2e2b0a9e4)
    -   [chore] update fyns build scripts for being part of fynpo [commit](https://github.com/jchip/fynjs/commit/9f8b70bdfaa2911708326f50fc02de9e360947b6)
    -   commit fyn-lock [commit](https://github.com/jchip/fynjs/commit/ceaedc65cbe8acc6f9c864b51254243ab270cc57)
    -   chore: claude and fix tests [commit](https://github.com/jchip/fynjs/commit/bb05037ad61ccd580b7c5e9ef8fc8e1f2a12a977)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/b37af0193f7c688e6b5abd2bf344420be9fea8b8)
    -   update build urls [commit](https://github.com/jchip/fynjs/commit/17c2639552ae897466a62c7f72b24c280278edbd)
    -   update READMEs [commit](https://github.com/jchip/fynjs/commit/31ba1d5a31f8ed67b8eac7d28cb6f75631411580)
    -   update readme [commit](https://github.com/jchip/fynjs/commit/58807ee5a84c4e42152d4cd462def854ba1d6369)
    -   add coverage badge [commit](https://github.com/jchip/fynjs/commit/c3e01d7b13e4a1c53af61a5ecf84ccaaf8e42ff4)
    -   [chore] update README [commit](https://github.com/jchip/fynjs/commit/e798240429f6e1429663c7ca8d25068788c99dbd)
    -   fynpo readme ([#28](https://github.com/jchip/fynjs/pull/28)) [commit](https://github.com/jchip/fynjs/commit/b9d49235b2bce2f45e974299953cce1b43a03cab)
    -   add fynpo-cli [commit](https://github.com/jchip/fynjs/commit/0204ba84232775b001043a209f77d8d6a2c4b6f4)
    -   update README [commit](https://github.com/jchip/fynjs/commit/bcd0a90946665294ac04ad863e0bf49d5c560a75)
    -   update README [commit](https://github.com/jchip/fynjs/commit/e76c9a0e18bc6a5870b364a5f633411e2513bf03)
    -   Update .travis.yml ([#15](https://github.com/jchip/fynjs/pull/15)) [commit](https://github.com/jchip/fynjs/commit/9a20366be938c2c1277e77dadb17fb2d4200a70e)
    -   update readme [commit](https://github.com/jchip/fynjs/commit/0b19b59fc063fa2af738b088095de2c062404da1)
    -   nesting task example [commit](https://github.com/jchip/fynjs/commit/6cf07333f779d61fc876a972dc028be2e215cbc0)
    -   update sample in readme [commit](https://github.com/jchip/fynjs/commit/f012bfe00ade760f580ede2a5090996262fea045)
    -   add toc to readme [commit](https://github.com/jchip/fynjs/commit/d65af6a8ff3dd1578cc176e6f1f8832079762152)
    -   add use cases to readme [commit](https://github.com/jchip/fynjs/commit/da0cf62bec10a20f41ecf85830098c72035d565e)
    -   add LICENSE [commit](https://github.com/jchip/fynjs/commit/eebcd7b0003608ffb71390aa0e787dea60f10cc1)
    -   Initial commit [commit](https://github.com/jchip/fynjs/commit/444f694823361d027e8193960c8c0a8e6a8885ee)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/d12b4f9ea412b15a3cb57852fcbfbeb9e034122c)
    -   format docs [commit](https://github.com/jchip/fynjs/commit/00a5156ee54744aa05411baf34a5fc9003d8cf2e)
    -   update README [commit](https://github.com/jchip/fynjs/commit/8f9ed5263648c02665fa53f5c59f00cc4785fb5f)
    -   update readme [commit](https://github.com/jchip/fynjs/commit/2b9c570a6c3153fd0a1b137a82c07cc6d8bce50f)
    -   updating docs [commit](https://github.com/jchip/fynjs/commit/bbc4c93128535ee38cca2b86be11310e7b74dfa9)
    -   update README [commit](https://github.com/jchip/fynjs/commit/37497d6f4e720fc6c33623d9005eb98fda1ebf72)
    -   update doc [commit](https://github.com/jchip/fynjs/commit/7a65fa8fda35de505ce1af9351774851a2726df3)
    -   update reference [commit](https://github.com/jchip/fynjs/commit/6faaf413feaf1730657f5d3fc3f29d8811c3099c)
    -   update example for exec [commit](https://github.com/jchip/fynjs/commit/532a3e1b74585ce61fa0cf7dee0d7485731d6f9b)
    -   update docs [commit](https://github.com/jchip/fynjs/commit/e225a442ced8a558f676d3c81811c7b34e05b8c2)
    -   update task options sample [commit](https://github.com/jchip/fynjs/commit/b2c301dedd9ff5ff09400b5c54f68a824a63da7e)
    -   update license file [commit](https://github.com/jchip/fynjs/commit/249fdb95e6ab8e3d99f150d50a3ae895522b29e6)
    -   CI node 14 [commit](https://github.com/jchip/fynjs/commit/74c2ae1007c6d4cdb910fb2b3cfb612a0a09d70a)
    -   add node.js ver 13 to CI [commit](https://github.com/jchip/fynjs/commit/8d738b04f7d128b57de86383a20c4c51cadd4c42)
    -   Update .travis.yml [commit](https://github.com/jchip/fynjs/commit/591e39210698870722ecf7b990b74446649e2cd2)
    -   update node7 to 8 for CI [commit](https://github.com/jchip/fynjs/commit/60cf408e5c62edfad621da206b5ae2d8edffd0f8)
    -   [chore] update .npmignore [commit](https://github.com/jchip/fynjs/commit/3d495dbaa7f6da21466d5223cc52ca376e23dbdf)
    -   update .npmignore [commit](https://github.com/jchip/fynjs/commit/b636e1dd0fbb54a510d83edb5c857c121d174b05)
    -   add local clap command [commit](https://github.com/jchip/fynjs/commit/93021ef37b7c55579c1fe3b176600ef888540c45)
    -   add test for child process with failure in tasks [commit](https://github.com/jchip/fynjs/commit/0110292b9cdeebe089572d91973ce6cda626d204)

# 8/13/2026

## Packages

-   `@fynpo/base@1.1.23` `(1.1.22 => 1.1.23)`
-   `fyn@2.1.6` `(2.1.5 => 2.1.6)`
-   `fynpo@2.1.6` `(2.1.5 => 2.1.6)`

## Commits

-   `packages/fynpo-base`

    -   FPO-17: notice when package discovery is implicit or finds nothing [commit](https://github.com/electrode-io/fynpo/commit/e651d324d53e7ca3b8bfb1a37ee722d59096f496)

-   `packages/fynpo`

    -   FPO-17: notice when package discovery is implicit or finds nothing [commit](https://github.com/electrode-io/fynpo/commit/e651d324d53e7ca3b8bfb1a37ee722d59096f496)
    -   FPO-17: fix fynpo prepare for repos not laid out under packages/ [commit](https://github.com/electrode-io/fynpo/commit/c9f8eec8c7913ca3a812edd5f2acccb857425c79)

-   `MISC`

    -   chore: update dep data [commit](https://github.com/electrode-io/fynpo/commit/11c9cf8a22e03fc4e26e678d2102180efbe75c97)

# 8/12/2026

## Packages

-   `fyn@2.1.5` `(2.1.4 => 2.1.5)`
-   `fynpo@2.1.5` `(2.1.4 => 2.1.5)`

## Commits

-   `packages/fynpo`

    -   FPO-16: document scoped publishing in fynpo README [commit](https://github.com/electrode-io/fynpo/commit/e2685dc278fe485c8206085b4f54f6d89adbfc47)
    -   FPO-16: skip packages in nested git repos when publishing [commit](https://github.com/electrode-io/fynpo/commit/22daa0715fb42c66755779bbf39e4447f4bff598)
    -   FPO-16: add publish-scoped package filter and fix layout-bound release paths [commit](https://github.com/electrode-io/fynpo/commit/02436877d03bde3a0378775a1d6ccd221d6be7ee)

-   `docusaurus`

    -   FPO-16: document publish package filter and nested repo skipping [commit](https://github.com/electrode-io/fynpo/commit/131da9ec1854a8a3ec2bd0bd9b5c6e94d380a92d)

-   `notes`

    -   FPO-16: add publish-scoped package filter and fix layout-bound release paths [commit](https://github.com/electrode-io/fynpo/commit/02436877d03bde3a0378775a1d6ccd221d6be7ee)

-   `MISC`

    -   FPO-16: version lock fynpo and fyn together [commit](https://github.com/electrode-io/fynpo/commit/ac50252289681dd5b8111beec7aef668e47938d8)
    -   FPO-16: drop _w exclusion, nested-repo detection covers it [commit](https://github.com/electrode-io/fynpo/commit/88f2ba1d52a768012a7f0b578a03acab3c7b87a7)
    -   FPO-16: keep _w vendored forks out of the publish set [commit](https://github.com/electrode-io/fynpo/commit/9d38f0fb5ce14cc0e85689c3ba48762d07fca0a7)

# 8/6/2026

## Packages

-   `fyn@2.1.4` `(2.1.3 => 2.1.4)`
-   `fynpo@2.1.4` `(2.1.3 => 2.1.4)`

## Commits

-   `packages/fyn`

    -   feat(fyn): make local export dir configurable [commit](https://github.com/electrode-io/fynpo/commit/1e9580d8478ae669f3e7487be0fa5fcf36c9304c)
    -   feat(fyn): add live local source exports [commit](https://github.com/electrode-io/fynpo/commit/e93d0b58dffb2904c48f647ef167d10dc2d7c61b)
    -   FPM-40: allow intentional permission bitmask [commit](https://github.com/electrode-io/fynpo/commit/28300dc58365be5eaf64d82a436c6244c82d6e4c)
    -   FPM-28: load prepared URL metadata offline [commit](https://github.com/electrode-io/fynpo/commit/ef98c6d682d0aff545e5e8164d451d1b39486235)
    -   FPM-26: separate cache recovery from network failure [commit](https://github.com/electrode-io/fynpo/commit/a5b219313ed5fab84d0c3c4b34cb7aa5ea5cc5d2)
    -   FPM-27: settle meta in-flight counters [commit](https://github.com/electrode-io/fynpo/commit/4e67e10c10bcbac5d983d64c2df62b5339a3a74b)
    -   FPM-25: parse cached URL-spec marker value [commit](https://github.com/electrode-io/fynpo/commit/d278a4c1ffd0c0b101b92303cf8eeefc5cdae2e5)
    -   FPM-24: refresh metadata cache with manager directory [commit](https://github.com/electrode-io/fynpo/commit/8c904f31403723254063c6a9384fb984face8f6f)
    -   FPM-39: enforce local trust before optional checks [commit](https://github.com/electrode-io/fynpo/commit/2870d260ca0aa929e14e523a9c1d53cbd782ff9f)
    -   FPM-37: recheck local trust after resolution [commit](https://github.com/electrode-io/fynpo/commit/fc5c63f3a4589a11364a7a8792c6ff516312df23)
    -   FPM-36: propagate local builder startup failures [commit](https://github.com/electrode-io/fynpo/commit/556e1499813545b5125c8833fb52405949b70c66)
    -   FPM-34: fail fast on local dependency scan errors [commit](https://github.com/electrode-io/fynpo/commit/cb50462b419498854bd13048ac2e89608b241666)
    -   FPM-30: preserve trust boundary for transitive local deps [commit](https://github.com/electrode-io/fynpo/commit/4b16f063c9512ec3c2bda52e32a74f1bc0da0ad8)
    -   FPM-33: toggle the consumed lockfile option [commit](https://github.com/electrode-io/fynpo/commit/903dd381a875d2ed5de34a803905f00b146ddae9)
    -   FPM-32: propagate stat resolution failures [commit](https://github.com/electrode-io/fynpo/commit/ab4776ccebef90e6b8c69cce2b269826e80d58e9)
    -   FPM-31: preserve run list load failures [commit](https://github.com/electrode-io/fynpo/commit/beefc4c5179cc90e692fdbfde311d0d99344cdbe)
    -   FPM-29: prefer child exit code over errno [commit](https://github.com/electrode-io/fynpo/commit/0a3f1b839ad3ea98a18ebab4ab53e019df452d3b)
    -   FPM-13: clear a package output dir on reinstall (mkdirp contract) [commit](https://github.com/electrode-io/fynpo/commit/7b9d4f2e8e3e7be0768208d7d26fedefceaac2cf)
    -   FPM-18: fix package.json chmod recovery bit math (| not +) [commit](https://github.com/electrode-io/fynpo/commit/b7776152ef985e77a9319de5001749aadaf0ba58)
    -   FPM-19: stop mutating shared request-path arrays in _removeFailedOptional [commit](https://github.com/electrode-io/fynpo/commit/60415760a1e8dc82946ed0a39a51d82b3309a2ed)
    -   FPM-11: make clearExtras remove stale .bin entries on Windows [commit](https://github.com/electrode-io/fynpo/commit/598e466ff32c1770089cb06c64edb3a25d57f88e)
    -   FPM-12: stop dropping non-JS source maps from local-linked packages [commit](https://github.com/electrode-io/fynpo/commit/46c124d90012f1f7c49668bdb7d610cda16f24ed)
    -   FPM-16: surface local-dep change-detection failures instead of swallowing [commit](https://github.com/electrode-io/fynpo/commit/beec020fded29058917c18f51640c19cdd0a02f8)
    -   FPM-14: make the existing-install layout override actually take effect [commit](https://github.com/electrode-io/fynpo/commit/f602c3a463a8ebf8286eeef4066aa963a8968362)
    -   FPM-10: identify global installs by tag dir, not version string [commit](https://github.com/electrode-io/fynpo/commit/c7451b4ef85dbed1d4a961121604681eafce3594)
    -   FPM-9: actually link the version when confirming during global add [commit](https://github.com/electrode-io/fynpo/commit/fd36f6a89e194fe9af0ccb819962fce5782de6be)
    -   FPM-17: fix simpleCompare prerelease ordering [commit](https://github.com/electrode-io/fynpo/commit/6ee0b71735f9cd04f780a403cd28506f354ce3a0)
    -   FPM-8: dont let a failed devOptDependencies abort the install [commit](https://github.com/electrode-io/fynpo/commit/aebfba7ebe8e7a1f5756ab3115e19978f33b6b4c)
    -   FPM-7: fix getPkgById TypeError on scoped package ids [commit](https://github.com/electrode-io/fynpo/commit/9e98db747411037fb51e872a6f0fe4b6851956a8)
    -   FPM-6: fix no-op fullMeta option in pacoteTarballStream fallback [commit](https://github.com/electrode-io/fynpo/commit/115a6cd58d31d9c0515f2da0702bfcf099a3e93f)
    -   FPM-5: stop re-cloning pinned-commit git deps on every install [commit](https://github.com/electrode-io/fynpo/commit/064cdc398b57d2e2de5c5eca23e43127e524dde6)
    -   FPM-4: use camelCase pacote v21 options for packument fetch [commit](https://github.com/electrode-io/fynpo/commit/89be6d3ce864bb774a1f4418955d1b88ddc41dac)
    -   FPM-1: settle putPkgInNodeModules listener on all extractor paths [commit](https://github.com/electrode-io/fynpo/commit/2890805d57703aff66a3a68ebdc5a889011655f1)
    -   FPM-2: honor NODE_ENV=production in pickEnvOptions [commit](https://github.com/electrode-io/fynpo/commit/bb0edb8ca438eb6804bfe8a6478c26370513b3aa)
    -   FPM-3: fyn run propagates real script exit codes via fyntil.exit [commit](https://github.com/electrode-io/fynpo/commit/958f8736a5038ec86e518a6748b83094906d0c92)
    -   FPM-50: improve fyn coverage and re-enable coverage gate in ci:check [commit](https://github.com/electrode-io/fynpo/commit/a3e7747323ee003017d6c1794f55bf37ea8f9c6d)
    -   FPM-49: fix fyn eslint errors and re-enable lint gate in ci:check [commit](https://github.com/electrode-io/fynpo/commit/be26e820da56a0e71838091e37f15edd36dd71dc)
    -   FPM-48: fyn ci:check runs tests only (drop failing eslint + coverage gates) [commit](https://github.com/electrode-io/fynpo/commit/88cafcd0c9cb20dead80c4c5545ebf655fb5d19e)
    -   FPM-47: complete JSDoc params in opt-resolver policy spec [commit](https://github.com/electrode-io/fynpo/commit/aa113df5a80b0030720c7cc478806fb6dfffde94)
    -   FPM-47: block optional dep preinstall from non-registry sources by default [commit](https://github.com/electrode-io/fynpo/commit/393de2c0431e43423197d29a1ec6bd70e8faf229)
    -   FPM-45: default fyn.enforceRegistryDeps on; add --no-enforce-registry-deps CLI flag [commit](https://github.com/electrode-io/fynpo/commit/a0534fb619d0a4b7485f6b3007331a84fdbff33c)
    -   FPM-44: opt-in fyn.enforceRegistryDeps - transitive deps must come from a registry [commit](https://github.com/electrode-io/fynpo/commit/77cd093030c880891424b326e021e623e013555c)
    -   FPM-42: assert lifecycle-scripts output by content, not brittle stdout indices [commit](https://github.com/electrode-io/fynpo/commit/d1bbdc53adc3763aec1829cf9033a9a9bcedb8ba)
    -   FPM-43: opt-in fyn.allowTopLevelScripts to trust lifecycle scripts of direct deps [commit](https://github.com/electrode-io/fynpo/commit/f693265b2ae511d691e46016f4b3aa7aaab9742b)
    -   FPM-41: block lifecycle scripts for non-registry packages; add fyn.allowScripts whitelist [commit](https://github.com/electrode-io/fynpo/commit/f8cb3bef1a7688db5d3d288601fc2bc021c29e7e)
    -   fix(fyn): command injection via unsanitized git-dependency ref ([#1](https://github.com/electrode-io/fynpo/pull/1)) [commit](https://github.com/electrode-io/fynpo/commit/265d13a053cf4d8fb9e8838804247c16bbeaf354)
    -   fyn: propagate all CLI options to global install paths [commit](https://github.com/electrode-io/fynpo/commit/13d3fa1b35507d8e106d429d7d235221df5deebe)
    -   fyn(fix): forward --refresh-meta to global update [commit](https://github.com/electrode-io/fynpo/commit/20efa1774b045ae6ca41e33bf47afce238c96ed5)

-   `packages/fynpo`

    -   FPO-13: run fynpo packages vitest suite in CI via ci:check script [commit](https://github.com/electrode-io/fynpo/commit/26a2e460b36da527c7443ae5d33d8de4e94a3663)
    -   FPO-12: fynpo changelog - return a promise from commitChangeLogFile skip paths [commit](https://github.com/electrode-io/fynpo/commit/e06b08d656c0c7839bf57c59a4d58fb908fd59f1)
    -   FPO-11: fynpo run - propagate failing package script exit code [commit](https://github.com/electrode-io/fynpo/commit/a39a2457310a98baf30aee41ed58a069e0aaa79c)
    -   FPO-10: fynpo version/changelog --publish - bump package.json versions from dep graph [commit](https://github.com/electrode-io/fynpo/commit/95d8709d6bfd247c542efdd8eb0e74c9ae9e6dad)

-   `.github`

    -   FPM-46: CI - drop node 18/20, add node 26 [commit](https://github.com/electrode-io/fynpo/commit/bf65116dd9c452a64251c3d6cc0d52be4cbd9a10)

-   `notes`

    -   feat(fyn): add live local source exports [commit](https://github.com/electrode-io/fynpo/commit/e93d0b58dffb2904c48f647ef167d10dc2d7c61b)

-   `testing`

    -   FPM-46: opt monorepo-test out of default-on enforceRegistryDeps (--no-enforce-registry-deps) [commit](https://github.com/electrode-io/fynpo/commit/c4d7cc0a51fd26c7991795e8631bb355cdd6d6c3)

-   `MISC`

    -   chore: update .gitignore [commit](https://github.com/electrode-io/fynpo/commit/0bd7b26ba0dd4f7878749d851b15c60e4dc2993a)

# 6/4/2026

## Packages

-   `fyn@2.1.3` `(2.1.2 => 2.1.3)`
-   `fynpo@2.1.3` `(2.1.2 => 2.1.3)`

## Commits

-   `packages/fyn`

    -   fyn: share fynpo central store from git main worktree [commit](https://github.com/electrode-io/fynpo/commit/ee6d3f7511606db5941262cdbeac1a94e329e1f6)
    -   fyn: detect bad semver [commit](https://github.com/electrode-io/fynpo/commit/076583dca5bfd87086d4d576f59763116c16d4a9)

-   `packages/fynpo`

    -   fynpo(fix): show start error [commit](https://github.com/electrode-io/fynpo/commit/41794d6cbff74a6bf32d5d5c4a38c0fa52086e67)

# 5/22/2026

## Packages

### Directly Updated

-   `fyn@2.1.2` `(2.1.1 => 2.1.2)`
-   `pkg-preper@0.1.8` `(0.1.7 => 0.1.8)`

### Fynpo Updated

-   `fynpo@2.1.2` `(2.1.1 => 2.1.2)`

## Commits

-   `packages/fyn`

    -   fyn(fix): package dir should always have node_modules prefix [commit](https://github.com/electrode-io/fynpo/commit/eead8c3ec502842889f78680b981560aacd88905)
    -   fix(fyn): retry meta fetch with forceRefresh when cached packument is stale [commit](https://github.com/electrode-io/fynpo/commit/03320d401e54d324891eed961394e1c6f4ab0819)
    -   chore: update top level dep [commit](https://github.com/electrode-io/fynpo/commit/1f247991de7eb6567d7ae73c237b253310d726e8)

-   `packages/pkg-preper`

    -   fyn(fix): package dir should always have node_modules prefix [commit](https://github.com/electrode-io/fynpo/commit/eead8c3ec502842889f78680b981560aacd88905)

-   `notes`

    -   fyn(fix): package dir should always have node_modules prefix [commit](https://github.com/electrode-io/fynpo/commit/eead8c3ec502842889f78680b981560aacd88905)

# 4/20/2026

## Packages

### Directly Updated

-   `fyn@2.1.1` `(2.0.4 => 2.1.1)`
-   `pkg-preper@0.1.7` `(0.1.6 => 0.1.7)`

### Fynpo Updated

-   `fynpo@2.1.1` `(2.1.1 => 2.1.1)`

## Commits

-   `packages/bluebird`

    -   fyn: support overrides [commit](https://github.com/electrode-io/fynpo/commit/c0f3084050ca04d3c94eccaca6ac5dd019bd3fcf)

-   `packages/fyn`

    -   chore: npmjs.org [commit](https://github.com/electrode-io/fynpo/commit/acacfa128d764943b61053e41edb2120152bef4a)
    -   fix fyn lockfile tarball registry rewrite [commit](https://github.com/electrode-io/fynpo/commit/45006845ad44fb69b715c11fe7e94a8447b7b226)
    -   fix(fyn): use shared global bin linker [commit](https://github.com/electrode-io/fynpo/commit/ac788806381df814bfd1607e02e068a4fe01eb79)
    -   fyn: fix pacote cache key [commit](https://github.com/electrode-io/fynpo/commit/b87afcad3be8674479391ca8d6ea9d3cf945872f)
    -   fyn: detect Bun runtime for global package version directories [commit](https://github.com/electrode-io/fynpo/commit/3ee576f2d8385b52492c10735aa2167fc3068049)
    -   fyn: support overrides [commit](https://github.com/electrode-io/fynpo/commit/c0f3084050ca04d3c94eccaca6ac5dd019bd3fcf)

-   `packages/pkg-preper`

    -   fyn: fix pacote cache key [commit](https://github.com/electrode-io/fynpo/commit/b87afcad3be8674479391ca8d6ea9d3cf945872f)
    -   fyn: detect Bun runtime for global package version directories [commit](https://github.com/electrode-io/fynpo/commit/3ee576f2d8385b52492c10735aa2167fc3068049)
    -   fyn: support overrides [commit](https://github.com/electrode-io/fynpo/commit/c0f3084050ca04d3c94eccaca6ac5dd019bd3fcf)

# 12/12/2025

## Packages

### Directly Updated

-   `fyn@2.1.0` `(2.0.4 => 2.1.0)`
-   `fynpo@2.1.0` `(2.0.4 => 2.1.0)`
-   `visual-exec@0.2.0` `(0.1.14 => 0.2.0)`

## Commits

-   `packages/fyn`

    -   chore: update dep [commit](https://github.com/electrode-io/fynpo/commit/22266684066e2b4b44c997a384039e7ad63730a5)
    -   fyn/fynpo: improve debug log visibility for sub-fyn failures [commit](https://github.com/electrode-io/fynpo/commit/05a4128f50f608f00488b7df380ff853b7fe675d)
    -   fyn: implement audit command [commit](https://github.com/electrode-io/fynpo/commit/af95bab9cf1243d6d334cee2c0b86105da595da0)
    -   fyn: detect Bun runtime for global package version directories [commit](https://github.com/electrode-io/fynpo/commit/3ee576f2d8385b52492c10735aa2167fc3068049)
    -   fyn: support overrides [commit](https://github.com/electrode-io/fynpo/commit/c0f3084050ca04d3c94eccaca6ac5dd019bd3fcf)

-   `packages/fynpo`

    -   fyn/fynpo: improve debug log visibility for sub-fyn failures [commit](https://github.com/electrode-io/fynpo/commit/05a4128f50f608f00488b7df380ff853b7fe675d)
    -   fynpo: add --no-audit to invoke fyn [commit](https://github.com/electrode-io/fynpo/commit/e29a17d7d188ca0cb718864b32ec6289820bb42b)

-   `packages/visual-exec`

    -   [minor] VEX-2: convert visual-exec to TypeScript [commit](https://github.com/electrode-io/fynpo/commit/5634415b23c467e8f6a60adfa9b42afff4ee8a24)


# 12/2/2025

## Packages

-   `fyn@2.0.4` `(2.0.3 => 2.0.4)`
-   `fynpo@2.0.4` `(2.0.3 => 2.0.4)`

## Commits

-   `packages/fyn`

    -   fyn: global update respects original version constraint instead of defaulting to latest [commit](https://github.com/electrode-io/fynpo/commit/30f5b332f71c980030333effe9da373faec49a47)

-   `packages/fynpo`

    -   fynpo: improve release steps output [commit](https://github.com/electrode-io/fynpo/commit/fcbc43f9a65ff527a6345756b62c8704f671cee8)

-   `MISC`

    -   chore: update dep [commit](https://github.com/electrode-io/fynpo/commit/f7d8d8a39928e78ff3b6d26f1db309f27574fc4a)

# 11/28/2025

## Packages

-   `fyn@2.0.3` `(2.0.2 => 2.0.3)`
-   `fynpo@2.0.3` `(2.0.2 => 2.0.3)`

## Commits

-   `packages/fyn`

    -   chore: update dep [commit](https://github.com/electrode-io/fynpo/commit/d3a6dc66b004aa0dbfa182f3c676439f631cbfa5)
    -   fyn: fix running postinstall npm script [commit](https://github.com/electrode-io/fynpo/commit/c4b6e1902d1edeecaae681492764619c9e48bdec)
    -   fyn: rename xrun-tasks.js to .ts [commit](https://github.com/electrode-io/fynpo/commit/e24c6fe5772d754340801e11d77369800014d394)
    -   fyn: rename test .js to .ts for TypeScript migration [commit](https://github.com/electrode-io/fynpo/commit/22c9fee22a24e14a9356f6d3b6a0326e955d18d3)
    -   fyn: use esbuild-loader instead of babel for webpack [commit](https://github.com/electrode-io/fynpo/commit/a160b136ca63498ce922364bc74e36073cba302d)
    -   fyn: rename .js to .ts for TypeScript migration [commit](https://github.com/electrode-io/fynpo/commit/cdd42f49ef47ee7498a6659e0ee16230930d34f2)

-   `packages/fynpo`

    -   chore: update dep [commit](https://github.com/electrode-io/fynpo/commit/d3a6dc66b004aa0dbfa182f3c676439f631cbfa5)
    -   fynpo: update dep [commit](https://github.com/electrode-io/fynpo/commit/48fb46238f4de818dcdeb5c54fba3a6506afa22a)

# 11/27/2025

## Packages

-   `@fynpo/base@1.1.22` `(1.1.21 => 1.1.22)`
-   `fyn@2.0.2` `(2.0.1 => 2.0.2)`
-   `fynpo@2.0.2` `(2.0.1 => 2.0.2)`
-   `pkg-preper@0.1.6` `(0.1.5 => 0.1.6)`

## Commits

-   `packages/fynpo-base`

    -   [Publish] [commit](https://github.com/electrode-io/fynpo/commit/e8d8e5afde377cecdea0d448ac686781c2083210)
    -   update dependencies [commit](https://github.com/electrode-io/fynpo/commit/67e5c55272018e219f6ab5e46c9b006bef6be2f5)
    -   fynpo-base: fix caching to not include directories [commit](https://github.com/electrode-io/fynpo/commit/c9f89093ac8804afb9e9b7c81867452c447f4326)

-   `packages/create-fynpo`

    -   create-fynpo: make private [commit](https://github.com/electrode-io/fynpo/commit/c46ec537b30aa8517d06f994b6a8e626c8ddcd77)
    -   [Publish] [commit](https://github.com/electrode-io/fynpo/commit/e8d8e5afde377cecdea0d448ac686781c2083210)
    -   fix fynpo publish [commit](https://github.com/electrode-io/fynpo/commit/3085e89683fc3748167e12f9f85dfc4b3ff442a1)
    -   chore: update xsh 0.4.6 [commit](https://github.com/electrode-io/fynpo/commit/6e6671d794ca863913ad366e6d3ee70a60e73baf)

-   `packages/fyn`

    -   fyn: use copy-on-write clones for central store links [commit](https://github.com/electrode-io/fynpo/commit/8c0eacb320bb856444ec0425e66c68d8842e563f)
    -   fyn: disable source maps for global installs [commit](https://github.com/electrode-io/fynpo/commit/54c39d301c7ed24db60010201914b609c2ea5573)
    -   update lock files [commit](https://github.com/electrode-io/fynpo/commit/66b18317c964bab057ec5760c11f4dc701a8c83b)
    -   fyn: fix global add to check semver range satisfaction [commit](https://github.com/electrode-io/fynpo/commit/c6dbcca16cb78a1138248a9a6c785d132e940c14)
    -   [Publish] [commit](https://github.com/electrode-io/fynpo/commit/e8d8e5afde377cecdea0d448ac686781c2083210)
    -   fyn: improve global commands - cleanup, update, and display fixes [commit](https://github.com/electrode-io/fynpo/commit/bef672cc84e082bd8a057ed580ef3d4c3c266ec7)
    -   update lock files [commit](https://github.com/electrode-io/fynpo/commit/d299a1753f723b0b3e66aa04ba2f512786721d15)
    -   update dependencies [commit](https://github.com/electrode-io/fynpo/commit/67e5c55272018e219f6ab5e46c9b006bef6be2f5)
    -   fyn: global multi-version support with link command [commit](https://github.com/electrode-io/fynpo/commit/4d81cfbba127b3d1fb980ab606623d4fa8bbc631)
    -   fyn: search upward for package.json like npm does [commit](https://github.com/electrode-io/fynpo/commit/70db591d03acadbbd5f208faa8826f16fa828cc2)
    -   update nix-clap [commit](https://github.com/electrode-io/fynpo/commit/6c1ce4bc51d481461acd250a291375133fce23de)
    -   fyn: global install [commit](https://github.com/electrode-io/fynpo/commit/3b3bb0c2a8f03fed9a0efdef57539d4ba376ea68)
    -   fyn: fix init [commit](https://github.com/electrode-io/fynpo/commit/53ccff6a5c5ac73eb14336cfcd8721163358e364)
    -   fix fynpo publish [commit](https://github.com/electrode-io/fynpo/commit/3085e89683fc3748167e12f9f85dfc4b3ff442a1)
    -   fyn: improve run script error handling and formatting [commit](https://github.com/electrode-io/fynpo/commit/3ae6fb2c265377abce8873dad4f07cf9c6fb3acc)
    -   chore: update xsh 0.4.6 [commit](https://github.com/electrode-io/fynpo/commit/6e6671d794ca863913ad366e6d3ee70a60e73baf)
    -   fyn: memoize fynpo detected [commit](https://github.com/electrode-io/fynpo/commit/5a904c2658143d5803bfc4849da34afe64718008)
    -   update to fynpo,fyn v2 [commit](https://github.com/electrode-io/fynpo/commit/1eed0a41118d83863899c0797479665a8366da1c)

-   `packages/fynpo`

    -   fynpo: default --tag to false for per-package tagging [commit](https://github.com/electrode-io/fynpo/commit/762713ec786827f1985a4176450d702af8e1c344)
    -   [Publish] [commit](https://github.com/electrode-io/fynpo/commit/e8d8e5afde377cecdea0d448ac686781c2083210)
    -   fynpo: fix tests and flag default [commit](https://github.com/electrode-io/fynpo/commit/f0c1f1a33c5019b0582617efb01f84b53bf4cf2f)
    -   fynpo: fix makeOpts to merge root command opts with subcommand opts [commit](https://github.com/electrode-io/fynpo/commit/038eb1abc8bb556780a601d8626ab7e4ef7221e1)
    -   fynpo: update dep [commit](https://github.com/electrode-io/fynpo/commit/beeea1ff36d80fb877779193ca98ef12cd28e29d)
    -   fynpo: fix run command to use named args instead of argList [commit](https://github.com/electrode-io/fynpo/commit/fe3a82f61a3bf1d09c4bba7ea21c7387b5c7f78f)
    -   update dependencies [commit](https://github.com/electrode-io/fynpo/commit/67e5c55272018e219f6ab5e46c9b006bef6be2f5)
    -   fynpo: fix cli args [commit](https://github.com/electrode-io/fynpo/commit/e523440ed0c6975682df3ecf3c5c70cc703bb76a)
    -   fynpo: fix nix-clap usage [commit](https://github.com/electrode-io/fynpo/commit/1911c91a3a2aa5f14d3146a0ef0584b8107a1494)
    -   chore: update xsh 0.4.6 [commit](https://github.com/electrode-io/fynpo/commit/6e6671d794ca863913ad366e6d3ee70a60e73baf)

-   `packages/pkg-preper`

    -   [Publish] [commit](https://github.com/electrode-io/fynpo/commit/e8d8e5afde377cecdea0d448ac686781c2083210)
    -   fix fynpo publish [commit](https://github.com/electrode-io/fynpo/commit/3085e89683fc3748167e12f9f85dfc4b3ff442a1)

-   `MISC`

    -   Update changelog [commit](https://github.com/electrode-io/fynpo/commit/f4f9b0b88c33c2ba7717448a448574793f5c9ee4)

# 11/25/2025

## Packages

-   `@fynpo/base@1.1.21` `(1.1.20 => 1.1.21)`
-   `create-fynpo@1.0.6` `(1.0.5 => 1.0.6)`
-   `fyn@2.0.1` `(2.0.0 => 2.0.1)`
-   `fynpo@2.0.1` `(2.0.0 => 2.0.1)`
-   `pkg-preper@0.1.5` `(0.1.4 => 0.1.5)`

## Commits

-   `packages/fynpo-base`

    -   update dependencies [commit](https://github.com/electrode-io/fynpo/commit/67e5c55272018e219f6ab5e46c9b006bef6be2f5)
    -   fynpo-base: fix caching to not include directories [commit](https://github.com/electrode-io/fynpo/commit/c9f89093ac8804afb9e9b7c81867452c447f4326)

-   `packages/create-fynpo`

    -   fix fynpo publish [commit](https://github.com/electrode-io/fynpo/commit/3085e89683fc3748167e12f9f85dfc4b3ff442a1)
    -   chore: update xsh 0.4.6 [commit](https://github.com/electrode-io/fynpo/commit/6e6671d794ca863913ad366e6d3ee70a60e73baf)

-   `packages/fyn`

    -   fyn: improve global commands - cleanup, update, and display fixes [commit](https://github.com/electrode-io/fynpo/commit/bef672cc84e082bd8a057ed580ef3d4c3c266ec7)
    -   update lock files [commit](https://github.com/electrode-io/fynpo/commit/d299a1753f723b0b3e66aa04ba2f512786721d15)
    -   update dependencies [commit](https://github.com/electrode-io/fynpo/commit/67e5c55272018e219f6ab5e46c9b006bef6be2f5)
    -   fyn: global multi-version support with link command [commit](https://github.com/electrode-io/fynpo/commit/4d81cfbba127b3d1fb980ab606623d4fa8bbc631)
    -   fyn: search upward for package.json like npm does [commit](https://github.com/electrode-io/fynpo/commit/70db591d03acadbbd5f208faa8826f16fa828cc2)
    -   update nix-clap [commit](https://github.com/electrode-io/fynpo/commit/6c1ce4bc51d481461acd250a291375133fce23de)
    -   fyn: global install [commit](https://github.com/electrode-io/fynpo/commit/3b3bb0c2a8f03fed9a0efdef57539d4ba376ea68)
    -   fyn: fix init [commit](https://github.com/electrode-io/fynpo/commit/53ccff6a5c5ac73eb14336cfcd8721163358e364)
    -   fix fynpo publish [commit](https://github.com/electrode-io/fynpo/commit/3085e89683fc3748167e12f9f85dfc4b3ff442a1)
    -   fyn: improve run script error handling and formatting [commit](https://github.com/electrode-io/fynpo/commit/3ae6fb2c265377abce8873dad4f07cf9c6fb3acc)
    -   chore: update xsh 0.4.6 [commit](https://github.com/electrode-io/fynpo/commit/6e6671d794ca863913ad366e6d3ee70a60e73baf)
    -   fyn: memoize fynpo detected [commit](https://github.com/electrode-io/fynpo/commit/5a904c2658143d5803bfc4849da34afe64718008)
    -   update to fynpo,fyn v2 [commit](https://github.com/electrode-io/fynpo/commit/1eed0a41118d83863899c0797479665a8366da1c)

-   `packages/fynpo`

    -   fynpo: fix tests and flag default [commit](https://github.com/electrode-io/fynpo/commit/f0c1f1a33c5019b0582617efb01f84b53bf4cf2f)
    -   fynpo: fix makeOpts to merge root command opts with subcommand opts [commit](https://github.com/electrode-io/fynpo/commit/038eb1abc8bb556780a601d8626ab7e4ef7221e1)
    -   fynpo: update dep [commit](https://github.com/electrode-io/fynpo/commit/beeea1ff36d80fb877779193ca98ef12cd28e29d)
    -   fynpo: fix run command to use named args instead of argList [commit](https://github.com/electrode-io/fynpo/commit/fe3a82f61a3bf1d09c4bba7ea21c7387b5c7f78f)
    -   update dependencies [commit](https://github.com/electrode-io/fynpo/commit/67e5c55272018e219f6ab5e46c9b006bef6be2f5)
    -   fynpo: fix cli args [commit](https://github.com/electrode-io/fynpo/commit/e523440ed0c6975682df3ecf3c5c70cc703bb76a)
    -   fynpo: fix nix-clap usage [commit](https://github.com/electrode-io/fynpo/commit/1911c91a3a2aa5f14d3146a0ef0584b8107a1494)
    -   chore: update xsh 0.4.6 [commit](https://github.com/electrode-io/fynpo/commit/6e6671d794ca863913ad366e6d3ee70a60e73baf)

-   `packages/pkg-preper`

    -   fix fynpo publish [commit](https://github.com/electrode-io/fynpo/commit/3085e89683fc3748167e12f9f85dfc4b3ff442a1)

# 11/15/2025

## Packages

-   `@fynpo/base@1.1.20` `(1.1.19 => 1.1.20)`
-   `fyn@2.0.0` `(1.1.46 => 2.0.0)`
-   `fynpo@2.0.0` `(1.1.49 => 2.0.0)`
-   `pkg-preper@0.1.4` `(0.1.3 => 0.1.4)`

## Commits

-   `packages/fynpo-base`

    -   fynpo: update tests [commit](https://github.com/electrode-io/fynpo/commit/0ce4c1a4227160f88c4b87cedcc216ab6caa8255)
    -   chore: update deps [commit](https://github.com/electrode-io/fynpo/commit/d95d9845c9ad1c8bd01905995c9124bc115c15c4)
    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/5a6e24a4b903a93a5d52d05b0391fb54136ac902)

-   `packages/fyn`

    -   fynpo,fyn: [major] bump to v2 [commit](https://github.com/electrode-io/fynpo/commit/40bc40fd3cdb5ee06c71f4bd58fb4f1069cc6126)
    -   chore: update deps [commit](https://github.com/electrode-io/fynpo/commit/d95d9845c9ad1c8bd01905995c9124bc115c15c4)
    -   chore: update deps [commit](https://github.com/electrode-io/fynpo/commit/951c3a29f75ad51903bf8237108da770a6045e06)
    -   fyn: skip tests - fix later [commit](https://github.com/electrode-io/fynpo/commit/728941519ca8ed93462d9dacacaed9aaca9954cc)
    -   fyn: clearer message about local packages [commit](https://github.com/electrode-io/fynpo/commit/4ab5a38b6c3d8ce5af94846b66e0a94559890bb9)
    -   fyn: fix cli args handling [commit](https://github.com/electrode-io/fynpo/commit/49c974760e83d8280257f5fb1a1088cde1a19af2)
    -   fyn: fix url semver handling [commit](https://github.com/electrode-io/fynpo/commit/ecf376857dcbbfed5b72dee3587904f2b6a50d17)
    -   fyn: fix git repo refresh check [commit](https://github.com/electrode-io/fynpo/commit/335b0c80c131f7c9f7a57852627afbe9e426795d)
    -   use semver for git repo package cache key [commit](https://github.com/electrode-io/fynpo/commit/db9991a44f41b68c55e125042b82e48bc487818d)
    -   tests for fetching packages from git repo [commit](https://github.com/electrode-io/fynpo/commit/71d9c0508897adf7fec3ba425542bfdb894b14a7)
    -   fix use of new npm packages [commit](https://github.com/electrode-io/fynpo/commit/c8d23add782aac58b0a5ac53bb170bede5817570)
    -   fix save-logs option [commit](https://github.com/electrode-io/fynpo/commit/e767ce9bd0e268830cda84d87fc813c8c64eaa2f)
    -   Update nix-clap from v1.3 to v2.3 and fix import/args format [commit](https://github.com/electrode-io/fynpo/commit/cd7497c8e2e1ace93e8c6617d45eb1f65de06844)
    -   Replace rimraf with fs.rmSync and fs.promises.rm in tests and remove from devDependencies [commit](https://github.com/electrode-io/fynpo/commit/fd6130dd3cc273d5c03cfcf15c26e1c2cdc73845)
    -   Move rimraf to devDependencies for tests [commit](https://github.com/electrode-io/fynpo/commit/aebb61a1d8ec3aa9caaf55a13cbe1ec6f435824c)
    -   Remove unused npmlog dependency [commit](https://github.com/electrode-io/fynpo/commit/8f82a10aebd6001a6c470761021c44e1bdbc06c5)
    -   Update ci-info from v2 to v4 [commit](https://github.com/electrode-io/fynpo/commit/a3bc05dee455f57d0ad3a6528999567781ac02a4)
    -   Remove unused es6-promisify local package [commit](https://github.com/electrode-io/fynpo/commit/250efb16a4d66dbcbf6c8b1a75b7a7953b9c2cd2)
    -   Replace rimraf with fs.promises.rm and bump Node.js requirement to 14.14+ [commit](https://github.com/electrode-io/fynpo/commit/6593cfff3f431c3e86185cdb1ad6259a9d9f1f92)
    -   Replace mkdirp with fs.mkdirSync({ recursive: true }) [commit](https://github.com/electrode-io/fynpo/commit/dcfe8b5cd579a9d2ed1f96b5b09657cccf2171b8)
    -   Remove unused osenv dependency [commit](https://github.com/electrode-io/fynpo/commit/af0df8d7f755bff7f3aec1e1e2f399d2d7bcdebf)
    -   3 [commit](https://github.com/electrode-io/fynpo/commit/d33c5c6e823524982f5842f7c905ea3142749fa8)
    -   Set npm_node_execpath, npm_execpath, and INIT_CWD in fyn run [commit](https://github.com/electrode-io/fynpo/commit/f9a67df77f7bac63a7cf294c2c35aa005f063f4a)
    -   Add npm_config_* env vars to fyn run and document lifecycle-scripts purpose [commit](https://github.com/electrode-io/fynpo/commit/81e4adc643b9a17790a4b6d0a29977645d11798d)
    -   Remove legacy npm-config.js and fix scriptShell option handling [commit](https://github.com/electrode-io/fynpo/commit/4fb1aa9308320dbb33b2b530267cecb66783ae5e)
    -   2 [commit](https://github.com/electrode-io/fynpo/commit/f05026fb54e713c3d440415e5fec872119c4197b)
    -   1 [commit](https://github.com/electrode-io/fynpo/commit/764e97ad46f060c448836d7c685c6a6ef8874553)
    -   fix outdated lock data causing null pkgInfo [commit](https://github.com/electrode-io/fynpo/commit/13964403e8784b6dc4b8328741b97fbd2a4acaf1)
    -   fyn --auto-run options to allow turn off auto run npm after install [commit](https://github.com/electrode-io/fynpo/commit/987bb47905ccd042c48bae15f38a4f77278d2781)
    -   chore: update yarn/README.md [commit](https://github.com/electrode-io/fynpo/commit/0edb9aa8fac026920b8e42c384c9ed2a2f54cf0b)
    -   chore: add dev dep tsx [commit](https://github.com/electrode-io/fynpo/commit/c88046f3674d0d38e2f316ae83f54c7a226b592b)
    -   chore: remove bin/node-gyp.js [commit](https://github.com/electrode-io/fynpo/commit/81e7a5a73389a7df38cc2223c0de9d83449c55f3)
    -   chore: claude and fix tests [commit](https://github.com/electrode-io/fynpo/commit/bb05037ad61ccd580b7c5e9ef8fc8e1f2a12a977)
    -   removing node-gyp from fyn [commit](https://github.com/electrode-io/fynpo/commit/b281e92048d41809279bbb89260e7a88ea3ece24)

-   `packages/fynpo`

    -   fynpo,fyn: [major] bump to v2 [commit](https://github.com/electrode-io/fynpo/commit/40bc40fd3cdb5ee06c71f4bd58fb4f1069cc6126)
    -   fynpo: update tests [commit](https://github.com/electrode-io/fynpo/commit/0ce4c1a4227160f88c4b87cedcc216ab6caa8255)
    -   fynpo: move to vitest [commit](https://github.com/electrode-io/fynpo/commit/7ee4b0ea560ca6dca6e12ee4a0169a952ac1b646)
    -   fynpo: upgrade to nix-clap 2.4.1 [commit](https://github.com/electrode-io/fynpo/commit/7575b86842659cfbbb6e82c6e5a124d68d6c1ef4)
    -   fynpo: fix copying build package to cache [commit](https://github.com/electrode-io/fynpo/commit/625c45e591d6745aca1745ef70b2626c24dfb6d2)
    -   fynpo: use tsx to execute .ts directly [commit](https://github.com/electrode-io/fynpo/commit/5208b18be65dab11e4bc4b3a6dae2f8d1f7c8fda)

-   `packages/pacote-jchip`

    -   fynpo: update tests [commit](https://github.com/electrode-io/fynpo/commit/0ce4c1a4227160f88c4b87cedcc216ab6caa8255)
    -   1 [commit](https://github.com/electrode-io/fynpo/commit/764e97ad46f060c448836d7c685c6a6ef8874553)

-   `packages/pkg-preper`

    -   chore: update deps [commit](https://github.com/electrode-io/fynpo/commit/d95d9845c9ad1c8bd01905995c9124bc115c15c4)
    -   chore: update deps [commit](https://github.com/electrode-io/fynpo/commit/951c3a29f75ad51903bf8237108da770a6045e06)
    -   tests for fetching packages from git repo [commit](https://github.com/electrode-io/fynpo/commit/71d9c0508897adf7fec3ba425542bfdb894b14a7)
    -   fix use of new npm packages [commit](https://github.com/electrode-io/fynpo/commit/c8d23add782aac58b0a5ac53bb170bede5817570)
    -   3 [commit](https://github.com/electrode-io/fynpo/commit/d33c5c6e823524982f5842f7c905ea3142749fa8)
    -   1 [commit](https://github.com/electrode-io/fynpo/commit/764e97ad46f060c448836d7c685c6a6ef8874553)

-   `MISC`

    -   chore: update lock and meta files [commit](https://github.com/electrode-io/fynpo/commit/f1cac5ad77dbbb357ef3bc91260502e8065244fd)

# 7/2/2025

## Packages

-   `@fynpo/base@1.1.18` `(1.1.17 => 1.1.18)`
-   `fyn@1.1.46` `(1.1.45 => 1.1.46)`
-   `fynpo@1.1.49` `(1.1.48 => 1.1.49)`

## Commits

-   `packages/fynpo-base`

    -   update deps [commit](https://github.com/electrode-io/fynpo/commit/ae32ffafef7231fac4ac0a2dbf3eb2a42889ca58)
    -   fix: ignore a fynpo root dir when searching for local packages [commit](https://github.com/electrode-io/fynpo/commit/ef676ae09fc51677aaaffffdd6d85a34d9769cdf)

-   `packages/fyn`

    -   update deps [commit](https://github.com/electrode-io/fynpo/commit/ae32ffafef7231fac4ac0a2dbf3eb2a42889ca58)

-   `packages/fynpo`

    -   update deps [commit](https://github.com/electrode-io/fynpo/commit/ae32ffafef7231fac4ac0a2dbf3eb2a42889ca58)

# 6/30/2025

## Packages

### Directly Updated

-   `fyn@1.1.45` `(1.1.44 => 1.1.45)`

### Fynpo Updated

-   `fynpo@1.1.48` `(1.1.47 => 1.1.48)`

## Commits

-   `packages/fyn`

    -   fix: use localPkgLinks to detect changes in local packages [commit](https://github.com/electrode-io/fynpo/commit/757545365388d951df1c77ab60aca0f296c02381)
    -   chore: update deps [commit](https://github.com/electrode-io/fynpo/commit/8b6e538c2eefe1feb3d0bc9450ae8c7d94fbc46a)

# 6/6/2025

## Packages

### Directly Updated

-   `fyn@1.1.44` `(1.1.43 => 1.1.44)`
-   `pkg-preper@0.1.3` `(0.1.2 => 0.1.3)`

### Fynpo Updated

-   `fynpo@1.1.47` `(1.1.46 => 1.1.47)`

## Commits

-   `packages/fyn`

    -   fyn: update publish-util [commit](https://github.com/electrode-io/fynpo/commit/39cb037f0f58ccb0509eedbdbff5ba005c9eadd2)

-   `packages/pkg-preper`

    -   fyn: update publish-util [commit](https://github.com/electrode-io/fynpo/commit/39cb037f0f58ccb0509eedbdbff5ba005c9eadd2)

# 6/3/2025

## Packages

-   `fyn@1.1.43` `(1.1.42 => 1.1.43)`
-   `fynpo@1.1.46` `(1.1.45 => 1.1.46)`
-   `pkg-preper@0.1.2` `(0.1.1 => 0.1.2)`

## Commits

-   `packages/fyn`

    -   make prettier optional [commit](https://github.com/electrode-io/fynpo/commit/13605249962256d97a23a6649de9ad837fce8356)

-   `packages/fynpo`

    -   make prettier optional [commit](https://github.com/electrode-io/fynpo/commit/13605249962256d97a23a6649de9ad837fce8356)

-   `packages/pkg-preper`

    -   pkg-preper: use aveazul [commit](https://github.com/electrode-io/fynpo/commit/22b934ab7e91adab36890675e9c6d6ead7769d24)

# 6/1/2025

## Packages

-   `fyn@1.1.42` `(1.1.41 => 1.1.42)`
-   `fynpo@1.1.45` `(1.1.44 => 1.1.45)`

## Commits

-   `packages/fyn`

    -   update circular error message [commit](https://github.com/electrode-io/fynpo/commit/7a26cdd152e41d944eec80884e0ec8027b297bcd)

-   `packages/fynpo`

    -   fynpo: update dependencies [commit](https://github.com/electrode-io/fynpo/commit/81ee5151c5ec4e81745e4d7b30da2f4bb95f71a1)
    -   update circular error message [commit](https://github.com/electrode-io/fynpo/commit/7a26cdd152e41d944eec80884e0ec8027b297bcd)

# 5/31/2025

## Packages

-   `@fynpo/base@1.1.17` `(1.1.16 => 1.1.17)`
-   `fyn@1.1.41` `(1.1.40 => 1.1.41)`
-   `fynpo@1.1.44` `(1.1.43 => 1.1.44)`
-   `pkg-preper@0.1.1` `(0.1.0 => 0.1.1)`

## Commits

-   `packages/fynpo-base`

    -   fix: fynpo detect and avoid circular deps [commit](https://github.com/electrode-io/fynpo/commit/67073c98160d82cfb2aeb086a47798e0d9c6bec2)

-   `packages/bluebird`

    -   chore: fix bluebird aveazul wrap test [commit](https://github.com/electrode-io/fynpo/commit/9f918d6325c0fb4fb08cd1e3fa33b0d11904c6dc)
    -   more replace bluebird [commit](https://github.com/electrode-io/fynpo/commit/977991522fea6fb2c666cf802ab6aa2a3fe2f450)

-   `packages/fyn`

    -   reduce log noise for optional platform check failures [commit](https://github.com/electrode-io/fynpo/commit/d3109aa544c65482066c3898e0246b9a664dd672)
    -   more replace bluebird [commit](https://github.com/electrode-io/fynpo/commit/977991522fea6fb2c666cf802ab6aa2a3fe2f450)
    -   update some tests [commit](https://github.com/electrode-io/fynpo/commit/e9703eeb3183f9a4ddb088042a7ea440f750ecda)
    -   fyn: use aveazul to replace bluebird [commit](https://github.com/electrode-io/fynpo/commit/762e97e42bc0ac64fc6d2138fe5d223d5d283405)
    -   update webpack [commit](https://github.com/electrode-io/fynpo/commit/d126e921ecb1618787f7d26aed92426f98850653)
    -   chore: update fyn lockfile [commit](https://github.com/electrode-io/fynpo/commit/d784467b50ffbed5a8354734d9515bc175a8bb3d)

-   `packages/fynpo`

    -   use tsx [commit](https://github.com/electrode-io/fynpo/commit/d7982a44758819f33169d5fe774aad9d018aef5a)
    -   fix: fynpo detect and avoid circular deps [commit](https://github.com/electrode-io/fynpo/commit/67073c98160d82cfb2aeb086a47798e0d9c6bec2)
    -   chore: use swc to compile ts for development [commit](https://github.com/electrode-io/fynpo/commit/05ded5d9d4d46d3eca2e0a2a73ea3e0941a41dcd)

-   `packages/pkg-preper`

    -   more replace bluebird [commit](https://github.com/electrode-io/fynpo/commit/977991522fea6fb2c666cf802ab6aa2a3fe2f450)
    -   add pkg pkg-preper [commit](https://github.com/electrode-io/fynpo/commit/6619fa650adeac3955f44ef3db6054fb3e9b609d)

-   `.github`

    -   update CI node versions [commit](https://github.com/electrode-io/fynpo/commit/eeb421fd0b4911f78d76529daaa21fcf2daf82b6)
    -   chore: update ci script [commit](https://github.com/electrode-io/fynpo/commit/6270b5be973961bf81fc488d972f3e203ff829a5)

-   `MISC`

    -   chore: update fynpo to 1.1.43 [commit](https://github.com/electrode-io/fynpo/commit/22e57cef41c4f0042346628cf61e06cb8e2db2f2)

# 7/18/2022

## Packages

-   `@fynpo/base@1.1.16` `(1.1.15 => 1.1.16)`
-   `fyn@1.1.40` `(1.1.39 => 1.1.40)`
-   `fynpo@1.1.43` `(1.1.42 => 1.1.43)`

## Commits

-   `packages/fynpo-base`

    -   fix: best effort to deal with circular deps [commit](https://github.com/electrode-io/fynpo/commit/b69086952e7c4021f79906e51ea167462b72dbe9)
    -   fix: add test for fynpo-base [commit](https://github.com/electrode-io/fynpo/commit/916c78c27977d3d19ba6ceb3e3817836cba03315)
    -   fix: fynpo-base and fyn tests [commit](https://github.com/electrode-io/fynpo/commit/d9a03612ad1a24001eacb6b6c4d93a50aaa43c27)
    -   fix: ignore optional and peer dependencies for topo sort [commit](https://github.com/electrode-io/fynpo/commit/e7f682fe96da0fbbc3f75b6b982b765f293adf7a)

-   `packages/fyn`

    -   fix: fyn validate central store package [commit](https://github.com/electrode-io/fynpo/commit/1a23bd4773f22264e81eb29b236694bc12337bfe)
    -   fix: update pacote [commit](https://github.com/electrode-io/fynpo/commit/b6ca1b569d4cbfd47865e664bffa3013ebc2690e)
    -   fix: fynpo-base and fyn tests [commit](https://github.com/electrode-io/fynpo/commit/d9a03612ad1a24001eacb6b6c4d93a50aaa43c27)
    -   fix: avoid build local when installing top level modules [commit](https://github.com/electrode-io/fynpo/commit/64f963d8b014ffddcfecdece7f4f10fc087c8402)

-   `packages/fynpo`

    -   fix: allow installing fynpo in unbundled form locally [commit](https://github.com/electrode-io/fynpo/commit/b22e2da6c9293f58ace769e4d2f8109f0ce55a47)

-   `testing`

    -   fix: run testing in ci check [commit](https://github.com/electrode-io/fynpo/commit/310d86ceb71de3e66aeaa23d5567e77e463e3516)

-   `MISC`

    -   update fynpo version [commit](https://github.com/electrode-io/fynpo/commit/f667bd7ec7d429e4dc1471c87f9c05b19f8ec82e)

# 5/20/2022

## Packages

-   `fyn@1.1.39` `(1.1.38 => 1.1.39)`
-   `fynpo@1.1.42` `(1.1.41 => 1.1.42)`

## Commits

-   `packages/fyn`

    -   fix: save flattenTop option to lockfile [commit](https://github.com/electrode-io/fynpo/commit/d4169ee0623ed4491f01210ebe9529dc2771b22c)

-   `packages/fynpo`

    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/8d453bc3cd0da5d7553bed62c6750120af5fc103)

-   `docs`

    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/8d453bc3cd0da5d7553bed62c6750120af5fc103)

-   `docusaurus`

    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/8d453bc3cd0da5d7553bed62c6750120af5fc103)

# 4/22/2022

## Packages

### Directly Updated

-   `fyn@1.1.38` `(1.1.37 => 1.1.38)`

### Fynpo Updated

-   `fynpo@1.1.41` `(1.1.40 => 1.1.41)`

## Commits

-   `packages/fyn`

    -   fix: match direct dep to resolutions for packages inside a fynpo [commit](https://github.com/electrode-io/fynpo/commit/c4a7d127bb64589d32547a5674d6ac104b53e683)
    -   fix: npm dep path matching avoid / meant for scope [commit](https://github.com/electrode-io/fynpo/commit/95f60c1a9a9cb3f901588e99741594457042eccb)

# 4/20/2022

## Packages

-   `fyn@1.1.37` `(1.1.36 => 1.1.37)`
-   `fynpo@1.1.40` `(1.1.39 => 1.1.40)`

## Commits

-   `packages/fyn`

    -   feat: supports user resolutions data base on yarn spec [commit](https://github.com/electrode-io/fynpo/commit/8953d34fe19abdab7ae9bb1ccc3209d79b1d0fe7)

-   `packages/fynpo`

    -   feat: supports user resolutions data base on yarn spec [commit](https://github.com/electrode-io/fynpo/commit/8953d34fe19abdab7ae9bb1ccc3209d79b1d0fe7)

# 4/16/2022

## Packages

-   `fyn@1.1.36` `(1.1.35 => 1.1.36)`
-   `fynpo@1.1.39` `(1.1.38 => 1.1.39)`

## Commits

-   `packages/fyn`

    -   update deps [commit](https://github.com/electrode-io/fynpo/commit/534a482c2086a3aeeefd2d0f03616aab307ca143)

-   `packages/fynpo`

    -   update deps [commit](https://github.com/electrode-io/fynpo/commit/534a482c2086a3aeeefd2d0f03616aab307ca143)

-   `testing`

    -   update deps [commit](https://github.com/electrode-io/fynpo/commit/534a482c2086a3aeeefd2d0f03616aab307ca143)

# 4/14/2022

## Packages

### Directly Updated

-   `@fynpo/base@1.1.15` `(1.1.14 => 1.1.15)`
-   `fyn@1.1.35` `(1.1.34 => 1.1.35)`

### Fynpo Updated

-   `fynpo@1.1.38` `(1.1.37 => 1.1.38)`

## Commits

-   `packages/fynpo-base`

    -   avoid resolving indirect dep in graph [commit](https://github.com/electrode-io/fynpo/commit/7f1e0a802deff50f63ce753ca6a456913d9d80fd)

-   `packages/fyn`

    -   new fyn sync-local command [commit](https://github.com/electrode-io/fynpo/commit/ed6de91990e58549108f8e4fd7c6fdb10f8fc0bc)

-   `MISC`

    -   update dep fynpo@1.1.35 [commit](https://github.com/electrode-io/fynpo/commit/656f0273902d62fcdae7e3763222971653caed4a)

# 4/12/2022

## Packages

### Directly Updated

-   `fyn@1.1.34` `(1.1.33 => 1.1.34)`

### Fynpo Updated

-   `fynpo@1.1.37` `(1.1.36 => 1.1.37)`

## Commits

-   `packages/fyn`

    -   minor linting updates [commit](https://github.com/electrode-io/fynpo/commit/81fb75d4a7a30e2ece28879076ccd872e762e6f7)
    -   avoid file name conflict with normal object prototypes [commit](https://github.com/electrode-io/fynpo/commit/937d0518a32abd74b065e0ce0b2c535cdaccbc4b)

# 4/8/2022

## Packages

### Directly Updated

-   `fyn@1.1.33` `(1.1.32 => 1.1.33)`

### Fynpo Updated

-   `fynpo@1.1.36` `(1.1.35 => 1.1.36)`

## Commits

-   `packages/fyn`

    -   replace env in rc config [commit](https://github.com/electrode-io/fynpo/commit/d1da9103ef9267ef27ef95494605903998389468)
    -   better errors with AggregateError [commit](https://github.com/electrode-io/fynpo/commit/c5b01669bf5d30623d0e367099fa87e6bace4d52)
    -   avoid checking fynpo local copies for URL semver [commit](https://github.com/electrode-io/fynpo/commit/7f83f14fda6009c3a657029c43d1068dbcb5cd30)
    -   handle semver using link: [commit](https://github.com/electrode-io/fynpo/commit/f8958ee19e350336c97996f56371e1acbb75c6ba)

# 4/6/2022

## Packages

### Directly Updated

-   `fyn@1.1.32` `(1.1.31 => 1.1.32)`

### Fynpo Updated

-   `fynpo@1.1.35` `(1.1.34 => 1.1.35)`

## Commits

-   `packages/fyn`

    -   add fynpo node_modules bin to PATH when running npm script [commit](https://github.com/electrode-io/fynpo/commit/a077528f2680142cffdaacb6f9d6ff03464cc39f)
    -   update dep and lockfiles [commit](https://github.com/electrode-io/fynpo/commit/ee8996250b921529d1f293f21730958b23f7c073)

# 3/18/2022

## Packages

-   `@fynpo/base@1.1.14` `(1.1.13 => 1.1.14)`
-   `fyn@1.1.31` `(1.1.30 => 1.1.31)`
-   `fynpo@1.1.34` `(1.1.33 => 1.1.34)`

## Commits

-   `packages/fynpo-base`

    -   add some types to functions [commit](https://github.com/electrode-io/fynpo/commit/cac9459ed18e5df44f7f2fbd77abb1f2a967f219)
    -   add tests [commit](https://github.com/electrode-io/fynpo/commit/5194dee3f59f77dd65346688ee0b4e5e81a9a400)
    -   fynpo bootstrap only save cache miss details if it was missed [commit](https://github.com/electrode-io/fynpo/commit/a7bec8420c0a38954cc87ca067559e3eaac47802)
    -   verify non-compress cache file hash when copying [commit](https://github.com/electrode-io/fynpo/commit/1b09d63fae3f146f187ee1e83aaba1ac844ec97a)

-   `packages/fyn`

    -   improve log messages [commit](https://github.com/electrode-io/fynpo/commit/a4c359e15e06cd7f564377813c7a4f2bcdf4650f)
    -   pkg install check buildLocal flag [commit](https://github.com/electrode-io/fynpo/commit/0a18dce5979d9fa2097fccdb119da5b75b7950aa)

-   `packages/fynpo`

    -   fynpo bootstrap only save cache miss details if it was missed [commit](https://github.com/electrode-io/fynpo/commit/a7bec8420c0a38954cc87ca067559e3eaac47802)
    -   improve log messages [commit](https://github.com/electrode-io/fynpo/commit/a4c359e15e06cd7f564377813c7a4f2bcdf4650f)
    -   verify non-compress cache file hash when copying [commit](https://github.com/electrode-io/fynpo/commit/1b09d63fae3f146f187ee1e83aaba1ac844ec97a)
    -   handle bootstrap restore from cache failure [commit](https://github.com/electrode-io/fynpo/commit/f93d69dcdc465f200dfa2f893e3bff98118c7785)

# 3/7/2022

## Packages

### Directly Updated

-   `@fynpo/base@1.1.13` `(1.1.12 => 1.1.13)`

### Fynpo Updated

-   `fyn@1.1.30` `(1.1.29 => 1.1.30)`
-   `fynpo@1.1.33` `(1.1.32 => 1.1.33)`

## Commits

-   `packages/fynpo-base`

    -   fix caching dir minimatch check [commit](https://github.com/electrode-io/fynpo/commit/80b3c73e3f085cf7f3703ff78f5929a416efdbca)

# 3/3/2022

## Packages

-   `fyn@1.1.29` `(1.1.28 => 1.1.29)`
-   `fynpo@1.1.32` `(1.1.31 => 1.1.32)`

## Commits

-   `packages/fyn`

    -   fyn run handles error with exit code [commit](https://github.com/electrode-io/fynpo/commit/0c0c835d35aea073566443dca1c21a580f57ffaf)

-   `packages/fynpo`

    -   add compress for fynpo fs caching [commit](https://github.com/electrode-io/fynpo/commit/4d2d3527031cae42ef49cfd3007693b1d08ab89a)

# 3/2/2022

## Packages

### Directly Updated

-   `@fynpo/base@1.1.12` `(1.1.11 => 1.1.12)`
-   `fynpo@1.1.31` `(1.1.30 => 1.1.31)`

### Fynpo Updated

-   `fyn@1.1.28` `(1.1.27 => 1.1.28)`

## Commits

-   `packages/fynpo-base`

    -   detail extra data for caching [commit](https://github.com/electrode-io/fynpo/commit/075ecdd26fcae5d1f1b4caad866df229342323ff)

-   `packages/fynpo`

    -   detail extra data for caching [commit](https://github.com/electrode-io/fynpo/commit/075ecdd26fcae5d1f1b4caad866df229342323ff)
    -   fynpo run check error after installing node_modules [commit](https://github.com/electrode-io/fynpo/commit/dead3e3a959d8ea6bcbacd7091dd651b310341b0)

-   `MISC`

    -   update deps [commit](https://github.com/electrode-io/fynpo/commit/893deb5e3f68a7920ed82866044a5d85f84d6546)

# 2/27/2022

## Packages

-   `fyn@1.1.27` `(1.1.26 => 1.1.27)`
-   `fynpo@1.1.30` `(1.1.29 => 1.1.30)`

## Commits

-   `packages/fyn`

    -   readme [commit](https://github.com/electrode-io/fynpo/commit/7c4c2cf0a4ba3b7c3aaace7f93cd02a7347cab07)
    -   update log messages and cache paths [commit](https://github.com/electrode-io/fynpo/commit/d03e9ffec7ababa8ff7b2b6612437249fd446248)

-   `packages/fynpo`

    -   update log messages and cache paths [commit](https://github.com/electrode-io/fynpo/commit/d03e9ffec7ababa8ff7b2b6612437249fd446248)

# 2/25/2022

## Packages

### Directly Updated

-   `@fynpo/base@1.1.11` `(1.1.10 => 1.1.11)`
-   `fynpo@1.1.29` `(1.1.28 => 1.1.29)`

### Fynpo Updated

-   `fyn@1.1.26` `(1.1.25 => 1.1.26)`

## Commits

-   `packages/fynpo-base`

    -   save cache missed details for debugging [commit](https://github.com/electrode-io/fynpo/commit/f2e665b787203dab1b437b25017fd0851717155a)
    -   polyfill hash digest base64url for older node versions [commit](https://github.com/electrode-io/fynpo/commit/4f9a2e213ffed00d3874e6f29499dcaaa4eeba2a)
    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/be812191be2fec623e161836b2a26ad69b4bad4e)

-   `packages/fynpo`

    -   save cache missed details for debugging [commit](https://github.com/electrode-io/fynpo/commit/f2e665b787203dab1b437b25017fd0851717155a)

# 2/24/2022

## Packages

-   `@fynpo/base@1.1.10` `(1.1.9 => 1.1.10)`
-   `fyn@1.1.25` `(1.1.24 => 1.1.25)`
-   `fynpo@1.1.28` `(1.1.27 => 1.1.28)`

## Commits

-   `packages/fynpo-base`

    -   implement caching [commit](https://github.com/electrode-io/fynpo/commit/7223d3718ec4df4e419753e141c20d01d53d35ad)
    -   update filterScanDir types [commit](https://github.com/electrode-io/fynpo/commit/17a63d86f225df5b117d8a7a5cceffcfb9549096)
    -   scan files concurrently [commit](https://github.com/electrode-io/fynpo/commit/edea1cd6778c00867ca616a444f46faee83604b0)

-   `packages/fyn`

    -   implement caching [commit](https://github.com/electrode-io/fynpo/commit/7223d3718ec4df4e419753e141c20d01d53d35ad)

-   `packages/fynpo`

    -   implement caching [commit](https://github.com/electrode-io/fynpo/commit/7223d3718ec4df4e419753e141c20d01d53d35ad)
    -   report total bootstrap time with second run [commit](https://github.com/electrode-io/fynpo/commit/963c5c1e55464f7c14cc49ccdab624873b67e62e)
    -   fynpo publish support running top prepublishOnly script [commit](https://github.com/electrode-io/fynpo/commit/3ef97d6a491ad141b230f4238be592305aa1c835)

-   `packages/init-package`

    -   fix init-package test [commit](https://github.com/electrode-io/fynpo/commit/fab42128c92642ec984894760e8a42136cbc441d)

-   `.github`

    -   add node 16 to ci [commit](https://github.com/electrode-io/fynpo/commit/404e3be99b237fc804d58638ccb6ba3e04e70d07)

-   `MISC`

    -   fynpo run with stream [commit](https://github.com/electrode-io/fynpo/commit/94607ee0ac03825fde27c133a733bc4b707f25ba)

# 2/18/2022

## Packages

### Directly Updated

-   `@fynpo/base@1.1.9` `(1.1.8 => 1.1.9)`
-   `fyn@1.1.24` `(1.1.23 => 1.1.24)`

### Fynpo Updated

-   `fynpo@1.1.27` `(1.1.26 => 1.1.27)`

## Commits

-   `packages/fynpo-base`

    -   update deps [commit](https://github.com/electrode-io/fynpo/commit/2746766f2c3fdb6c39c56c23dc07d8cdd64dbf5d)
    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/3764dc95ca92f33adbf5a84c981889f749b2cfa9)

-   `packages/create-fynpo`

    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/3764dc95ca92f33adbf5a84c981889f749b2cfa9)

-   `packages/fyn`

    -   update deps [commit](https://github.com/electrode-io/fynpo/commit/2746766f2c3fdb6c39c56c23dc07d8cdd64dbf5d)

# 2/13/2022

## Packages

-   `@fynpo/base@1.1.8` `(1.1.7 => 1.1.8)`
-   `create-fynpo@1.0.5` `(1.0.4 => 1.0.5)`
-   `fyn@1.1.23` `(1.1.22 => 1.1.23)`
-   `fynpo@1.1.26` `(1.1.25 => 1.1.26)`

## Commits

-   `packages/fynpo-base`

    -   update dep filter-scan-dir [commit](https://github.com/electrode-io/fynpo/commit/4063da33aa9f7515165c5ea63d8349c46fd31555)

-   `packages/create-fynpo`

    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/881c28ff28d09f6922201c5dd77b81458eff19c4)

-   `packages/fyn`

    -   update build urls [commit](https://github.com/electrode-io/fynpo/commit/17c2639552ae897466a62c7f72b24c280278edbd)
    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/881c28ff28d09f6922201c5dd77b81458eff19c4)
    -   expose fyns generatePackTree function [commit](https://github.com/electrode-io/fynpo/commit/e58e9c1b724d517d0b9d1505aeaf0705847758d6)
    -   update READMEs [commit](https://github.com/electrode-io/fynpo/commit/31ba1d5a31f8ed67b8eac7d28cb6f75631411580)
    -   restore fyns main [commit](https://github.com/electrode-io/fynpo/commit/990193e28dff20d9567445cfedad6397c360692b)
    -   disable other module systems in webpack [commit](https://github.com/electrode-io/fynpo/commit/8241d2c5eb094a52afc1d6c1291fd4f87e788b10)
    -   fix default command for npx [commit](https://github.com/electrode-io/fynpo/commit/f612741db44d78bbfc8ca9ef4cf0c93e81721682)
    -   dep: update filter-scan-dir to 1.5.0 [commit](https://github.com/electrode-io/fynpo/commit/7ec33290a9a2480a71fa9adce75001f501c03bea)

-   `packages/fynpo`

    -   update build urls [commit](https://github.com/electrode-io/fynpo/commit/17c2639552ae897466a62c7f72b24c280278edbd)
    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/881c28ff28d09f6922201c5dd77b81458eff19c4)
    -   update READMEs [commit](https://github.com/electrode-io/fynpo/commit/31ba1d5a31f8ed67b8eac7d28cb6f75631411580)
    -   set webpack module to commonjs and esm only for fynpo [commit](https://github.com/electrode-io/fynpo/commit/bf42fbcfc70bfba1c283e142bcc8d2aedb4a1732)
    -   update fynpo docs [commit](https://github.com/electrode-io/fynpo/commit/df5e2ecebecf3608682f2f2c2e72feada69a071c)
    -   dep: update filter-scan-dir to 1.5.0 [commit](https://github.com/electrode-io/fynpo/commit/7ec33290a9a2480a71fa9adce75001f501c03bea)

-   `docs`

    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/881c28ff28d09f6922201c5dd77b81458eff19c4)

-   `docusaurus`

    -   update docs [commit](https://github.com/electrode-io/fynpo/commit/881c28ff28d09f6922201c5dd77b81458eff19c4)
    -   update fynpo docs [commit](https://github.com/electrode-io/fynpo/commit/df5e2ecebecf3608682f2f2c2e72feada69a071c)

# 1/3/2022

## Packages

### Directly Updated

-   `fyn@1.1.22` `(1.1.21 => 1.1.22)`

### Fynpo Updated

-   `fynpo@1.1.25` `(1.1.24 => 1.1.25)`

## Commits

-   `packages/fyn`

    -   init env with npm-lifecycle [commit](https://github.com/electrode-io/fynpo/commit/9faa8bbd0c42385715be0b9306657e29495dc402)

-   `packages/init-package`

    -   update publishConfig when fyn init exist package [commit](https://github.com/electrode-io/fynpo/commit/445a44ebc14cd425384c3018cb1798f953654053)

# 12/27/2021

## Packages

### Directly Updated

-   `fyn@1.1.21` `(1.1.20 => 1.1.21)`

### Fynpo Updated

-   `fynpo@1.1.24` `(1.1.23 => 1.1.24)`

## Commits

-   `packages/fyn`

    -   bundle node-gyp [commit](https://github.com/electrode-io/fynpo/commit/a43b704224f87819bf663a46248d142d10d24b57)
    -   setup node-gyp for fyn run [commit](https://github.com/electrode-io/fynpo/commit/d65f4a9c493097f76a14d4cdd6de7a3115fb48cf)
    -   improve node-gyp-bin search for npm8 [commit](https://github.com/electrode-io/fynpo/commit/5a09f3a0f63c44823d292b2bd3e8a8d2cc505682)

# 12/26/2021

## Packages

### Directly Updated

-   `fyn@1.1.20` `(1.1.19 => 1.1.20)`

### Fynpo Updated

-   `fynpo@1.1.23` `(1.1.22 => 1.1.23)`

## Commits

-   `packages/fyn`

    -   add fyn init [commit](https://github.com/electrode-io/fynpo/commit/ef00660a441d5b30b9e803e6253a1d37c82ed877)
    -   reduce normal log noise [commit](https://github.com/electrode-io/fynpo/commit/9bb3fc70bb2d2bf591d1112fc7d310a4e4ce595f)

-   `packages/init-package`

    -   add fyn init [commit](https://github.com/electrode-io/fynpo/commit/ef00660a441d5b30b9e803e6253a1d37c82ed877)

# 12/8/2021

## Packages

-   `fyn@1.1.19` `(1.1.18 => 1.1.19)`
-   `fynpo@1.1.22` `(1.1.21 => 1.1.22)`

## Commits

-   `packages/fyn`

    -   allow FYN_CENTRAL_DIR env to turn off central store [commit](https://github.com/electrode-io/fynpo/commit/ad24ab8f1bb3565fe8ea7f1f1a2bb9b07b0cf027)
    -   fyn local allow copy files and packing symlinks [commit](https://github.com/electrode-io/fynpo/commit/072f0ab639e3fba8c7f8f00fb983648407d57650)

-   `packages/fynpo`

    -   update readme [commit](https://github.com/electrode-io/fynpo/commit/58807ee5a84c4e42152d4cd462def854ba1d6369)
    -   fix lint [commit](https://github.com/electrode-io/fynpo/commit/856f0760153bbaeb304467b4f518ca53a5a0241c)
    -   release fynpo with webpack bundled code [commit](https://github.com/electrode-io/fynpo/commit/4170a78e08f25f221840ab643c4380a046f91b12)

# 11/23/2021

## Packages

### Directly Updated

-   `fyn@1.1.18` `(1.1.17 => 1.1.18)`

### Fynpo Updated

-   `fynpo@1.1.21` `(1.1.20 => 1.1.21)`

## Commits

-   `packages/fyn`

    -   fix: move different version of a package to FV dir [commit](https://github.com/electrode-io/fynpo/commit/36b4e6557f7e66b1dea84494fd642d785505ed2b)
    -   fix: fyn lock-only not fail for optionals [commit](https://github.com/electrode-io/fynpo/commit/3902174872171db1b5fdf7d01f92217819bea944)

# 11/15/2021

## Packages

-   `@fynpo/base@1.1.7` `(1.1.6 => 1.1.7)`
-   `fyn@1.1.17` `(1.1.16 => 1.1.17)`
-   `fynpo@1.1.20` `(1.1.19 => 1.1.20)`

## Commits

-   `packages/fynpo-base`

    -   dep: publish-util 2.0.0 [commit](https://github.com/electrode-io/fynpo/commit/5c58d154bf660f134dba49360564c71bc5401f32)

-   `packages/fyn`

    -   dep: visual-exec 0.1.14 [commit](https://github.com/electrode-io/fynpo/commit/2f43075b66023ddbc14931bf60d72ef7a454eb32)
    -   dep: publish-util 2.0.0 [commit](https://github.com/electrode-io/fynpo/commit/5c58d154bf660f134dba49360564c71bc5401f32)

-   `packages/fynpo`

    -   dep: visual-exec 0.1.14 [commit](https://github.com/electrode-io/fynpo/commit/2f43075b66023ddbc14931bf60d72ef7a454eb32)
    -   dep: publish-util 2.0.0 [commit](https://github.com/electrode-io/fynpo/commit/5c58d154bf660f134dba49360564c71bc5401f32)

# 11/11/2021

## Packages

-   `fyn@1.1.16` `(1.1.15 => 1.1.16)`
-   `fynpo@1.1.19` `(1.1.18 => 1.1.19)`

## Commits

-   `packages/fyn`

    -   fix: allow option to override semver for local dep [commit](https://github.com/electrode-io/fynpo/commit/a6668072127e34a8e9821ca607ef289a0de90ed9)
    -   fix: handle array in npmRunScripts option [commit](https://github.com/electrode-io/fynpo/commit/5d1c1e606fa5b225ebe28577b6574f31add99bbf)

-   `packages/fynpo`

    -   fix: allow option to override semver for local dep [commit](https://github.com/electrode-io/fynpo/commit/a6668072127e34a8e9821ca607ef289a0de90ed9)

# 11/10/2021

## Packages

### Directly Updated

-   `@fynpo/base@1.1.6` `(1.1.5 => 1.1.6)`
-   `fyn@1.1.15` `(1.1.14 => 1.1.15)`

### Fynpo Updated

-   `fynpo@1.1.18` `(1.1.17 => 1.1.18)`

## Commits

-   `packages/fynpo-base`

    -   fix: match local fynpo packages with semver [commit](https://github.com/electrode-io/fynpo/commit/e658be28084ec4a4ea3007d967958032212aa273)

-   `packages/fyn`

    -   fix: run prepublish/prepack/postpack as part of building local pkg [commit](https://github.com/electrode-io/fynpo/commit/382d22fb752705c6078534dce8c0dfefc1401322)
    -   fix: match local fynpo packages with semver [commit](https://github.com/electrode-io/fynpo/commit/e658be28084ec4a4ea3007d967958032212aa273)

# 11/9/2021

## Packages

### Directly Updated

-   `fyn@1.1.14` `(1.1.13 => 1.1.14)`

### Fynpo Updated

-   `fynpo@1.1.17` `(1.1.16 => 1.1.17)`

## Commits

-   `packages/fyn`

    -   fix: allow fynpo config to override publish-util config [commit](https://github.com/electrode-io/fynpo/commit/6d4347c0a0e27935def146f872d24953561c2327)
    -   fix: handle null integrity when checking central store [commit](https://github.com/electrode-io/fynpo/commit/d8a1d893c61cb500dba11badb5070a090cda7814)
    -   fix: process local package.json with publish-util [commit](https://github.com/electrode-io/fynpo/commit/14525ce1ff0182fd7b29c9e9ebf69a597d01f41a)

# 11/8/2021

## Packages

-   `@fynpo/base@1.1.5` `(1.1.4 => 1.1.5)`
-   `fyn@1.1.13` `(1.1.12 => 1.1.13)`
-   `fynpo@1.1.16` `(1.1.15 => 1.1.16)`

## Commits

-   `packages/fynpo-base`

    -   fix: use is-path-inside [commit](https://github.com/electrode-io/fynpo/commit/fb575309f424f3cc30c5ee85234045e60ec73192)

-   `packages/fyn`

    -   fix: run npm scripts from fynpo config with lifecycle [commit](https://github.com/electrode-io/fynpo/commit/06370aa71dac0e7b8125a82b9c048a55b8bc7d66)
    -   fix: make fyns various logging output better [commit](https://github.com/electrode-io/fynpo/commit/3c5560cc7cc1e66b4481cb09d2273ce55b9d0687)

-   `packages/fynpo`

    -   fix: run npm scripts from fynpo config with lifecycle [commit](https://github.com/electrode-io/fynpo/commit/06370aa71dac0e7b8125a82b9c048a55b8bc7d66)
    -   fix: make fyns various logging output better [commit](https://github.com/electrode-io/fynpo/commit/3c5560cc7cc1e66b4481cb09d2273ce55b9d0687)

# 11/5/2021

## Packages

-   `@fynpo/base@1.1.4` `(1.1.3 => 1.1.4)`
-   `fyn@1.1.12` `(1.1.11 => 1.1.12)`
-   `fynpo@1.1.15` `(1.1.14 => 1.1.15)`

## Commits

-   `packages/fynpo-base`

    -   fix: fynpo auto search avoid package.json in nested modules [commit](https://github.com/electrode-io/fynpo/commit/f3dbbeb98b1b1e8dcd97b602da68d8ca8bf2814b)

-   `packages/fyn`

    -   fix: avoid saving empty indirects for fynpo [commit](https://github.com/electrode-io/fynpo/commit/3e625de61fc0f09ec1f5f0a18554068aea48bd89)

-   `packages/fynpo`

    -   fix: fynpo auto search avoid package.json in nested modules [commit](https://github.com/electrode-io/fynpo/commit/f3dbbeb98b1b1e8dcd97b602da68d8ca8bf2814b)
    -   fix: fynpo handle --cwd option [commit](https://github.com/electrode-io/fynpo/commit/c39bb6c31821e529fef04f967431b4810b292a5e)
    -   fix: chdir to top for fynpo prepare [commit](https://github.com/electrode-io/fynpo/commit/14f0b077f378436c2b79c50f73ba68c5afdbc878)
    -   fix: fynpo changelog handle no-changelog token [commit](https://github.com/electrode-io/fynpo/commit/19c119854196d58c315fc5b42daed807650f0f77)
    -   fix: clean paths in log [commit](https://github.com/electrode-io/fynpo/commit/d73fcfa302e385d2f313ba1a836eeafd6052d30d)

-   `MISC`

    -   chore: update top dep [commit](https://github.com/electrode-io/fynpo/commit/52adc247e2de7667a4f596b4618f77291ca94b8e)

# 11/5/2021

## Packages

-   `fynpo@1.1.14` `(1.1.13 => 1.1.14)`

## Commits

-   `packages/fynpo`

    -   fix: get packages options [commit](https://github.com/electrode-io/fynpo/commit/d05fd4e1a78cea2f4aff78c1f71af8c76efa90a6)

# 11/4/2021

## Packages

### Directly Updated

-   `fyn@1.1.11` `(1.1.10 => 1.1.11)`

### Fynpo Updated

-   `fynpo@1.1.13` `(1.1.12 => 1.1.13)`

## Commits

-   `packages/fyn`

    -   feat: support multiple node_modules layout [commit](https://github.com/electrode-io/fynpo/commit/12575a143b3b125db434deec534677f06c41e686)

# 11/3/2021

## Packages

-   `@fynpo/base@1.1.3` `(1.1.2 => 1.1.3)`
-   `fyn@1.1.10` `(1.1.9 => 1.1.10)`
-   `fynpo@1.1.12` `(1.1.11 => 1.1.12)`

## Commits

-   `packages/fynpo-base`

    -   fix: remove default patterns to trigger searching package.json [commit](https://github.com/electrode-io/fynpo/commit/4ad7715de5dffd64ea4c13b99838c07bacb4630e)

-   `packages/fyn`

    -   fix: remove default patterns to trigger searching package.json [commit](https://github.com/electrode-io/fynpo/commit/4ad7715de5dffd64ea4c13b99838c07bacb4630e)

-   `packages/fynpo`

    -   fix: remove default patterns to trigger searching package.json [commit](https://github.com/electrode-io/fynpo/commit/4ad7715de5dffd64ea4c13b99838c07bacb4630e)

-   `MISC`

    -   chore: update top dep [commit](https://github.com/electrode-io/fynpo/commit/2d6342ee0ec9ecdf582acc84ba0000a9244f8500)

# 11/3/2021

## Packages

-   `fyn@1.1.9` `(1.1.8 => 1.1.9)`
-   `fynpo@1.1.11` `(1.1.10 => 1.1.11)`

## Commits

-   `packages/fyn`

    -   fix: automatically figure out if package need copy in central mode [commit](https://github.com/electrode-io/fynpo/commit/f6cdab7effdf5790d9169e04f68a74b5d7d58903)
    -   feat: load yarn.lock to resolve versions [commit](https://github.com/electrode-io/fynpo/commit/a3a14a7a5f56edfc00a11384cca09c4e1dc37097)

-   `packages/fynpo`

    -   fix: less log noise [commit](https://github.com/electrode-io/fynpo/commit/cb4c95ee89cd6a851abadd74acf9ab8ec38da27d)

-   `MISC`

    -   chore: update top dep [commit](https://github.com/electrode-io/fynpo/commit/d77734a6285ac3e595da78f37963311bb232f5b1)

# 10/31/2021

## Packages

-   `fynpo@1.1.10` `(1.1.9 => 1.1.10)`

## Commits

-   `packages/fynpo`

    -   fix: pushing release tag to git remote [commit](https://github.com/electrode-io/fynpo/commit/d0714c574df8963c3b52faf0194dfcff7b529fac)

-   `MISC`

    -   chore: update top dep [commit](https://github.com/electrode-io/fynpo/commit/9b95b57faf2e87528668bb640c7189d31cb2f790)

# 10/31/2021

## Packages

-   `fynpo@1.1.9` `(1.1.8 => 1.1.9)`

## Commits

-   `packages/fynpo`

    -   fix: publish handles CLI options [commit](https://github.com/electrode-io/fynpo/commit/1bec4f37b234d9f00ff878f836143ec4b0decbfb)

-   `MISC`

    -   chore: update dep [commit](https://github.com/electrode-io/fynpo/commit/7370f7849bbc0deabb3a314b661bf52c9488cc1a)

# 10/30/2021

## Packages

-   `fyn@1.1.8` `(1.1.7 => 1.1.8)`
-   `fynpo@1.1.8` `(1.1.7 => 1.1.8)`

## Commits

-   `packages/fyn`

    -   fix: publish that handles mid failures better [commit](https://github.com/electrode-io/fynpo/commit/617b5bda15e3ddeeb192eecb7f8deabd2625b1af)
    -   fix: improve retriev meta fail error message [commit](https://github.com/electrode-io/fynpo/commit/bc998f4d5990375dd296f157c5c40f332ff4a7fd)

-   `packages/fynpo`

    -   fix: has an index file [commit](https://github.com/electrode-io/fynpo/commit/9fd0aea75c6945e2270363a053b712beb4d66ff0)
    -   fix: update dep [commit](https://github.com/electrode-io/fynpo/commit/40b2cd694e92400eda64fcf312c8028ea569ca53)
    -   fix: publish that handles mid failures better [commit](https://github.com/electrode-io/fynpo/commit/617b5bda15e3ddeeb192eecb7f8deabd2625b1af)

-   `MISC`

    -   chore: update top dep [commit](https://github.com/electrode-io/fynpo/commit/5242e55d0d3e59257a23f94e1cad982472974930)

# 10/28/2021

## Packages

### Directly Updated

-   `fyn@1.1.6` `(1.1.5 => 1.1.6)`

### Fynpo Updated

-   `fynpo@1.1.6` `(1.1.3 => 1.1.6)`

## Commits

-   `packages/fyn`

    -   fix: package.json can disable fyn-local for indirect deps [commit](https://github.com/electrode-io/fynpo/commit/fbb58f5b99787188d02526849fc2e0beb8bc4ea7)
    -   fix: publish [commit](https://github.com/electrode-io/fynpo/commit/86a35f006b86d1bec053debb025176bae14dfc7e)

-   `MISC`

    -   chore: update top lockfile [commit](https://github.com/electrode-io/fynpo/commit/4cd219b29a9d03b2e344fb7121ffbf0c7b620509)

# 10/28/2021

## Packages

### Directly Updated

-   `fyn@1.1.3` `(1.1.2 => 1.1.3)`

### Fynpo Updated

-   `fynpo@1.1.3` `(1.1.2 => 1.1.3)`

## Commits

-   `packages/fyn`

    -   fix: webpack bundle in production mode [commit](https://github.com/electrode-io/fynpo/commit/254603c8ae1bc996404bafa845e519e083407aeb)
    -   chore: update webpack dep [commit](https://github.com/electrode-io/fynpo/commit/0c4dadfaa2c006eb22b94079a5ed2a3b6844e8f3)
    -   fix: log error [commit](https://github.com/electrode-io/fynpo/commit/a227cb8bf61274e4911a9542a65b3d04a89a1481)
    -   fix: handle npm 8 [commit](https://github.com/electrode-io/fynpo/commit/464fbc6e158e381e5c4001ac12863ccb2bbad778)
    -   feat: treat unknown command as npm script to run [commit](https://github.com/electrode-io/fynpo/commit/6da7655c28a60938aaa91d79cb74c2510f0a1a87)
    -   fix: compatible with node 8 [commit](https://github.com/electrode-io/fynpo/commit/c616d80f073195f787d643b2d815416ef4b9c27f)
    -   fix: fyn add reload fynpo before installing [commit](https://github.com/electrode-io/fynpo/commit/48b08bf8054e36da62c9cc5107e10b46cc19278a)

-   `MISC`

    -   chore: update lockfile [commit](https://github.com/electrode-io/fynpo/commit/78e947b060f6c17c5192dfd3854f87711072ca60)

# 10/25/2021

## Packages

-   `@fynpo/base@1.1.2` `(1.1.1 => 1.1.2)`
-   `fyn@1.1.2` `(1.1.1 => 1.1.2)`
-   `fynpo@1.1.2` `(1.1.1 => 1.1.2)`

## Commits

-   `packages/fynpo-base`

    -   fix: typo [commit](https://github.com/electrode-io/fynpo/commit/5993b58cc5601784747476b4f0216217f7fc96d1)
    -   fix: use dep graph for update changelog [commit](https://github.com/electrode-io/fynpo/commit/b86f54a0ed047f0dff545e884f1f78f0e8611fe8)
    -   fix: propage error with AggregateError [commit](https://github.com/electrode-io/fynpo/commit/2f6f48b2ecb554418f308691e2d2ae4966550e05)

-   `packages/fyn`

    -   fix: minor clean up of logs [commit](https://github.com/electrode-io/fynpo/commit/aa1a475616c1d4c2bda5dcfed0f9e28fd1ec4165)
    -   add v8-compile-cache for fyn [commit](https://github.com/electrode-io/fynpo/commit/22aea58930b27b26a6922bf8f420fe0fca4a21ae)
    -   fix: webpack config minimize size [commit](https://github.com/electrode-io/fynpo/commit/7d06f3c8d3ad5f86ddb99be55dd11f0124606382)
    -   fix: fyn run avoid initializing install [commit](https://github.com/electrode-io/fynpo/commit/ce61eb3ad89e8e37a46a80a997cff371845ec1aa)
    -   fix: wait for fynpo data lock [commit](https://github.com/electrode-io/fynpo/commit/816a0a7ab75b1ebac1c731ae450e8377daf8a70f)
    -   fix: propage error with AggregateError [commit](https://github.com/electrode-io/fynpo/commit/2f6f48b2ecb554418f308691e2d2ae4966550e05)

-   `packages/fynpo`

    -   fix: minor clean up of logs [commit](https://github.com/electrode-io/fynpo/commit/aa1a475616c1d4c2bda5dcfed0f9e28fd1ec4165)
    -   fix: parallel use concurrency [commit](https://github.com/electrode-io/fynpo/commit/30f467fc7a07c44827f2bef99a077cb22e8a4214)
    -   refactor: extract topo runner [commit](https://github.com/electrode-io/fynpo/commit/af27ca8c6820377b52693c1cf9c8bcf7cf27f830)
    -   fix: use dep graph for update changelog [commit](https://github.com/electrode-io/fynpo/commit/b86f54a0ed047f0dff545e884f1f78f0e8611fe8)
    -   fix: add -n flag to git commit [commit](https://github.com/electrode-io/fynpo/commit/cd1d4cc604187afce76dbbcbf21bdbd510340d63)

-   `MISC`

    -   chore: update lockfile [commit](https://github.com/electrode-io/fynpo/commit/87be9f29552ed6f2fb6e40150ce3fc3385994bc3)

# 10/6/2021

## Packages

-   `@fynpo/base@1.1.1` `(1.1.0 => 1.1.1)`
-   `fyn@1.1.1` `(1.1.0 => 1.1.1)`
-   `fynpo@1.1.1` `(1.1.0 => 1.1.1)`

## Commits

-   `packages/fynpo-base`

    -   fix: handle non-fynpo [commit](https://github.com/electrode-io/fynpo/commit/b8e81958c8b082b6d57a23e7ad53db8c77e46192)
    -   [patch]: fix scan pattern without wildcards [commit](https://github.com/electrode-io/fynpo/commit/bfbfb40d54c522a9f44eb05d881dc9fc41a983f8)

-   `packages/fyn`

    -   [chore]: fix ci [commit](https://github.com/electrode-io/fynpo/commit/e8825278acaf65c3d991766143a7cac79354e84f)

-   `packages/fynpo`

    -   [chore]: fix ci [commit](https://github.com/electrode-io/fynpo/commit/e8825278acaf65c3d991766143a7cac79354e84f)

-   `.github`

    -   [chore]: fix ci [commit](https://github.com/electrode-io/fynpo/commit/e8825278acaf65c3d991766143a7cac79354e84f)

# 10/5/2021

## Packages

-   `@fynpo/base@1.1.0` `(1.0.1 => 1.1.0)`
-   `fyn@1.1.0` `(1.0.1 => 1.1.0)`
-   `fynpo@1.1.0` `(1.0.1 => 1.1.0)`

## Commits

-   `packages/fynpo-base`

    -   [minor]: fyn help save fynpo local package indirect dep relations [commit](https://github.com/electrode-io/fynpo/commit/11ea2e26de254aaeaeb3e468e0fc76f5683c20f0)
    -   move fynpo config loading to fynpo-base [commit](https://github.com/electrode-io/fynpo/commit/7329c6aa9526f71aaa8831c352fbd88d126ec1b6)
    -   [Publish] [commit](https://github.com/electrode-io/fynpo/commit/c50cdc2bb1ece25090fafdeb145a42731e38d800)
    -   new dep graph handling [commit](https://github.com/electrode-io/fynpo/commit/7f019aeef52a274be2d4566260e509083164c384)

-   `packages/fyn`

    -   [minor]: fyn help save fynpo local package indirect dep relations [commit](https://github.com/electrode-io/fynpo/commit/11ea2e26de254aaeaeb3e468e0fc76f5683c20f0)
    -   move fynpo config loading to fynpo-base [commit](https://github.com/electrode-io/fynpo/commit/7329c6aa9526f71aaa8831c352fbd88d126ec1b6)
    -   [Publish] [commit](https://github.com/electrode-io/fynpo/commit/c50cdc2bb1ece25090fafdeb145a42731e38d800)
    -   chore: add badges [commit](https://github.com/electrode-io/fynpo/commit/0c49668e2ba93a95b2f102098f6f0eb6d64e5b53)

-   `packages/fynpo`

    -   [minor]: fyn help save fynpo local package indirect dep relations [commit](https://github.com/electrode-io/fynpo/commit/11ea2e26de254aaeaeb3e468e0fc76f5683c20f0)
    -   [Publish] [commit](https://github.com/electrode-io/fynpo/commit/c50cdc2bb1ece25090fafdeb145a42731e38d800)
    -   update tests [commit](https://github.com/electrode-io/fynpo/commit/50a96aa83eb82319df475886d943036158a37a8c)
    -   use vanilla http for meta memoizer server [commit](https://github.com/electrode-io/fynpo/commit/1e2d06efc7838dbb30c0c2166075968031121692)
    -   use new dep graph for bootstrap and run [commit](https://github.com/electrode-io/fynpo/commit/3685057a96231a5a730b29bbebd977a1c788048b)
    -   chore: add badges [commit](https://github.com/electrode-io/fynpo/commit/0c49668e2ba93a95b2f102098f6f0eb6d64e5b53)

-   `MISC`

    -   chore: update dep [commit](https://github.com/electrode-io/fynpo/commit/062132fff7dc2fa6b083684ee8a79f6b5ec36ffa)
    -   update dep [commit](https://github.com/electrode-io/fynpo/commit/60e258ce0409cf1eeda657504088431bb4480fb7)
    -   Update changelog [commit](https://github.com/electrode-io/fynpo/commit/d07d1cc5b50acad53ceb1a8e7269764a258a9cbf)

# 9/30/2021

## Packages

-   `@fynpo/base@1.0.1` `(1.0.0 => 1.0.1)`
-   `fyn@1.0.1` `(1.0.0 => 1.0.1)`
-   `fynpo@1.0.1` `(1.0.0 => 1.0.1)`

## Commits

-   `packages/fynpo-base`

    -   new dep graph handling [commit](https://github.com/electrode-io/fynpo/commit/7f019aeef52a274be2d4566260e509083164c384)

-   `packages/fyn`

    -   chore: add badges [commit](https://github.com/electrode-io/fynpo/commit/0c49668e2ba93a95b2f102098f6f0eb6d64e5b53)

-   `packages/fynpo`

    -   update tests [commit](https://github.com/electrode-io/fynpo/commit/50a96aa83eb82319df475886d943036158a37a8c)
    -   use vanilla http for meta memoizer server [commit](https://github.com/electrode-io/fynpo/commit/1e2d06efc7838dbb30c0c2166075968031121692)
    -   use new dep graph for bootstrap and run [commit](https://github.com/electrode-io/fynpo/commit/3685057a96231a5a730b29bbebd977a1c788048b)
    -   chore: add badges [commit](https://github.com/electrode-io/fynpo/commit/0c49668e2ba93a95b2f102098f6f0eb6d64e5b53)

-   `MISC`

    -   update dep [commit](https://github.com/electrode-io/fynpo/commit/60e258ce0409cf1eeda657504088431bb4480fb7)

# 9/10/2021

## Packages

- `@fynpo/base@1.0.0` `(0.1.0 => 1.0.0)`
- `fyn@1.0.0` `(0.4.38 => 1.0.0)`
- `fynpo@1.0.0` `(0.4.7 => 1.0.0)`
- `fynpo-cli@1.0.3` `(1.0.2 => 1.0.3)`

## Commits

- `packages/fynpo-base`

  - chore: update docs [commit](https://github.com/electrode-io/fynpo/commit/b1a49fc349f4be0192dfb0f18bbb045b7df37507)
  - [major] 1.x release [commit](https://github.com/electrode-io/fynpo/commit/df2fd6fd947c4c44e8d65199eb9affd0544bab5d)
  - chore: update license and homepage [commit](https://github.com/electrode-io/fynpo/commit/19823db5801cdfdf8db3d4b8127084627e6d8184)

- `packages/create-fynpo`

  - chore: update docs [commit](https://github.com/electrode-io/fynpo/commit/b1a49fc349f4be0192dfb0f18bbb045b7df37507)
  - chore: update license and homepage [commit](https://github.com/electrode-io/fynpo/commit/19823db5801cdfdf8db3d4b8127084627e6d8184)

- `packages/fyn`

  - [major] 1.x release [commit](https://github.com/electrode-io/fynpo/commit/df2fd6fd947c4c44e8d65199eb9affd0544bab5d)
  - chore: update license and homepage [commit](https://github.com/electrode-io/fynpo/commit/19823db5801cdfdf8db3d4b8127084627e6d8184)

- `packages/fynpo`

  - chore: update docs [commit](https://github.com/electrode-io/fynpo/commit/b1a49fc349f4be0192dfb0f18bbb045b7df37507)
  - [major] 1.x release [commit](https://github.com/electrode-io/fynpo/commit/df2fd6fd947c4c44e8d65199eb9affd0544bab5d)
  - chore: update license and homepage [commit](https://github.com/electrode-io/fynpo/commit/19823db5801cdfdf8db3d4b8127084627e6d8184)

- `packages/fynpo-cli`

  - chore: add homepage [commit](https://github.com/electrode-io/fynpo/commit/f383b59d8004ffd5817a65fee65cc59cca972380)
  - chore: update license and homepage [commit](https://github.com/electrode-io/fynpo/commit/19823db5801cdfdf8db3d4b8127084627e6d8184)

# 9/8/2021

## Packages

- `fyn@0.4.38` `(0.4.37 => 0.4.38)`
- `fynpo@0.4.7` `(0.4.6 => 0.4.7)`

## Commits

- `packages/fyn`

  - fix: copy package.json in central mode because we modify it [commit](https://github.com/electrode-io/fynpo/commit/950e49437f51db442c89ccb05bcf60b4ba7992f8)

- `packages/fynpo`

  - update readme and docs [commit](https://github.com/electrode-io/fynpo/commit/ebe1506d98d59e7e3b40ce1a63c435df40d46abb)

- `docs`

  - update readme and docs [commit](https://github.com/electrode-io/fynpo/commit/ebe1506d98d59e7e3b40ce1a63c435df40d46abb)

- `docusaurus`

  - update readme and docs [commit](https://github.com/electrode-io/fynpo/commit/ebe1506d98d59e7e3b40ce1a63c435df40d46abb)

# 8/25/2021

## Packages

- `fyn@0.4.37` `(0.4.36 => 0.4.37)`
- `fynpo@0.4.6` `(0.4.5 => 0.4.6)`

## Commits

- `packages/fyn`

  - fix: better fyn-central package error reporting [commit](https://github.com/electrode-io/fynpo/commit/15d442edd7210ea862ce48864d23ad54c73e75af)
  - [Publish] [commit](https://github.com/electrode-io/fynpo/commit/900ef4d029fa2622331c354485952402a75645b7)
  - fix: avoid too much meta fetch from registry [commit](https://github.com/electrode-io/fynpo/commit/fd79623fcae132cda95211dcdef26cda23d6807b)

- `packages/fynpo`

  - [Publish] [commit](https://github.com/electrode-io/fynpo/commit/900ef4d029fa2622331c354485952402a75645b7)

- `MISC`

  - Update changelog [commit](https://github.com/electrode-io/fynpo/commit/98190b83d556a083ea53c8cd4a8c19d5e63eeaea)

# 8/17/2021

## Packages

### Directly Updated

- `fyn@0.4.36` `(0.4.35 => 0.4.36)`

### Fynpo Updated

- `fynpo@0.4.5` `(0.4.4 => 0.4.5)`

## Commits

- `packages/fyn`

  - fix: avoid too much meta fetch from registry [commit](https://github.com/electrode-io/fynpo/commit/fd79623fcae132cda95211dcdef26cda23d6807b)

# 8/7/2021

## Packages

- `fyn@0.4.35` `(0.4.34 => 0.4.35)`
- `fynpo@0.4.4` `(0.4.3 => 0.4.4)`

## Commits

- `packages/fyn`

  - fix: look for .npmrc and .fynrc in fynpo dir [commit](https://github.com/electrode-io/fynpo/commit/a78e7c1283bc1cc47b21497bfa302e7ac45edab0)
  - fix: handle initial load fynpo config failures [commit](https://github.com/electrode-io/fynpo/commit/9b5e634fbc2bee11eda785c34f469b169a80afe4)

- `packages/fynpo`

  - fix: dump fynpo bootstrap for debug log [commit](https://github.com/electrode-io/fynpo/commit/e4be77f891b37a57dc6b1f2a14a0d9f267840693)

- `MISC`

  - chore: update lockfile [commit](https://github.com/electrode-io/fynpo/commit/6b6279c2d4d36d0afa31e14091815fa0ec08702f)

# 8/7/2021

## Packages

- `fyn@0.4.34` `(0.4.33 => 0.4.34)`
- `fynpo@0.4.3` `(0.4.2 => 0.4.3)`

## Commits

- `packages/fyn`

  - feat: use a server to share meta cache between multiple fyn installs [commit](https://github.com/electrode-io/fynpo/commit/40e3513af9fb9bf05fb1b025f1fa9af00f9fdb82)
  - fix: default pseudo source maps off ([#26](https://github.com/electrode-io/fynpo/pull/26)) [commit](https://github.com/electrode-io/fynpo/commit/0b7108f75c8085c783d8d66267a63995da980413)

- `packages/fynpo`

  - fix: try to handle CI truncating output [commit](https://github.com/electrode-io/fynpo/commit/a9f015a64760ad5675db86a50bfe94c3546f2766)
  - feat: use a server to share meta cache between multiple fyn installs [commit](https://github.com/electrode-io/fynpo/commit/40e3513af9fb9bf05fb1b025f1fa9af00f9fdb82)
  - docs: update description [commit](https://github.com/electrode-io/fynpo/commit/4d5a42dc9e529da5bec858510f7a0f69afaf52e2)
  - fix: duplicate entries in changelog [commit](https://github.com/electrode-io/fynpo/commit/7564ae6fbb897d05fecec2a6e16a4df5bcb354d0)

- `docs`

  - docs: update description [commit](https://github.com/electrode-io/fynpo/commit/4d5a42dc9e529da5bec858510f7a0f69afaf52e2)

- `docusaurus`

  - docs: update description [commit](https://github.com/electrode-io/fynpo/commit/4d5a42dc9e529da5bec858510f7a0f69afaf52e2)

- `MISC`

  - chore: update lockfile [commit](https://github.com/electrode-io/fynpo/commit/e6938aed7e5350bc8d6905d2aa2813b5d816bf20)

# 6/21/2021

## Packages

- `fyn@0.4.33` `(0.4.32 => 0.4.33)`
- `fynpo@0.4.2` `(0.4.1 => 0.4.2)`

## Commits

- `packages/fyn`

  - fix(fyn): more fs retry for windows [commit](https://github.com/electrode-io/fynpo/commit/2d472691913a31e948830b0c25f6a69c2e47c2c5)
  - fix(fyn): retry release lock [commit](https://github.com/electrode-io/fynpo/commit/dfb6e848a71c84e3b4fb3fd7071197f7ed18b831)
  - [patch] fix central locking on windows [commit](https://github.com/electrode-io/fynpo/commit/126da0311b941e4440a689460ed15ded1f075b02)
  - [patch] disable local dep with --no-fyn-local as semver [commit](https://github.com/electrode-io/fynpo/commit/fd7cb77b8f3b91d3f785eb520d5283f4add5eb11)

- `packages/fynpo`

  - make minor and major types configurable ([#23](https://github.com/electrode-io/fynpo/pull/23)) [commit](https://github.com/electrode-io/fynpo/commit/ffc44fed23792ee470f84699e7cc8ef2e2b0a9e4)

- `.github`

  - Update GitHub workflows ([#22](https://github.com/electrode-io/fynpo/pull/22)) [commit](https://github.com/electrode-io/fynpo/commit/d5d25e6f3e3263182f1da9154985dd3b0eb54000)

- `docs`

  - [chore] docs add debugging to sidebar ([#21](https://github.com/electrode-io/fynpo/pull/21)) [commit](https://github.com/electrode-io/fynpo/commit/10b0e2a4430f19500bb88fe7faa21e25337f0ade)
  - [chore] add docs about debugging with source maps ([#20](https://github.com/electrode-io/fynpo/pull/20)) [commit](https://github.com/electrode-io/fynpo/commit/32196e7fe420da780306082bbb8963d97832bef4)

- `docusaurus`

  - [chore] docs add debugging to sidebar ([#21](https://github.com/electrode-io/fynpo/pull/21)) [commit](https://github.com/electrode-io/fynpo/commit/10b0e2a4430f19500bb88fe7faa21e25337f0ade)
  - [chore] add docs about debugging with source maps ([#20](https://github.com/electrode-io/fynpo/pull/20)) [commit](https://github.com/electrode-io/fynpo/commit/32196e7fe420da780306082bbb8963d97832bef4)

# 5/21/2021

- [patch] allow file to turn off fyn generating source maps

## Packages

- `fyn@0.4.32` `(0.4.31 => 0.4.32)`

## Commits

- `packages/fynpo-base`

  - [chore] update dep publish-util [commit](https://github.com/electrode-io/fynpo/commit/5eed0fead5e9b5c014d039efc22e7f98184d3066)

- `packages/create-fynpo`

  - [chore] update dep publish-util [commit](https://github.com/electrode-io/fynpo/commit/5eed0fead5e9b5c014d039efc22e7f98184d3066)

- `packages/fyn`

  - [patch] allow file to turn off fyn generating source maps ([#19](https://github.com/electrode-io/fynpo/pull/19)) [commit](https://github.com/electrode-io/fynpo/commit/ac241b328dac08c3f31a9acf82c7f56272d90c1b)
  - [chore] update dep publish-util [commit](https://github.com/electrode-io/fynpo/commit/5eed0fead5e9b5c014d039efc22e7f98184d3066)
  - [chore] fix npm publish issue with prepack script [commit](https://github.com/electrode-io/fynpo/commit/735af8fb026061297d5b3c6876ebd382d7392c47)

- `packages/fynpo`

  - [chore] update dep publish-util [commit](https://github.com/electrode-io/fynpo/commit/5eed0fead5e9b5c014d039efc22e7f98184d3066)

- `MISC`

  - [chore] update fynpo to 0.4.1 [commit](https://github.com/electrode-io/fynpo/commit/4bab8320766901ed3f59644240354adbf9fe4240)

# 5/20/2021

- [patch] fyn support generating source map back to original file
- [patch] fynpo adjust logging to help some build systems

## Packages

- `fyn@0.4.30` `(0.4.29 => 0.4.30)`
- `fynpo@0.4.1` `(0.4.0 => 0.4.1)`

## Commits

- `packages/fynpo-base`

  - [chore] add ci:check script [commit](https://github.com/electrode-io/fynpo/commit/68b794e8d7fc174a65c0a6b98885bdbf374d6471)

- `packages/fyn`

  - [patch] improving source map rewriting and generation ([#18](https://github.com/electrode-io/fynpo/pull/18)) [commit](https://github.com/electrode-io/fynpo/commit/78d143305440761030fca12813b182389ade477f)
  - [patch] fyn support generating source map back to original file ([#16](https://github.com/electrode-io/fynpo/pull/16)) [commit](https://github.com/electrode-io/fynpo/commit/313e94f63560b9f3d96dc28c7ec6a795edd5a883)
  - transferred into mono-repo

- `packages/fynpo`

  - [patch] fynpo adjust logging to help some build systems ([#17](https://github.com/electrode-io/fynpo/pull/17)) [commit](https://github.com/electrode-io/fynpo/commit/51103b989316c74302ad60cf4420fc843c2c42b4)
  - [chore] update license and readme etc [commit](https://github.com/electrode-io/fynpo/commit/8cb9578a68e854e8a41c0490aa22061bf6d3a64e)
  - [chore] prettier@2.3.0 ([#36](https://github.com/electrode-io/fynpo/pull/36)) [commit](https://github.com/electrode-io/fynpo/commit/9c32d8f8fc654a6db1709a28e01deb3b3df4b77e)
  - [chore] add ci:check script [commit](https://github.com/electrode-io/fynpo/commit/68b794e8d7fc174a65c0a6b98885bdbf374d6471)

- `packages/fynpo-cli`

  - [chore] add ci:check script [commit](https://github.com/electrode-io/fynpo/commit/68b794e8d7fc174a65c0a6b98885bdbf374d6471)

- `.github`

  - [chore] update github workflow branch [commit](https://github.com/electrode-io/fynpo/commit/cbdf7272d8dee44d6518d7d04d222ce3520fa177)
  - Create node.js.yml [commit](https://github.com/electrode-io/fynpo/commit/3ce3e756a07507f87c492d998646b549992f575e)

- `MISC`

  - [chore] update README [commit](https://github.com/electrode-io/fynpo/commit/e798240429f6e1429663c7ca8d25068788c99dbd)
  - [chore] update dep fynpo [commit](https://github.com/electrode-io/fynpo/commit/b5bb13f27bc916b2fa2977707f625debacfde69e)

# 5/17/2021

- fynpo-base module for common code
- [minor] prepare fynpo-base for release
- [patch] fix run command
- [patch] fynpo publish fixes
- [patch] fynpo improve run logs
- [patch] fynpo uses fynpo-base
- [chore] update publish info

## Packages

- `@fynpo/base@0.1.0` `(0.0.1 => 0.1.0)`
- `create-fynpo@1.0.4` `(1.0.3 => 1.0.4)`
- `fynpo@0.4.0` `(0.3.2 => 0.4.0)`
- `fynpo-cli@1.0.2` `(1.0.1 => 1.0.2)`

## Commits

- `packages/fynpo-base`

  - [minor] prepare fynpo-base for release [commit](https://github.com/electrode-io/fynpo/commit/35de764c3acab816c0ff8d8cf33d2f4a5d13b7a1)
  - [patch] fynpo publish fixes ([#34](https://github.com/electrode-io/fynpo/pull/34)) [commit](https://github.com/electrode-io/fynpo/commit/c614ad5bd72ebbc0112f4fa2c97c2a09b4b13304)
  - fynpo-base module for common code ([#31](https://github.com/electrode-io/fynpo/pull/31)) [commit](https://github.com/electrode-io/fynpo/commit/a5c2cb73297fe55197e53ce2e0258a072ff5a9a3)

- `packages/create-fynpo`

  - [chore] update publish info [commit](https://github.com/electrode-io/fynpo/commit/176737ea80a1b087589b40b6c51fee8ee3ed6af8)
  - create-fynpo@1.0.3 [commit](https://github.com/electrode-io/fynpo/commit/ba06d91241afec9794f9a4af7fc1facac6615829)
  - Add README to create-fynpo pckage ([#26](https://github.com/electrode-io/fynpo/pull/26)) [commit](https://github.com/electrode-io/fynpo/commit/21e3bbcafd6bde19f5b87bbfdd7c2d663ec2bf85)
  - create-fynpo@1.0.2 [commit](https://github.com/electrode-io/fynpo/commit/2de3ab4c5baab5373ef09bf053c7a2d58bc1b95f)
  - create-fynpo@1.0.1 [commit](https://github.com/electrode-io/fynpo/commit/fd3167810cc31361206c7a47f2a48ded7187154e)
  - fix: create-fynpo copy packages ([#25](https://github.com/electrode-io/fynpo/pull/25)) [commit](https://github.com/electrode-io/fynpo/commit/bc0ad387f731743a6eabab47080f720626369606)
  - create-fynpo package ([#23](https://github.com/electrode-io/fynpo/pull/23)) [commit](https://github.com/electrode-io/fynpo/commit/2aaf32a66ce0b055d25d7e2e10941ef5b2c30dfd)

- `packages/fynpo`

  - [minor] prepare fynpo-base for release [commit](https://github.com/electrode-io/fynpo/commit/35de764c3acab816c0ff8d8cf33d2f4a5d13b7a1)
  - [patch] fix run command ([#35](https://github.com/electrode-io/fynpo/pull/35)) [commit](https://github.com/electrode-io/fynpo/commit/672d617924e06d09b98ed89e5e685236ef7a60d0)
  - [patch] fynpo publish fixes ([#34](https://github.com/electrode-io/fynpo/pull/34)) [commit](https://github.com/electrode-io/fynpo/commit/c614ad5bd72ebbc0112f4fa2c97c2a09b4b13304)
  - [patch] fynpo improve run logs ([#33](https://github.com/electrode-io/fynpo/pull/33)) [commit](https://github.com/electrode-io/fynpo/commit/1b47d41667ced80b41f29a66de413d29d0822dcb)
  - [patch] fynpo uses fynpo-base ([#32](https://github.com/electrode-io/fynpo/pull/32)) [commit](https://github.com/electrode-io/fynpo/commit/17a70494faff557eabfb706059dc0b0000c75ad1)
  - [chore] update publish info [commit](https://github.com/electrode-io/fynpo/commit/176737ea80a1b087589b40b6c51fee8ee3ed6af8)

- `packages/fynpo-cli`

  - [chore] update publish info [commit](https://github.com/electrode-io/fynpo/commit/176737ea80a1b087589b40b6c51fee8ee3ed6af8)
  - fynpo-cli@1.0.1 [commit](https://github.com/electrode-io/fynpo/commit/e4fcbfe79480710ef047a3dd95512e07d883c509)
  - Global fynpo command ([#22](https://github.com/electrode-io/fynpo/pull/22)) [commit](https://github.com/electrode-io/fynpo/commit/320924df51d9c12068473127deed721c6f83e11c)
  - Typescript conversion, added tests ([#1](https://github.com/electrode-io/fynpo/pull/1)) [commit](https://github.com/electrode-io/fynpo/commit/5e7abb79f18a4db27b59934e2106303054866e9e)
  - add fynpo-cli [commit](https://github.com/electrode-io/fynpo/commit/0204ba84232775b001043a209f77d8d6a2c4b6f4)

- `docusaurus`

  - doc updates ([#30](https://github.com/electrode-io/fynpo/pull/30)) [commit](https://github.com/electrode-io/fynpo/commit/acde2eed6843c4acd55e77102ce655690303c3eb)
  - docusaurus guide ([#29](https://github.com/electrode-io/fynpo/pull/29)) [commit](https://github.com/electrode-io/fynpo/commit/db3ee8151a2d862b78f05e18dd37b2a25e760aea)
