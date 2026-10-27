import { describe, expect, it, vi } from 'vitest';
import { advanceAsync, useFakeTime } from '../../test/time';
import {
  browserScannerEnv,
  createScanner,
  FRAME_GAP_MS,
  SCAN_FORMATS,
  WASM_FORMATS,
  type NativeDetectorClass,
  type ScannerEnv,
  type WasmReader,
} from './decoder';

// The lazy chunk, replaced so no WASM is compiled here. The factory counts how often the module
// is evaluated: a static import from decoder.ts would evaluate it as this file loads.
const lazy = vi.hoisted(() => ({
  evaluated: 0,
  reader: { read: () => Promise.resolve(['from the chunk']) },
}));
vi.mock('./wasmReader', () => {
  lazy.evaluated += 1;
  return { wasmReader: lazy.reader };
});

const START = '2026-10-27T09:00:00Z';
const CODE = '4006381333931';

/** A frame the WASM path can be handed (jsdom has no canvas pixels). */
const PICTURE = { width: 4, height: 4, data: new Uint8ClampedArray(64) } as unknown as ImageData;

/**
 * A stand-in for the browser's `BarcodeDetector`: each `detect` returns the next frame's values.
 * `supported` is what it reports reading; null leaves `getSupportedFormats` out.
 */
function detectorReading(
  frames: (readonly string[])[],
  supported: readonly string[] | null = SCAN_FORMATS,
) {
  const built: string[][] = [];
  const detect = vi.fn((_video: HTMLVideoElement) =>
    Promise.resolve((frames.shift() ?? []).map((rawValue) => ({ rawValue }))),
  );
  class Detector {
    constructor(options: { formats: string[] }) {
      built.push(options.formats);
    }
    detect = detect;
  }
  const native = Detector as unknown as NativeDetectorClass;
  if (supported) native.getSupportedFormats = () => Promise.resolve(supported);
  return { native, built, detect };
}

/** A WASM reader whose reads return the next frame's values. */
function wasmReading(frames: (readonly string[])[]) {
  const read = vi.fn((_picture: ImageData, _formats: readonly string[]) =>
    Promise.resolve(frames.shift() ?? []),
  );
  const reader: WasmReader = { read };
  const loadWasm = vi.fn(() => Promise.resolve(reader));
  return { read, loadWasm };
}

/** An environment without a camera or detector unless given; loading WASM fails the test. */
function envWith(overrides: Partial<ScannerEnv> = {}): ScannerEnv {
  return {
    loadWasm: () => Promise.reject(new Error('the WASM reader was not expected')),
    grabFrame: () => PICTURE,
    ...overrides,
  };
}

const video = () => document.createElement('video');

