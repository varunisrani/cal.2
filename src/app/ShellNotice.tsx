import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import styles from './shell.module.css';

/** Reloads the page: what the notice cards' button does outside tests. */
export function reloadPage(): void {
  window.location.reload();
}

export interface ShellNoticeProps {
  readonly title: string;
  readonly body: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
  /** The card's hook; the button gets `<hook>.reload`. */
  readonly 'data-ui': string;
}

/** A full-page card that stands in for the app (the recovery and crash cards). */
export function ShellNotice({
  title,
  body,
  actionLabel,
  onAction,
  'data-ui': ui,
}: ShellNoticeProps) {
  return (
    <main className={styles.notice} data-ui={ui}>
      <Card heading={title} headingLevel={2} role="alert" className={styles.noticeCard}>
        <p className={styles.noticeBody}>{body}</p>
        <Button variant="primary" block data-ui={`${ui}.reload`} onClick={onAction}>
          {actionLabel}
        </Button>
      </Card>
    </main>
  );
}
