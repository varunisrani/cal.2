import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { common } from '../../../i18n/en/common';
import { scan } from '../../../i18n/en/scan';
import { fixedClock } from '../../../lib/clock';
import type { Scanner } from '../../../services/barcode/decoder';
import type {
  BarcodeService,
  BarcodeState,
  LookupFailureKind,
} from '../../../services/barcode/lookup';
import { ServicesProvider, type Services } from '../../../services/context';
import { FACTORY_NOW } from '../../../test/factories';
import { LookupOverlay } from './LookupOverlay';

const words = scan.scan;
const CODE = '0712345000108';

/** A barcode service whose state the test sets; `armLabelScan` gives `armed`. */
function standIn(start: BarcodeState, armed: string | null = CODE) {
  let state = start;
  const listeners = new Set<() => void>();
  const service = {
    getSnapshot: () => state,
    subscribe: (onChange: () => void) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    lookup: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(),
    retry: vi.fn(() => Promise.resolve()),
    armLabelScan: vi.fn(() => armed),
    takeArmedLabel: vi.fn(() => null),
    clearArmedLabel: vi.fn(),
    scanner: {} as Scanner,
  } satisfies BarcodeService;
  const set = (next: BarcodeState) =>
    act(() => {
      state = next;
      for (const listener of [...listeners]) listener();
    });
  return { service, set };
}

function mount(barcode: BarcodeService) {
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
    barcode,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  };
  const onScanLabel = vi.fn();
  render(
    <ServicesProvider services={services}>
      <LookupOverlay onScanLabel={onScanLabel} />
    </ServicesProvider>,
  );
  return { onScanLabel };
}

const failed = (failure: LookupFailureKind): BarcodeState => ({
  phase: 'failed',
  code: CODE,
  failure,
});
const dialog = () => within(screen.getByRole('alertdialog', { name: words.failedTitle }));

describe('LookupOverlay', () => {
  it('shows nothing while no lookup runs', () => {
    mount(standIn({ phase: 'idle' }).service);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows a spinner and Cancel while looking, and Cancel stops the lookup', () => {
    const { service } = standIn({ phase: 'looking', code: CODE });
    mount(service);

    const layer = within(screen.getByRole('dialog', { name: words.looking }));
    expect(layer.getByRole('status')).toHaveTextContent(words.looking);
    const cancel = layer.getByRole('button', { name: common.common.cancel });
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);

    expect(service.cancel).toHaveBeenCalledOnce();
  });

  it.each(['notFound', 'noNutrition', 'keyRefused'] as const)(
    'offers Scan label for %s, which holds the code and opens the camera (ACC-D20-2)',
    (failure) => {
      const { service } = standIn(failed(failure));
      const { onScanLabel } = mount(service);

      expect(dialog().getByText(words.failure[failure])).toBeVisible();
      fireEvent.click(dialog().getByRole('button', { name: words.scanLabel }));

      expect(service.armLabelScan).toHaveBeenCalledOnce();
      expect(onScanLabel).toHaveBeenCalledOnce();
      expect(service.retry).not.toHaveBeenCalled();
    },
  );

  it('opens no camera when nothing could be held', () => {
    const { service } = standIn(failed('notFound'), null);
    const { onScanLabel } = mount(service);

    fireEvent.click(dialog().getByRole('button', { name: words.scanLabel }));

    expect(onScanLabel).not.toHaveBeenCalled();
  });

  it.each([
    'rateLimited',
    'unavailable',
    'unexpected',
    'offline',
    'timeout',
    'network',
    'generic',
  ] as const)('offers Retry and Cancel for %s, with its own message', (failure) => {
    const { service } = standIn(failed(failure));
    const { onScanLabel } = mount(service);

    expect(dialog().getByText(words.failure[failure])).toBeVisible();
    expect(dialog().queryByRole('button', { name: words.scanLabel })).toBeNull();
    fireEvent.click(dialog().getByRole('button', { name: common.common.retry }));

    expect(service.retry).toHaveBeenCalledOnce();
    expect(service.armLabelScan).not.toHaveBeenCalled();
    expect(onScanLabel).not.toHaveBeenCalled();
  });

  it('offers only Close for a code that is not digits', () => {
    const { service } = standIn(failed('invalid'));
    mount(service);

    expect(dialog().getByText(words.failure.invalid)).toBeVisible();
    expect(dialog().getAllByRole('button')).toHaveLength(1);
    fireEvent.click(dialog().getByRole('button', { name: common.common.close }));

    expect(service.cancel).toHaveBeenCalledOnce();
    expect(service.retry).not.toHaveBeenCalled();
  });

  it('cancels from the failure, and answers a new failure after a Retry', async () => {
    const { service, set } = standIn(failed('timeout'));
    mount(service);
    fireEvent.click(dialog().getByRole('button', { name: common.common.retry }));
    await set({ phase: 'looking', code: CODE });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await set(failed('offline'));

    fireEvent.click(dialog().getByRole('button', { name: common.common.cancel }));

    expect(service.cancel).toHaveBeenCalledOnce();
  });

  it('has a message of its own for every failure', () => {
    const messages = Object.values(words.failure);
    expect(new Set(messages).size).toBe(messages.length);
    expect(Object.keys(words.failure)).toHaveLength(11);
  });
});
