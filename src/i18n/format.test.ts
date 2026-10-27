import { describe, expect, it, vi } from 'vitest';
import {
  dateFormat,
  formatDay,
  formatDecimal,
  formatDuration,
  formatInt,
  formatNameList,
  formatPercent,
  formatPeriod,
  formatTime,
  numberFormat,
  pluralRules,
} from './format';
import { inTimeZone } from '../test/time';

/** `Intl` may print U+00A0, U+202F or U+2009 where a reader sees a space. */
const plain = (text: string): string => text.replace(/[\u00a0\u202f\u2009]/g, ' ');

describe('formatInt', () => {
  it('groups with the locale: 8368 is "8,368" in en-US and "8.368" in de-DE', () => {
    expect(formatInt(8368, 'en-US')).toBe('8,368');
    expect(formatInt(8368, 'de-DE')).toBe('8.368');
  });

  it('rounds half away from zero and never prints "-0"', () => {
    expect(formatInt(2.5, 'en-US')).toBe('3');
    expect(formatInt(-2.5, 'en-US')).toBe('-3');
    expect(formatInt(-0.4, 'en-US')).toBe('0');
    expect(formatInt(-0, 'en-US')).toBe('0');
    expect(formatInt(-0.49, 'en-US')).toBe('0');
    expect(formatInt(-0.5, 'en-US')).toBe('-1');
    expect(formatInt(1234567.89, 'en-US')).toBe('1,234,568');
  });

  it('follows the browser language by default', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
    expect(formatInt(8368)).toBe('8.368');
  });
});

describe('formatDecimal', () => {
  it('shows up to the given decimals with the locale separator', () => {
    expect(formatDecimal(70.25, 1, 'en-US')).toBe('70.3');
    expect(formatDecimal(70.25, 1, 'de-DE')).toBe('70,3');
    expect(formatDecimal(1234.5, 1, 'en-US')).toBe('1,234.5');
  });

  it('drops trailing zeros and never prints "-0"', () => {
    expect(formatDecimal(1, 2, 'en-US')).toBe('1');
    expect(formatDecimal(0.5, 2, 'en-US')).toBe('0.5');
    expect(formatDecimal(-0.04, 1, 'en-US')).toBe('0');
    expect(formatDecimal(-0.06, 1, 'en-US')).toBe('-0.1');
  });
});

describe('formatPercent', () => {
  it('shows a fraction as a percentage in the locale', () => {
    expect(formatPercent(0.235, 1, 'en-US')).toBe('23.5%');
    expect(plain(formatPercent(0.235, 1, 'de-DE'))).toBe('23,5 %');
    expect(formatPercent(0.256, 0, 'en-US')).toBe('26%');
    expect(formatPercent(-0.001, 0, 'en-US')).toBe('0%');
    expect(formatPercent(-0.006, 0, 'en-US')).toBe('-1%');
    expect(formatPercent(-0.0004, 1, 'en-US')).toBe('0%');
  });
});

describe('formatDay', () => {
  it('formats a day key in each style', () => {
    expect(formatDay('2026-10-11', 'short', 'en-US')).toBe('Oct 11');
    expect(formatDay('2026-10-11', 'medium', 'en-US')).toBe('Oct 11, 2026');
    expect(formatDay('2026-10-11', 'long', 'en-US')).toBe('Sunday, October 11, 2026');
    expect(formatDay('2026-10-11', 'weekday', 'en-US')).toBe('Sun, Oct 11');
  });

  it('uses the order and words of the locale', () => {
    expect(formatDay('2026-10-11', 'short', 'de-DE')).toBe('11. Okt.');
    expect(formatDay('2026-10-11', 'medium', 'en-GB')).toBe('11 Oct 2026');
  });

  it('shows the same calendar day in every time zone', () => {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/New_York']) {
      inTimeZone(zone, () => {
        expect(formatDay('2026-01-01', 'long', 'en-US')).toBe('Thursday, January 1, 2026');
        expect(formatDay('2026-03-08', 'short', 'en-US')).toBe('Mar 8');
      });
    }
  });

  it.each(['2026-13-01', '2026-02-30', '2026-2-03', '20261011', '', '2026-10-11T00:00'])(
    'rejects "%s", which is not a real day key',
    (key) => {
      expect(() => formatDay(key, 'short', 'en-US')).toThrow(RangeError);
    },
  );
});

describe('formatTime', () => {
  it('uses a 12-hour clock in en-US and a 24-hour clock in en-GB', () => {
    const afternoon = new Date(2026, 9, 11, 14, 5).getTime();
    const morning = new Date(2026, 9, 11, 9, 5).getTime();
    expect(plain(formatTime(afternoon, 'en-US'))).toBe('2:05 PM');
    expect(formatTime(afternoon, 'en-GB')).toBe('14:05');
    expect(plain(formatTime(morning, 'en-US'))).toBe('9:05 AM');
    expect(formatTime(morning, 'en-GB')).toBe('09:05');
  });

  it('follows the current time zone even after its formatter was cached', () => {
    const instant = Date.UTC(2026, 9, 11, 18, 5);
    expect(inTimeZone('America/New_York', () => plain(formatTime(instant, 'en-US')))).toBe(
      '2:05 PM',
    );
    expect(inTimeZone('Asia/Tokyo', () => plain(formatTime(instant, 'en-US')))).toBe('3:05 AM');
  });
});

