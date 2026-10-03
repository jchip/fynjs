//! Copy-on-write file cloning for fyn.
//!
//! Each file is placed by removing the destination first, then trying a reflink, then a hardlink
//! when the caller allows it, then a plain copy unless the caller forbids it. Removing first
//! matters: clone and copy write through an existing destination, which corrupts any other path
//! hardlinked to the same inode.

use std::collections::HashSet;
use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::thread;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;
use rayon::ThreadPool;

/// More threads than this slow APFS down from directory contention.
const MAX_THREADS: usize = 4;

/// Batch clones run here, not on rayon's global pool (one thread per core) or libuv's pool
/// (which Node needs for every other fs call).
fn pool() -> &'static ThreadPool {
  static POOL: OnceLock<ThreadPool> = OnceLock::new();
  POOL.get_or_init(|| {
    let n = thread::available_parallelism().map_or(1, |n| n.get()).min(MAX_THREADS);
    rayon::ThreadPoolBuilder::new()
      .num_threads(n)
      .thread_name(|i| format!("reflink-{i}"))
      .build()
      .expect("reflink: build thread pool")
  })
}

#[napi(object)]
pub struct CloneStats {
  /// files placed with a copy-on-write clone
  pub cloned: u32,
  /// files hardlinked because a clone wasn't possible
  pub linked: u32,
  /// files that fell back to a full copy
  pub copied: u32,
}

#[derive(Clone, Copy)]
enum Placed {
  Cloned,
  Linked,
  Copied,
}

/// Place `src` at `dest`: reflink, else hardlink if `hardlink`, else copy if `copy`, else fail
/// with the reflink error. `reflink` is cleared on the first failed reflink, so a batch on a
/// filesystem without copy-on-write stops paying for the attempt.
fn place(src: &Path, dest: &Path, hardlink: bool, copy: bool, reflink: &AtomicBool) -> io::Result<Placed> {
  match fs::remove_file(dest) {
    Err(e) if e.kind() != ErrorKind::NotFound => return Err(e),
    _ => {}
  }
  // without copy, every file has to try the clone, so there is an error to report
  let mut clone_err = None;
  if !copy || reflink.load(Ordering::Relaxed) {
    match reflink_copy::reflink(src, dest) {
      Ok(()) => return Ok(Placed::Cloned),
      Err(e) => {
        reflink.store(false, Ordering::Relaxed);
        clone_err = Some(e);
      }
    }
  }
  if hardlink && fs::hard_link(src, dest).is_ok() {
    return Ok(Placed::Linked);
  }
  if let (false, Some(e)) = (copy, clone_err) {
    return Err(e);
  }
  fs::copy(src, dest)?;
  Ok(Placed::Copied)
}

/// `target` names what failed, e.g. `src -> dest` or `mkdir dir`
fn to_napi(e: io::Error, target: String) -> Error {
  Error::from_reason(format!(
    "{}: {} ({})",
    e,
    target,
    e.raw_os_error().map_or_else(|| format!("{:?}", e.kind()), |c| c.to_string())
  ))
}

fn place_err(e: io::Error, src: &Path, dest: &Path) -> Error {
  to_napi(e, format!("{} -> {}", src.display(), dest.display()))
}

fn clone_one(src: &str, dest: &str) -> Result<bool> {
  let (s, d) = (Path::new(src), Path::new(dest));
  let placed = place(s, d, false, true, &AtomicBool::new(true)).map_err(|e| place_err(e, s, d))?;
  Ok(matches!(placed, Placed::Cloned))
}

fn clone_many(
  src_dir: &str,
  dest_dir: &str,
  files: &[String],
  hardlink: bool,
  copy: bool,
) -> Result<CloneStats> {
  let (src_dir, dest_dir) = (Path::new(src_dir), Path::new(dest_dir));
  let pairs: Vec<(PathBuf, PathBuf)> =
    files.iter().map(|f| (src_dir.join(f), dest_dir.join(f))).collect();

  // create each parent once, before the parallel phase
  let parents: HashSet<&Path> = pairs.iter().filter_map(|(_, d)| d.parent()).collect();
  for p in parents {
    fs::create_dir_all(p).map_err(|e| to_napi(e, format!("mkdir {}", p.display())))?;
  }

  let reflink = AtomicBool::new(true);
  let (cloned, linked, copied) = pairs
    .par_iter()
    .map(|(s, d)| place(s, d, hardlink, copy, &reflink).map_err(|e| place_err(e, s, d)))
    .try_fold(
      || (0u32, 0u32, 0u32),
      |(c, l, p), r| {
        r.map(|placed| match placed {
          Placed::Cloned => (c + 1, l, p),
          Placed::Linked => (c, l + 1, p),
          Placed::Copied => (c, l, p + 1),
        })
      },
    )
    .try_reduce(|| (0, 0, 0), |a, b| Ok((a.0 + b.0, a.1 + b.1, a.2 + b.2)))?;

  Ok(CloneStats { cloned, linked, copied })
}

