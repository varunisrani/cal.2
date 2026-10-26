import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { result, type CheckContext, type CheckResult, type Finding } from './lib/types';

export const ALLOW_FILE = 'tooling/checks/licenses.allow.json';

export interface Pkg {
  name: string;
  version: string;
  license: string;
}

export interface LicenseException {
  package: string;
  license: string;
  reason: string;
}

export interface LicensePolicy {
  allowed: string[];
  exceptions: LicenseException[];
}

// ---- SPDX expressions ---------------------------------------------------------------

type Expr = { op: 'id'; id: string } | { op: 'and' | 'or'; items: Expr[] };

/** Parses `MIT`, `(MIT OR Apache-2.0)`, `A AND (B OR C)`, `X WITH Y`. Throws on bad input. */
export function parseSpdx(input: string): Expr {
  const tokens = input.match(/\(|\)|[^\s()]+/g) ?? [];
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const isOp = (t: string | undefined, op: string): boolean => t?.toUpperCase() === op;

  const parseOr = (): Expr => {
    const items = [parseAnd()];
    while (isOp(peek(), 'OR')) {
      pos++;
      items.push(parseAnd());
    }
    return items.length === 1 ? items[0]! : { op: 'or', items };
  };
  const parseAnd = (): Expr => {
    const items = [parseAtom()];
    while (isOp(peek(), 'AND')) {
      pos++;
      items.push(parseAtom());
    }
    return items.length === 1 ? items[0]! : { op: 'and', items };
  };
  const parseAtom = (): Expr => {
    const t = tokens[pos++];
    if (t === undefined) throw new Error('expression ends too early');
    if (t === '(') {
      const inner = parseOr();
      if (tokens[pos++] !== ')') throw new Error('missing ")"');
      return inner;
    }
    if (t === ')' || isOp(t, 'AND') || isOp(t, 'OR') || isOp(t, 'WITH')) {
      throw new Error(`unexpected "${t}"`);
    }
    // An exception (`X WITH Y`) only adds permissions, so X decides.
    if (isOp(peek(), 'WITH')) {
      pos++;
      if (tokens[pos++] === undefined) throw new Error('WITH needs an exception id');
    }
    return { op: 'id', id: t };
  };

  const expr = parseOr();
  if (pos !== tokens.length) throw new Error(`unexpected "${tokens[pos]}"`);
  return expr;
}

/** OR passes when any side is allowed, AND when every side is. */
export function spdxAllowed(license: string, allowed: Set<string>): boolean {
  let expr: Expr;
  try {
    expr = parseSpdx(license);
  } catch {
    return false;
  }
  const ok = (e: Expr): boolean => {
    if (e.op === 'id') {
      return allowed.has(e.id) || (e.id.endsWith('+') && allowed.has(e.id.slice(0, -1)));
    }
    return e.op === 'or' ? e.items.some(ok) : e.items.every(ok);
  };
  return ok(expr);
}

// ---- policy -------------------------------------------------------------------------

export function loadPolicy(productRoot: string): { policy: LicensePolicy; errors: string[] } {
  const file = join(productRoot, ALLOW_FILE);
  const empty: LicensePolicy = { allowed: [], exceptions: [] };
  if (!existsSync(file)) return { policy: empty, errors: [`${ALLOW_FILE} is missing`] };
  let data: Partial<LicensePolicy>;
  try {
    data = JSON.parse(readFileSync(file, 'utf8')) as Partial<LicensePolicy>;
  } catch (err) {
    return { policy: empty, errors: [`${ALLOW_FILE}: not valid JSON (${(err as Error).message})`] };
  }
  const errors: string[] = [];
  const allowed = Array.isArray(data.allowed)
    ? data.allowed.filter((x) => typeof x === 'string')
    : [];
  if (!Array.isArray(data.allowed)) errors.push(`${ALLOW_FILE}: "allowed" must be an array`);
  const exceptions: LicenseException[] = [];
  for (const [i, raw] of (Array.isArray(data.exceptions) ? data.exceptions : []).entries()) {
    const e = (raw ?? {}) as Partial<LicenseException>;
    if (typeof e.package !== 'string' || typeof e.license !== 'string') {
      errors.push(`${ALLOW_FILE} exceptions[${i}]: "package" and "license" are required`);
    } else if (typeof e.reason !== 'string' || !e.reason.trim()) {
      errors.push(`${ALLOW_FILE} exceptions[${i}] (${e.package}): "reason" is mandatory`);
    } else {
      exceptions.push({ package: e.package, license: e.license, reason: e.reason });
    }
  }
  if (data.exceptions !== undefined && !Array.isArray(data.exceptions)) {
    errors.push(`${ALLOW_FILE}: "exceptions" must be an array`);
  }
  return { policy: { allowed, exceptions }, errors };
}

export function judge(pkgs: Pkg[], policy: LicensePolicy): Finding[] {
  const allowed = new Set(policy.allowed);
  const findings: Finding[] = [];
  for (const p of pkgs) {
    if (spdxAllowed(p.license, allowed)) continue;
    if (policy.exceptions.some((e) => e.package === p.name && e.license === p.license)) continue;
    findings.push({
      file: 'package.json',
      rule: p.license,
      message: `${p.name}@${p.version}: licence "${p.license}" is not allowed (add it to ${ALLOW_FILE} "allowed", or an exception with a reason)`,
    });
  }
  return findings;
}

// ---- listing production dependencies ------------------------------------------------

