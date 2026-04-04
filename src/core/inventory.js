import { readdirSync, readFileSync, writeFileSync, statSync, lstatSync, existsSync, realpathSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { SKILLS_DIR, PLUGINS_DIR, ensureDirs } from './paths.js';

export function listSkills() {
  ensureDirs();
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith('.')) continue;

    const skillPath = join(SKILLS_DIR, entry.name);
    const skillFile = join(skillPath, 'SKILL.md');

    let frontmatter = {};
    let content = '';
    try {
      const raw = readFileSync(skillFile, 'utf-8');
      const parsed = matter(raw);
      frontmatter = parsed.data;
      content = parsed.content;
    } catch {
      // No SKILL.md or can't parse — still list the directory
    }

    const lstat = lstatSync(skillPath);
    const isSymlink = lstat.isSymbolicLink();

    let files = [];
    try {
      files = collectFiles(skillPath);
    } catch {}

    skills.push({
      name: frontmatter.name || entry.name,
      dirName: entry.name,
      description: frontmatter.description || '',
      tags: frontmatter.tags || [],
      version: frontmatter.version || null,
      author: frontmatter.author || null,
      path: skillPath,
      isSymlink,
      files,
      fileCount: files.length,
      modified: (() => { try { return statSync(skillPath).mtime.toISOString(); } catch { return new Date().toISOString(); } })(),
      hasSkillFile: content !== '' || Object.keys(frontmatter).length > 0,
      source: 'local',
      pluginName: null
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function listPluginSkills() {
  if (!existsSync(PLUGINS_DIR)) return [];

  const skills = [];
  let marketplaces;
  try {
    marketplaces = readdirSync(PLUGINS_DIR, { withFileTypes: true });
  } catch { return []; }

  for (const marketplace of marketplaces) {
    if (!marketplace.isDirectory() || marketplace.name.startsWith('.')) continue;

    const pluginsPath = join(PLUGINS_DIR, marketplace.name, 'plugins');
    if (!existsSync(pluginsPath)) continue;

    let plugins;
    try {
      plugins = readdirSync(pluginsPath, { withFileTypes: true });
    } catch { continue; }

    for (const plugin of plugins) {
      if (!plugin.isDirectory() || plugin.name.startsWith('.')) continue;

      const pluginPath = join(pluginsPath, plugin.name);

      // Read plugin metadata
      let pluginMeta = { name: plugin.name, description: '', version: null, author: null };
      try {
        const metaFile = join(pluginPath, '.claude-plugin', 'plugin.json');
        const raw = readFileSync(metaFile, 'utf-8');
        const meta = JSON.parse(raw);
        pluginMeta = {
          name: meta.name || plugin.name,
          description: meta.description || '',
          version: meta.version || null,
          author: typeof meta.author === 'object' ? meta.author.name : meta.author || null
        };
      } catch {}

      // Scan skills/ subdirectory
      const skillsPath = join(pluginPath, 'skills');
      if (existsSync(skillsPath)) {
        try {
          const skillDirs = readdirSync(skillsPath, { withFileTypes: true });
          for (const skillDir of skillDirs) {
            if (!skillDir.isDirectory() || skillDir.name.startsWith('.')) continue;

            const skillPath = join(skillsPath, skillDir.name);
            const skillFile = join(skillPath, 'SKILL.md');

            let frontmatter = {};
            let content = '';
            try {
              const raw = readFileSync(skillFile, 'utf-8');
              const parsed = matter(raw);
              frontmatter = parsed.data;
              content = parsed.content;
            } catch { continue; }

            let files = [];
            try { files = collectFiles(skillPath); } catch {}

            skills.push({
              name: frontmatter.name || skillDir.name,
              dirName: skillDir.name,
              description: frontmatter.description || '',
              tags: frontmatter.tags || [],
              version: frontmatter.version || pluginMeta.version,
              author: frontmatter.author || pluginMeta.author,
              path: skillPath,
              isSymlink: false,
              files,
              fileCount: files.length,
              modified: (() => { try { return statSync(skillPath).mtime.toISOString(); } catch { return new Date().toISOString(); } })(),
              hasSkillFile: true,
              source: 'plugin',
              pluginName: pluginMeta.name
            });
          }
        } catch {}
      }

      // Scan commands/ subdirectory (legacy format)
      const commandsPath = join(pluginPath, 'commands');
      if (existsSync(commandsPath)) {
        try {
          const cmdFiles = readdirSync(commandsPath).filter(f => f.endsWith('.md'));
          for (const cmdFile of cmdFiles) {
            const cmdPath = join(commandsPath, cmdFile);
            const cmdName = cmdFile.replace('.md', '');

            let frontmatter = {};
            try {
              const raw = readFileSync(cmdPath, 'utf-8');
              const parsed = matter(raw);
              frontmatter = parsed.data;
            } catch { continue; }

            skills.push({
              name: cmdName,
              dirName: cmdName,
              description: frontmatter.description || '',
              tags: frontmatter.tags || [],
              version: pluginMeta.version,
              author: pluginMeta.author,
              path: cmdPath,
              isSymlink: false,
              files: [cmdFile],
              fileCount: 1,
              modified: (() => { try { return statSync(cmdPath).mtime.toISOString(); } catch { return new Date().toISOString(); } })(),
              hasSkillFile: true,
              source: 'plugin',
              pluginName: pluginMeta.name
            });
          }
        } catch {}
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function listAll() {
  return [...listSkills(), ...listPluginSkills()]
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSkill(name) {
  const skills = listAll();
  return skills.find(s => s.name === name || s.dirName === name) || null;
}

export function getSkillContent(name) {
  const skill = getSkill(name);
  if (!skill) return null;

  // For plugin commands (single .md files), the path IS the file
  const skillFile = skill.path.endsWith('.md') ? skill.path : join(skill.path, 'SKILL.md');
  try {
    const raw = readFileSync(skillFile, 'utf-8');
    const parsed = matter(raw);
    return { ...skill, content: parsed.content, frontmatter: parsed.data };
  } catch {
    return { ...skill, content: '', frontmatter: {} };
  }
}

export function saveSkillContent(name, raw) {
  const skill = getSkill(name);
  if (!skill) throw new Error(`Skill not found: ${name}`);
  if (skill.source !== 'local') throw new Error('Only local skills can be edited.');

  const skillFile = join(skill.path, 'SKILL.md');
  writeFileSync(skillFile, raw);
  return { name: skill.name, path: skillFile };
}

function collectFiles(dir, base = '', depth = 0, visited = new Set()) {
  if (depth > 10) return [];
  let realDir;
  try { realDir = realpathSync(dir); } catch { return []; }
  if (visited.has(realDir)) return [];
  visited.add(realDir);

  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectFiles(join(dir, entry.name), rel, depth + 1, visited));
    } else {
      results.push(rel);
    }
  }
  return results;
}
