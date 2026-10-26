/**
 * Shared by the traps ledger and the acceptance map. Both are Markdown lists:
 *
 *   - **R01.3** what goes wrong
 *     - Test: src/x/y.test.ts > describe name > test name
 *     - Review: why a test cannot cover it, and which task owns it
 *
 * A Test line resolves when the file exists and contains every name (plain text search;
 * no test is run), and the test is not skipped or a todo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';

export interface Coverage {
  kind: 'test' | 'review';
  value: string;
  line: number;
}

export interface LedgerRow {
  id: string;
  summary: string;
  line: number;
  coverage: Coverage[];
}

const ROW = /^[-*]\s+\*\*([^*]+)\*\*\s*(.*)$/;
const COVERAGE = /^\s+[-*]\s+(Test|Review):\s*(.*)$/i;

export function parseLedger(text: string): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let current: LedgerRow | null = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    const row = ROW.exec(line);
    if (row) {
      current = { id: row[1]!.trim(), summary: row[2]!.trim(), line: i + 1, coverage: [] };
      rows.push(current);
      return;
    }
    const cov = COVERAGE.exec(line);
    if (cov && current) {
      const kind = cov[1]!.toLowerCase() === 'test' ? 'test' : 'review';
      current.coverage.push({ kind, value: cov[2]!.trim(), line: i + 1 });
      return;
    }
    // Any other text at the left margin (a heading, a paragraph) ends the row.
    if (line && !/^\s/.test(line)) current = null;
  });
  return rows;
}

export function groupById(rows: LedgerRow[]): Map<string, LedgerRow[]> {
  const map = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const list = map.get(row.id);
    if (list) list.push(row);
    else map.set(row.id, [row]);
  }
  return map;
}

const SKIP_CALL =
  /\b(?:it|test|describe|suite)\s*\.\s*(?:skip|todo)\s*\(|\bx(?:it|test|describe)\s*\(/;

function unquote(s: string): string {
  const t = s.trim();
  const m = /^([`'"])(.*)\1$/.exec(t);
  return m ? m[2]! : t;
}

export class TestResolver {
  private readonly cache = new Map<string, string | null>();

  constructor(private readonly productRoot: string) {}

  private read(rel: string): string | null {
    if (!this.cache.has(rel)) {
      const abs = join(this.productRoot, rel);
      this.cache.set(rel, existsSync(abs) ? readFileSync(abs, 'utf8') : null);
    }
    return this.cache.get(rel) ?? null;
  }

  /** Returns null when the reference resolves, otherwise why not. */
  check(value: string): string | null {
    const parts = value.split(' > ').map(unquote);
    const path = parts[0] ?? '';
    const names = parts.slice(1).filter(Boolean);
    if (!path || names.length === 0) {
      return `"${value}" should read <path> > <describe> > <test name>`;
    }
    const rel = normalize(path).replace(/\\/g, '/');
    if (isAbsolute(rel) || rel.startsWith('..')) return `${path} is outside the product folder`;
    const text = this.read(rel);
    if (text === null) return `${path} does not exist`;
    for (const name of names) {
      if (!text.includes(name)) return `"${name}" is not in ${path}`;
    }
    const lines = text.split('\n');
    for (const name of names) {
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i]!.includes(name)) continue;
        // A formatter may put the name alone on the line after `it.skip(`.
        const alone = /^\s*[`'"]/.test(lines[i]!);
        if (SKIP_CALL.test(lines[i]!) || (alone && i > 0 && SKIP_CALL.test(lines[i - 1]!))) {
          return `"${name}" in ${path} is skipped or a todo`;
        }
      }
    }
    return null;
  }
}
