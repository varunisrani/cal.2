// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { familyOf, scanText, wordId, type Family } from './scan';

const tokens = (text: string, family: Family = 'c') => scanText(text, family).tokens.ids;
const lineNos = (text: string, family: Family = 'c') => scanText(text, family).lines.lines;
const prose = (text: string, family: Family = 'c') => scanText(text, family).prose.ids;
const words = (...list: string[]) => list.map(wordId);

describe('familyOf', () => {
  it('maps extensions to comment families', () => {
    expect(familyOf('ts')).toBe('c');
    expect(familyOf('swift')).toBe('c');
    expect(familyOf('py')).toBe('hash');
    expect(familyOf('yml')).toBe('hash');
    expect(familyOf('html')).toBe('markup');
    expect(familyOf('md')).toBe('markdown');
    expect(familyOf('png')).toBeNull();
  });
});

describe('scanText tokens', () => {
  it('ignores whitespace, so reformatting gives the same tokens', () => {
    const a = 'function add(a,b){return a+b}';
    const b = 'function add(\n  a,\n  b,\n) {\n  return a + b;\n}\n';
    expect(tokens(b)).toEqual(tokens(a));
  });

  it('keys strings by content, so quote style does not matter', () => {
    expect(tokens(`const s = "hello there";`)).toEqual(tokens(`const s = 'hello there'`));
    expect(tokens('const s = `hello there`')).toEqual(tokens(`const s = 'hello there'`));
  });

  it('strips // and /* */ comments in the c family', () => {
    const plain = 'let total = price * count';
    expect(tokens('let total /* inline */ = price // trailing\n * count')).toEqual(tokens(plain));
  });

  it('strips # comments in the hash family but not ${#x}', () => {
    expect(tokens('total = price  # why\n', 'hash')).toEqual(tokens('total = price', 'hash'));
    expect(tokens('echo ${#items}', 'hash')).toHaveLength(
      tokens('echo ${ items}', 'hash').length + 1,
    );
  });

  it('strips <!-- --> comments in markup and markdown', () => {
    expect(tokens('<p>hi<!-- note --></p>', 'markup')).toEqual(tokens('<p>hi</p>', 'markup'));
    expect(tokens('Some text <!-- hidden -->here', 'markdown')).toEqual(
      tokens('Some text here', 'markdown'),
    );
  });

  it('keeps comment markers inside strings', () => {
    expect(tokens(`const url = 'http://x.test/a'; next()`)).toHaveLength(7);
  });

  it('treats triple-quoted and template strings as one token across lines', () => {
    expect(tokens('x = """one\ntwo"""\ny', 'hash')).toHaveLength(4);
    expect(tokens('x = `one\ntwo`\ny')).toHaveLength(4);
  });

  it('ends an unterminated plain string at the line break', () => {
    expect(tokens(`a = 'oops\nb = 2`)).toEqual(tokens(`a = 'oops'\nb = 2`));
  });

  it('flags identifiers, numbers and strings as content, not punctuation or bare tags', () => {
    expect(scanText("f(x, 'a b')\n</div>", 'c').tokens.content).toEqual([
      1, 0, 1, 0, 1, 0, 0, 0, 0, 0,
    ]);
  });

  it('records the line of every token', () => {
    expect(scanText('a\n/* x\ny */ b\n\nc', 'c').tokens.lines).toEqual([1, 3, 5]);
  });
});

describe('scanText meaningful lines', () => {
  it('skips blank, comment-only, bracket-only and import lines', () => {
    const src = [
      "import { a } from 'a';", // 1
      '', // 2
      '// a comment', // 3
      'const x = a(1);', // 4
      '  });', // 5
      'package com.example.app', // 6
      '@testable import Thing', // 7
      'from os import path', // 8
      "export { b } from './b';", // 9
      "} from './c';", // 10
      'return x', // 11
      '</div>', // 12
      '<div className="row">', // 13
    ].join('\n');
    expect(lineNos(src)).toEqual([4, 11, 13]);
  });

  it('collapses whitespace inside a line', () => {
    const a = scanText('const   x =  1', 'c').lines.ids;
    const b = scanText('const x = 1', 'c').lines.ids;
    expect(a).toEqual(b);
  });
});

describe('scanText prose', () => {
  it('takes words from comments and strings with spaces', () => {
    expect(prose(`// Count the Meals\nconst s = 'Log a meal'; const k = 'key_name';`)).toEqual(
      words('count', 'the', 'meals', 'log', 'a', 'meal'),
    );
  });

  it('drops strings on import lines', () => {
    expect(prose(`import x from 'some module';\nconst a = 'real copy';`)).toEqual(
      words('real', 'copy'),
    );
  });

  it('takes every word of Markdown and text files, comments included', () => {
    expect(prose('# Title\nHello, World! <!-- note -->', 'markdown')).toEqual(
      words('title', 'hello', 'world', 'note'),
    );
    expect(prose('plain text 42', 'plain')).toEqual(words('plain', 'text', '42'));
  });

  it('takes text outside tags and attribute strings with spaces in markup', () => {
    expect(prose('<p class="a">Snap your plate</p><img alt="a big salad">', 'markup')).toEqual(
      words('snap', 'your', 'plate', 'a', 'big', 'salad'),
    );
  });
});