/// Clone `src` to `dest`, replacing `dest`. Falls back to a copy. Returns true if cloned.
#[napi]
pub fn clone_file_sync(src: String, dest: String) -> Result<bool> {
  clone_one(&src, &dest)
}

pub struct CloneFile {
  src: String,
  dest: String,
}

impl Task for CloneFile {
  type Output = bool;
  type JsValue = bool;
  fn compute(&mut self) -> Result<bool> {
    clone_one(&self.src, &self.dest)
  }
  fn resolve(&mut self, _: Env, out: bool) -> Result<bool> {
    Ok(out)
  }
}

/// Async `cloneFileSync`, runs on the libuv thread pool.
#[napi(ts_return_type = "Promise<boolean>")]
pub fn clone_file(src: String, dest: String) -> AsyncTask<CloneFile> {
  AsyncTask::new(CloneFile { src, dest })
}

/// Clone `files` (relative paths) from `srcDir` into `destDir` in parallel.
/// Where a clone isn't possible, `hardlink` hardlinks the file instead of copying it.
/// `copyFallback` false (default true) fails instead of copying a file that can't be placed.
/// Parent directories are created as needed. Fails on the first error.
#[napi]
pub fn clone_files_sync(
  src_dir: String,
  dest_dir: String,
  files: Vec<String>,
  hardlink: Option<bool>,
  copy_fallback: Option<bool>,
) -> Result<CloneStats> {
  let (hardlink, copy) = (hardlink.unwrap_or(false), copy_fallback.unwrap_or(true));
  pool().install(|| clone_many(&src_dir, &dest_dir, &files, hardlink, copy))
}

/// One clonefile(2) call for the whole tree. APFS clones it in the kernel, so no per-file
/// syscalls. Returns false when the filesystem can't clone it.
#[cfg(target_os = "macos")]
fn clone_tree(src: &str, dest: &str) -> Result<bool> {
  use std::ffi::CString;
  // <sys/clonefile.h>; libc has clonefile but not its flags
  const CLONE_NOFOLLOW: u32 = 0x0001;
  let cstr = |s: &str| CString::new(s).map_err(|e| Error::from_reason(format!("{e}: {s}")));
  let (s, d) = (cstr(src)?, cstr(dest)?);
  if unsafe { libc::clonefile(s.as_ptr(), d.as_ptr(), CLONE_NOFOLLOW) } == 0 {
    return Ok(true);
  }
  let e = io::Error::last_os_error();
  match e.raw_os_error() {
    Some(libc::ENOTSUP) | Some(libc::EXDEV) => Ok(false),
    _ => Err(to_napi(e, format!("{src} -> {dest}"))),
  }
}

#[cfg(not(target_os = "macos"))]
fn clone_tree(_src: &str, _dest: &str) -> Result<bool> {
  Ok(false)
}

/// Clone the directory `src` to `dest` in one call. `dest` must not exist; its parent must.
/// Resolves false where a directory clone isn't possible (anything but APFS), so the caller
/// can fall back to `cloneFiles`.
#[napi(ts_return_type = "Promise<boolean>")]
pub fn clone_dir<'env>(env: &'env Env, src: String, dest: String) -> Result<Object<'env>> {
  let (deferred, promise) = env.create_deferred()?;
  pool().spawn(move || match clone_tree(&src, &dest) {
    Ok(cloned) => deferred.resolve(move |_| Ok(cloned)),
    Err(e) => deferred.reject(e),
  });
  Ok(promise)
}

/// Async `cloneFilesSync`. Runs on this addon's own thread pool, so it never holds a libuv thread.
#[napi(ts_return_type = "Promise<CloneStats>")]
pub fn clone_files<'env>(
  env: &'env Env,
  src_dir: String,
  dest_dir: String,
  files: Vec<String>,
  hardlink: Option<bool>,
  copy_fallback: Option<bool>,
) -> Result<Object<'env>> {
  let (deferred, promise) = env.create_deferred()?;
  let (hardlink, copy) = (hardlink.unwrap_or(false), copy_fallback.unwrap_or(true));
  pool().spawn(move || match clone_many(&src_dir, &dest_dir, &files, hardlink, copy) {
    Ok(stats) => deferred.resolve(move |_| Ok(stats)),
    Err(e) => deferred.reject(e),
  });
  Ok(promise)
}
