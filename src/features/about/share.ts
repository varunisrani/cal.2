/** What Share Platewise hands to the browser (P09-16). */
export interface SharedLink {
  readonly title: string;
  readonly text: string;
  readonly url: string;
}

/** The parts of the browser sharing uses; tests pass their own. */
export interface ShareTarget {
  /** The system share sheet (`navigator.share`), where the browser has one. */
  readonly share?: (data: ShareData) => Promise<void>;
  /** Puts text on the clipboard (`navigator.clipboard.writeText`), where allowed. */
  readonly copy?: (text: string) => Promise<void>;
}

/**
 * `shared`: the share sheet took it. `cancelled`: the person closed the sheet. `copied`: the
 * address is on the clipboard instead. `failed`: neither worked.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

const closedByPerson = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/**
 * Offers the link to the share sheet when there is one; copies the address when there is none or
 * when sharing fails for any reason but the person closing the sheet. Never throws.
 */
export async function shareLink(link: SharedLink, target: ShareTarget): Promise<ShareOutcome> {
  if (target.share) {
    try {
      await target.share({ title: link.title, text: link.text, url: link.url });
      return 'shared';
    } catch (error) {
      if (closedByPerson(error)) return 'cancelled';
    }
  }
  if (!target.copy) return 'failed';
  try {
    await target.copy(link.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** The browser's own share sheet and clipboard, each only when present. */
export function browserShareTarget(): ShareTarget {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    share: typeof nav?.share === 'function' ? (data) => nav.share(data) : undefined,
    copy: nav?.clipboard ? (text) => nav.clipboard.writeText(text) : undefined,
  };
}

/**
 * The address to share: the app's public one when the owner has given it, else the address this
 * copy of the app runs from (the page's origin and the app's base path, without any screen).
 */
export function appAddress(site: string | null, page: string, base: string): string {
  return site ?? new URL(base, page).href;
}
