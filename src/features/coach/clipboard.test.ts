import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

const REPLY = '**Protein:** 92 g\n- of 120 g';

/** The copy command, which jsdom lacks: records the text area's value when it runs. */
function stubCommand(works: boolean) {
  const copied: string[] = [];
  const execCommand = vi.fn((command: string) => {
    const area = document.activeElement as HTMLTextAreaElement | null;
    if (command === 'copy' && works) copied.push(area?.value ?? '');
    return works;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
  return { execCommand, copied };
}

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
});

describe('copyText (P13)', () => {
  it('uses the Clipboard API when there is one', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { execCommand } = stubCommand(true);

    expect(await copyText(REPLY, { clipboard: { writeText }, document })).toBe(true);
    expect(writeText).toHaveBeenCalledWith(REPLY);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('copies with the copy command on a hidden text area when the API is missing', async () => {
    const { copied } = stubCommand(true);
    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();

    expect(await copyText(REPLY, { document })).toBe(true);
    expect(copied).toEqual([REPLY]);
    // The text area is gone and the focus is back where it was.
    expect(document.querySelectorAll('textarea')).toHaveLength(1);
    expect(field).toHaveFocus();
    field.remove();
  });

  it('falls back to the copy command when the API refuses', async () => {
    const { copied } = stubCommand(true);
    const writeText = vi.fn(() => Promise.reject(new DOMException('Denied', 'NotAllowedError')));

    expect(await copyText(REPLY, { clipboard: { writeText }, document })).toBe(true);
    expect(copied).toEqual([REPLY]);
  });

  it('says it failed when both ways fail, or there is no way at all', async () => {
    stubCommand(false);
    expect(await copyText(REPLY, { document })).toBe(false);
    Reflect.deleteProperty(document, 'execCommand');
    expect(await copyText(REPLY, { document })).toBe(false);
  });
});
