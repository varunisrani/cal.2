import { describe, expect, it } from 'vitest';
import type { MessageTree } from './catalogue';
import { enPartitions, onDemandPartitions } from './en';

/**
 * Every lazily fetched chunk names the partitions its modules use (P18-00). Reads the app's
 * sources: from main.tsx, static imports make the start-up download and each dynamic import a
 * chunk fetched on demand. No start-up module may name a key of an on-demand partition, and each
 * dynamic import must be wrapped as `withPartitions([...], import('…'))` naming exactly the
 * on-demand partitions its chunk's modules use. A key is found as a string literal: a whole key,
 * or a prefix ending in `.` or followed by `${` in a template.
 */

// The app's sources, as text (tests and test helpers are only reached if the app imports them).
const SOURCES = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/**/*.d.ts'],
  { query: '?raw', import: 'default', eager: true },
);

/** Setting names spelt like a message key, and the modules where they name only the setting. */
const SETTING_NAMES: Readonly<Record<string, readonly string[]>> = {
  'backup.lastAt': [
    '/src/data/settingsSchema.ts',
    '/src/services/storageNudge.ts',
    '/src/services/backup/auto.ts',
    '/src/services/backup/backup.ts',
    '/src/services/backup/drive.ts',
    '/src/services/backup/hash.ts',
    '/src/services/backup/restore.ts',
  ],
};

const ENTRY = '/src/main.tsx';

/** Each message key and the partition that defines it. */
function keyOwners(): Map<string, string> {
  const owners = new Map<string, string>();
  const walk = (node: string | MessageTree, key: string, partition: string): void => {
    if (typeof node === 'string') {
      owners.set(key, partition);
      return;
    }
    for (const [segment, child] of Object.entries(node)) {
      walk(child, key ? `${key}.${segment}` : segment, partition);
    }
  };
  for (const [partition, tree] of Object.entries(enPartitions)) walk(tree, '', partition);
  return owners;
}

function resolveSpecifier(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const parts = from.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  const base = parts.join('/');
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
    (candidate) => Object.hasOwn(SOURCES, candidate),
  );
}

interface Module {
  readonly imports: string[];
  /** Dynamic imports, each with the partitions its `withPartitions` names (null: not wrapped). */
  readonly fetches: Array<{ readonly target: string; readonly names: string[] | null }>;
  /** On-demand and start-up partitions whose keys the module names, with one key for each. */
  readonly uses: Map<string, string>;
}

const STATIC_IMPORT = /^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*(\bfrom\s+)?['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /(typeof\s+)?\bimport\(\s*'([^']+)'\s*\)(\.(?!then\b)\w+)?/g;
const WRAPPED = /withPartitions\(\s*\[([^\]]*)\]\s*,\s*$/;
const LITERAL = /(['"`])([A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9.]*)(\1|\$\{)/g;

function readModule(file: string, owners: Map<string, string>, keys: string[]): Module {
  const text = SOURCES[file]!;
  const imports: string[] = [];
  for (const [, kind, typeOnly, clause = '', from, specifier = ''] of text.matchAll(
    STATIC_IMPORT,
  )) {
    if (typeOnly || (kind === 'export' && !from)) continue;
    const names = /^\{([^}]*)\}$/.exec(clause.trim())?.[1];
    const allTypes =
      names !== undefined &&
      names.split(',').every((name) => name.trim() === '' || name.trim().startsWith('type '));
    if (allTypes && clause.trim() !== '{}') continue;
    const target = resolveSpecifier(file, specifier);
    if (target) imports.push(target);
  }
  const fetches: Module['fetches'] = [];
  for (const match of text.matchAll(DYNAMIC_IMPORT)) {
    const [, typeQuery, specifier = '', member] = match;
    if (typeQuery || member) continue;
    const target = resolveSpecifier(file, specifier);
    if (!target) continue;
    const wrapped = WRAPPED.exec(text.slice(0, match.index));
    const names = wrapped ? [...wrapped[1]!.matchAll(/'([^']+)'/g)].map((name) => name[1]!) : null;
    fetches.push({ target, names });
  }
  const uses = new Map<string, string>();
  if (!file.startsWith('/src/i18n/')) {
    for (const [, , literal = '', end] of text.matchAll(LITERAL)) {
      if (SETTING_NAMES[literal]?.includes(file)) continue;
      const prefix = end === '${' || literal.endsWith('.');
      const named = prefix ? keys.filter((key) => key.startsWith(literal)) : [literal];
      for (const key of named) {
        const partition = owners.get(key);
        if (partition !== undefined && !uses.has(partition)) uses.set(partition, key);
      }
    }
  }
  return { imports, fetches, uses };
}

/** The modules reachable from main.tsx, read once. */
function readApp(): Map<string, Module> {
  const owners = keyOwners();
  const keys = [...owners.keys()];
  const modules = new Map<string, Module>();
  const queue = [ENTRY];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (modules.has(file)) continue;
    const module = readModule(file, owners, keys);
    modules.set(file, module);
    queue.push(...module.imports, ...module.fetches.map((fetch) => fetch.target));
  }
  return modules;
}

function staticClosure(modules: Map<string, Module>, entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...modules.get(file)!.imports);
  }
  return seen;
}

const ON_DEMAND: ReadonlySet<string> = new Set(Object.keys(onDemandPartitions));

describe('catalogue partitions on demand: what each chunk names (P18-00)', () => {
  const modules = readApp();
  const startup = staticClosure(modules, ENTRY);

  it('reads the app: the start-up modules and the chunks fetched on demand', () => {
    expect(startup.has('/src/app/App.tsx')).toBe(true);
    expect(startup.has('/src/features/home/HomePage.tsx')).toBe(true);
    expect(startup.has('/src/features/walk/WalkScreen.tsx')).toBe(false);
    expect(modules.has('/src/features/walk/WalkScreen.tsx')).toBe(true);
  });

  it('keeps every on-demand partition out of the start-up download', () => {
    const inStartup = [...ON_DEMAND].filter((name) => startup.has(`/src/i18n/en/${name}.ts`));
    expect(inStartup).toEqual([]);
  });

  it('has no start-up module name a key of an on-demand partition', () => {
    const misuses: string[] = [];
    for (const file of startup) {
      for (const [partition, key] of modules.get(file)!.uses) {
        if (ON_DEMAND.has(partition))
          misuses.push(`${file} names ${key} (on demand: ${partition})`);
      }
    }
    expect(misuses).toEqual([]);
  });

  it('has every dynamic import name exactly the on-demand partitions its chunk uses', () => {
    const problems: string[] = [];
    for (const [file, module] of modules) {
      for (const { target, names } of module.fetches) {
        const used = new Set<string>();
        for (const member of staticClosure(modules, target)) {
          if (startup.has(member)) continue;
          for (const partition of modules.get(member)!.uses.keys()) {
            if (ON_DEMAND.has(partition)) used.add(partition);
          }
        }
        const named = new Set(names ?? []);
        const missing = [...used].filter((name) => !named.has(name)).sort();
        const extra = [...named].filter((name) => !used.has(name)).sort();
        if (missing.length > 0 || extra.length > 0) {
          problems.push(
            `${file} fetching ${target}: ` +
              (names === null ? 'not wrapped' : `names [${[...named].join(', ')}]`) +
              `, its chunk uses [${[...used].sort().join(', ')}]`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