/** `pnpm licenses list --prod --json`; null when pnpm is missing or fails. */
export function listWithPnpm(productRoot: string): { pkgs: Pkg[] | null; why?: string } {
  const run = spawnSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    cwd: productRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) return { pkgs: null, why: run.error.message };
  if (run.status !== 0) {
    return { pkgs: null, why: `exit ${run.status}: ${run.stderr.trim().slice(0, 200)}` };
  }
  const out = run.stdout.trim();
  if (!out.startsWith('{')) {
    return /no licenses/i.test(out) ? { pkgs: [] } : { pkgs: null, why: 'output is not JSON' };
  }
  try {
    const data = JSON.parse(out) as Record<
      string,
      Array<{ name: string; versions?: string[]; version?: string; license?: string }>
    >;
    const pkgs: Pkg[] = [];
    for (const [license, list] of Object.entries(data)) {
      for (const entry of list) {
        for (const version of entry.versions ?? [entry.version ?? '?']) {
          pkgs.push({ name: entry.name, version, license: entry.license ?? license });
        }
      }
    }
    return { pkgs };
  } catch (err) {
    return { pkgs: null, why: (err as Error).message };
  }
}

function licenseOf(manifest: Record<string, unknown>): string {
  const lic = manifest.license;
  if (typeof lic === 'string' && lic.trim()) return lic.trim();
  if (lic && typeof lic === 'object' && typeof (lic as { type?: unknown }).type === 'string') {
    return (lic as { type: string }).type;
  }
  const list = manifest.licenses;
  if (Array.isArray(list)) {
    const types = list
      .map((l: unknown) => (l && typeof l === 'object' ? (l as { type?: unknown }).type : l))
      .filter((t): t is string => typeof t === 'string');
    if (types.length === 1) return types[0]!;
    if (types.length > 1) return `(${types.join(' OR ')})`;
  }
  return 'UNKNOWN';
}

/** Node's lookup: `<dir>/node_modules/<name>` in `fromDir` and each parent folder. */
function resolvePackage(name: string, fromDir: string): string | null {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    if (basename(dir) !== 'node_modules') {
      const candidate = join(dir, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    }
    if (dirname(dir) === dir) return null;
  }
}

function prodDeps(manifest: Record<string, unknown>): string[] {
  const names = new Set<string>();
  for (const field of ['dependencies', 'optionalDependencies']) {
    const deps = manifest[field];
    if (deps && typeof deps === 'object') for (const name of Object.keys(deps)) names.add(name);
  }
  return [...names];
}

/**
 * Walks `node_modules` from package.json "dependencies" (the pnpm layout resolves each
 * package's own dependencies next to it under `.pnpm/<pkg>/node_modules`).
 */
export function listFromNodeModules(productRoot: string): { pkgs: Pkg[]; missing: string[] } {
  const root = JSON.parse(readFileSync(join(productRoot, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const pkgs: Pkg[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const optionalOf = (m: Record<string, unknown>): Set<string> =>
    new Set(Object.keys((m.optionalDependencies as object | undefined) ?? {}));
  const rootOptional = optionalOf(root);
  const queue = prodDeps(root).map((name) => ({
    name,
    from: productRoot,
    optional: rootOptional.has(name),
  }));
  while (queue.length > 0) {
    const { name, from, optional } = queue.shift()!;
    const dir = resolvePackage(name, from);
    if (!dir) {
      if (!optional) missing.push(name);
      continue;
    }
    if (seen.has(dir)) continue;
    seen.add(dir);
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    pkgs.push({
      name: typeof manifest.name === 'string' ? manifest.name : name,
      version: typeof manifest.version === 'string' ? manifest.version : '?',
      license: licenseOf(manifest),
    });
    const optionalHere = optionalOf(manifest);
    for (const dep of prodDeps(manifest)) {
      queue.push({ name: dep, from: dir, optional: optionalHere.has(dep) });
    }
  }
  return { pkgs, missing };
}

export async function runLicenses(
  ctx: CheckContext,
  options: { usePnpm?: boolean } = {},
): Promise<CheckResult> {
  const { policy, errors } = loadPolicy(ctx.productRoot);
  if (errors.length > 0) {
    return result('licenses', 'error', 'licence policy is invalid', { notes: errors });
  }
  const notes: string[] = [];
  let pkgs: Pkg[] | null = null;
  if (options.usePnpm !== false) {
    const viaPnpm = listWithPnpm(ctx.productRoot);
    pkgs = viaPnpm.pkgs;
    if (!pkgs) notes.push(`pnpm licenses failed (${viaPnpm.why}); walked node_modules instead`);
  }
  if (!pkgs) {
    let walked: { pkgs: Pkg[]; missing: string[] };
    try {
      walked = listFromNodeModules(ctx.productRoot);
    } catch (err) {
      return result('licenses', 'error', `cannot list dependencies: ${(err as Error).message}`, {
        notes,
      });
    }
    if (walked.missing.length > 0) {
      notes.push(`not installed: ${walked.missing.join(', ')}`);
      return result('licenses', 'error', 'production dependencies are not installed', { notes });
    }
    pkgs = walked.pkgs;
  }
  const findings = judge(pkgs, policy);
  const n = findings.length;
  return result(
    'licenses',
    n > 0 ? 'fail' : 'pass',
    n > 0
      ? `${n} production package${n === 1 ? '' : 's'} with a licence outside the policy`
      : `${pkgs.length} production packages, all licences allowed`,
    { findings, notes },
  );
}