describe('formatPeriod', () => {
  it('labels a period within one month', () => {
    expect(formatPeriod('2026-10-11', '2026-10-17', '2026-10-26', 'en-US')).toBe('Oct 11 – 17');
  });

  it('labels a period across two months', () => {
    expect(formatPeriod('2026-09-28', '2026-10-04', '2026-10-26', 'en-US')).toBe('Sep 28 – Oct 4');
  });

  it('shows the years for a period across two years', () => {
    expect(formatPeriod('2025-12-28', '2026-01-03', '2026-01-03', 'en-US')).toBe(
      'Dec 28, 2025 – Jan 3, 2026',
    );
    expect(formatPeriod('2026-12-28', '2027-01-03', '2026-12-30', 'en-US')).toBe(
      'Dec 28, 2026 – Jan 3, 2027',
    );
  });

  it('shows the year for a period that lies wholly in another year', () => {
    expect(formatPeriod('2025-10-11', '2025-10-17', '2026-10-26', 'en-US')).toBe(
      'Oct 11 – 17, 2025',
    );
  });

  it('labels a one-day period with that day', () => {
    expect(formatPeriod('2026-10-11', '2026-10-11', '2026-10-26', 'en-US')).toBe('Oct 11');
  });

  it('puts plain spaces around the en dash', () => {
    const label = formatPeriod('2026-09-28', '2026-10-04', '2026-10-26', 'en-US');
    expect(label).toContain(' – ');
    expect(label).not.toMatch(/[\u2009\u202f]/);
  });

  it('uses the order and words of the locale', () => {
    expect(formatPeriod('2026-10-11', '2026-10-17', '2026-10-26', 'en-GB')).toBe('11–17 Oct');
    expect(formatPeriod('2026-10-11', '2026-10-17', '2026-10-26', 'de-DE')).toBe('11.–17. Okt.');
  });

  it('refuses a period that ends before it starts', () => {
    expect(() => formatPeriod('2026-10-17', '2026-10-11', '2026-10-26', 'en-US')).toThrow(
      RangeError,
    );
  });

  it('joins both ends with a spaced en dash where formatRange is missing', () => {
    const proto = Intl.DateTimeFormat.prototype as { formatRange?: unknown };
    const saved = proto.formatRange;
    delete proto.formatRange;
    try {
      expect(formatPeriod('2026-10-11', '2026-10-17', '2026-10-26', 'en-US')).toBe(
        'Oct 11 – Oct 17',
      );
      expect(formatPeriod('2026-10-11', '2026-10-11', '2026-10-26', 'en-US')).toBe('Oct 11');
    } finally {
      proto.formatRange = saved;
    }
  });
});

describe('formatDuration', () => {
  it('shows minutes as hours and minutes in narrow units', () => {
    expect(formatDuration(45, 'en-US')).toBe('45m');
    expect(formatDuration(960, 'en-US')).toBe('16h');
    expect(formatDuration(990, 'en-US')).toBe('16h 30m');
    expect(formatDuration(0, 'en-US')).toBe('0m');
  });

  it('floors fractions and treats negative lengths as zero', () => {
    expect(formatDuration(65.9, 'en-US')).toBe('1h 5m');
    expect(formatDuration(-5, 'en-US')).toBe('0m');
  });

  it('uses the units of the locale', () => {
    expect(plain(formatDuration(990, 'de-DE'))).toBe('16 Std., 30 Min.');
  });
});

describe('formatNameList', () => {
  it('joins names without "and", as the locale lists them', () => {
    expect(formatNameList(['Protein', 'Fibre', 'Water'], 'en-US')).toBe('Protein, Fibre, Water');
    expect(formatNameList(['Protein'], 'en-US')).toBe('Protein');
    expect(formatNameList([], 'en-US')).toBe('');
  });
});

describe('Intl instance cache', () => {
  it('returns the same NumberFormat on the second call', () => {
    const first = numberFormat('en-US', { maximumFractionDigits: 1 });
    expect(numberFormat('en-US', { maximumFractionDigits: 1 })).toBe(first);
    expect(numberFormat('en-US', { maximumFractionDigits: 2 })).not.toBe(first);
    expect(numberFormat('de-DE', { maximumFractionDigits: 1 })).not.toBe(first);
  });

  it('returns the same DateTimeFormat on the second call', () => {
    const first = dateFormat('en-GB', { month: 'short' });
    expect(dateFormat('en-GB', { month: 'short' })).toBe(first);
    expect(dateFormat('en-GB', { month: 'long' })).not.toBe(first);
  });

  it('returns the same PluralRules on the second call', () => {
    expect(pluralRules('en')).toBe(pluralRules('en'));
    expect(pluralRules('fr')).not.toBe(pluralRules('en'));
  });
});
