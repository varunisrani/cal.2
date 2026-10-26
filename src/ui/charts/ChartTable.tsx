import styles from './charts.module.css';
import { chartT } from './text';

export interface ChartTableRow {
  readonly key: string;
  /** The row's date as shown. */
  readonly date: string;
  /** The row's value as shown, with its unit. */
  readonly value: string;
}

export interface ChartTableProps {
  /** The table's name: the chart's own label. */
  readonly caption: string;
  /** The value column's heading. */
  readonly valueLabel: string;
  readonly rows: readonly ChartTableRow[];
  /** Sentences read before the table, e.g. the goal. */
  readonly notes?: readonly string[];
  readonly 'data-ui'?: string;
}

/**
 * A chart's values as text: a table of dates and values, visually hidden, for screen readers
 * and anyone who cannot use the pointer inspector.
 */
export function ChartTable({
  caption,
  valueLabel,
  rows,
  notes = [],
  'data-ui': dataUi,
}: ChartTableProps) {
  return (
    <div className={styles.hidden}>
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
      <table data-ui={dataUi}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{chartT('charts.date')}</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.date}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
