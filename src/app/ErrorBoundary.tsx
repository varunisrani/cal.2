import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n/t';
import { Button } from '../ui/Button';
import { ProblemCard } from './ProblemCard';

/** Reloads the page: the way out of a crash or a database that will not open. */
export function reloadPage(): void {
  window.location.reload();
}

export interface ErrorBoundaryProps {
  readonly children?: ReactNode;
  /** What Reload does; the page reload by default. */
  readonly reload?: () => void;
}

interface ErrorBoundaryState {
  readonly crashed: boolean;
}

/** Shows a crash card with Reload in place of everything below when a render throws. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { crashed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The only record of the crash: there is no server to report to.
    console.error('Platewise crashed', error, info.componentStack);
  }

  override render() {
    if (!this.state.crashed) return this.props.children;
    const reload = this.props.reload ?? reloadPage;
    return (
      <ProblemCard
        data-ui="shell.crash"
        title={t('shell.crash.title')}
        body={t('shell.crash.body')}
        actions={
          <Button variant="primary" data-ui="shell.crash.reload" onClick={() => reload()}>
            {t('shell.reload')}
          </Button>
        }
      />
    );
  }
}
