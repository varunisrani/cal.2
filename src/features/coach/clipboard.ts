// Copying a Coach reply (P08-13, P13). The Clipboard API first; where it is missing (a page not
// served over https, an older WebView) or refuses, the older way: select the text in a hidden
// text area and run the copy command. Neither throws out of here.

/** What the copy reaches for; the browser's by default, a stand-in in tests. */
export interface CopyEnvironment {
  readonly clipboard?: Pick<Clipboard, 'writeText'>;
  readonly document: Document;
}

function browserEnvironment(): CopyEnvironment {
  return {
    clipboard: typeof navigator === 'undefined' ? undefined : navigator.clipboard,
    document,
  };
}

/** The copy command on a hidden, read-only text area; true when the browser says it copied. */
function copyWithCommand(text: string, doc: Document): boolean {
  if (typeof doc.execCommand !== 'function') return false;
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.insetBlockStart = '0';
  area.style.opacity = '0';
  const focused = doc.activeElement;
  doc.body.append(area);
  try {
    area.focus({ preventScroll: true });
    area.select();
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
}

/** Puts `text` on the clipboard as it is; resolves whether that worked. */
export async function copyText(
  text: string,
  environment: CopyEnvironment = browserEnvironment(),
): Promise<boolean> {
  const { clipboard } = environment;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Refused (no permission, the page not focused): the older way may still work.
    }
  }
  return copyWithCommand(text, environment.document);
}
