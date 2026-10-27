/**
 * Reading barcodes from the back camera (02 §3.12, D-16.18). The browser's own `BarcodeDetector`
 * reads the frames when it has one that knows our formats; otherwise the zxing-wasm reader does,
 * loaded the first time a frame needs it and kept in a chunk of its own (`wasmReader.ts`), so the
 * app's start-up never pays for it. Frames are read one after another with a short gap until one
 * holds a value that is not blank: that value is handed on once and reading stops.
 */
import { err, ok, type Result } from '../../lib/result';

/** The formats read, as the browser's detector names them: retail codes, then industrial ones. */
export const SCAN_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
] as const;

/** The same formats, in the same order, as the WASM reader names them. */
export const WASM_FORMATS = [
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
  'Code128',
  'Code39',
  'Code93',
  'ITF',
] as const;

export type WasmFormat = (typeof WASM_FORMATS)[number];

/** The pause after one frame's read before the next, so reading never takes the whole page. */
export const FRAME_GAP_MS = 150;

/** The longest side of a frame handed to the WASM reader; larger frames are drawn smaller. */
export const MAX_FRAME_EDGE = 1280;

/** Why the camera did not open: the person or the browser refused it, or there is none to use. */
export type CameraFailure = 'denied' | 'unavailable';

/** The open back camera. */
export interface ScanCamera {
  readonly stream: MediaStream;
  /** The camera can focus on a point of the picture. */
  readonly canFocus: boolean;
  /** Focuses near (x, y), each from 0 to 1 across the picture; nothing when it cannot. */
  focusAt(x: number, y: number): void;
  /** Turns the camera off. */
  stop(): void;
}

export interface Scanner {
  /** Opens the back camera (any camera when there is no back one) without sound. */
  openCamera(): Promise<Result<ScanCamera, CameraFailure>>;
  /**
   * Reads frames of `video` until one holds a code, then hands its first non-blank value, trimmed,
   * to `onCode` once and stops. `onBroken` hears when no reader can be loaded at all. Returns the
   * stop, for a scanner closed before a code was found.
   */
  watch(video: HTMLVideoElement, onCode: (code: string) => void, onBroken?: () => void): () => void;
}

/** What the browser's `BarcodeDetector` finds in a frame (the part we use). */
interface DetectedCode {
  readonly rawValue: string;
}

/** The browser's `BarcodeDetector` class (not in TypeScript's DOM types yet). */
export interface NativeDetectorClass {
  new (options: { formats: string[] }): {
    detect(source: HTMLVideoElement): Promise<readonly DetectedCode[]>;
  };
  getSupportedFormats?(): Promise<readonly string[]>;
}

/** The WASM reader: every value it finds in a picture, looking only for `formats`. */
export interface WasmReader {
  read(picture: ImageData, formats: readonly WasmFormat[]): Promise<readonly string[]>;
}

/** What the scanner takes from the browser; tests pass their own. */
export interface ScannerEnv {
  readonly mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
  readonly nativeDetector?: NativeDetectorClass;
  /** Loads the WASM reader: asked only without a usable native detector, at most once. */
  readonly loadWasm: () => Promise<WasmReader>;
  /** The video's current picture for the WASM reader; undefined while it has none. */
  readonly grabFrame: (video: HTMLVideoElement) => ImageData | undefined;
}

/** One way of reading a frame: every value found in it. */
interface FrameReader {
  read(video: HTMLVideoElement): Promise<readonly string[]>;
}

/** The video the scanner asks for: the camera facing away from the person, at a modest size. */
const BACK_CAMERA: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

/** The real browser: its camera, its detector if any, the lazy WASM chunk and a canvas. */
export function browserScannerEnv(): ScannerEnv {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  const native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  return {
    ...(typeof devices?.getUserMedia === 'function' ? { mediaDevices: devices } : {}),
    ...(typeof native === 'function' ? { nativeDetector: native } : {}),
    loadWasm: () => import('./wasmReader').then((module) => module.wasmReader),
    grabFrame: canvasFrames(),
  };
}

