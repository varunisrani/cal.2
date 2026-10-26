/**
 * Turns one text file into three streams of integer ids, each id paired with its line:
 * - tokens: code tokens with comments and whitespace gone;
 * - lines: one id per meaningful line, built from that line's tokens;
 * - prose: lower-cased words from comments, string literals and document text.
 * Ids are string hashes, so the same text always gives the same id without a dictionary.
 */

export type Family = 'c' | 'hash' | 'markup' | 'markdown' | 'json' | 'plain';

const FAMILIES: Record<string, Family> = {
  ts: 'c',
  tsx: 'c',
  js: 'c',
  mjs: 'c',
  cjs: 'c',
  kt: 'c',
  kts: 'c',
  swift: 'c',
  css: 'c',
  gradle: 'c',
  strings: 'c',
  py: 'hash',
  sh: 'hash',
  yml: 'hash',
  yaml: 'hash',
  toml: 'hash',
  html: 'markup',
  xml: 'markup',
  md: 'markdown',
  json: 'json',
  txt: 'plain',
};

export const TEXT_EXTENSIONS = new Set(Object.keys(FAMILIES));

/** Product config files only feed the `--closest` ranking, never the gate. */
export const CONFIG_EXTENSIONS = new Set(['json', 'yml', 'yaml', 'toml']);

export function familyOf(ext: string): Family | null {
  return FAMILIES[ext] ?? null;
}

export interface Stream {
  ids: number[];
  lines: number[];
  /**
   * Tokens only: 1 for an identifier, number or string, 0 for punctuation and bare tag
   * names. A window with too little content (a table rule, a run of closing tags) is not code.
   */
  content?: number[];
}

export interface ScanResult {
  tokens: Stream;
  lines: Stream;
  prose: Stream;
}

// FNV-1a, cut to 30 bits so ids stay small integers. Each token kind gets its own seed.
const FNV_PRIME = 16777619;
const MASK = 0x3fffffff;
const SEED_WORD = 0x811c9dc5 | 0;
const SEED_STRING = 0x2a6b9c13 | 0;
const SEED_PUNCT = 0x5f3759df | 0;
const SEED_LINE = 0x1b873593 | 0;

const KIND_PUNCT = 0;
const KIND_WORD = 1;
const KIND_STRING = 2;

export function wordId(word: string): number {
  let h = SEED_WORD;
  for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), FNV_PRIME);
  return h & MASK;
}

function punctId(c: number): number {
  return Math.imul(SEED_PUNCT ^ c, FNV_PRIME) & MASK;
}

const ID_IMPORT = wordId('import');
const ID_PACKAGE = wordId('package');
const ID_USING = wordId('using');
const ID_FROM = wordId('from');
const ID_EXPORT = wordId('export');
const ID_COMMA = punctId(44);
const ID_LT = punctId(60);
const ID_SLASH = punctId(47);
const ID_GT = punctId(62);

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 13 || c === 11 || c === 12 || c === 0xa0 || c === 0xfeff;
}

function isWordStart(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36 || c >= 128;
}

function isWordPart(c: number): boolean {
  return isWordStart(c) || (c >= 48 && c <= 57);
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

function hasSpace(text: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10) return true;
  }
  return false;
}

