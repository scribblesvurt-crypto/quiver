import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';

const home = homedir();

export const SKILLS_DIR = join(home, '.claude', 'skills');
export const PLUGINS_DIR = join(home, '.claude', 'plugins', 'marketplaces');
export const CONFIG_DIR = join(home, '.quiver');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const SYNC_DIR = join(CONFIG_DIR, 'sync');

export function ensureDirs() {
  mkdirSync(SKILLS_DIR, { recursive: true });
  mkdirSync(CONFIG_DIR, { recursive: true });
  mkdirSync(SYNC_DIR, { recursive: true });
}
