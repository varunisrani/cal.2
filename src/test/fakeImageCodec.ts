/**
 * A fake image codec for tests: jsdom has neither `createImageBitmap` nor a canvas. A fake photo
 * is a blob whose first bytes name its upright size (`PIC <n> <width>x<height>`), padded to the
 * byte count asked for, so it decodes the same after a trip through fake-indexeddb (which clones
 * blobs). The JPEGs it "encodes" are such blobs too, of a byte count that grows with the pixels
 * and the quality, so the photo store's "keep the smaller one" rule can be tested without real
 * pixels. Blobs are Node's own, which fake-indexeddb keeps as blobs (see blobs.ts).
 */
import { fitWithin, type ImageCodec, type Picture } from '../lib/imageCodec';

// Tests run in Node, but the app's tsconfig has no Node types: this is all we use of node:buffer.
interface NodeBuffer {
  Blob: typeof Blob;
}
// A variable specifier keeps the compiler from looking for Node's type declarations.
const NODE_BUFFER = 'node:buffer';

async function nodeBlob(header: string, size: number, type: string): Promise<Blob> {
  const { Blob: NodeBlob } = (await import(/* @vite-ignore */ NODE_BUFFER)) as NodeBuffer;
  const head = new TextEncoder().encode(header);
  const bytes = new Uint8Array(Math.max(size, head.length));
  bytes.set(head);
  return new NodeBlob([bytes], { type });
}

const HEADER = /^PIC \d+ (\d+)x(\d+)\n/;
// Long enough for any header the fake writes.
const HEADER_BYTES = 48;

/** One JPEG the fake made. */
export interface FakeEncode {
  /** The size it was drawn at. */
  readonly width: number;
  readonly height: number;
  readonly maxEdge: number;
  readonly quality: number;
}

export interface FakeCodecOptions {
  /** Bytes of a JPEG at this size and quality; by default width × height × quality / 20. */
  readonly jpegBytes?: (width: number, height: number, quality: number) => number;
}

export interface FakeCodec {
  readonly codec: ImageCodec;
  /** A photo file of `bytes` bytes that decodes, upright, as width × height. */
  photo(width: number, height: number, bytes?: number): Promise<Blob>;
  /** A file the codec cannot decode, as HEIC is outside Safari. */
  undecodable(bytes?: number): Promise<Blob>;
  /** The size a blob decodes as, or null when it does not decode. */
  sizeOf(blob: Blob): Promise<{ width: number; height: number } | null>;
  /** Every JPEG made so far, in order. */
  readonly encodes: FakeEncode[];
  /** How many files were decoded. */
  decodes(): number;
  /** Decoded pictures not released yet. */
  openPictures(): number;
  /** Makes every encode at this edge fail from now on. */
  failEncodesAt(maxEdge: number): void;
  /** Holds every decode from now until `release`; `reached` settles when one is held. */
  hold(): FakeHold;
}

export interface FakeHold {
  /** Settles once a decode is waiting. */
  readonly reached: Promise<void>;
  release(): void;
}

const defaultJpegBytes = (width: number, height: number, quality: number) =>
  Math.max(1, Math.round((width * height * quality) / 20));

export function createFakeCodec(options: FakeCodecOptions = {}): FakeCodec {
  const jpegBytes = options.jpegBytes ?? defaultJpegBytes;
  const encodes: FakeEncode[] = [];
  const failing = new Set<number>();
  let made = 0;
  let decoded = 0;
  let open = 0;
  let gate: { arrive: () => void; open: Promise<void> } | null = null;

  const makePhoto = (width: number, height: number, bytes: number, type: string) =>
    nodeBlob(`PIC ${++made} ${width}x${height}\n`, bytes, type);

  async function sizeOf(blob: Blob) {
    const head = new TextDecoder().decode(await blob.slice(0, HEADER_BYTES).arrayBuffer());
    const match = HEADER.exec(head);
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
  }

  function pictureOf(width: number, height: number): Picture {
    open += 1;
    let closed = false;
    return {
      width,
      height,
      async toJpeg(maxEdge, quality) {
        if (closed) throw new Error('The picture was released');
        if (failing.has(maxEdge)) throw new Error('The fake encoder failed');
        const size = fitWithin(width, height, maxEdge);
        encodes.push({ ...size, maxEdge, quality });
        return makePhoto(
          size.width,
          size.height,
          jpegBytes(size.width, size.height, quality),
          'image/jpeg',
        );
      },
      close() {
        if (!closed) open -= 1;
        closed = true;
      },
    };
  }

  const codec: ImageCodec = {
    async decode(blob) {
      if (gate) {
        gate.arrive();
        await gate.open;
      }
      decoded += 1;
      const size = await sizeOf(blob);
      return size ? pictureOf(size.width, size.height) : null;
    },
  };

  return {
    codec,
    photo: (width, height, bytes = jpegBytes(width, height, 1)) =>
      makePhoto(width, height, bytes, 'image/jpeg'),
    undecodable: (bytes = 4096) => nodeBlob('HEIC', bytes, 'image/heic'),
    sizeOf,
    encodes,
    decodes: () => decoded,
    openPictures: () => open,
    failEncodesAt: (maxEdge) => void failing.add(maxEdge),
    hold() {
      let arrive = () => {};
      const reached = new Promise<void>((resolve) => (arrive = resolve));
      let release = () => {};
      const open = new Promise<void>((resolve) => (release = resolve));
      gate = { arrive, open };
      return {
        reached,
        release() {
          gate = null;
          release();
        },
      };
    },
  };
}
