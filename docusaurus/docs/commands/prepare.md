---
id: prepare
title: fynpo prepare
---

:::note 
Install [fynpo-cli](/docs/packages#fynpo-cli) for global access of fynpo command
:::

## Usage

```
fynpo prepare
```

Start from a clean Git working tree, including staged and nonignored untracked files. `fynpo prepare`:

1. Reads release versions from `CHANGELOG.md` and updates package versions and dependent ranges.
2. Bootstraps all managed packages using the updated manifests, refreshing their lockfiles.
3. Runs each package's optional `fynpo:prepare` script through the internal `fynpo run` runner, in dependency order.
4. Commits all changed, added, and deleted files, respecting Git ignore rules, and creates tags when requested.

If versions and dependent ranges already match, prepare reports "Nothing to update" and exits before bootstrap or hooks. Use `--force` to run those steps anyway.

Bootstrap and hooks cover all managed packages, including dependents outside a selective release. If either fails, prepare stops before committing or tagging; changes already made remain available for inspection. Before retrying, restore or otherwise resolve those changes so the tree is clean again.

## Package hook

Packages that need to regenerate files after dependency updates can declare:

```json
{
  "scripts": {
    "fynpo:prepare": "node scripts/update-release-files.mjs"
  }
}
```

The hook runs after bootstrap, so it sees the updated dependencies and lockfiles. Packages without this script are skipped. New nonignored files produced by the hook are included in the release commit automatically.

## Options

**`--force`**

Run bootstrap and `fynpo:prepare` hooks even when no versions or dependent ranges need updating. A clean working tree is still required. Resulting file changes are committed normally; if no files change, no commit or tags are created.

```
fynpo prepare --force
```

**`--no-commit`**

By default, `fynpo prepare` will commit the release changes with the commit message `[Publish]...`. Pass `--no-commit` to leave the changes for review. The clean-tree requirement, bootstrap, and package hooks still apply; commits and tags are skipped.

```
fynpo prepare --no-commit
```

**`--tag`**

If `--tag` option is passed, `prepare` will create individual tags for each changed packages.

```
fynpo prepare --tag
```