export function scanText(text: string, family: Family): ScanResult {
  const tokIds: number[] = [];
  const tokLines: number[] = [];
  const tokKinds: number[] = [];
  const wordIds: number[] = [];
  const wordLines: number[] = [];
  // 1 when the word came from a string literal (dropped later on import lines).
  const wordFromString: number[] = [];

  const n = text.length;
  const cComments = family === 'c';
  const hashComments = family === 'hash';
  const markupComments = family === 'markup' || family === 'markdown';
  const wholeFileProse = family === 'markdown' || family === 'plain';
  const stringsAnywhere = family === 'c' || family === 'hash' || family === 'json';
  const backticks = family === 'c';
  const tripleQuotes = family === 'c' || family === 'hash';
  const markup = family === 'markup';

  const addWords = (start: number, end: number, startLine: number, fromString: number): void => {
    let line = startLine;
    let h = 0;
    let inWord = false;
    let wordLine = line;
    for (let i = start; i < end; i++) {
      let c = text.charCodeAt(i);
      if (c >= 65 && c <= 90) c += 32;
      if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
        if (!inWord) {
          inWord = true;
          h = SEED_WORD;
          wordLine = line;
        }
        h = Math.imul(h ^ c, FNV_PRIME);
      } else {
        if (inWord) {
          wordIds.push(h & MASK);
          wordLines.push(wordLine);
          wordFromString.push(fromString);
          inWord = false;
        }
        if (c === 10) line++;
      }
    }
    if (inWord) {
      wordIds.push(h & MASK);
      wordLines.push(wordLine);
      wordFromString.push(fromString);
    }
  };

  const countLines = (start: number, end: number): number => {
    let k = 0;
    for (let i = start; i < end; i++) if (text.charCodeAt(i) === 10) k++;
    return k;
  };

  const emit = (id: number, line: number, kind: number): void => {
    tokIds.push(id);
    tokLines.push(line);
    tokKinds.push(kind);
  };

  if (wholeFileProse) addWords(0, n, 1, 0);

  let line = 1;
  let inTag = false;
  let i = 0;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 10) {
      line++;
      i++;
      continue;
    }
    if (isSpace(c)) {
      i++;
      continue;
    }

    // Comments: stripped from the code tokens, kept as prose.
    if (cComments && c === 47) {
      const d = text.charCodeAt(i + 1);
      if (d === 47) {
        let end = text.indexOf('\n', i);
        if (end < 0) end = n;
        addWords(i + 2, end, line, 0);
        i = end;
        continue;
      }
      if (d === 42) {
        const close = text.indexOf('*/', i + 2);
        const end = close < 0 ? n : close;
        addWords(i + 2, end, line, 0);
        const stop = close < 0 ? n : close + 2;
        line += countLines(i, stop);
        i = stop;
        continue;
      }
    }
    // `#` starts a comment at the start of a line or after a space (`${#x}` is not one).
    const prev = i === 0 ? 10 : text.charCodeAt(i - 1);
    if (hashComments && c === 35 && (prev === 10 || isSpace(prev))) {
      let end = text.indexOf('\n', i);
      if (end < 0) end = n;
      addWords(i + 1, end, line, 0);
      i = end;
      continue;
    }
    if (markupComments && c === 60 && text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      const end = close < 0 ? n : close;
      if (!wholeFileProse) addWords(i + 4, end, line, 0);
      const stop = close < 0 ? n : close + 3;
      line += countLines(i, stop);
      i = stop;
      continue;
    }

    // String literals: one token each, keyed by content so quote style does not matter.
    if (
      (c === 34 || c === 39 || (c === 96 && backticks)) &&
      (stringsAnywhere || (markup && inTag))
    ) {
      const triple =
        tripleQuotes && c !== 96 && text.charCodeAt(i + 1) === c && text.charCodeAt(i + 2) === c;
      const startLine = line;
      let j = i + (triple ? 3 : 1);
      const contentStart = j;
      let contentEnd = n;
      let stop = n;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d === 92) {
          if (text.charCodeAt(j + 1) === 10) line++;
          j += 2;
          continue;
        }
        if (d === 10) {
          // Plain quotes end at the line break; template and triple strings span lines.
          if (!triple && c !== 96) {
            contentEnd = j;
            stop = j;
            break;
          }
          line++;
        } else if (
          d === c &&
          (!triple || (text.charCodeAt(j + 1) === c && text.charCodeAt(j + 2) === c))
        ) {
          contentEnd = j;
          stop = j + (triple ? 3 : 1);
          break;
        }
        j++;
      }
      if (j >= n) contentEnd = stop = n;
      let h = SEED_STRING;
      for (let k = contentStart; k < contentEnd; k++)
        h = Math.imul(h ^ text.charCodeAt(k), FNV_PRIME);
      emit(h & MASK, startLine, KIND_STRING);
      // Only strings with spaces are prose; keys, paths and URLs are not.
      if (hasSpace(text, contentStart, contentEnd)) {
        addWords(contentStart, contentEnd, startLine, 1);
      }
      i = stop;
      continue;
    }

    if (isWordStart(c) || isDigit(c)) {
      const start = i;
      let h = SEED_WORD;
      if (isDigit(c)) {
        // Numbers keep their dots and suffixes: 1.5e3, 0x1F, 10_000L.
        while (i < n) {
          const d = text.charCodeAt(i);
          if (!(isWordPart(d) || d === 46)) break;
          h = Math.imul(h ^ d, FNV_PRIME);
          i++;
        }
      } else {
        while (i < n) {
          const d = text.charCodeAt(i);
          if (!isWordPart(d)) break;
          h = Math.imul(h ^ d, FNV_PRIME);
          i++;
        }
      }
      emit(h & MASK, line, KIND_WORD);
      if (markup && !inTag) addWords(start, i, line, 0);
      continue;
    }

    // Punctuation, one character per token. Semicolons and a comma before a closing
    // bracket are dropped, so a formatter adding them cannot hide a copy.
    if (markup) {
      if (c === 60) {
        const d = text.charCodeAt(i + 1);
        if (isWordStart(d) || d === 47 || d === 33 || d === 63) inTag = true;
      } else if (c === 62) {
        inTag = false;
      }
    }
    i++;
    if (c === 59) continue;
    const last = tokIds.length - 1;
    if (
      (c === 41 || c === 93 || c === 125) &&
      last >= 0 &&
      tokIds[last] === ID_COMMA &&
      tokKinds[last] === KIND_PUNCT
    ) {
      tokIds.pop();
      tokLines.pop();
      tokKinds.pop();
    }
    emit(punctId(c), line, KIND_PUNCT);
  }

  // Meaningful lines: a line's tokens hashed together. Lines with no word or string
  // (only brackets and punctuation, only bare tags like `</div>`, or only comments) and
  // import/package lines are left out.
  const content: number[] = new Array<number>(tokIds.length).fill(0);
  const lineIds: number[] = [];
  const lineNos: number[] = [];
  const importLines = new Set<number>();
  let a = 0;
  while (a < tokIds.length) {
    const ln = tokLines[a]!;
    let b = a;
    let words = 0;
    while (b < tokIds.length && tokLines[b] === ln) b++;
    for (let k = a; k < b; k++) {
      if (tokKinds[k] !== KIND_PUNCT && !isBareTagName(tokIds, tokKinds, k, a, b)) {
        content[k] = 1;
        words++;
      }
    }
    if (words > 0) {
      if (isImportLine(tokIds, tokKinds, a, b)) {
        importLines.add(ln);
      } else {
        let h = SEED_LINE;
        for (let k = a; k < b; k++) h = Math.imul(h ^ tokIds[k]!, FNV_PRIME);
        lineIds.push(h & MASK);
        lineNos.push(ln);
      }
    }
    a = b;
  }

  let proseIds = wordIds;
  let proseLines = wordLines;
  if (importLines.size > 0) {
    proseIds = [];
    proseLines = [];
    for (let k = 0; k < wordIds.length; k++) {
      if (wordFromString[k] === 1 && importLines.has(wordLines[k]!)) continue;
      proseIds.push(wordIds[k]!);
      proseLines.push(wordLines[k]!);
    }
  }

  return {
    tokens: { ids: tokIds, lines: tokLines, content },
    lines: { ids: lineIds, lines: lineNos },
    prose: { ids: proseIds, lines: proseLines },
  };
}

