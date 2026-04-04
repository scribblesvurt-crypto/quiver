import { execFileSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SYNC_DIR } from '../paths.js';
import { loadConfig, setConfigValue } from '../config.js';
import { snapshotToSync, snapshotFromSync, diffLocalVsSync } from './snapshot.js';

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: SYNC_DIR, encoding: 'utf-8', stdio: 'pipe', timeout: 30000, ...opts }).trim();

function isGitRepo() {
  return existsSync(join(SYNC_DIR, '.git'));
}

function hasRemote() {
  try {
    return git(['remote']).length > 0;
  } catch { return false; }
}

function hasCommits() {
  try {
    git(['rev-parse', 'HEAD']);
    return true;
  } catch { return false; }
}

export function syncInit() {
  if (isGitRepo()) {
    return { ok: true, message: 'Sync already initialized.' };
  }

  git(['init']);
  writeFileSync(join(SYNC_DIR, '.gitignore'), '.DS_Store\n');

  // Snapshot current skills and make initial commit
  const changes = snapshotToSync();
  git(['add', '-A']);

  try {
    git(['commit', '-m', 'Initial Quiver sync']);
  } catch {
    // Nothing to commit (no skills yet)
  }

  setConfigValue('sync.backend', 'git');

  const total = changes.added.length;
  return {
    ok: true,
    message: `Sync initialized with ${total} skill${total !== 1 ? 's' : ''}.`,
    changes
  };
}

export function syncSetRemote(url) {
  if (!isGitRepo()) {
    return { ok: false, error: 'Sync not initialized. Run "quiver sync init" first.' };
  }

  if (!/^(https?:\/\/|git@)[\w.@:\/~-]+$/.test(url)) {
    return { ok: false, error: 'Invalid remote URL format' };
  }

  try {
    if (hasRemote()) {
      git(['remote', 'set-url', 'origin', url]);
    } else {
      git(['remote', 'add', 'origin', url]);
    }
  } catch (e) {
    return { ok: false, error: `Failed to set remote: ${e.message}` };
  }

  setConfigValue('sync.remote', url);
  return { ok: true, message: `Remote set to ${url}` };
}

export function syncPush() {
  if (!isGitRepo()) {
    return { ok: false, error: 'Sync not initialized. Run "quiver sync init" first.' };
  }
  if (!hasRemote()) {
    return { ok: false, error: 'No remote configured. Run "quiver sync remote <url>" first.' };
  }

  const changes = snapshotToSync();
  const totalChanges = changes.added.length + changes.modified.length + changes.removed.length;

  if (totalChanges === 0) {
    // Check if there are any uncommitted changes in the sync dir
    const gitStatus = git(['status', '--porcelain']);
    if (!gitStatus) {
      return { ok: true, message: 'Everything up to date.', changes };
    }
  }

  git(['add', '-A']);

  try {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    git(['commit', '-m', `Quiver sync ${timestamp}`]);
  } catch {
    // Nothing to commit
  }

  // Determine branch name
  let branch = 'main';
  try {
    branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {}

  try {
    if (!hasCommits()) {
      return { ok: false, error: 'No commits to push.' };
    }
    git(['push', '-u', 'origin', branch], { timeout: 60000 });
  } catch (e) {
    const msg = e.stderr || e.message;
    if (msg.includes('rejected')) {
      return { ok: false, error: 'Push rejected — pull first to get remote changes.' };
    }
    return { ok: false, error: `Push failed: ${msg}` };
  }

  setConfigValue('sync.lastSync', new Date().toISOString());
  return {
    ok: true,
    message: `Pushed ${totalChanges} change${totalChanges !== 1 ? 's' : ''}.`,
    changes
  };
}

export function syncPull() {
  if (!isGitRepo()) {
    return { ok: false, error: 'Sync not initialized. Run "quiver sync init" first.' };
  }
  if (!hasRemote()) {
    return { ok: false, error: 'No remote configured. Run "quiver sync remote <url>" first.' };
  }

  let branch = 'main';
  try {
    branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {}

  try {
    git(['pull', '--rebase', 'origin', branch], { timeout: 60000 });
  } catch (e) {
    const msg = e.stderr || e.message;
    if (msg.includes('Could not resolve host') || msg.includes('fatal: unable to access')) {
      return { ok: false, error: 'Cannot reach remote — check your network connection.' };
    }
    return { ok: false, error: `Pull failed: ${msg}` };
  }

  // Apply pulled changes to local skills
  const applied = snapshotFromSync();

  setConfigValue('sync.lastSync', new Date().toISOString());

  const total = applied.added.length + applied.modified.length;
  return {
    ok: true,
    message: total > 0
      ? `Pulled ${total} change${total !== 1 ? 's' : ''}.`
      : 'Already up to date.',
    changes: applied
  };
}

export function syncStatus() {
  const config = loadConfig();
  const initialized = isGitRepo();

  if (!initialized) {
    return {
      ok: true,
      initialized: false,
      backend: config.sync?.backend || 'local',
      remote: null,
      lastSync: null,
      localChanges: { added: [], modified: [], removed: [], unchanged: [] },
      remoteChanges: 0
    };
  }

  const diff = diffLocalVsSync();
  let remote = null;
  try { remote = git(['remote', 'get-url', 'origin']); } catch {}

  let remoteChanges = 0;
  if (remote) {
    try {
      git(['fetch', 'origin'], { timeout: 60000 });
      let branch = 'main';
      try { branch = git(['rev-parse', '--abbrev-ref', 'HEAD']); } catch {}
      const log = git(['log', `HEAD..origin/${branch}`, '--oneline']);
      remoteChanges = log ? log.split('\n').length : 0;
    } catch {}
  }

  return {
    ok: true,
    initialized: true,
    backend: config.sync?.backend || 'git',
    remote,
    lastSync: config.sync?.lastSync || null,
    localChanges: diff,
    remoteChanges
  };
}
