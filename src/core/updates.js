import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { MANIFEST_FILE } from './paths.js';

/* ── Manifest CRUD ──────────────────────────── */

export function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));
  } catch { return {}; }
}

export function saveManifest(data) {
  writeFileSync(MANIFEST_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function recordInstall(name, marketplace, details) {
  const manifest = loadManifest();
  const key = `${marketplace}/${name}`;
  manifest[key] = {
    name,
    marketplace,
    installedAt: new Date().toISOString(),
    installPath: details.installPath || null,
    sourceRepo: details.sourceRepo || null,
    commitHash: details.commitHash || null,
    version: details.version || null,
    checkedAt: null,
    latestCommitHash: null,
    updateAvailable: false
  };
  saveManifest(manifest);
}

/* ── Update checking ────────────────────────── */

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

async function fetchLatestCommit(repo) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) return null;
  try {
    const url = `https://api.github.com/repos/${repo}/commits?per_page=1&sha=main`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Quiver-Skill-Manager' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data[0]?.sha || null;
  } catch { return null; }
}

export async function checkAllUpdates({ force = false } = {}) {
  const manifest = loadManifest();
  const entries = Object.entries(manifest);
  let checked = 0;
  let updatesAvailable = 0;
  const results = [];

  for (const [key, entry] of entries) {
    // Skip if checked recently (unless forced)
    if (!force && entry.checkedAt) {
      const elapsed = Date.now() - new Date(entry.checkedAt).getTime();
      if (elapsed < CHECK_INTERVAL) {
        if (entry.updateAvailable) updatesAvailable++;
        results.push(entry);
        continue;
      }
    }

    const repo = entry.sourceRepo || entry.marketplace;
    if (!repo) continue;

    const latestHash = await fetchLatestCommit(repo);
    checked++;

    if (latestHash) {
      entry.latestCommitHash = latestHash;
      entry.updateAvailable = !!(entry.commitHash && latestHash !== entry.commitHash);
      if (entry.updateAvailable) updatesAvailable++;
    }
    entry.checkedAt = new Date().toISOString();
    results.push(entry);
  }

  saveManifest(manifest);
  return { checked, updatesAvailable, plugins: results };
}

export function getUpdateSummary() {
  const manifest = loadManifest();
  const updates = Object.values(manifest).filter(e => e.updateAvailable);
  return { updates, total: updates.length };
}

export async function updatePlugin(name, marketplace) {
  const manifest = loadManifest();
  const key = `${marketplace}/${name}`;
  const entry = manifest[key];

  if (!entry) return { ok: false, error: 'Plugin not found in manifest' };

  const installPath = entry.installPath;
  if (!installPath || !existsSync(installPath)) {
    return { ok: false, error: 'Install path not found' };
  }

  try {
    // Try git pull if .git exists
    const gitDir = installPath + '/.git';
    if (existsSync(gitDir)) {
      execFileSync('git', ['fetch', 'origin'], { cwd: installPath, stdio: 'pipe' });
      execFileSync('git', ['reset', '--hard', 'origin/HEAD'], { cwd: installPath, stdio: 'pipe' });
      const newHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: installPath, stdio: 'pipe' }).toString().trim();
      entry.commitHash = newHash;
    } else {
      // No .git - need to re-clone. Import installPlugin dynamically to avoid circular deps
      const { rmSync } = await import('fs');
      const { installPlugin } = await import('./registry.js');
      rmSync(installPath, { recursive: true, force: true });
      await installPlugin(name, marketplace);
      // Re-read manifest since installPlugin updates it
      const updated = loadManifest();
      if (updated[key]) {
        entry.commitHash = updated[key].commitHash;
        entry.installPath = updated[key].installPath;
      }
    }

    entry.updateAvailable = false;
    entry.latestCommitHash = entry.commitHash;
    entry.checkedAt = new Date().toISOString();
    entry.installedAt = new Date().toISOString();
    saveManifest(manifest);

    return { ok: true, message: `Updated ${name}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
