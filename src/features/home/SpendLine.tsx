import type { Spend } from '../../domain/money/spending';
import { formatMoneyList } from '../../i18n/format';
import { Icon } from '../../ui/icons';
import styles from './home.module.css';
import { tx } from './text';

export interface SpendLineProps {
  /** What the shown day's foods cost, as far as they have prices (`spendOf`). */
  readonly spend: Spend;
  /** A tap: opens Progress › Spending. */
  readonly onOpen: () => void;
}

/**
 * The spend line under the day's summary (D-16.108): "₹240 spent", each currency added apart
 * ("₹240 and $5 spent"), the person's own first; "from 4 of 6 foods" when some foods have no price,
 * which never count as 0. Nothing on a day where no food has a price. The button is named by its
 * words in reading order.
 */
export function SpendLine({ spend, onOpen }: SpendLineProps) {
  if (spend.priced === 0) return null;
  return (
    <button type="button" className={styles.spend} data-ui="spending.home" onClick={onOpen}>
      <span className={styles.spendAmount} data-ui="spending.home.amount">
        {tx('home.spend', { amount: formatMoneyList(spend.totals) })}
      </span>
      {spend.priced < spend.foods ? (
        <>
          {' '}
          <span className={styles.spendNote} data-ui="spending.home.coverage">
            {tx('home.sugar.coverage', { count: spend.priced, total: spend.foods })}
          </span>
        </>
      ) : null}
      <Icon name="chevronRight" size={16} />
    </button>
  );
}
