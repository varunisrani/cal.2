/**
 * Platewise's own addresses on the web (Proposed D-16.66). Each one is `null` until the owner
 * supplies it, and a `null` address is never shown: the row that would use it is left out, so
 * nobody meets a dead link. Only `https:` and `mailto:` addresses belong here (a test checks).
 */
export interface PlatewiseLinks {
  /** The app's public address, which Share Platewise sends; `null`: where this copy runs from. */
  readonly site: string | null;
  /** Help and feedback: a help page or a form for questions, problems and ideas. */
  readonly help: string | null;
  /** How to reach the people behind Platewise: a `mailto:` address or a contact page. */
  readonly contact: string | null;
  /** The source code. */
  readonly source: string | null;
  /** The release notes (CHANGELOG.md once P10-14 writes it, wherever it is published). */
  readonly changelog: string | null;
  /** The privacy policy, when it lives on the web rather than in the app (P09-01). */
  readonly privacy: string | null;
  /** The terms of use, when they live on the web rather than in the app (P09-01). */
  readonly terms: string | null;
}

export type LinkName = keyof PlatewiseLinks;

/** Placeholders: every address waits for the owner. */
export const LINKS: PlatewiseLinks = {
  site: null,
  help: null,
  contact: null,
  source: null,
  changelog: null,
  privacy: null,
  terms: null,
};

/** True for the kinds of address the app may open: a secure page or an email. */
export function isLinkAddress(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'mailto:' ? url.pathname.includes('@') : url.protocol === 'https:';
}

/** True when the address opens the person's mail app rather than a page. */
export function isMailAddress(value: string): boolean {
  return value.toLowerCase().startsWith('mailto:');
}
