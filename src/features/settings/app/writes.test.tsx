import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { deferred } from './testing/openAppSettings';
import { usePendingWrites } from './writes';

type Stored = { readonly accent: string; readonly on: boolean };

/** The hook over `stored`, which a test changes as the database would. */
function renderPending(stored: Stored) {
  return renderHook((props: { stored: Stored }) => usePendingWrites(props.stored), {
    initialProps: { stored },
  });
}

describe('usePendingWrites', () => {
  it('shows a choice at once and keeps it until the stored value moves to it', async () => {
    const save = deferred<void>();
    const view = renderPending({ accent: 'basil', on: false });

    let written: Promise<void> = Promise.resolve();
    act(() => {
      written = view.result.current.write('accent', 'ember', () => save.promise);
    });
    expect(view.result.current.shown('accent')).toBe('ember');
    expect(view.result.current.shown('on')).toBe(false);

    // The write has landed, but the stored value has not been read again yet: no flash back.
    await act(async () => {
      save.resolve();
      await written;
    });
    expect(view.result.current.shown('accent')).toBe('ember');

    view.rerender({ stored: { accent: 'ember', on: false } });
    expect(view.result.current.shown('accent')).toBe('ember');
  });

  it('lets a stored value that moved elsewhere win over the choice', () => {
    const view = renderPending({ accent: 'basil', on: false });

    act(() => {
      void view.result.current.write('accent', 'ember', () => new Promise(() => undefined));
    });
    view.rerender({ stored: { accent: 'ink', on: false } });
    expect(view.result.current.shown('accent')).toBe('ink');

    // The choice is gone for good: the stored value coming back does not bring it back.
    view.rerender({ stored: { accent: 'basil', on: false } });
    expect(view.result.current.shown('accent')).toBe('basil');
  });

  it('shows the stored value again and rejects when the save fails', async () => {
    const save = deferred<void>();
    const view = renderPending({ accent: 'basil', on: false });

    let written: Promise<void> = Promise.resolve();
    act(() => {
      written = view.result.current.write('on', true, () => save.promise);
    });
    expect(view.result.current.shown('on')).toBe(true);

    const failure = new Error('disk full');
    await act(async () => {
      save.reject(failure);
      await expect(written).rejects.toBe(failure);
    });
    expect(view.result.current.shown('on')).toBe(false);
  });

  it('keeps each control to its own choice', () => {
    const view = renderPending({ accent: 'basil', on: false });

    act(() => {
      void view.result.current.write('accent', 'lagoon', () => new Promise(() => undefined));
      void view.result.current.write('on', true, () => new Promise(() => undefined));
    });
    // The switch's write lands first; the accent is still being written.
    view.rerender({ stored: { accent: 'basil', on: true } });
    expect(view.result.current.shown('accent')).toBe('lagoon');
    expect(view.result.current.shown('on')).toBe(true);
  });

  it('shows the stored value when it is chosen again while another choice is being written', () => {
    const view = renderPending({ accent: 'basil', on: false });

    act(() => {
      void view.result.current.write('accent', 'beet', () => new Promise(() => undefined));
    });
    act(() => {
      void view.result.current.write('accent', 'basil', () => new Promise(() => undefined));
    });
    expect(view.result.current.shown('accent')).toBe('basil');
  });
});