describe('watch: the browser’s own detector', () => {
  it('hands on the first non-blank value once, trimmed, and stops reading', async () => {
    useFakeTime(START);
    const { native, built, detect } = detectorReading([[], ['  '], [` ${CODE} `, '5000112637922']]);
    const wasm = wasmReading([]);
    const scanner = createScanner(envWith({ nativeDetector: native, loadWasm: wasm.loadWasm }));
    const onCode = vi.fn();
    const preview = video();

    scanner.watch(preview, onCode);
    await advanceAsync(FRAME_GAP_MS * 10);

    expect(onCode).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith(CODE);
    expect(detect).toHaveBeenCalledTimes(3);
    expect(detect).toHaveBeenLastCalledWith(preview);
    expect(built).toEqual([[...SCAN_FORMATS]]);
    expect(wasm.loadWasm).not.toHaveBeenCalled();
  });

  it('asks only for the formats of ours it reports reading', async () => {
    useFakeTime(START);
    const { native, built } = detectorReading([[CODE]], ['qr_code', 'upc_a', 'ean_13']);
    const onCode = vi.fn();

    createScanner(envWith({ nativeDetector: native })).watch(video(), onCode);
    await advanceAsync(FRAME_GAP_MS);

    expect(built).toEqual([['ean_13', 'upc_a']]);
    expect(onCode).toHaveBeenCalledWith(CODE);
  });

  it('asks for every format when it cannot report which it reads', async () => {
    useFakeTime(START);
    const { native, built } = detectorReading([[CODE]], null);

    createScanner(envWith({ nativeDetector: native })).watch(video(), vi.fn());
    await advanceAsync(FRAME_GAP_MS);

    expect(built).toEqual([[...SCAN_FORMATS]]);
  });

  it('keeps reading after a frame it could not take', async () => {
    useFakeTime(START);
    const { native, detect } = detectorReading([]);
    detect
      .mockRejectedValueOnce(new DOMException('No frame yet', 'InvalidStateError'))
      .mockResolvedValueOnce([{ rawValue: CODE }]);
    const onCode = vi.fn();

    createScanner(envWith({ nativeDetector: native })).watch(video(), onCode);
    await advanceAsync(FRAME_GAP_MS * 3);

    expect(onCode).toHaveBeenCalledWith(CODE);
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it('reads nothing more once stopped, even when a read was under way', async () => {
    useFakeTime(START);
    let finish: (values: { rawValue: string }[]) => void = () => undefined;
    const { native, detect } = detectorReading([[], []]);
    const onCode = vi.fn();
    const stop = createScanner(envWith({ nativeDetector: native })).watch(video(), onCode);
    await advanceAsync(FRAME_GAP_MS);
    expect(detect).toHaveBeenCalledTimes(2);
    detect.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await advanceAsync(FRAME_GAP_MS);
    expect(detect).toHaveBeenCalledTimes(3);

    stop();
    finish([{ rawValue: CODE }]);
    await advanceAsync(FRAME_GAP_MS * 10);

    expect(detect).toHaveBeenCalledTimes(3);
    expect(onCode).not.toHaveBeenCalled();
  });
});

describe('watch: the WASM reader (ACC-D19-2)', () => {
  it('loads the WASM reader only when the first frame needs it, and once', async () => {
    useFakeTime(START);
    const wasm = wasmReading([[], [CODE], ['', '0012345678905']]);
    const scanner = createScanner(envWith({ loadWasm: wasm.loadWasm }));
    expect(wasm.loadWasm).not.toHaveBeenCalled();

    const first = vi.fn();
    scanner.watch(video(), first);
    await advanceAsync(FRAME_GAP_MS * 3);
    const second = vi.fn();
    scanner.watch(video(), second);
    await advanceAsync(FRAME_GAP_MS * 3);

    expect(wasm.loadWasm).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledWith(CODE);
    expect(second).toHaveBeenCalledWith('0012345678905');
    expect(wasm.read).toHaveBeenCalledWith(PICTURE, WASM_FORMATS);
    expect(WASM_FORMATS).toHaveLength(SCAN_FORMATS.length);
  });

  it('takes the WASM reader when the browser’s detector reads none of our formats', async () => {
    useFakeTime(START);
    const { native, built } = detectorReading([], ['qr_code', 'aztec']);
    const wasm = wasmReading([[CODE]]);
    const onCode = vi.fn();

    createScanner(envWith({ nativeDetector: native, loadWasm: wasm.loadWasm })).watch(
      video(),
      onCode,
    );
    await advanceAsync(FRAME_GAP_MS);

    expect(built).toEqual([]);
    expect(wasm.loadWasm).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith(CODE);
  });

  it('takes the WASM reader when the browser’s detector refuses to be built', async () => {
    useFakeTime(START);
    const refusing = class {
      constructor() {
        throw new TypeError('Unsupported format');
      }
    } as unknown as NativeDetectorClass;
    const wasm = wasmReading([[CODE]]);
    const onCode = vi.fn();

    createScanner(envWith({ nativeDetector: refusing, loadWasm: wasm.loadWasm })).watch(
      video(),
      onCode,
    );
    await advanceAsync(FRAME_GAP_MS);

    expect(onCode).toHaveBeenCalledWith(CODE);
  });

  it('skips the read while the video has no picture yet', async () => {
    useFakeTime(START);
    const wasm = wasmReading([[CODE]]);
    const grabFrame = vi.fn<(video: HTMLVideoElement) => ImageData | undefined>(() => undefined);
    const onCode = vi.fn();

    createScanner(envWith({ loadWasm: wasm.loadWasm, grabFrame })).watch(video(), onCode);
    await advanceAsync(FRAME_GAP_MS * 2);
    expect(grabFrame).toHaveBeenCalledTimes(3);
    expect(wasm.read).not.toHaveBeenCalled();

    grabFrame.mockReturnValue(PICTURE);
    await advanceAsync(FRAME_GAP_MS);
    expect(onCode).toHaveBeenCalledWith(CODE);
  });

  it('says it is broken when the WASM reader cannot load, and tries again next time', async () => {
    useFakeTime(START);
    const loadWasm = vi.fn<() => Promise<WasmReader>>(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    const scanner = createScanner(envWith({ loadWasm }));
    const onCode = vi.fn();
    const onBroken = vi.fn();

    scanner.watch(video(), onCode, onBroken);
    await advanceAsync(FRAME_GAP_MS * 3);
    expect(onBroken).toHaveBeenCalledOnce();
    expect(onCode).not.toHaveBeenCalled();

    loadWasm.mockResolvedValueOnce({ read: () => Promise.resolve([CODE]) });
    scanner.watch(video(), onCode, onBroken);
    await advanceAsync(FRAME_GAP_MS);
    expect(loadWasm).toHaveBeenCalledTimes(2);
    expect(onCode).toHaveBeenCalledWith(CODE);
  });

  it('imports the reader chunk on first use, never with this module', async () => {
    expect(lazy.evaluated).toBe(0);
    const env = browserScannerEnv();
    expect(lazy.evaluated).toBe(0);

    const reader = await env.loadWasm();

    expect(lazy.evaluated).toBe(1);
    expect(reader).toBe(lazy.reader);
  });
});

// ---- The camera ----------------------------------------------------------------------------

interface FakeTrack {
  readonly stop: ReturnType<typeof vi.fn>;
  readonly applyConstraints: ReturnType<typeof vi.fn>;
  readonly getCapabilities?: () => unknown;
}

function streamOf(track: FakeTrack): MediaStream {
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function trackWith(focusModes?: readonly string[]): FakeTrack {
  return {
    stop: vi.fn(),
    applyConstraints: vi.fn(() => Promise.resolve()),
    ...(focusModes ? { getCapabilities: () => ({ focusMode: focusModes }) } : {}),
  };
}

function devicesGiving(stream: MediaStream) {
  return {
    getUserMedia: vi.fn((_constraints?: MediaStreamConstraints) => Promise.resolve(stream)),
  };
}

/** Camera access that fails the way a browser does, with a DOMException of this name. */
function devicesRefusing(name: string) {
  return { getUserMedia: () => Promise.reject(new DOMException('No camera for you', name)) };
}

describe('openCamera', () => {
  it('asks for the camera facing away, without sound, and stops every track', async () => {
    const track = trackWith();
    const devices = devicesGiving(streamOf(track));

    const opened = await createScanner(envWith({ mediaDevices: devices })).openCamera();

    expect(devices.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    if (!opened.ok) throw new Error('the camera did not open');
    opened.value.stop();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('reads a refusal by the person or the page as denied', async () => {
    for (const name of ['NotAllowedError', 'SecurityError']) {
      const devices = devicesRefusing(name);
      const opened = await createScanner(envWith({ mediaDevices: devices })).openCamera();
      expect(opened).toEqual({ ok: false, error: 'denied' });
    }
  });

  it('reads no camera, a busy camera or no camera API as unavailable', async () => {
    for (const name of ['NotFoundError', 'NotReadableError', 'OverconstrainedError']) {
      const devices = devicesRefusing(name);
      const opened = await createScanner(envWith({ mediaDevices: devices })).openCamera();
      expect(opened).toEqual({ ok: false, error: 'unavailable' });
    }
    expect(await createScanner(envWith()).openCamera()).toEqual({
      ok: false,
      error: 'unavailable',
    });
  });

  it('focuses on a tapped point where the camera can, kept inside the picture', async () => {
    const track = trackWith(['continuous', 'single-shot']);
    const opened = await createScanner(
      envWith({ mediaDevices: devicesGiving(streamOf(track)) }),
    ).openCamera();
    if (!opened.ok) throw new Error('the camera did not open');

    expect(opened.value.canFocus).toBe(true);
    opened.value.focusAt(0.25, 1.4);

    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ pointsOfInterest: [{ x: 0.25, y: 1 }], focusMode: 'single-shot' }],
    });
  });

  it('does nothing on a tap where the camera cannot focus on a point', async () => {
    for (const track of [trackWith(), trackWith(['continuous'])]) {
      const opened = await createScanner(
        envWith({ mediaDevices: devicesGiving(streamOf(track)) }),
      ).openCamera();
      if (!opened.ok) throw new Error('the camera did not open');

      expect(opened.value.canFocus).toBe(false);
      opened.value.focusAt(0.5, 0.5);
      expect(track.applyConstraints).not.toHaveBeenCalled();
    }
  });
});
