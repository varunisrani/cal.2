import { Component, type ReactNode } from 'react';
import { t } from '../i18n/t';
import { reloadPage, ShellNotice } from './ShellNotice';

export interface ErrorBoundaryProps {
  readonly children?: ReactNode;
  /** What the crash card's Reload does (tests pass their own). */
  readonly onReload?: () => void;
}

interface ErrorBoundaryState {
  readonly crashed: boolean;
}

/** Catches a crash while drawing anything below it and shows a card with Reload instead. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { crashed: true };
  }

  override render(): ReactNode {
    if (!this.state.crashed) return this.props.children;
    return (
      <ShellNotice
        title={t('shell.crash.title')}
        body={t('shell.crash.body')}
        actionLabel={t('shell.crash.reload')}
        onAction={this.props.onReload ?? reloadPage}
        data-ui="shell.crash"
      />
    );
  }
}
