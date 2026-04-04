import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig, setConfigValue } from './config.js';
import { CONFIG_DIR } from './paths.js';

const PLUGINS_BASE = join(homedir(), '.claude', 'plugins');
const KNOWN_MARKETPLACES_FILE = join(PLUGINS_BASE, 'known_marketplaces.json');
const REGISTRY_CACHE_DIR = join(CONFIG_DIR, 'registry-cache');

/**
 * Curated list of known community marketplaces.
 * Users toggle these on/off — no URL typing needed.
 */
export const KNOWN_SOURCES = [
  {
    id: 'daymade/claude-code-skills',
    repo: 'daymade/claude-code-skills',
    name: 'Claude Code Skills',
    description: '43 production-ready skills for development workflows'
  },
  {
    id: 'trailofbits/skills-curated',
    repo: 'trailofbits/skills-curated',
    name: 'Trail of Bits Curated',
    description: 'Security-focused, community-vetted skills'
  },
  {
    id: 'NeoLabHQ/context-engineering-kit',
    repo: 'NeoLabHQ/context-engineering-kit',
    name: 'Context Engineering Kit',
    description: 'Hand-crafted skills for multi-agent workflows'
  },
  {
    id: 'mhattingpete/claude-skills-marketplace',
    repo: 'mhattingpete/claude-skills-marketplace',
    name: 'Skills Marketplace',
    description: 'Git automation, testing, and code review skills'
  },
  {
    id: 'anthropics/skills',
    repo: 'anthropics/skills',
    name: 'Anthropic Skills',
    description: 'Official Anthropic skill packs (docs, spreadsheets, etc.)'
  }
];

/**
 * Get the list of enabled source IDs from config.
 * Local marketplaces default to enabled unless explicitly disabled.
 */
export function getEnabledSources() {
  const config = loadConfig();
  return config.registry?.enabled || [];
}

export function getDisabledSources() {
  const config = loadConfig();
  return config.registry?.disabled || [];
}

/**
 * Enable or disable a marketplace source (local or remote).
 */
export function setSourceEnabled(sourceId, enabled) {
  // Check if it's a local marketplace
  const localMPs = listLocalMarketplaces();
  const isLocal = localMPs.some(m => m.id === sourceId);

  if (isLocal) {
    // Local sources: track disabled list (they're on by default)
    const disabled = getDisabledSources();
    const filtered = disabled.filter(id => id !== sourceId);
    if (!enabled) filtered.push(sourceId);
    setConfigValue('registry.disabled', filtered);
    return filtered;
  } else {
    // Remote sources: track enabled list (they're off by default)
    const current = getEnabledSources();
    const filtered = current.filter(id => id !== sourceId);
    if (enabled) filtered.push(sourceId);
    setConfigValue('registry.enabled', filtered);
    return filtered;
  }
}

/**
 * Get all sources (local + remote) with their enabled status.
 */
export function listSources() {
  const enabled = new Set(getEnabledSources());
  const disabled = new Set(getDisabledSources());

  const sources = [];

  // Local marketplaces (on by default, user can disable)
  const localMPs = listLocalMarketplaces();
  for (const mp of localMPs) {
    sources.push({
      id: mp.id,
      repo: mp.repo,
      name: mp.id,
      description: `Installed locally via Claude Code`,
      enabled: !disabled.has(mp.id),
      local: true
    });
  }

  // Remote community sources (off by default, user enables)
  for (const s of KNOWN_SOURCES) {
    // Skip if already present as a local marketplace
    if (localMPs.some(m => m.repo === s.repo)) continue;
    sources.push({
      ...s,
      enabled: enabled.has(s.id),
      local: false
    });
  }

  return sources;
}

/**
 * Fetch a marketplace.json from a GitHub repo's raw URL.
 * Tries common paths: .claude-plugin/marketplace.json, marketplace.json
 * Caches to disk to avoid repeat fetches.
 */
async function fetchRemoteCatalog(repo) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) return null;
  mkdirSync(REGISTRY_CACHE_DIR, { recursive: true });
  const cacheFile = join(REGISTRY_CACHE_DIR, repo.replace(/\//g, '_') + '.json');

  // Use cache if less than 1 hour old
  if (existsSync(cacheFile)) {
    try {
      const stat = readFileSync(cacheFile, 'utf-8');
      const cached = JSON.parse(stat);
      if (cached._fetchedAt && Date.now() - new Date(cached._fetchedAt).getTime() < 3600000) {
        return cached;
      }
    } catch {}
  }

  // Try common marketplace.json locations
  const paths = [
    `.claude-plugin/marketplace.json`,
    `marketplace.json`
  ];

  // Also try to find skills as individual SKILL.md repos (for repos like anthropics/skills)
  for (const p of paths) {
    const url = `https://raw.githubusercontent.com/${repo}/main/${p}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        data._fetchedAt = new Date().toISOString();
        data._source = repo;
        writeFileSync(cacheFile, JSON.stringify(data, null, 2));
        return data;
      }
    } catch {}
  }

  // Fallback: try to read the repo as a simple skill collection
  // (repos that list skills in subdirectories without marketplace.json)
  try {
    const apiUrl = `https://api.github.com/repos/${repo}/contents`;
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.ok) {
      const contents = await res.json();
      const dirs = contents.filter(c => c.type === 'dir' && !c.name.startsWith('.'));
      if (dirs.length > 0) {
        const catalog = {
          name: repo.split('/')[1],
          description: `Skills from ${repo}`,
          plugins: dirs.map(d => ({
            name: d.name,
            description: '',
            source: { source: 'github', repo: `${repo}` },
            category: null
          })),
          _fetchedAt: new Date().toISOString(),
          _source: repo
        };
        writeFileSync(cacheFile, JSON.stringify(catalog, null, 2));
        return catalog;
      }
    }
  } catch {}

  return null;
}

