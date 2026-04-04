import AdmZip from 'adm-zip';
import { join, resolve, relative } from 'path';
import { readdirSync, statSync } from 'fs';
import { getSkill, listSkills } from './inventory.js';

const SENSITIVE_PATTERNS = [/^\.env/, /^\.git\//, /^node_modules\//, /^\.DS_Store$/];

function walkFiltered(dir, base = '') {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (SENSITIVE_PATTERNS.some(p => p.test(rel) || p.test(entry.name))) continue;
    if (entry.isDirectory()) {
      results.push(...walkFiltered(join(dir, entry.name), rel));
    } else {
      results.push({ rel, abs: join(dir, entry.name) });
    }
  }
  return results;
}

export function exportSkill(name, outputDir = '.') {
  const skill = getSkill(name);
  if (!skill) {
    throw new Error(`Skill "${name}" not found`);
  }

  const zip = new AdmZip();
  const files = walkFiltered(skill.path);
  for (const file of files) {
    const dir = file.rel.includes('/') ? file.rel.substring(0, file.rel.lastIndexOf('/')) : '';
    zip.addLocalFile(file.abs, dir);
  }

  const outPath = resolve(outputDir, `${skill.dirName}.skill.zip`);
  zip.writeZip(outPath);
  return outPath;
}

export function exportAll(outputDir = '.') {
  const skills = listSkills();
  const paths = [];
  for (const skill of skills) {
    paths.push(exportSkill(skill.dirName, outputDir));
  }
  return paths;
}
