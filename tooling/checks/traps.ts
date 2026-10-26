import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { groupById, parseLedger, TestResolver } from './ledger';
import { result, type CheckContext, type CheckResult, type Finding } from './lib/types';

export const RESEARCH_DIR = 'docs/plan/research';
export const PLAN_DIR = 'docs/plan';
export const LEDGER = 'docs/internals/traps-ledger.md';

export interface DeclaredTrap {
  id: string;
  file: string;
  line: number;
  text: string;
}

/**
 * Numbered items (`1.` or `1)`, indented at most three spaces) in the section whose
 * level-2 heading matches `heading`, up to the next level-1 or level-2 heading.
 */
export function numberedItems(
  text: string,
  heading: RegExp,
): Array<{ k: number; line: number; text: string }> {
  const lines = text.split('\n');
  const items: Array<{ k: number; line: number; text: string }> = [];
  let inSection = false;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    if (/^#{1,2}\s/.test(line)) {
      inSection = heading.test(line);
      continue;
    }
    if (!inSection) continue;
    const item = /^\s{0,3}(\d+)[.)]\s+(.*)$/.exec(line);
    if (item) {
      items.push({ k: Number(item[1]), line: i + 1, text: item[2]! });
    } else if (items.length > 0 && /^\s+\S/.test(line)) {
      // Continuation lines belong to the item above.
      items[items.length - 1]!.text += ` ${line.trim()}`;
    }
  }
  return items;
}

function listMarkdown(productRoot: string, dir: string): string[] {
  const abs = join(productRoot, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();
}

/** Traps from research `## 6` sections (R ids) and plan `## Traps` sections (T ids). */
export function declaredTraps(productRoot: string): {
  traps: DeclaredTrap[];
  researchFiles: number;
} {
  const traps: DeclaredTrap[] = [];
  const research = listMarkdown(productRoot, RESEARCH_DIR).filter((f) => /^\d+-/.test(f));
  for (const name of research) {
    const nn = /^(\d+)-/.exec(name)![1]!;
    const rel = `${RESEARCH_DIR}/${name}`;
    const text = readFileSync(join(productRoot, rel), 'utf8');
    for (const item of numberedItems(text, /^##\s+6(?!\d)/)) {
      const explicit = /\bR\d+\.\d+\b/.exec(item.text)?.[0];
      traps.push({
        id: explicit ?? `R${nn}.${item.k}`,
        file: rel,
        line: item.line,
        text: item.text,
      });
    }
  }
  for (const name of listMarkdown(productRoot, PLAN_DIR)) {
    const rel = `${PLAN_DIR}/${name}`;
    const text = readFileSync(join(productRoot, rel), 'utf8');
    const nn = /^(\d+)-/.exec(name)?.[1] ?? name.replace(/\.md$/, '');
    for (const item of numberedItems(text, /^##\s+Traps\b/i)) {
      const explicit = /\bT\d+\.\d+\b/.exec(item.text)?.[0];
      traps.push({
        id: explicit ?? `T${nn}.${item.k}`,
        file: rel,
        line: item.line,
        text: item.text,
      });
    }
  }
  return { traps, researchFiles: research.length };
}

export async function runTraps(ctx: CheckContext): Promise<CheckResult> {
  const { traps, researchFiles } = declaredTraps(ctx.productRoot);
  if (researchFiles === 0) {
    return result('traps', 'skip', `no research specs in ${RESEARCH_DIR} yet`);
  }
  const ledgerPath = join(ctx.productRoot, LEDGER);
  if (!existsSync(ledgerPath)) {
    return result('traps', 'fail', `${LEDGER} is missing (${traps.length} declared traps)`, {
      findings: [
        {
          file: LEDGER,
          rule: 'ledger-missing',
          message: `${traps.length} declared traps have no ledger`,
        },
      ],
    });
  }
  const rows = groupById(parseLedger(readFileSync(ledgerPath, 'utf8')));
  const resolver = new TestResolver(ctx.productRoot);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const trap of traps) {
    if (seen.has(trap.id)) continue;
    seen.add(trap.id);
    const found = rows.get(trap.id);
    if (!found) {
      findings.push({
        file: trap.file,
        line: trap.line,
        rule: 'no-row',
        message: `${trap.id} has no row in ${LEDGER}`,
        excerpt: trap.text.slice(0, 120),
      });
      continue;
    }
    for (const row of found) {
      if (row.coverage.length === 0) {
        findings.push({
          file: LEDGER,
          line: row.line,
          rule: 'no-coverage',
          message: `${row.id} has no Test: or Review: line`,
        });
      }
      for (const cov of row.coverage) {
        if (cov.kind !== 'test') continue;
        const why = resolver.check(cov.value);
        if (why) {
          findings.push({
            file: LEDGER,
            line: cov.line,
            rule: 'test-unresolved',
            message: `${row.id}: ${why}`,
          });
        }
      }
    }
  }
  const n = findings.length;
  return result(
    'traps',
    n > 0 ? 'fail' : 'pass',
    n > 0
      ? `${n} ledger problem${n === 1 ? '' : 's'} (${seen.size} declared traps)`
      : `${seen.size} declared traps covered`,
    { findings },
  );
}
