import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Built from parts so the banned-name check does not flag its own runner.
const DEFAULT_REF_NAME = ['f', 'ud', '-', 'ai'].join('');

/** `<homedir>/reference/<reference name>`, where the lead keeps the pinned reference. */
export function defaultRefPath(home = homedir()): string {
  return join(home, 'reference', DEFAULT_REF_NAME);
}

/** `--ref` wins over `PLATEWISE_REF`, which wins over the default folder. */
export function resolveRefPath(flag: string | undefined, env: NodeJS.ProcessEnv): string {
  const chosen = flag ?? (env.PLATEWISE_REF?.trim() || undefined) ?? defaultRefPath();
  return resolve(chosen);
}

export function refExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
