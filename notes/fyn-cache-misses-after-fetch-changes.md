# fyn cache misses after the fetch changes

Follow-up ticket material. fyn changes made in October 2026 stopped writing some data into
cacache. Nothing breaks, but some setups now download again. This note lists those cases so a
later ticket can decide which ones are worth fixing.

## What changed

| Data | Before | Now |
|---|---|---|
| Packuments | make-fetch-happen kept the full response in cacache, and fyn kept a trimmed copy beside it | fyn fetches with make-fetch-happen directly, with no HTTP cache. The trimmed copy in `_cacache/fyn-packuments/` is the only copy. It holds the etag and last-modified, and its format is now 2. It starts from npm's abbreviated form, marked `$corgi`, and is replaced by the full form once a run needs it: lock time, or a version with install scripts. A full copy stays full |
| Tarballs, store on | pacote wrote each tarball into cacache, then fyn untarred it into the central store | A package going into the store downloads as bytes and goes straight into the store. cacache never sees it, and isn't checked for it unless remote tarballs are disabled |
| Tarballs, store off | into cacache | unchanged |

Commit: `b042d757`, for both packuments and tarballs.

## Who sees a cache miss

### 1. An older fyn sharing the same cache dir

- **Packuments.** Older fyn only reads trimmed format 1, so it skips the format 2 file. It then
  looks for a full copy in cacache and finds none, so it fetches the whole packument. Then it
  writes a format 1 file over the format 2 one. When the new fyn runs next, it does the reverse.
  Every switch between versions refetches or rewrites packuments.
- **Tarballs.** Older fyn checks cacache before the store. It misses, downloads the tarball,
  and only then finds the package already in the store. It downloads each package once, and
  after that cacache has it.

### 2. Turning the central store off

Tarballs that went into the store were never in cacache. A project that later sets
`FYN_CENTRAL_DIR=false`, or runs with the store off, downloads each of them again once.

### 3. Offline installs with the store off

`--offline`, or any mode that disables remote tarballs, finds no cached tarball for packages
that only exist in the store. With the store on, offline works as before.

### 4. Upgrading to the new fyn

This one costs little. The format 1 trimmed files get skipped, but the full copies the older
fyn left in cacache are still there. A fresh full copy is used and trimmed again. A stale one is
revalidated with the etag in its cacache metadata, so the registry usually answers 304.

### 5. Tarballs an older fyn left in cacache

Online, a package going into the store no longer looks in cacache. So when the store doesn't have
it yet, a tarball an older fyn cached there is downloaded again once. With remote tarballs
disabled, fyn still uses the cached tarball.

### 6. The first lock-time install over abbreviated copies

Lock time needs each version's publish time, which abbreviated packuments don't have. So the first
install with lock time set ignores abbreviated cached copies and fetches the full ones. After that
the full copies are kept, and later installs revalidate them as full.

## Leftover disk use

The full packuments and tarballs older fyn put in cacache stay on disk. Nothing reads them
once they are older than the trimmed copies, and nothing removes them.

## Options for the follow-up

- **Stop the version flip-flop.** Write format 2 files to a new directory, such as
  `fyn-packuments-v2/`, so each fyn version keeps its own copy. This is the cheapest fix for
  case 1.
- **Read tarballs from the store when it's off.** When cacache misses but the store has the
  package, pack or copy it from the store instead of downloading. This covers cases 2 and 3.
- **Clean up.** Add a cache cleanup step that drops `make-fetch-happen:request-cache:*`
  entries and tarballs already in the store.

## A related risk to watch

Downloaded tarball bytes stay in memory until the extractor runs their store job. Workers keep
up on the benchmark project, where max RSS stayed under 1 GB. A very large install on a slow
disk could hold more. A cap on bytes waiting to be stored would bound it.
