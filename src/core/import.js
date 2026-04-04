import AdmZip from 'adm-zip';
import { existsSync, readFileSync } from 'fs';
import { join, resolve, basename } from 'path';
import matter from 'gray-matter';
import { SKILLS_DIR, ensureDirs } from './paths.js';

export function importSkill(zipPath) {
  ensureDirs();
  const absPath = resolve(zipPath);

  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const zip = new AdmZip(absPath);
  const entries = zip.getEntries();

  // Check for SKILL.md in the zip
  const skillEntry = entries.find(e => e.entryName === 'SKILL.md' || e.entryName.endsWith('/SKILL.md'));
  if (!skillEntry) {
    throw new Error('Zip does not contain a SKILL.md file');
  }

  // Determine skill name from frontmatter or zip filename
  let skillName;
  try {
    const content = skillEntry.getData().toString('utf-8');
    const parsed = matter(content);
    skillName = parsed.data.name;
  } catch {
    // Fall through to filename
  }

  if (!skillName) {
    skillName = basename(absPath, '.skill.zip').replace('.zip', '');
  }

  // Sanitize skill name to prevent path traversal
  skillName = skillName.replace(/[/\\]/g, '-').replace(/\.\./g, '');
  if (!skillName || skillName.startsWith('.')) throw new Error('Invalid skill name in zip');

  const target = join(SKILLS_DIR, skillName);
  if (existsSync(target)) {
    throw new Error(`Skill "${skillName}" already exists. Remove it first.`);
  }

  // Zip slip protection: verify no entries escape the target directory
  for (const entry of entries) {
    const resolved = resolve(target, entry.entryName);
    if (!resolved.startsWith(target + '/') && resolved !== target) {
      throw new Error('Zip contains unsafe path: ' + entry.entryName);
    }
  }

  zip.extractAllTo(target, true);
  return skillName;
}
