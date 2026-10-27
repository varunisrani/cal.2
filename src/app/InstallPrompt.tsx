import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { t } from '../i18n/t';
import { systemClock, type Clock } from '../lib/clock';
import { Button } from '../ui/Button';
import { installOffer as appInstallOffer, type InstallOffer } from './installOffer';
import styles from './notices.module.css';

/** At most one install card in this long on a device. */
export const INSTALL_CARD_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * When an install card was last shown, epoch ms. An app-owned `localStorage` key: it belongs to
 * this device, stays out of backups, and Erase everything removes it with the other `platewise-`
 * keys.
 */
export const INSTALL_SHOWN_KEY = 'platewise-install-shown';

/** The part of `localStorage` used here. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What the card needs to know about the browser. */
export interface DeviceInfo {
  readonly userAgent: string;
  /** iPadOS reports itself as a Mac; touch points tell the two apart. */
  readonly maxTouchPoints: number;
  /** Already running as the installed app. */
  readonly standalone: boolean;
}

export function readDevice(): DeviceInfo {
  const nav = navigator as Navigator & { readonly standalone?: boolean };
  const standaloneWindow =
    typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints || 0,
    standalone: nav.standalone === true || standaloneWindow,
  };
}

const IOS_DEVICE = /\b(?:iPhone|iPad|iPod)\b/;
// Other browsers on iOS name themselves; their Add to Home Screen steps differ from Safari's.
const OTHER_IOS_BROWSER = /\b(?:CriOS|FxiOS|EdgiOS|OPiOS|GSA)\/|FBAN|FBAV|Instagram/;

/** iPhone, iPod or iPad Safari, which installs only through Share → Add to Home Screen. */
export function isIosSafari({ userAgent, maxTouchPoints }: DeviceInfo): boolean {
  const ios = IOS_DEVICE.test(userAgent) || (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1);
  return ios && /\bSafari\//.test(userAgent) && !OTHER_IOS_BROWSER.test(userAgent);
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Reading `localStorage` throws where the browser blocks site data.
    return null;
  }
}

function readShown(storage: KeyValueStorage | null): number | null {
  try {
    const raw = storage?.getItem(INSTALL_SHOWN_KEY) ?? null;
    const at = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function writeShown(storage: KeyValueStorage | null, at: number): void {
  try {
    storage?.setItem(INSTALL_SHOWN_KEY, String(at));
  } catch {
    // Without storage the card still shows at most once in this page.
  }
}

/** Whether a card may show at `now`; records `now` as its time when it may. */
function claimShowing(storage: KeyValueStorage | null, now: number): boolean {
  const last = readShown(storage);
  if (last !== null && last > now) {
    // The clock moved back: count the week from now rather than from a future time.
    writeShown(storage, now);
    return false;
  }
  if (last !== null && now - last < INSTALL_CARD_INTERVAL_MS) return false;
  writeShown(storage, now);
  return true;
}

export interface InstallPromptProps {
  /** The browser's install offer; the app's own by default. */
  readonly offer?: InstallOffer;
  readonly clock?: Clock;
  /** Where the last-shown time is kept; defaults to `localStorage`, `null` for nowhere. */
  readonly storage?: KeyValueStorage | null;
  /** Defaults to what `navigator` says. */
  readonly device?: DeviceInfo;
}

/**
 * The install card (P09-18): Install and Not now where the browser offers to install the app,
 * the Add to Home Screen steps on iPhone and iPad Safari, nothing in the installed app. It shows
 * at most once in a page and once in seven days on a device; dismissing, installing or ignoring
 * it all count.
 */
export function InstallPrompt({
  offer = appInstallOffer,
  clock = systemClock,
  storage,
  device,
}: InstallPromptProps) {
  const { event, installed } = useSyncExternalStore(offer.subscribe, offer.getSnapshot);
  const [info] = useState(() => device ?? readDevice());
  const [store] = useState(() => (storage === undefined ? browserStorage() : storage));
  const kind =
    info.standalone || installed ? null : event ? 'prompt' : isIosSafari(info) ? 'ios' : null;
  // Decided once per page: a second offer in the same visit never brings the card back.
  const decided = useRef<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (kind === null || decided.current !== null) return;
    decided.current = claimShowing(store, clock.now());
    setOpen(decided.current);
  }, [kind, store, clock]);

  if (!open || kind === null) return null;

  const dismiss = (): void => setOpen(false);
  const install = async (): Promise<void> => {
    setOpen(false);
    const kept = offer.take();
    if (!kept) return;
    try {
      // Called inside the press: browsers show the prompt only for a person's gesture.
      await kept.prompt();
      await kept.userChoice;
    } catch (error) {
      console.warn('Platewise: the install prompt could not be shown', error);
    }
  };

  const ios = kind === 'ios';
  return (
    <div className={styles.notice} role="group" aria-labelledby={titleId} data-ui="shell.install">
      <div className={styles.text}>
        <p id={titleId} className={styles.title}>
          {t('shell.install.title')}
        </p>
        <p className={styles.body}>{t(ios ? 'shell.install.iosBody' : 'shell.install.body')}</p>
      </div>
      <div className={styles.actions}>
        {ios ? (
          <Button variant="secondary" data-ui="shell.install.dismiss" onClick={dismiss}>
            {t('shell.install.gotIt')}
          </Button>
        ) : (
          <>
            <Button variant="quiet" data-ui="shell.install.later" onClick={dismiss}>
              {t('shell.install.later')}
            </Button>
            <Button variant="primary" data-ui="shell.install.install" onClick={install}>
              {t('shell.install.install')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
