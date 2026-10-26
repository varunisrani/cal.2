// Lint fixture (P00-07, rule 3): linted as a screen, which must not call the network itself.
import { t } from '../../i18n/t';

export function LookUpButton({ code }: { code: string }) {
  const lookUp = () => fetch(`https://example.org/products/${encodeURIComponent(code)}`);
  return (
    <button type="button" onClick={() => void lookUp()}>
      {t('common.retry')}
    </button>
  );
}
