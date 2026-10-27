/**
 * The WASM barcode reader for browsers without a usable `BarcodeDetector`. Only `decoder.ts`
 * reaches this file, through a dynamic import, so it and zxing-wasm form a chunk of their own that
 * loads the first time a frame needs it. The `.wasm` binary is served from our own build: the
 * library would fetch it from a public CDN otherwise.
 */
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmFile from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { WasmReader } from './decoder';

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? wasmFile : prefix + path,
  },
});

export const wasmReader: WasmReader = {
  async read(picture, formats) {
    const found = await readBarcodes(picture, { formats: [...formats], maxNumberOfSymbols: 1 });
    return found.map((result) => result.text);
  },
};
