// Lint fixture for rule 3: a screen calls the network itself instead of going through
// src/ai/client. Linted only by scripts/lint-rules.test.ts, as a file in src/features/.
import { t } from '../../i18n/t';

export function SendButton({ body }: { body: string }) {
  const send = () => fetch('https://ai.example.invalid/v1/chat', { method: 'POST', body });
  return (
    <button type="button" onClick={send}>
      {t('common.retry')}
    </button>
  );
}
