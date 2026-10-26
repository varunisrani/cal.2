import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { capture } from '../../i18n/en/capture';
import { common } from '../../i18n/en/common';
import { enPartitions } from '../../i18n/en';
import { lintCatalogue } from '../../i18n/lint';
import { fixedClock } from '../../lib/clock';
import type { AnalysisService } from '../../services/analysis';
import { ServicesProvider, type Services } from '../../services/context';
import { FACTORY_NOW } from '../../test/factories';
import { advance, useFakeTime } from '../../test/time';
import { DescribeSheet, EXAMPLE_MS } from './DescribeSheet';

const words = capture.capture.describe;
const EXAMPLES = [words.example1, words.example2, words.example3, words.example4];

/** A stand-in for the analysis service: only `start` is used here. */
function standIn(): AnalysisService {
  return {
    getSnapshot: () => ({ phase: 'idle' }),
    subscribe: () => () => undefined,
    start: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(() => Promise.resolve()),
    retry: vi.fn(() => Promise.resolve()),
    closeReview: vi.fn(() => Promise.resolve()),
    restore: vi.fn(() => Promise.resolve()),
  };
}

function mount(open = true) {
  const analysis = standIn();
  const services: Services = {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
    onboarding: { complete: vi.fn() },
    aiSetup: {
      saveChoice: vi.fn(),
      savedKeyMask: vi.fn(),
      setTermsAccepted: vi.fn(),
      setUpLater: vi.fn(),
    },
    planBuilder: { build: vi.fn() },
    analysis,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  };
  const onClose = vi.fn();
  const view = render(
    <ServicesProvider services={services}>
      <DescribeSheet open={open} onClose={onClose} />
    </ServicesProvider>,
  );
  const reopen = (next: boolean) =>
    view.rerender(
      <ServicesProvider services={services}>
        <DescribeSheet open={next} onClose={onClose} />
      </ServicesProvider>,
    );
  return { analysis, onClose, reopen };
}

const sheet = () => within(screen.getByRole('dialog', { name: words.title }));
const field = () => sheet().getByLabelText(words.label) as HTMLTextAreaElement;
const analyseButton = () => sheet().getByRole('button', { name: capture.capture.analyse });
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
const wait = (ms: number) => act(() => advance(ms));

describe('DescribeSheet', () => {
  it('opens with a three-line field that has focus', () => {
    mount();

    expect(field().tagName).toBe('TEXTAREA');
    expect(field()).toHaveAttribute('rows', '3');
    expect(field()).toHaveValue('');
    expect(field()).toHaveFocus();
  });

  it('renders nothing while closed', () => {
    mount(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a new example meal every 2 s while the field is empty, all four in turn', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    mount();

    expect(field()).toHaveAttribute('placeholder', EXAMPLES[0]);
    wait(EXAMPLE_MS - 1);
    expect(field()).toHaveAttribute('placeholder', EXAMPLES[0]);
    wait(1);
    expect(field()).toHaveAttribute('placeholder', EXAMPLES[1]);
    wait(EXAMPLE_MS);
    expect(field()).toHaveAttribute('placeholder', EXAMPLES[2]);
    wait(EXAMPLE_MS);
    expect(field()).toHaveAttribute('placeholder', EXAMPLES[3]);
    wait(EXAMPLE_MS);
    expect(field()).toHaveAttribute('placeholder', EXAMPLES[0]);
    expect(new Set(EXAMPLES).size).toBe(4);
  });

  it('stops the examples once typing starts, and goes on when the field is emptied', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    mount();
    wait(EXAMPLE_MS);
    expect(field()).toHaveAttribute('placeholder', EXAMPLES[1]);

    type('p');
    wait(EXAMPLE_MS * 3);
    expect(field()).toHaveAttribute('placeholder', EXAMPLES[1]);

    type('');
    wait(EXAMPLE_MS);
    expect(field()).toHaveAttribute('placeholder', EXAMPLES[2]);
  });

  it('keeps Analyse off while the text is only spaces and line breaks', () => {
    mount();
    expect(analyseButton()).toBeDisabled();

    type('  \n\t  \n');
    expect(analyseButton()).toBeDisabled();

    type('  soup ');
    expect(analyseButton()).toBeEnabled();
  });

  it('starts a text analysis with the trimmed text and closes', () => {
    const { analysis, onClose } = mount();

    type('  two eggs and toast\n ');
    fireEvent.click(analyseButton());

    expect(analysis.start).toHaveBeenCalledTimes(1);
    expect(analysis.start).toHaveBeenCalledWith('text', { text: 'two eggs and toast' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Cancel without starting anything, and only then', () => {
    const { analysis, onClose } = mount();
    type('soup');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(sheet().getByRole('button', { name: common.common.cancel }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(analysis.start).not.toHaveBeenCalled();
  });

  it('starts empty each time it opens', () => {
    const { reopen } = mount();
    type('soup');

    reopen(false);
    reopen(true);

    expect(field()).toHaveValue('');
    expect(field()).toHaveAttribute('placeholder', EXAMPLES[0]);
  });

  it('draws its words from a catalogue partition that passes the lint', () => {
    mount();
    expect(lintCatalogue(enPartitions)).toEqual([]);
    expect(sheet().getByText(words.label)).toBeInTheDocument();
  });
});
