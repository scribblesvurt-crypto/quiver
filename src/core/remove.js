import { existsSync, lstatSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';
import { SKILLS_DIR } from './paths.js';
import { getSkill } from './inventory.js';

export function removeSkill(name) {
  const skill = getSkill(name);
  if (!skill) {
    throw new Error(`Skill "${name}" not found`);
  }
  if (skill.source !== 'local') {
    throw new Error('Only local skills can be removed via Quiver');
  }

  const target = skill.path;

  if (skill.isSymlink) {
    unlinkSync(target);
  } else {
    rmSync(target, { recursive: true, force: true });
  }

  return name;
}
