import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownReply, readBlocks, readInline } from './markdown';

function draw(text: string): HTMLElement {
  render(<MarkdownReply text={text} />);
  return document.querySelector('[data-ui="coach.reply"]') as HTMLElement;
}

describe('MarkdownReply: safety', () => {
  it('shows <script> as text and never makes markup from a reply', () => {
    const reply = draw('Try this: <script>alert("hi")</script> and <img src=x onerror=alert(1)>');

    expect(reply.querySelector('script')).toBeNull();
    expect(reply.querySelector('img')).toBeNull();
    expect(reply).toHaveTextContent(
      'Try this: <script>alert("hi")</script> and <img src=x onerror=alert(1)>',
    );
  });

  it('shows [x](javascript:alert(1)) as plain text, with no link', () => {
    const reply = draw('Tap [x](javascript:alert(1)) now');

    expect(reply.querySelector('a')).toBeNull();
    expect(reply).toHaveTextContent('Tap [x](javascript:alert(1)) now');
  });

  it.each([
    '[mail](mailto:coach@example.com)',
    '[data](data:text/html,hi)',
    '[relative](/settings)',
    '[bare](www.example.com)',
    '[spaced](https://example.com/a b)',
  ])('keeps %s as text: only http and https become links', (source) => {
    const reply = draw(source);
    expect(reply.querySelector('a')).toBeNull();
    expect(reply).toHaveTextContent(source);
  });
});

describe('MarkdownReply: blocks', () => {
  it('draws a numbered list and a code block, the code kept literal', () => {
    const reply = draw(
      [
        'Three steps:',
        '1. Weigh the rice',
        '2. Log it **cooked**',
        '3. Check the total',
        '',
        '```text',
        'rice **200 g** = 260 kcal',
        '  _indented_',
        '```',
      ].join('\n'),
    );

    const list = reply.querySelector('ol') as HTMLElement;
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Weigh the rice',
      'Log it cooked',
      'Check the total',
    ]);
    expect(items.map((item) => item.getAttribute('value'))).toEqual(['1', '2', '3']);

    const code = reply.querySelector('pre > code') as HTMLElement;
    expect(code.textContent).toBe('rice **200 g** = 260 kcal\n  _indented_');
    expect(code.querySelector('strong, em')).toBeNull();
  });

  it('draws bold inside a bullet', () => {
    const reply = draw('- **Protein:** 120 g\n* Carbs: 200 g\n+ Fat: 60 g');

    const list = reply.querySelector('ul') as HTMLElement;
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]!.querySelector('strong')).toHaveTextContent('Protein:');
    expect(items[0]).toHaveTextContent('Protein: 120 g');
  });

  it('draws a list as a list and opens an https link in a new tab (ACC-I4-1)', () => {
    const reply = draw(
      'Good sources:\n- Eggs\n- Lentils, see [the USDA table](https://fdc.nal.usda.gov/food-search)',
    );

    expect(within(reply.querySelector('ul') as HTMLElement).getAllByRole('listitem')).toHaveLength(
      2,
    );
    const link = screen.getByRole('link', { name: 'the USDA table' });
    expect(link).toHaveAttribute('href', 'https://fdc.nal.usda.gov/food-search');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('draws three heading sizes under the page’s own headings, and #### as text', () => {
    const reply = draw('# Today\n## Meals\n### Lunch\n#### Too deep\n#nospace');

    expect(screen.getByRole('heading', { level: 3, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Meals' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 5, name: 'Lunch' })).toBeInTheDocument();
    expect(reply.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(3);
    expect(reply.querySelector('p')).toHaveTextContent('#### Too deep#nospace');
  });

  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    const reply = draw('First line\nsecond line\n\n\nNew paragraph');

    const paragraphs = reply.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.querySelectorAll('br')).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent('First linesecond line');
    expect(paragraphs[1]).toHaveTextContent('New paragraph');
  });

  it('takes the rest of the reply as code when a fence never closes', () => {
    const reply = draw('Here:\n```\nline one\n\nline three');
    expect(reply.querySelector('pre > code')?.textContent).toBe('line one\n\nline three');
  });
});

describe('readBlocks', () => {
  it('reads each block kind, gathering neighbouring lines of one kind', () => {
    expect(
      readBlocks('## Plan\r\nEat more\r\nprotein\n- a\n- b\n1. one\n3. three\n```\nx\n```\nEnd ##'),
    ).toEqual([
      { kind: 'heading', level: 2, text: 'Plan' },
      { kind: 'paragraph', lines: ['Eat more', 'protein'] },
      { kind: 'list', ordered: false, items: [{ text: 'a' }, { text: 'b' }] },
      {
        kind: 'list',
        ordered: true,
        items: [
          { number: 1, text: 'one' },
          { number: 3, text: 'three' },
        ],
      },
      { kind: 'code', text: 'x' },
      { kind: 'paragraph', lines: ['End ##'] },
    ]);
  });

  it('keeps a heading’s closing hashes out of its text and a marker with nothing after it as text', () => {
    expect(readBlocks('# Summary ##\n-\n1.')).toEqual([
      { kind: 'heading', level: 1, text: 'Summary' },
      { kind: 'paragraph', lines: ['-', '1.'] },
    ]);
  });
});

describe('readInline', () => {
  it('reads bold, italic with * and _, inline code and links, nesting styles', () => {
    expect(
      readInline('**Big *and* bold** then _soft_, `code **raw**` and [**site**](http://a.example)'),
    ).toEqual([
      {
        kind: 'strong',
        children: [
          { kind: 'text', text: 'Big ' },
          { kind: 'em', children: [{ kind: 'text', text: 'and' }] },
          { kind: 'text', text: ' bold' },
        ],
      },
      { kind: 'text', text: ' then ' },
      { kind: 'em', children: [{ kind: 'text', text: 'soft' }] },
      { kind: 'text', text: ', ' },
      { kind: 'code', text: 'code **raw**' },
      { kind: 'text', text: ' and ' },
      {
        kind: 'link',
        href: 'http://a.example/',
        children: [{ kind: 'strong', children: [{ kind: 'text', text: 'site' }] }],
      },
    ]);
  });

  it.each([
    ['snake_case_name', 'an underscore inside a word'],
    ['2 * 3 * 4 = 24', 'stars next to spaces'],
    ['**not closed', 'an unclosed pair'],
    ['a lone ` tick', 'an unclosed tick'],
    ['** spaced **', 'a pair that opens on a space'],
    ['[label] (no link)', 'a bracket not followed by an address'],
  ])('keeps %s as text (%s)', (source) => {
    expect(readInline(source)).toEqual([{ kind: 'text', text: source }]);
  });

  it('keeps balanced parentheses inside a link address', () => {
    expect(readInline('[pasta](https://en.example.org/wiki/Pasta_(food)).')).toEqual([
      {
        kind: 'link',
        href: 'https://en.example.org/wiki/Pasta_(food)',
        children: [{ kind: 'text', text: 'pasta' }],
      },
      { kind: 'text', text: '.' },
    ]);
  });
});
