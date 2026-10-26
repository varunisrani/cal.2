import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLedger, TestResolver } from './ledger';
import { result, type CheckContext, type CheckResult, type Finding } from './lib/types';

export const INVENTORY = 'docs/plan/03-feature-inventory.md';
export const MAP = 'docs/internals/acceptance-map.md';

export interface Feature {
  id: string;
  name: string;
  tier: string | null;
  line: number;
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

const SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * Feature rows `| <ID> | <Feature> | <Tier> | ... |`. The ID is one letter and a number;
 * the tier is the first P0–P3 in the tier cell (third column, or a header named "Tier").
 */
export function parseInventory(text: string): Feature[] {
  const lines = text.split('\n');
  const features: Feature[] = [];
  let tierCol = 2;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim().startsWith('|')) continue;
    if (SEPARATOR.test(line.trim())) {
      const header = i > 0 ? cells(lines[i - 1]!) : [];
      const named = header.findIndex((h) => /^tier\b/i.test(h.replace(/[*_`]/g, '')));
      tierCol = named >= 0 ? named : 2;
      continue;
    }
    const row = cells(line);
    const id = (row[0] ?? '').replace(/[*_`]/g, '').trim();
    if (!/^[A-Za-z]\d+$/.test(id)) continue;
    features.push({
      id,
      name: row[1] ?? '',
      tier: /P[0-3]/.exec(row[tierCol] ?? '')?.[0] ?? null,
      line: i + 1,
    });
  }
  return features;
}

const ACC_ID = /^ACC-([A-Za-z]\d+)-\d+$/;

export async function runAcceptance(ctx: CheckContext): Promise<CheckResult> {
  const inventoryPath = join(ctx.productRoot, INVENTORY);
  if (!existsSync(inventoryPath)) {
    return result('acceptance', 'skip', `${INVENTORY} does not exist yet`);
  }
  const features = parseInventory(readFileSync(inventoryPath, 'utf8'));
  const required = features.filter((f) => f.tier === 'P0' || f.tier === 'P1');
  const mapPath = join(ctx.productRoot, MAP);
  const rows = existsSync(mapPath) ? parseLedger(readFileSync(mapPath, 'utf8')) : [];
  const notes: string[] = [];
  if (!existsSync(mapPath)) notes.push(`${MAP} is missing`);

  const byFeature = new Map<string, typeof rows>();
  for (const row of rows) {
    const m = ACC_ID.exec(row.id);
    if (!m) continue;
    const list = byFeature.get(m[1]!) ?? [];
    list.push(row);
    byFeature.set(m[1]!, list);
  }

  const resolver = new TestResolver(ctx.productRoot);
  const findings: Finding[] = [];
  let reviewRows = 0;
  for (const feature of required) {
    const accRows = byFeature.get(feature.id);
    if (!accRows) {
      findings.push({
        file: INVENTORY,
        line: feature.line,
        rule: 'no-acc-row',
        message: `${feature.id} (${feature.tier}) "${feature.name}" has no ACC-${feature.id}-<n> row in ${MAP}`,
      });
      continue;
    }
    for (const row of accRows) {
      if (row.coverage.length === 0) {
        findings.push({
          file: MAP,
          line: row.line,
          rule: 'no-coverage',
          message: `${row.id} has no Test: or Review: line`,
        });
      }
      for (const cov of row.coverage) {
        if (cov.kind === 'review') {
          reviewRows++;
          if (ctx.strict) {
            findings.push({
              file: MAP,
              line: cov.line,
              rule: 'review-strict',
              message: `${row.id} is covered by review only (--strict)`,
            });
          }
          continue;
        }
        const why = resolver.check(cov.value);
        if (why) {
          findings.push({
            file: MAP,
            line: cov.line,
            rule: 'test-unresolved',
            message: `${row.id}: ${why}`,
          });
        }
      }
    }
  }
  const known = new Set(features.map((f) => f.id));
  const orphans = [...byFeature.keys()].filter((id) => !known.has(id));
  if (orphans.length > 0) {
    notes.push(`rows for features not in the inventory: ${orphans.join(', ')}`);
  }
  if (reviewRows > 0 && !ctx.strict) {
    notes.push(`${reviewRows} Review: line(s); --strict fails them`);
  }
  const n = findings.length;
  return result(
    'acceptance',
    n > 0 ? 'fail' : 'pass',
    n > 0
      ? `${n} acceptance problem${n === 1 ? '' : 's'} (${required.length} P0/P1 features)`
      : `${required.length} P0/P1 features covered`,
    { findings, notes },
  );
}
