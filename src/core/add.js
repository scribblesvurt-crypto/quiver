import { existsSync, symlinkSync, cpSync, readFileSync } from 'fs';
import { join, resolve, basename } from 'path';
import { SKILLS_DIR, ensureDirs } from './paths.js';

export function addSkill(sourcePath, opts = {}) {
  ensureDirs();
  const absPath = resolve(sourcePath);

  if (!existsSync(absPath)) {
    throw new Error(`Path not found: ${absPath}`);
  }

  // Check for SKILL.md
  const skillFile = join(absPath, 'SKILL.md');
  if (!existsSync(skillFile)) {
    throw new Error(`No SKILL.md found in ${absPath}. Skills must contain a SKILL.md file.`);
  }

  const dirName = basename(absPath);
  const target = join(SKILLS_DIR, dirName);

  if (existsSync(target)) {
    throw new Error(`Skill "${dirName}" already exists in ~/.claude/skills/`);
  }

  if (opts.copy) {
    cpSync(absPath, target, { recursive: true });
  } else {
    symlinkSync(absPath, target, 'dir');
  }

  return dirName;
}
