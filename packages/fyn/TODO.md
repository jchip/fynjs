# TODOs

This file lists outstanding work only. Completed and obsolete items are removed rather than
kept as a historical checklist. Concrete implementation work is tracked in the task system.

## Still valid

### Install correctness

- Support omitting `optionalDependencies` during install.
- Link executables from bundled dependencies into the containing package's
  `node_modules/.bin`.
- Inspect an extracted package's name and version against the expected package identity before
  accepting it.
- Stop downstream extraction work when the fetch stage fails.

## Nice to have

### Dependency maintenance

- Offer interactive package-version selection when adding or locking a dependency.
- Offer an interactive update flow for top-level dependencies.

### Install experience

- Summarize failed and omitted optional dependencies at the end of an install.

### Performance

- Evaluate worker-process tarball extraction if benchmarks show that extraction is a bottleneck.

### Package metadata

- Report missing root `description`, `repository`, and `license` fields, and inspect `license` as
  a recognized SPDX expression or `UNLICENSED`.
