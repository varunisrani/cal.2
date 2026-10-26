/** A success or a failure returned as a value, for code that should not throw. */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Narrows to the success; `!isOk(r)` narrows to the failure. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}
