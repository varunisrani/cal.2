import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GAUGE_ARC, GAUGE_DASHES, GAUGE_STROKE, Gauge, gaugeSweep } from './Gauge';

afterEach(cleanup);

/** The text a screen reader reaches inside `root`: every text node outside aria-hidden parts. */
function spokenText(root: Element): string[] {
  const texts: string[] = [];
  const walk = (node: Node) => {
    if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) texts.push(text);
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return texts;
}

/** Renders a gauge and returns its fill and its reveal arc (null when nothing is drawn). */
function drawGauge(amount: number, goal: number) {
  render(
    <Gauge
      data-ui="test.gauge"
      amount={amount}
      goal={goal}
      heading="Calories"
      value="1,200"
      status="800 left"
    />,
  );
  const gauge = screen.getByRole('group', { name: 'Calories' });
  const fill = gauge.querySelector('[data-ui="test.gauge.fill"]');
  const maskId = fill?.getAttribute('mask')?.match(/^url\(#(.+)\)$/)?.[1];
  const reveal = maskId ? document.getElementById(maskId)?.querySelector('path') : null;
  return { gauge, fill, reveal: reveal ?? null };
}

/** The sweep the reveal arc draws, in degrees: its dash length over a path measured in degrees. */
function sweepOf(reveal: Element | null): number {
  if (!(reveal instanceof SVGElement)) throw new Error('no reveal arc');
  expect(reveal).toHaveAttribute('pathLength', '180');
  const [dash, gap] = reveal.style.strokeDasharray.split(' ').map(Number);
  expect(gap).toBe(180);
  return dash ?? Number.NaN;
}

describe('gaugeSweep', () => {
  it('sweeps 180° times the share of the goal', () => {
    expect(gaugeSweep(1200, 2000)).toBe(108);
    expect(gaugeSweep(500, 2000)).toBe(45);
    expect(gaugeSweep(0, 2000)).toBe(0);
  });

  it('stays full past the goal and never runs backwards', () => {
    expect(gaugeSweep(2500, 2000)).toBe(180);
    expect(gaugeSweep(2000, 2000)).toBe(180);
    expect(gaugeSweep(-50, 2000)).toBe(0);
    expect(gaugeSweep(Number.NaN, 2000)).toBe(0);
  });

  it('has no sweep at all without a goal', () => {
    expect(gaugeSweep(1200, 0)).toBeNull();
    expect(gaugeSweep(1200, -10)).toBeNull();
    expect(gaugeSweep(1200, Number.NaN)).toBeNull();
  });
});

describe('Gauge', () => {
  it('sweeps 108° at 1 200 of 2 000', () => {
    const { fill, reveal } = drawGauge(1200, 2000);
    expect(fill).not.toBeNull();
    expect(sweepOf(reveal)).toBe(108);
  });

  it('stays full at 2 500 of 2 000', () => {
    const { reveal } = drawGauge(2500, 2000);
    expect(sweepOf(reveal)).toBe(180);
  });

  it('draws an empty fill at zero, ready to grow', () => {
    const { fill, reveal } = drawGauge(0, 2000);
    expect(fill).not.toBeNull();
    expect(sweepOf(reveal)).toBe(0);
  });

  it('draws no fill when the goal is 0', () => {
    const { gauge, fill } = drawGauge(1200, 0);
    expect(fill).toBeNull();
    expect(gauge.querySelector('mask')).toBeNull();
    // The track is still there.
    expect(gauge.querySelectorAll('path')).toHaveLength(1);
  });

  it('draws the upper half circle from its left end clockwise to its right end', () => {
    // Box 240 × 120, stroke 14: radius 113 around (120, 120), the middle of the bottom edge.
    expect(GAUGE_ARC).toBe('M 7 120 A 113 113 0 0 1 233 120');
    const { gauge, fill, reveal } = drawGauge(1200, 2000);
    expect(gauge.querySelector('svg')).toHaveAttribute('viewBox', '0 0 240 120');
    for (const arc of [...gauge.querySelectorAll('path'), reveal]) {
      expect(arc).toHaveAttribute('d', GAUGE_ARC);
    }
    expect(fill).toHaveAttribute('stroke-width', String(GAUGE_STROKE));
  });

  it('draws the track and the fill with the same dashes, 4 drawn and 6 left out', () => {
    const { gauge, fill } = drawGauge(1200, 2000);
    expect(GAUGE_DASHES).toBe('4 6');
    const track = gauge.querySelector('path');
    expect(track).toHaveAttribute('stroke-dasharray', '4 6');
    expect(fill).toHaveAttribute('stroke-dasharray', '4 6');
    // Flat ends: no line cap is set, and SVG's default is butt.
    expect(track).not.toHaveAttribute('stroke-linecap');
    expect(fill).not.toHaveAttribute('stroke-linecap');
  });

  it('reads out exactly the heading, value and status it shows', () => {
    const { gauge } = drawGauge(1200, 2000);
    expect(gauge).toHaveAttribute('data-ui', 'test.gauge');
    expect(within(gauge).getByText('1,200')).toHaveAttribute('data-ui', 'test.gauge.value');
    expect(within(gauge).getByText('800 left')).toHaveAttribute('data-ui', 'test.gauge.status');
    expect(spokenText(gauge)).toEqual(['Calories', '1,200', '800 left']);
  });

  it('keeps the drawing away from screen readers', () => {
    const { gauge } = drawGauge(1200, 2000);
    const drawing = gauge.querySelector('svg');
    expect(drawing).toHaveAttribute('aria-hidden', 'true');
    expect(drawing).toHaveAttribute('focusable', 'false');
  });

  it('follows a new value without remounting the drawing', () => {
    const view = render(
      <Gauge data-ui="test.gauge" amount={500} goal={2000} heading="Calories" value="500" />,
    );
    const before = view.container.querySelector('svg');
    view.rerender(
      <Gauge data-ui="test.gauge" amount={1500} goal={2000} heading="Calories" value="1,500" />,
    );
    expect(view.container.querySelector('svg')).toBe(before);
    const reveal = view.container.querySelector('mask path');
    expect(sweepOf(reveal)).toBe(135);
    expect(spokenText(view.container)).toEqual(['Calories', '1,500']);
  });

  it('gives each gauge its own reveal, so two on a page never share one', () => {
    render(
      <>
        <Gauge data-ui="test.a" amount={1} goal={2} heading="A" value="1" />
        <Gauge data-ui="test.b" amount={1} goal={4} heading="B" value="1" />
      </>,
    );
    const masks = [...document.querySelectorAll('mask')].map((mask) => mask.id);
    expect(new Set(masks).size).toBe(2);
    const fills = document.querySelectorAll('[data-ui$=".fill"]');
    expect(fills[0]).toHaveAttribute('mask', `url(#${masks[0]})`);
    expect(fills[1]).toHaveAttribute('mask', `url(#${masks[1]})`);
  });
});
