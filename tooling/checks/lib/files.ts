import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

/** Build and test output folders at the product root; never product source. */
const PRODUCT_OUTPUT_DIRS = new Set(['dist', 'coverage', 'test-results', 'playwright-report']);

/**
 * `node_modules` and `.git` anywhere (a checkout with worktrees keeps their commit messages under
 * `.git/worktrees/`), and the build/test output folders at the product root.
 */
export function isGeneratedProductDir(rel: string, name: string): boolean {
  return (
    name === 'node_modules' || name === '.git' || (rel === name && PRODUCT_OUTPUT_DIRS.has(name))
  );
}

export interface WalkOptions {
  /** Return true to leave out a folder (path relative to the root, forward slashes). */
  skipDir?: (rel: string, name: string) => boolean;
}

export interface WalkedFile {
  /** Relative path with forward slashes. */
  rel: string;
  abs: string;
}

/**
 * Lists every file under `root`, depth first, sorted by name so output is stable.
 * Symlinked files are followed; symlinked folders are not (no loops).
 */
export function walkFiles(root: string, options: WalkOptions = {}): WalkedFile[] {
  const out: WalkedFile[] = [];
  const visit = (dir: string, relDir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (options.skipDir?.(rel, entry.name)) continue;
        visit(abs, rel);
      } else if (entry.isFile()) {
        out.push({ rel, abs });
      } else if (entry.isSymbolicLink()) {
        try {
          if (statSync(abs).isFile()) out.push({ rel, abs });
        } catch {
          // A dangling link is not a file.
        }
      }
    }
  };
  visit(root, '');
  return out;
}

export function extOf(rel: string): string {
  const slash = rel.lastIndexOf('/');
  const dot = rel.lastIndexOf('.');
  return dot > slash + 1 ? rel.slice(dot + 1).toLowerCase() : '';
}

/** A file is binary when its first 8000 bytes hold a NUL byte (the usual sniff). */
export function isBinary(buf: Uint8Array): boolean {
  const end = Math.min(buf.length, 8000);
  for (let i = 0; i < end; i++) if (buf[i] === 0) return true;
  return false;
}

/** Reads a text file, or returns null when it is binary or larger than `maxBytes`. */
export function readText(abs: string, maxBytes = Infinity): string | null {
  try {
    if (maxBytes !== Infinity && statSync(abs).size > maxBytes) return null;
    const buf = readFileSync(abs);
    if (isBinary(buf)) return null;
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Turns a glob into a RegExp over relative paths: `**` spans folders, `*` and `?` stay
 * inside one segment. A pattern without wildcards matches that file or anything under it.
 */
export function globToRegExp(glob: string): RegExp {
  const clean = glob.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!/[*?]/.test(clean)) return new RegExp(`^${escapeRe(clean)}(?:/.*)?$`);
  let src = '';
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i] as string;
    if (ch === '*' && clean[i + 1] === '*') {
      if (clean[i + 2] === '/') {
        src += '(?:.*/)?';
        i += 2;
      } else {
        src += '.*';
        i += 1;
      }
    } else if (ch === '*') src += '[^/]*';
    else if (ch === '?') src += '[^/]';
    else src += escapeRe(ch);
  }
  return new RegExp(`^${src}$`);
}

export function matchesAny(rel: string, globs: RegExp[]): boolean {
  return globs.some((re) => re.test(rel));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collapses whitespace and cuts to `max` characters with an ellipsis. */
export function shorten(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Lines `from..to` (1-based, inclusive) of a split file, shortened for a finding. */
export function excerptLines(lines: string[], from: number, to: number, max = 120): string {
  return shorten(lines.slice(Math.max(0, from - 1), Math.max(from, to)).join(' '), max);
}
