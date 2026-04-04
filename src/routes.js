import { Router } from 'express';
import multer from 'multer';
import { tmpdir, homedir } from 'os';
import { join, resolve } from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, writeFileSync, unlinkSync, realpathSync } from 'fs';
import { listAll, getSkillContent, saveSkillContent } from './core/inventory.js';
import { addSkill } from './core/add.js';
import { removeSkill } from './core/remove.js';
import { exportSkill } from './core/export.js';
import { importSkill } from './core/import.js';
import { SKILLS_DIR, PLUGINS_DIR } from './core/paths.js';
import { syncInit, syncSetRemote, syncPush, syncPull, syncStatus } from './core/sync/index.js';
import { listAvailablePlugins, listCategories, listSources, setSourceEnabled, installPlugin } from './core/registry.js';
import { getUpdateSummary, checkAllUpdates, updatePlugin } from './core/updates.js';

const upload = multer({ dest: join(tmpdir(), 'skill-manager-uploads'), limits: { fileSize: 10 * 1024 * 1024 } });

/** Escape special XML characters to prevent injection in plist generation. */
function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Strip system paths and environment details from error messages. */
function sanitizeError(msg) {
  if (!msg) return 'An unexpected error occurred';
  return msg
    .replace(/\/Users\/[^\s:]+/g, '<path>')
    .replace(/\/home\/[^\s:]+/g, '<path>')
    .replace(/\/opt\/[^\s:]+/g, '<path>')
    .replace(/\/tmp\/[^\s:]+/g, '<path>');
}