export function createScanner(env: ScannerEnv = browserScannerEnv()): Scanner {
  /** The reader every watch shares, picked on first use. */
  let reader: Promise<FrameReader> | undefined;

  const frameReader = (): Promise<FrameReader> => {
    reader ??= pickReader(env).catch((error: unknown) => {
      // Not kept: the next scanner opening may load it (back online, say).
      reader = undefined;
      throw error;
    });
    return reader;
  };

  return {
    async openCamera() {
      const devices = env.mediaDevices;
      if (!devices) return err('unavailable');
      try {
        return ok(cameraOf(await devices.getUserMedia(BACK_CAMERA)));
      } catch (error) {
        return err(isRefusal(error) ? 'denied' : 'unavailable');
      }
    },

    watch(video, onCode, onBroken) {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = (): void => {
        stopped = true;
        clearTimeout(timer);
      };

      const readNext = async (): Promise<void> => {
        let picked: FrameReader;
        try {
          picked = await frameReader();
        } catch {
          if (stopped) return;
          stop();
          onBroken?.();
          return;
        }
        if (stopped) return;
        let code: string | undefined;
        try {
          code = firstValue(await picked.read(video));
        } catch {
          // A frame the reader could not take (the video not playing yet): try the next one.
        }
        if (stopped) return;
        if (code !== undefined) {
          stop();
          onCode(code);
          return;
        }
        timer = setTimeout(() => void readNext(), FRAME_GAP_MS);
      };

      void readNext();
      return stop;
    },
  };
}

/** The browser's detector when it reads at least one of our formats, else the WASM reader. */
async function pickReader(env: ScannerEnv): Promise<FrameReader> {
  const native = env.nativeDetector ? await nativeReader(env.nativeDetector) : undefined;
  if (native) return native;
  const wasm = await env.loadWasm();
  return {
    async read(video) {
      const picture = env.grabFrame(video);
      return picture ? wasm.read(picture, WASM_FORMATS) : [];
    },
  };
}

/** A reader over the browser's detector, asked only for our formats it supports. */
async function nativeReader(Detector: NativeDetectorClass): Promise<FrameReader | undefined> {
  try {
    const supported = Detector.getSupportedFormats
      ? new Set(await Detector.getSupportedFormats())
      : undefined;
    const formats = SCAN_FORMATS.filter((format) => supported?.has(format) ?? true);
    if (formats.length === 0) return undefined;
    const detector = new Detector({ formats });
    return {
      read: async (video) => (await detector.detect(video)).map((found) => found.rawValue),
    };
  } catch {
    // A detector that cannot say what it reads, or refuses our formats: the WASM reader instead.
    return undefined;
  }
}

/** The first value that is not blank, trimmed. */
function firstValue(values: readonly string[]): string | undefined {
  for (const value of values) {
    const code = typeof value === 'string' ? value.trim() : '';
    if (code !== '') return code;
  }
  return undefined;
}

function isRefusal(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
  return name === 'NotAllowedError' || name === 'SecurityError';
}

/** The focus modes a track reports, where the browser reports them. */
interface FocusCapabilities {
  readonly focusMode?: readonly string[];
}

function cameraOf(stream: MediaStream): ScanCamera {
  const track = stream.getVideoTracks()[0];
  const capabilities = (track?.getCapabilities?.() ?? {}) as FocusCapabilities;
  const canFocus = track !== undefined && (capabilities.focusMode ?? []).includes('single-shot');
  return {
    stream,
    canFocus,
    focusAt(x, y) {
      if (!canFocus || !track) return;
      const point = { x: clampUnit(x), y: clampUnit(y) };
      // Point focus is not in TypeScript's constraint types; browsers that lack it ignore it.
      const advanced = [
        { pointsOfInterest: [point], focusMode: 'single-shot' },
      ] as unknown as MediaTrackConstraintSet[];
      track.applyConstraints({ advanced }).catch(() => undefined);
    },
    stop() {
      for (const each of stream.getTracks()) each.stop();
    },
  };
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

/** Copies video frames onto one canvas, at most `MAX_FRAME_EDGE` on the longest side. */
function canvasFrames(): (video: HTMLVideoElement) => ImageData | undefined {
  let canvas: HTMLCanvasElement | undefined;
  return (video) => {
    const { videoWidth, videoHeight } = video;
    if (videoWidth === 0 || videoHeight === 0) return undefined;
    const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(videoWidth, videoHeight));
    const width = Math.round(videoWidth * scale);
    const height = Math.round(videoHeight * scale);
    canvas ??= document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(video, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  };
}
