import { t } from '../../i18n/t';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';

/** How long the "copied" confirmation stays. */
export const COPIED_TOAST_MS = 2000;

export interface CopyButtonProps {
  /** The reply as the model wrote it: copied as it is, Markdown included. */
  readonly text: string;
  readonly className?: string;
}

/**
 * Puts a Coach reply on the clipboard and says so in a short toast (P08-13). A clipboard that is
 * missing (an insecure page) or refused gets a toast saying the copy failed; nothing throws.
 */
export function CopyButton({ text, className }: CopyButtonProps) {
  const toast = useToast();

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(t('coach.copy.done'), { duration: COPIED_TOAST_MS });
    } catch {
      toast.show(t('coach.copy.failed'));
    }
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