/** Simple in-memory rate limiter. */
function rateLimit({ windowMs = 60000, max = 60 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const record = hits.get(key);
    if (!record || now - record.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    record.count++;
    if (record.count > max) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}

/** Check that a path is within allowed skill/plugin directories. */
function isAllowedPath(targetPath) {
  try {
    const resolved = realpathSync(resolve(targetPath));
    const allowedRoots = [realpathSync(SKILLS_DIR), realpathSync(PLUGINS_DIR)];
    return allowedRoots.some(root => resolved.startsWith(root + '/') || resolved === root);
  } catch {
    return false;
  }
}

export function createRoutes() {
  const router = Router();

  // Apply rate limiting to all API routes
  router.use(rateLimit({ windowMs: 60000, max: 120 }));

  // List all skills
  router.get('/skills', (req, res) => {
    try {
      res.json(listAll());
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  // Get skill detail with content
  router.get('/skills/:name', (req, res) => {
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(req.params.name)) {
        return res.status(400).json({ error: 'Invalid skill name' });
      }
      const skill = getSkillContent(req.params.name);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      res.json(skill);
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  // Save skill content
  router.put('/skills/:name', (req, res) => {
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(req.params.name)) {
        return res.status(400).json({ error: 'Invalid skill name' });
      }
      const { raw } = req.body;
      if (typeof raw !== 'string') return res.status(400).json({ error: 'Raw content required' });
      const result = saveSkillContent(req.params.name, raw);
      res.json({ ok: true, message: `Saved: ${result.name}` });
    } catch (e) {
      res.status(400).json({ error: sanitizeError(e.message) });
    }
  });

  // Add a skill
  router.post('/skills/add', (req, res) => {
    try {
      const { path, copy } = req.body;
      const name = addSkill(path, { copy });
      res.json({ name, message: `Added skill: ${name}` });
    } catch (e) {
      res.status(400).json({ error: sanitizeError(e.message) });
    }
  });

  // Remove a skill
  router.delete('/skills/:name', (req, res) => {
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(req.params.name)) {
        return res.status(400).json({ error: 'Invalid skill name' });
      }
      removeSkill(req.params.name);
      res.json({ message: `Removed: ${req.params.name}` });
    } catch (e) {
      res.status(400).json({ error: sanitizeError(e.message) });
    }
  });

  // Import a skill zip (multipart upload)
  router.post('/skills/import', upload.single('file'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const name = importSkill(req.file.path);
      res.json({ name, message: `Imported skill: ${name}` });
    } catch (e) {
      res.status(400).json({ error: sanitizeError(e.message) });
    } finally {
      try { if (req.file) unlinkSync(req.file.path); } catch {}
    }
  });

  // Export a skill as zip download
  router.get('/skills/:name/export', (req, res) => {
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(req.params.name)) {
        return res.status(400).json({ error: 'Invalid skill name' });
      }
      const outPath = exportSkill(req.params.name, tmpdir());
      res.download(outPath, () => { try { unlinkSync(outPath); } catch {} });
    } catch (e) {
      res.status(400).json({ error: sanitizeError(e.message) });
    }
  });

  // Reveal a file/folder in Finder (macOS)
  router.post('/reveal', (req, res) => {
    try {
      const { path } = req.body;
      if (!path) return res.status(400).json({ error: 'Path required' });
      if (!isAllowedPath(path)) {
        return res.status(403).json({ error: 'Path is outside allowed directories' });
      }
      spawnSync('open', ['-R', path]);
      res.json({ message: 'Revealed in Finder' });
    } catch (e) {
      res.status(400).json({ error: sanitizeError(e.message) });
    }
  });

  // --- Launch on startup ---
  const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', 'com.quiver.server.plist');

  router.get('/startup', (req, res) => {
    res.json({ enabled: existsSync(PLIST_PATH) });
  });

  router.post('/startup', (req, res) => {
    try {
      const { enabled } = req.body;
      if (enabled) {
        // Find node safely using execFileSync (no shell interpolation)
        let nodePath;
        try {
          nodePath = execFileSync('which', ['node'], { encoding: 'utf-8', timeout: 5000 }).trim();
        } catch {
          nodePath = '/opt/homebrew/bin/node';
        }
        const scriptPath = join(process.cwd(), 'bin', 'quiver.js');

        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.quiver.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(scriptPath)}</string>
    <string>ui</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>WorkingDirectory</key>
  <string>${escapeXml(process.cwd())}</string>
</dict>
</plist>`;
        writeFileSync(PLIST_PATH, plist);
        res.json({ enabled: true, message: 'Skill Manager will launch on startup' });
      } else {
        if (existsSync(PLIST_PATH)) {
          try { execFileSync('launchctl', ['unload', PLIST_PATH], { timeout: 5000 }); } catch {}
          unlinkSync(PLIST_PATH);
        }
        res.json({ enabled: false, message: 'Startup disabled' });
      }
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  // --- Registry / Install ---
  router.post('/registry/install', async (req, res) => {
    try {
      const { name, marketplace } = req.body;
      if (!name) return res.status(400).json({ ok: false, error: 'Plugin name required' });
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).json({ ok: false, error: 'Invalid plugin name' });
      }

      const result = await installPlugin(name, marketplace);
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e.message) });
    }
  });

  // --- Registry / Browse ---
  router.get('/registry/plugins', async (req, res) => {
    try {
      const { search, category } = req.query;
      const plugins = await listAvailablePlugins({ search, category });
      res.json({ plugins, total: plugins.length });
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  router.get('/registry/categories', async (req, res) => {
    try {
      res.json({ categories: await listCategories() });
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  router.get('/registry/sources', (req, res) => {
    try {
      res.json({ sources: listSources() });
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  router.post('/registry/sources', (req, res) => {
    try {
      const { id, enabled } = req.body;
      if (!id) return res.status(400).json({ error: 'Source ID required' });
      const updated = setSourceEnabled(id, enabled);
      res.json({ ok: true, enabled: updated });
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  router.get('/registry/updates', (req, res) => {
    try {
      res.json(getUpdateSummary());
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  router.post('/registry/updates/check', async (req, res) => {
    try {
      const result = await checkAllUpdates({ force: true });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  router.post('/registry/update', async (req, res) => {
    try {
      const { name, marketplace } = req.body;
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).json({ error: 'Invalid plugin name' });
      }
      const result = await updatePlugin(name, marketplace);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: sanitizeError(e.message) });
    }
  });

  // --- Sync ---
  router.get('/sync/status', (req, res) => {
    try {
      res.json(syncStatus());
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e.message) });
    }
  });

  router.post('/sync/init', (req, res) => {
    try {
      res.json(syncInit());
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e.message) });
    }
  });

  router.post('/sync/remote', (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ ok: false, error: 'URL required' });
      const result = syncSetRemote(url);
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e.message) });
    }
  });

  router.post('/sync/push', (req, res) => {
    try {
      const result = syncPush();
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e.message) });
    }
  });

  router.post('/sync/pull', (req, res) => {
    try {
      const result = syncPull();
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e.message) });
    }
  });

  return router;
}
