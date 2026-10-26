import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon, type IconName } from './index';

afterEach(cleanup);

/** Every icon the phase row asks for (the chevrons in four directions). */
const REQUIRED: readonly IconName[] = [
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
  'chevronLeft',
  'chevronRight',
  'chevronUp',
  'chevronDown',
  'close',
  'check',
  'info',
  'copy',
  'sort',
];

const SHAPE_TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'ellipse']);

describe('Icon', () => {
  it('has every icon of the set, each name once', () => {
    expect(ICON_NAMES).toEqual(expect.arrayContaining([...REQUIRED]));
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it.each(ICON_NAMES)('draws %s on the 24 grid in currentColor, hidden when unlabelled', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('data-icon', name);

    const shapes = [...(svg?.querySelectorAll('*') ?? [])];
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(SHAPE_TAGS).toContain(shape.tagName);
      // No colour of its own: everything follows the text colour.
      expect(shape.getAttribute('stroke')).toBeNull();
      expect(shape.getAttribute('fill')).toBeNull();
      expect(shape.getAttribute('style')).toBeNull();
    }
  });

  it('becomes a named image when given a label', () => {
    render(<Icon name="trash" label="Delete" />);
    const image = screen.getByRole('img', { name: 'Delete' });
    expect(image).not.toHaveAttribute('aria-hidden');
  });

  it('stays hidden with an empty label', () => {
    const { container } = render(<Icon name="info" label="" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('takes a size in px or any CSS length', () => {
    const { container } = render(
      <>
        <Icon name="plus" />
        <Icon name="plus" size={18} />
        <Icon name="plus" size="1.25em" className="extra" />
      </>,
    );
    const [standard, small, relative] = [...container.querySelectorAll('svg')];
    expect(standard).toHaveAttribute('width', '24');
    expect(small).toHaveAttribute('height', '18');
    expect(relative).toHaveAttribute('width', '1.25em');
    expect(relative).toHaveClass('extra');
  });
});
