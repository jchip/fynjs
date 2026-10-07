# Docs site plan

The fynjs site at `fynjs.pages.dev`. It has a landing page for humans and a reference for each
package, written for AI coding tools to read.

## References first, API docs second

Most people now code with an AI assistant. The assistant needs a dense, accurate reference it
can load in one fetch. Generated API HTML is hard for it to consume. So the main content is one
Markdown reference per package, following the [llms.txt](https://llmstxt.org) convention.

Plain TypeDoc HTML is still generated under `/api/`, for anyone who wants to browse the types.
It is secondary. The landing page links it next to each reference.

The earlier plan used VitePress with `typedoc-plugin-markdown`. That is dropped. Its phase 1
shipped: the per-package TypeDoc HTML and `typedoc` devDependencies are gone. Only
`fyn/docs/*.md` and `run-verify/docs/reference.md` remain.

## What the site serves

```
fynjs.pages.dev/
  index.html      landing page for humans
  llms.txt        index: one line per package, linking to its reference
  llms-full.txt   every reference joined into one file
  ref/<dir>.md    one reference per package, named by its packages/<dir>
  api/            TypeDoc HTML for packages that ship types
```

The `.md` files are served raw. There is no HTML rendering of references.

## Where references live

Each package owns `packages/<dir>/docs/reference.md` and lists `docs/reference.md` in its npm
`files`. An assistant working in a user's project can then read
`node_modules/<pkg>/docs/reference.md` offline, at the installed version. The site only copies
these files.

`run-verify/docs/reference.md` is the model. `xarc-run/REFERENCE.md` moves to
`docs/reference.md`, and its README links follow.

## Reference format

Written for an AI reader. Dense and complete beats friendly.

1. Title `# <npm name> reference`, then one or two sentences on what the package is for.
2. `## Imports`: the exact import lines that work, ESM first. Say what is not exported.
3. One `##` or `###` section per public export, headed with its name in backticks.
4. Each section has the TypeScript signature in a `ts` block, then behavior rules.
5. Option objects get a table: option, type, default, behavior.
6. State errors thrown, edge cases and defaults explicitly. Do not leave them implied.
7. Short examples only where usage is not obvious from the signature.
8. CLI packages cover commands, flags, config files and environment variables instead of, or
   in addition to, JS exports.
9. No marketing, badges, history or changelog. No links that only work on GitHub.

Every statement must come from the source code. When the README and the code disagree, the
code wins, and the mismatch is noted in the subagent's summary.

## Site layout

```
site/
  index.html      hand-written landing page; build fills in the package list
  build.mjs       build into site-pub/; runs TypeDoc for api/
  typedoc.json    TypeDoc config: packages mode, one entry per typed package
  check-refs.mjs  drift check: runtime exports missing from a reference
```

`typedoc` is a root devDependency. TypeDoc resolves types across packages, so the monorepo
must be bootstrapped and built before `build.mjs` runs.

`build.mjs` groups packages the way the root README does. Packages without a reference yet are
skipped with a warning.

`check-refs.mjs` imports each built package and lists its runtime exports. It fails when an
export name does not appear in backticks in that package's reference. It needs the packages
built, so it runs in CI and locally after a bootstrap.

## Rollout

All 29 published packages get a reference, in batches.

1. Batch 1: `fyn`, `fynpo`, `xarc-run`, `run-verify` (done), `xaa`, `fetch`.
2. Batch 2: the rest of the tools and CLI helpers.
3. Batch 3: the remaining small libraries.

## Deploy

All site and reference changes land on `main`. The `cf-pages` branch holds `main` plus one
commit with the built site. Cloudflare Pages watches `cf-pages` and serves the built folder as
is. It runs no build of its own.

Every publish hard resets `cf-pages` to `main`, so the branch never keeps old builds. To publish:

```sh
git switch cf-pages
git reset --hard main
fyn bootstrap                 # TypeDoc needs installed, built packages
node site/build.mjs           # writes site-pub/
git add -f site-pub           # site-pub is gitignored on main
git commit -m "chore(site): build"
git push --force origin cf-pages
```

Cloudflare Pages settings: production branch `cf-pages`, no build command, output directory
`site-pub`. There is no GitHub Actions workflow and no wrangler secret.

## Open items

1. Create the Cloudflare Pages project `fynjs`, connected to the repo's `cf-pages` branch.
   Needs the account owner.
2. Repoint the README links that still go to `jchip.github.io/*`.
3. Decide whether `check-refs.mjs` joins `ci:check`.
