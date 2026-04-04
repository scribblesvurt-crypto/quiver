import { readFileSync, writeFileSync } from 'fs';
import { CONFIG_FILE, ensureDirs } from './paths.js';

const DEFAULTS = {
  port: 3456,
  sync: {
    backend: 'local',
    remote: null
  }
};

export function loadConfig() {
  ensureDirs();
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const saved = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...saved,
      sync: { ...DEFAULTS.sync, ...(saved.sync || {}) }
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config) {
  ensureDirs();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

export function getConfigValue(key) {
  const config = loadConfig();
  return key.split('.').reduce((obj, k) => obj?.[k], config);
}

export function setConfigValue(key, value) {
  const config = loadConfig();
  const keys = key.split('.');
  let obj = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  saveConfig(config);
  return config;
}
