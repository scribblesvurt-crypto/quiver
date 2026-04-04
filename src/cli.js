import { program } from 'commander';
import { listAll, getSkillContent } from './core/inventory.js';
import { addSkill } from './core/add.js';
import { removeSkill } from './core/remove.js';
import { exportSkill, exportAll } from './core/export.js';
import { importSkill } from './core/import.js';
import { loadConfig, getConfigValue, setConfigValue } from './core/config.js';
import { syncInit, syncSetRemote, syncPush, syncPull, syncStatus } from './core/sync/index.js';
import { listAvailablePlugins, listCategories, listSources, setSourceEnabled } from './core/registry.js';
import { startServer } from './server.js';

program
  .name('quiver')
  .description('Quiver — manage Claude Code skills')
  .version('0.1.0');

// --- list ---
program
  .command('list')
  .alias('ls')
  .description('List all installed skills')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const skills = listAll();
    if (skills.length === 0) {
      console.log('No skills found.');
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(skills, null, 2));
      return;
    }
    const maxName = Math.max(...skills.map(s => s.name.length), 4);
    const maxSource = Math.max(...skills.map(s => (s.pluginName || s.source).length), 6);
    console.log(`${'NAME'.padEnd(maxName)}  ${'SOURCE'.padEnd(maxSource)}  ${'FILES'}  DESCRIPTION`);
    console.log(`${'─'.repeat(maxName)}  ${'─'.repeat(maxSource)}  ${'─────'}  ${'─'.repeat(40)}`);
    for (const s of skills) {
      const source = s.pluginName || s.source;
      const desc = s.description.length > 50 ? s.description.slice(0, 47) + '...' : s.description;
      console.log(`${s.name.padEnd(maxName)}  ${source.padEnd(maxSource)}  ${String(s.fileCount).padStart(5)}  ${desc}`);
    }
  });

