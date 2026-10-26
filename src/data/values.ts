// Looking inside stored values: recognising blobs, comparing query results, and a stable text form
// and fingerprint of a raw value for the quarantine.

/**
 * True for a Blob or File. Checked by shape rather than `instanceof Blob`, because a blob can come
 * from another realm (and the test runtime's structured clone returns Node's Blob class).
 */
export function isBlobLike(value: unknown): value is Blob {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Blob>;
  return (
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string' &&
    typeof candidate.slice === 'function' &&
    typeof candidate.arrayBuffer === 'function'
  );
}

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function bytesOf(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  return value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function isBytes(value: object): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function sameBytes(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean {
  const left = bytesOf(a);
  const right = bytesOf(b);
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

/**
 * Structural equality for query results: every read returns fresh copies, so identity says
 * nothing. Plain objects, arrays, dates, byte arrays, maps and sets compare by content; anything
 * else (a Blob, a class instance) only equals itself, because a missed update is worse than an
 * extra render.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameData(item, b[i]));
  }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  }
  if (isBytes(a) || isBytes(b)) {
    return isBytes(a) && isBytes(b) && a.constructor === b.constructor && sameBytes(a, b);
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !sameData(value, b.get(key))) return false;
    }
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
    for (const item of a) if (!b.has(item)) return false;
    return true;
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}

/**
 * A text form that is the same for two values with the same content, whatever the order of their
 * keys. Blobs are written as size and type only (their bytes cannot be read synchronously).
 */
export function stableText(value: unknown): string {
  const open = new Set<object>();

  const write = (item: unknown): string => {
    switch (typeof item) {
      case 'undefined':
        return 'u';
      case 'boolean':
        return item ? 'T' : 'F';
      case 'number':
        return Object.is(item, -0) ? '#-0' : `#${item}`;
      case 'bigint':
        return `#${item}n`;
      case 'string':
        return JSON.stringify(item);
      case 'object':
        break;
      default:
        return `?${typeof item}`;
    }
    if (item === null) return 'N';
    if (open.has(item)) return '@cycle';
    open.add(item);
    try {
      if (Array.isArray(item)) {
        // Index loop, so holes in a sparse array read as undefined.
        const parts: string[] = [];
        for (let i = 0; i < item.length; i++) parts.push(write(item[i]));
        return `[${parts.join(',')}]`;
      }
      if (item instanceof Date) return `date(${item.getTime()})`;
      if (isBytes(item)) return `bytes(${Array.from(bytesOf(item)).join('.')})`;
      if (isBlobLike(item)) return `blob(${item.size},${JSON.stringify(item.type)})`;
      if (item instanceof Map) {
        const pairs = [...item].map(([key, entry]) => `${write(key)}=>${write(entry)}`);
        return `map{${pairs.sort().join(',')}}`;
      }
      if (item instanceof Set) return `set{${[...item].map(write).sort().join(',')}}`;
      const record = item as Record<string, unknown>;
      const fields = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${write(record[key])}`);
      return `{${fields.join(',')}}`;
    } finally {
      open.delete(item);
    }
  };

  return write(value);
}

/** FNV-1a (32 bit) over UTF-16 code units, as 8 hex digits. */
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * A short fingerprint of a value's content. Equal content gives an equal fingerprint; an equal
 * fingerprint does not prove equal content (compare `stableText` for that).
 */
export function fingerprint(value: unknown): string {
  return hashText(stableText(value));
}
