/**
 * Blobs that survive fake-indexeddb. A jsdom `Blob` is cloned into a plain object on the way into
 * the fake database (the photo codec then refuses it), but Node's own `Blob` is kept as a real blob
 * by the structured clone. Tests that store photos build them here and compare bytes after reading
 * them back.
 */

// Tests run in Node, but the app's tsconfig has no Node types: this is all we use of node:buffer.
interface NodeBuffer {
  Blob: typeof Blob;
}
// A variable specifier keeps the compiler from looking for Node's type declarations.
const NODE_BUFFER = 'node:buffer';

/** A blob of `size` bytes counting up from `first` (mod 256), which IndexedDB stores as a blob. */
export async function storableBlob(size: number, first = 0, type = 'image/jpeg'): Promise<Blob> {
  const { Blob: NodeBlob } = (await import(/* @vite-ignore */ NODE_BUFFER)) as NodeBuffer;
  const bytes = Uint8Array.from({ length: size }, (_, index) => (first + index) % 256);
  return new NodeBlob([bytes], { type });
}

/** The bytes of a blob, for comparing what was stored with what came back. */
export async function bytesOf(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}