// --- add ---
program
  .command('add <path>')
  .description('Add a skill to ~/.claude/skills/ (symlink by default)')
  .option('--copy', 'Copy instead of symlink')
  .action((path, opts) => {
    try {
      const name = addSkill(path, { copy: opts.copy });
      console.log(`Added skill: ${name}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// --- remove ---
program
  .command('remove <name>')
  .alias('rm')
  .description('Remove a skill from ~/.claude/skills/')
  .action((name) => {
    try {
      removeSkill(name);
      console.log(`Removed skill: ${name}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// --- export ---
program
  .command('export <name>')
  .description('Export a skill as a .skill.zip')
  .option('--all', 'Export all skills')
  .option('-o, --output <dir>', 'Output directory', '.')
  .action((name, opts) => {
    try {
      if (opts.all) {
        const files = exportAll(opts.output);
        console.log(`Exported ${files.length} skills to ${opts.output}`);
      } else {
        const outPath = exportSkill(name, opts.output);
        console.log(`Exported: ${outPath}`);
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// --- import ---
program
  .command('import <zip>')
  .description('Import a skill from a .zip file')
  .action((zip) => {
    try {
      const name = importSkill(zip);
      console.log(`Imported skill: ${name}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// --- ui ---
program
  .command('ui')
  .description('Launch the web UI')
  .option('-p, --port <port>', 'Port number', '3456')
  .action((opts) => {
    startServer(parseInt(opts.port));
  });

// --- config ---
program
  .command('config [key] [value]')
  .description('Get or set config values')
  .action((key, value) => {
    if (!key) {
      console.log(JSON.stringify(loadConfig(), null, 2));
    } else if (value === undefined) {
      console.log(getConfigValue(key) ?? '(not set)');
    } else {
      setConfigValue(key, value);
      console.log(`Set ${key} = ${value}`);
    }
  });

// --- browse ---
program
  .command('browse')
  .description('Browse available marketplace plugins')
  .option('--category <cat>', 'Filter by category')
  .option('--search <term>', 'Search plugins')
  .option('--json', 'Output as JSON')
  .option('--categories', 'List categories only')
  .option('--sources', 'List marketplace sources and their status')
  .option('--enable <id>', 'Enable a marketplace source')
  .option('--disable <id>', 'Disable a marketplace source')
  .action(async (opts) => {
    if (opts.sources) {
      const sources = listSources();
      console.log('Marketplace sources:\n');
      for (const s of sources) {
        const status = s.enabled ? '[ON] ' : '[OFF]';
        console.log(`  ${status} ${s.id}`);
        console.log(`        ${s.description}`);
      }
      console.log('\nUse --enable <id> or --disable <id> to toggle.');
      return;
    }

    if (opts.enable) {
      setSourceEnabled(opts.enable, true);
      console.log(`Enabled: ${opts.enable}`);
      return;
    }

    if (opts.disable) {
      setSourceEnabled(opts.disable, false);
      console.log(`Disabled: ${opts.disable}`);
      return;
    }

    if (opts.categories) {
      const cats = await listCategories();
      if (cats.length === 0) {
        console.log('No marketplaces found. Add one with: claude /plugin marketplace add anthropics/claude-plugins-official');
        return;
      }
      for (const c of cats) {
        console.log(`  ${c.name} (${c.count})`);
      }
      return;
    }

    const plugins = await listAvailablePlugins({ search: opts.search, category: opts.category });
    if (plugins.length === 0) {
      console.log('No plugins found.');
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(plugins, null, 2));
      return;
    }

    const maxName = Math.max(...plugins.map(p => p.name.length), 4);
    const maxCat = Math.max(...plugins.map(p => (p.category || '—').length), 8);
    console.log(`${'NAME'.padEnd(maxName)}  ${'CATEGORY'.padEnd(maxCat)}  ${'STATUS'}    DESCRIPTION`);
    console.log(`${'─'.repeat(maxName)}  ${'─'.repeat(maxCat)}  ${'─'.repeat(9)}  ${'─'.repeat(40)}`);
    for (const p of plugins) {
      const cat = (p.category || '—').padEnd(maxCat);
      const status = p.installed ? 'installed' : 'available';
      const desc = p.description.length > 50 ? p.description.slice(0, 47) + '...' : p.description;
      console.log(`${p.name.padEnd(maxName)}  ${cat}  ${status.padEnd(9)}  ${desc}`);
    }
    console.log(`\n${plugins.length} plugins (${plugins.filter(p => p.installed).length} installed)`);
  });

// --- sync ---
const sync = program.command('sync').description('Sync skills across machines');

sync
  .command('init')
  .description('Initialize sync (creates git repo in ~/.quiver/sync/)')
  .action(() => {
    try {
      const result = syncInit();
      console.log(result.message);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

sync
  .command('remote <url>')
  .description('Set the git remote URL')
  .action((url) => {
    try {
      const result = syncSetRemote(url);
      if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
      console.log(result.message);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

sync
  .command('push')
  .description('Push local skills to remote')
  .action(() => {
    try {
      const result = syncPush();
      if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
      console.log(result.message);
      if (result.changes) {
        for (const s of result.changes.added || []) console.log(`  + ${s}`);
        for (const s of result.changes.modified || []) console.log(`  ~ ${s}`);
        for (const s of result.changes.removed || []) console.log(`  - ${s}`);
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

sync
  .command('pull')
  .description('Pull skills from remote')
  .action(() => {
    try {
      const result = syncPull();
      if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(1); }
      console.log(result.message);
      if (result.changes) {
        for (const s of result.changes.added || []) console.log(`  + ${s}`);
        for (const s of result.changes.modified || []) console.log(`  ~ ${s}`);
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

sync
  .command('status')
  .description('Show sync status')
  .action(() => {
    try {
      const status = syncStatus();
      if (!status.initialized) {
        console.log('Sync not initialized. Run "quiver sync init" to get started.');
        return;
      }
      console.log(`Backend:  ${status.backend}`);
      console.log(`Remote:   ${status.remote || '(none)'}`);
      console.log(`Last sync: ${status.lastSync || 'never'}`);

      const { added, modified, removed } = status.localChanges;
      const localTotal = added.length + modified.length + removed.length;

      if (localTotal === 0 && status.remoteChanges === 0) {
        console.log('\nEverything up to date.');
      } else {
        if (localTotal > 0) {
          console.log(`\nLocal changes (${localTotal}):`);
          for (const s of added) console.log(`  + ${s} (new)`);
          for (const s of modified) console.log(`  ~ ${s} (modified)`);
          for (const s of removed) console.log(`  - ${s} (removed)`);
        }
        if (status.remoteChanges > 0) {
          console.log(`\nRemote: ${status.remoteChanges} new commit${status.remoteChanges !== 1 ? 's' : ''} to pull.`);
        }
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program.parse();
