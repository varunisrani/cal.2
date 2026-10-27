import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { enPartitions } from '../../../i18n/en';
import { scan } from '../../../i18n/en/scan';
import { lintCatalogue } from '../../../i18n/lint';
import { fixedClock } from '../../../lib/clock';
import { err, ok, type Result } from '../../../lib/result';
import type { CameraFailure, ScanCamera, Scanner } from '../../../services/barcode/decoder';
import type { BarcodeService } from '../../../services/barcode/lookup';
import { ServicesProvider, type Services } from '../../../services/context';
import { FACTORY_NOW } from '../../../test/factories';
import { ScanSheet } from './ScanSheet';

const words = scan.scan;
const CODE = '4006381333931';

type Opening = Result<ScanCamera, CameraFailure>;

/** A camera that records what is asked of it. */
function fakeCamera(canFocus = true) {
  return {
    stream: { id: 'back-camera' } as unknown as MediaStream,
    canFocus,
    focusAt: vi.fn(),
    stop: vi.fn(),
  } satisfies ScanCamera;
}

/**
 * A scanner whose camera opens when the test says so, and whose frame reading hands on the codes
 * the test sends (as many as it likes: the sheet must take only the first).
 */
function fakeScanner() {
  let answer: (opening: Opening) => void = () => undefined;
  let watching: { onCode: (code: string) => void; onBroken?: () => void } | undefined;
  const stopWatching = vi.fn();
  const scanner = {
    openCamera: vi.fn(() => new Promise<Opening>((resolve) => (answer = resolve))),
    watch: vi.fn(
      (_video: HTMLVideoElement, onCode: (code: string) => void, onBroken?: () => void) => {
        watching = { onCode, ...(onBroken ? { onBroken } : {}) };
        return stopWatching;
      },
    ),
  } satisfies Scanner;
  return {
    scanner,
    stopWatching,
    /** The camera's answer, inside act. */
    open: (opening: Opening) =>
      act(async () => {
        answer(opening);
        await Promise.resolve();
      }),
    /** A frame holding `code`. */
    read: (code: string) => act(() => watching?.onCode(code)),
    /** No reader could be loaded. */
    breakReader: () => act(() => watching?.onBroken?.()),
  };
}

function mount(scanner: Scanner) {
  const barcode = { scanner } as unknown as BarcodeService;
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
  const onCode = vi.fn();
  const onClose = vi.fn();
  const ui = (open: boolean) => (
    <ServicesProvider services={services}>
      <ScanSheet open={open} onCode={onCode} onClose={onClose} />
    </ServicesProvider>
  );
  const view = render(ui(true));
  return { onCode, onClose, close: () => view.rerender(ui(false)) };
}

/** A layout box (jsdom lays nothing out). */
const boxAt = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    x: left,
    y: top,
    right: left + width,
    bottom: top + height,
  }) as DOMRect;

const sheet = () => within(screen.getByRole('dialog', { name: words.title }));
const preview = () => document.querySelector<HTMLVideoElement>('[data-ui="scan.preview"]');
const digits = () => sheet().getByRole('textbox', { name: words.digits.label });

