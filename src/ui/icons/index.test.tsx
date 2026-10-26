import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ICON_NAMES, ICON_STROKE, Icon } from './index';

afterEach(cleanup);

const drawingOf = (name: (typeof ICON_NAMES)[number], label?: string) => {
  const { container } = render(<Icon name={name} label={label} />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error(`no svg for ${name}`);
  return svg;
};

describe('Icon', () => {
  it.each(ICON_NAMES)('draws %s as decoration hidden from screen readers', (name) => {
    const svg = drawingOf(name);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).not.toHaveAttribute('role');
    expect(svg).not.toHaveAttribute('aria-label');
    expect(svg).toHaveAttribute('data-icon', name);
    expect(svg.children.length).toBeGreaterThan(0);
  });

  it('is a named image when it has a label', () => {
    render(<Icon name="info" label="About" />);
    const image = screen.getByRole('img', { name: 'About' });
    expect(image).not.toHaveAttribute('aria-hidden');
  });

  it('stays hidden with an empty label', () => {
    const svg = drawingOf('info', '');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('draws every icon in one stroke style on the current colour, sized to the text', () => {
    for (const name of ICON_NAMES) {
      const svg = drawingOf(name);
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg).toHaveAttribute('stroke-width', String(ICON_STROKE));
      expect(svg).toHaveAttribute('stroke-linecap', 'round');
      expect(svg).toHaveAttribute('stroke-linejoin', 'round');
      expect(svg).toHaveAttribute('width', '1em');
      // No part brings its own colour or line weight.
      for (const part of svg.querySelectorAll('*')) {
        expect(part).not.toHaveAttribute('stroke');
        expect(part).not.toHaveAttribute('fill');
        expect(part).not.toHaveAttribute('stroke-width');
      }
      cleanup();
    }
  });

  it('takes a size', () => {
    const { container } = render(<Icon name="plus" size={20} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '20');
  });

  it('has a different drawing for every name', () => {
    const drawings = ICON_NAMES.map((name) => {
      const markup = drawingOf(name).innerHTML;
      cleanup();
      return markup;
    });
    expect(new Set(drawings).size).toBe(ICON_NAMES.length);
  });

  it('includes the set the screens ask for', () => {
    expect(ICON_NAMES).toEqual(
      expect.arrayContaining([
        'plus',
        'camera',
        'photos',
        'barcode',
        'text',
        'pencil',
        'clock',
        'drop',
        'hourglass',
        'scale',
        'chart',
        'chat',
        'gear',
        'trash',
        'heart',
        'chevron-left',
        'chevron-right',
        'chevron-up',
        'chevron-down',
        'close',
        'check',
        'info',
        'copy',
        'sort',
      ]),
    );
  });
});
