import { readdirSync, existsSync, statSync, readFileSync, rmSync, cpSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { SKILLS_DIR, SYNC_DIR } from '../paths.js';

/**
 * Snapshot local skills into the sync directory, resolving symlinks.
 * Returns { added, modified, removed } arrays of skill dirNames.
 */
export function snapshotToSync() {
  mkdirSync(SYNC_DIR, { recursive: true });

  const localDirs = listDirs(SKILLS_DIR);
  const syncDirs = listDirs(SYNC_DIR);

  const added = [];
  const modified = [];
  const removed = [];

  // Copy new/modified skills into sync dir
  for (const dir of localDirs) {
    const src = join(SKILLS_DIR, dir);
    const dest = join(SYNC_DIR, dir);

    if (!existsSync(dest)) {
      cpSync(src, dest, { recursive: true, dereference: true });
      added.push(dir);
    } else if (dirChanged(src, dest)) {
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true, dereference: true });
      modified.push(dir);
    }
  }

  // Remove skills from sync that no longer exist locally
  for (const dir of syncDirs) {
    if (dir.startsWith('.')) continue;
    if (!localDirs.includes(dir)) {
      rmSync(join(SYNC_DIR, dir), { recursive: true, force: true });
      removed.push(dir);
    }
  }

  return { added, modified, removed };
}

/**
 * Apply skills from sync directory back to local skills dir.
 * Last-write-wins by mtime. Does NOT remove local skills absent from sync.
 * Returns { added, modified } arrays of skill dirNames.
 */
export function snapshotFromSync() {
  const syncDirs = listDirs(SYNC_DIR);
  const added = [];
  const modified = [];

  for (const dir of syncDirs) {
    if (dir.startsWith('.')) continue;
    const src = join(SYNC_DIR, dir);
    const dest = join(SKILLS_DIR, dir);

    if (!existsSync(dest)) {
      cpSync(src, dest, { recursive: true });
      added.push(dir);
    } else if (dirChanged(src, dest)) {
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
      modified.push(dir);
    }
  }

  return { added, modified };
}

/**
 * Compare local skills dir vs sync dir.
 * Returns { added, modified, removed, unchanged } arrays of skill dirNames.
 */
export function diffLocalVsSync() {
  const localDirs = listDirs(SKILLS_DIR);
  const syncDirs = listDirs(SYNC_DIR).filter(d => !d.startsWith('.'));

  const added = [];     // in local but not sync
  const modified = [];  // in both but different
  const removed = [];   // in sync but not local
  const unchanged = []; // in both and same

  for (const dir of localDirs) {
    if (!syncDirs.includes(dir)) {
      added.push(dir);
    } else if (dirChanged(join(SKILLS_DIR, dir), join(SYNC_DIR, dir))) {
      modified.push(dir);
    } else {
      unchanged.push(dir);
    }
  }

  for (const dir of syncDirs) {
    if (!localDirs.includes(dir)) {
      removed.push(dir);
    }
  }

  return { added, modified, removed, unchanged };
}

// --- helpers ---

function listDirs(parent) {
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter(e => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'))
    .map(e => e.name);
}

function dirChanged(dirA, dirB) {
  const hashA = hashDir(dirA);
  const hashB = hashDir(dirB);
  return hashA !== hashB;
}

function hashDir(dir) {
  const hash = createHash('sha256');
  const files = collectFilesRecursive(dir).sort();
  for (const rel of files) {
    hash.update(rel);
    try {
      hash.update(readFileSync(join(dir, rel)));
    } catch {}
  }
  return hash.digest('hex');
}

function collectFilesRecursive(dir, base = '') {
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}