describe('ScanSheet', () => {
  it('shows the camera’s picture and reads its frames once it opens', async () => {
    const fake = fakeScanner();
    mount(fake.scanner);
    expect(sheet().getByText(words.starting)).toBeVisible();
    expect(fake.scanner.watch).not.toHaveBeenCalled();

    const camera = fakeCamera();
    await fake.open(ok(camera));

    const video = preview();
    expect(video).not.toBeNull();
    expect(video?.srcObject).toBe(camera.stream);
    expect(fake.scanner.watch).toHaveBeenCalledWith(
      video,
      expect.any(Function),
      expect.any(Function),
    );
    expect(sheet().getByText(words.hint)).toBeVisible();
  });

  it('hands on the first code it reads, once, however many frames follow (P06-14)', async () => {
    const fake = fakeScanner();
    const { onCode } = mount(fake.scanner);
    await fake.open(ok(fakeCamera()));

    fake.read(CODE);
    fake.read('5000112637922');
    fireEvent.change(digits(), { target: { value: '123' } });
    fireEvent.click(sheet().getByRole('button', { name: words.digits.submit }));

    expect(onCode).toHaveBeenCalledOnce();
    expect(onCode).toHaveBeenCalledWith(CODE);
  });

  it('hands on typed digits without their spaces (D-16.18)', async () => {
    const fake = fakeScanner();
    const { onCode } = mount(fake.scanner);
    await fake.open(ok(fakeCamera()));

    fireEvent.change(digits(), { target: { value: '0 12345 67890 5' } });
    fireEvent.click(sheet().getByRole('button', { name: words.digits.submit }));

    expect(onCode).toHaveBeenCalledWith('012345678905');
  });

  it('says the camera is off and puts the focus in the digits when access is refused', async () => {
    const fake = fakeScanner();
    const { onCode } = mount(fake.scanner);

    await fake.open(err('denied'));

    expect(sheet().getByRole('alert')).toHaveTextContent(words.denied.title);
    expect(sheet().getByText(words.denied.body)).toBeVisible();
    expect(preview()).toBeNull();
    expect(digits()).toHaveFocus();
    fireEvent.change(digits(), { target: { value: CODE } });
    fireEvent.submit(digits().closest('form') as HTMLFormElement);
    expect(onCode).toHaveBeenCalledWith(CODE);
  });

  it('says the camera cannot scan here when there is none', async () => {
    const fake = fakeScanner();
    mount(fake.scanner);

    await fake.open(err('unavailable'));

    expect(sheet().getByRole('alert')).toHaveTextContent(words.unavailable);
    expect(digits()).toHaveFocus();
  });

  it('turns the camera off and says so when no reader can take its frames', async () => {
    const fake = fakeScanner();
    mount(fake.scanner);
    const camera = fakeCamera();
    await fake.open(ok(camera));

    fake.breakReader();

    expect(camera.stop).toHaveBeenCalled();
    expect(preview()).toBeNull();
    expect(sheet().getByRole('alert')).toHaveTextContent(words.unavailable);
  });

  it('turns the camera off and stops reading when it closes', async () => {
    const fake = fakeScanner();
    const { close } = mount(fake.scanner);
    const camera = fakeCamera();
    await fake.open(ok(camera));

    close();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(fake.stopWatching).toHaveBeenCalledOnce();
  });

  it('turns off a camera that opens only after the scanner closed', async () => {
    const fake = fakeScanner();
    const { close } = mount(fake.scanner);
    close();

    const camera = fakeCamera();
    await fake.open(ok(camera));

    expect(camera.stop).toHaveBeenCalledOnce();
    expect(fake.scanner.watch).not.toHaveBeenCalled();
  });

  it('closes from its button and from Escape', async () => {
    const fake = fakeScanner();
    const { onClose } = mount(fake.scanner);
    await fake.open(ok(fakeCamera()));

    fireEvent.click(sheet().getByRole('button', { name: words.close }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('focuses where the picture is tapped, mapped through the crop, where the camera can', async () => {
    const fake = fakeScanner();
    mount(fake.scanner);
    const camera = fakeCamera(true);
    await fake.open(ok(camera));
    const video = preview() as HTMLVideoElement;
    // A 400 × 400 view showing a 1280 × 720 picture: its sides are cut off.
    video.getBoundingClientRect = () => boxAt(0, 100, 400, 400);
    Object.defineProperty(video, 'videoWidth', { value: 1280 });
    Object.defineProperty(video, 'videoHeight', { value: 720 });

    fireEvent.click(video, { clientX: 200, clientY: 200 });
    fireEvent.click(video, { clientX: 0, clientY: 500 });

    expect(camera.focusAt).toHaveBeenNthCalledWith(1, 0.5, 0.25);
    const [x, y] = camera.focusAt.mock.calls[1] ?? [];
    expect(x).toBeCloseTo((711.11 - 400) / 2 / 711.11, 3);
    expect(y).toBe(1);
  });

  it('leaves the focus alone on a tap where the camera cannot focus on a point', async () => {
    const fake = fakeScanner();
    mount(fake.scanner);
    const camera = fakeCamera(false);
    await fake.open(ok(camera));
    const video = preview() as HTMLVideoElement;
    video.getBoundingClientRect = () => boxAt(0, 0, 400, 400);

    fireEvent.click(video, { clientX: 100, clientY: 100 });

    expect(camera.focusAt).not.toHaveBeenCalled();
  });

  it('takes its words from a catalogue partition that passes the lint', async () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
    const fake = fakeScanner();
    mount(fake.scanner);
    await fake.open(ok(fakeCamera()));

    expect(preview()).toHaveAccessibleName(words.preview);
    expect(sheet().getByText(words.source)).toBeVisible();
    expect(digits()).toHaveAttribute('placeholder', words.digits.placeholder);
    expect(digits()).toHaveAttribute('inputmode', 'numeric');
  });
});