/** A tag name in `<name>`, `</name>` or `<name/>`: markup's version of a bracket. */
function isBareTagName(ids: number[], kinds: number[], k: number, a: number, b: number): boolean {
  if (kinds[k] !== KIND_WORD) return false;
  const opens =
    (k - 1 >= a && ids[k - 1] === ID_LT) ||
    (k - 2 >= a && ids[k - 1] === ID_SLASH && ids[k - 2] === ID_LT);
  const closes =
    (k + 1 < b && ids[k + 1] === ID_GT) ||
    (k + 2 < b && ids[k + 1] === ID_SLASH && ids[k + 2] === ID_GT);
  return opens && closes;
}

/**
 * `import x`, `package x`, `using x`, `@testable import x`, `from a import b`,
 * `export { x } from 'y'` and the closing `} from 'y'` of a long import say where code comes
 * from, not what it does.
 */
function isImportLine(ids: number[], kinds: number[], a: number, b: number): boolean {
  let first = -1;
  let second = -1;
  for (let k = a; k < b; k++) {
    if (kinds[k] !== KIND_WORD) continue;
    if (first < 0) first = ids[k]!;
    else {
      second = ids[k]!;
      break;
    }
  }
  if (first === ID_IMPORT || first === ID_PACKAGE || first === ID_USING) return true;
  if (second === ID_IMPORT && kinds[a] === KIND_PUNCT) return true;
  if (first === ID_FROM) {
    for (let k = a; k < b; k++) if (kinds[k] === KIND_WORD && ids[k] === ID_IMPORT) return true;
  }
  if (first === ID_FROM || first === ID_EXPORT) {
    return (
      b - a >= 2 &&
      ids[b - 2] === ID_FROM &&
      kinds[b - 2] === KIND_WORD &&
      kinds[b - 1] === KIND_STRING
    );
  }
  return false;
}
