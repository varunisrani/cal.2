import { t } from '../../i18n/t';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';
import { copyText } from './clipboard';

/** How long the "copied" confirmation stays. */
export const COPIED_TOAST_MS = 2000;

export interface CopyButtonProps {
  /** The reply as the model wrote it: copied as it is, Markdown included. */
  readonly text: string;
  readonly className?: string;
}

/**
 * Puts a Coach reply on the clipboard and says so in a short toast (P08-13). Without the
 * Clipboard API (an insecure page, an older WebView) the copy command does it; when both fail a
 * toast says the copy failed. Nothing throws.
 */
export function CopyButton({ text, className }: CopyButtonProps) {
  const toast = useToast();

  const copy = async (): Promise<void> => {
    if (await copyText(text)) toast.show(t('coach.copy.done'), { duration: COPIED_TOAST_MS });
    else toast.show(t('coach.copy.failed'));
  };

  return (
    <IconButton
      label={t('coach.copy.label')}
      icon={<Icon name="copy" size={18} />}
      onClick={copy}
      className={className}
      data-ui="coach.copy"
    />
  );
}