/**
 * Read the list of marketplaces registered with Claude Code.
 */
export function listLocalMarketplaces() {
  if (!existsSync(KNOWN_MARKETPLACES_FILE)) return [];

  try {
    const raw = readFileSync(KNOWN_MARKETPLACES_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Object.entries(data).map(([id, info]) => ({
      id,
      repo: info.source?.repo || null,
      installLocation: info.installLocation,
      lastUpdated: info.lastUpdated || null
    }));
  } catch {
    return [];
  }
}

/**
 * Read a marketplace.json catalog from a marketplace directory.
 */
function readMarketplaceCatalog(marketplacePath) {
  const catalogFile = join(marketplacePath, '.claude-plugin', 'marketplace.json');
  if (!existsSync(catalogFile)) return null;

  try {
    const raw = readFileSync(catalogFile, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Get set of installed plugin directory names within a marketplace.
 */
function getInstalledPluginNames(marketplacePath) {
  const installed = new Set();

  for (const subdir of ['plugins', 'external_plugins']) {
    const dir = join(marketplacePath, subdir);
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if ((e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.')) {
          installed.add(e.name);
        }
      }
    } catch {}
  }

  return installed;
}

function getSourceType(source) {
  if (typeof source === 'string') return 'local';
  if (source?.source === 'url') return 'url';
  if (source?.source === 'git-subdir') return 'git-subdir';
  if (source?.source === 'github') return 'github';
  return 'unknown';
}

function getAuthorName(author) {
  if (!author) return null;
  if (typeof author === 'string') return author;
  return author.name || null;
}

/**
 * List all available plugins from local + enabled remote marketplaces.
 */
export async function listAvailablePlugins({ search, category } = {}) {
  const plugins = [];

  // 1. Local marketplaces (already cloned by Claude Code)
  const localMPs = listLocalMarketplaces();
  const localRepos = new Set(localMPs.map(m => m.repo).filter(Boolean));
  const disabled = new Set(getDisabledSources());

  for (const mp of localMPs) {
    if (disabled.has(mp.id)) continue;
    const catalog = readMarketplaceCatalog(mp.installLocation);
    if (!catalog?.plugins) continue;

    const installed = getInstalledPluginNames(mp.installLocation);

    for (const p of catalog.plugins) {
      plugins.push({
        name: p.name,
        description: p.description || '',
        category: p.category || null,
        author: getAuthorName(p.author),
        homepage: p.homepage || null,
        keywords: p.keywords || [],
        marketplace: mp.id,
        marketplaceRepo: mp.repo,
        installed: installed.has(p.name),
        sourceType: getSourceType(p.source)
      });
    }
  }

  // 2. Enabled remote sources (fetched from GitHub)
  const enabledIds = getEnabledSources();
  const remoteSources = KNOWN_SOURCES.filter(s =>
    enabledIds.includes(s.id) && !localRepos.has(s.repo)
  );

  for (const source of remoteSources) {
    try {
      const catalog = await fetchRemoteCatalog(source.repo);
      if (!catalog?.plugins) continue;

      for (const p of catalog.plugins) {
        plugins.push({
          name: p.name,
          description: p.description || '',
          category: p.category || null,
          author: getAuthorName(p.author),
          homepage: p.homepage || null,
          keywords: p.keywords || [],
          marketplace: source.id,
          marketplaceRepo: source.repo,
          installed: false,
          sourceType: getSourceType(p.source)
        });
      }
    } catch {}
  }

  // Apply filters
  let filtered = plugins;

  if (category) {
    filtered = filtered.filter(p => p.category === category);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.author || '').toLowerCase().includes(q) ||
      p.keywords.some(k => k.toLowerCase().includes(q))
    );
  }

  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * List unique categories with counts.
 */
export async function listCategories() {
  const plugins = await listAvailablePlugins();
  const counts = {};

  for (const p of plugins) {
    const cat = p.category || 'uncategorized';
    counts[cat] = (counts[cat] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Install a plugin by name.
 * For local marketplaces: clone from git URL or copy from local path.
 * For remote marketplaces: clone the marketplace repo and extract the plugin.
 */
export async function installPlugin(name, marketplaceId) {
  // Find the plugin in the catalog
  const allPlugins = await listAvailablePlugins();
  const plugin = allPlugins.find(p => p.name === name);
  if (!plugin) return { ok: false, error: `Plugin not found: ${name}` };
  if (plugin.installed) return { ok: true, message: `${name} is already installed.` };

  // Find the marketplace and plugin source details
  const localMPs = listLocalMarketplaces();
  const localMP = localMPs.find(m => m.id === plugin.marketplace);

  if (localMP) {
    // Plugin is in a locally-cloned marketplace — read its source from marketplace.json
    const catalog = readMarketplaceCatalog(localMP.installLocation);
    const entry = catalog?.plugins?.find(p => p.name === name);
    if (!entry) return { ok: false, error: 'Plugin not found in marketplace catalog' };

    const source = entry.source;

    if (typeof source === 'string' && source.startsWith('./')) {
      // Local path within marketplace repo — already on disk, just a relative ref
      const srcPath = join(localMP.installLocation, source);
      if (existsSync(srcPath)) {
        return { ok: true, message: `${name} is available locally at ${srcPath}` };
      }
      return { ok: false, error: `Source path not found: ${srcPath}` };
    }

    // Remote source — clone into external_plugins/
    const destDir = join(localMP.installLocation, 'external_plugins', name);
    if (existsSync(destDir)) return { ok: true, message: `${name} is already installed.` };

    let gitUrl = null;
    if (source?.source === 'url') {
      gitUrl = source.url;
    } else if (source?.source === 'github') {
      gitUrl = `https://github.com/${source.repo}.git`;
    }

    if (gitUrl) {
      try {
        mkdirSync(join(localMP.installLocation, 'external_plugins'), { recursive: true });
        execFileSync('git', ['clone', '--depth', '1', gitUrl, destDir], {
          encoding: 'utf-8', stdio: 'pipe', timeout: 120000
        });
        return { ok: true, message: `Installed ${name} from ${gitUrl}` };
      } catch (e) {
        const detail = (e.stderr || e.message || '').replace(/\/[^\s:]+/g, '<path>');
      return { ok: false, error: `Clone failed: ${detail}` };
      }
    }

    // git-subdir: clone whole repo then extract subdirectory
    if (source?.source === 'git-subdir') {
      const repoUrl = source.url.includes('://') ? source.url : `https://github.com/${source.url}.git`;
      const tmpDir = join(REGISTRY_CACHE_DIR, `_tmp_${name}`);
      try {
        execFileSync('git', ['clone', '--depth', '1', repoUrl, tmpDir], {
          encoding: 'utf-8', stdio: 'pipe', timeout: 120000
        });
        const subPath = join(tmpDir, source.path || '');
        if (existsSync(subPath)) {
          mkdirSync(join(localMP.installLocation, 'external_plugins'), { recursive: true });
          cpSync(subPath, destDir, { recursive: true });
        }
        rmSync(tmpDir, { recursive: true, force: true });
        return { ok: true, message: `Installed ${name}` };
      } catch (e) {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        const detail = (e.stderr || e.message || '').replace(/\/[^\s:]+/g, '<path>');
        return { ok: false, error: `Install failed: ${detail}` };
      }
    }

    return { ok: false, error: `Unsupported source type for ${name}` };
  }

  // Remote marketplace — clone the skill from the marketplace repo
  const remoteSource = KNOWN_SOURCES.find(s => s.id === plugin.marketplace);
  if (!remoteSource) return { ok: false, error: 'Marketplace source not found' };

  // Fetch the cached catalog to find the plugin's source path
  const catalog = await fetchRemoteCatalog(remoteSource.repo);
  const entry = catalog?.plugins?.find(p => p.name === name);
  if (!entry) return { ok: false, error: 'Plugin not found in remote catalog' };

  // Clone the marketplace repo and extract the plugin
  const repoUrl = `https://github.com/${remoteSource.repo}.git`;
  const tmpDir = join(REGISTRY_CACHE_DIR, `_tmp_${Date.now()}`);
  const destDir = join(homedir(), '.claude', 'skills', name);

  if (existsSync(destDir)) return { ok: true, message: `${name} already exists in skills.` };

  try {
    execFileSync('git', ['clone', '--depth', '1', repoUrl, tmpDir], {
      encoding: 'utf-8', stdio: 'pipe', timeout: 120000
    });

    // Find the plugin source path within the cloned repo
    const sourcePath = typeof entry.source === 'string'
      ? entry.source.replace(/^\.\//, '')
      : entry.source?.path || `plugins/${name}`;
    const srcDir = join(tmpDir, sourcePath);

    if (existsSync(srcDir)) {
      cpSync(srcDir, destDir, { recursive: true });
    } else {
      throw new Error(`Plugin directory not found in repo: ${sourcePath}`);
    }

    rmSync(tmpDir, { recursive: true, force: true });
    return { ok: true, message: `Installed ${name} to ~/.claude/skills/` };
  } catch (e) {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    return { ok: false, error: `Install failed: ${e.message}` };
  }
}
