import type { ReactNode } from 'react';

/**
 * Platewise's own icon set, drawn for this app on a 24 × 24 grid: strokes in `currentColor`,
 * 1.75 wide with round ends and joins, nothing filled. Each icon is a few plain shapes so it
 * reads at 16 px and recolours with the text around it.
 */
const SHAPES = {
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevronLeft: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  chevronRight: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  chevronUp: <path d="M5.5 14.5L12 8l6.5 6.5" />,
  chevronDown: <path d="M5.5 9.5L12 16l6.5-6.5" />,
  camera: (
    <>
      <rect x="2.75" y="7" width="18.5" height="13" rx="3.5" />
      <path d="M8.5 7l1.4-2.5h4.2L15.5 7" />
      <circle cx="12" cy="13.5" r="3.6" />
      <path d="M17.8 10.2h.1" />
    </>
  ),
  photos: (
    <>
      <path d="M7.5 4.5h11a2 2 0 0 1 2 2v10" />
      <rect x="3.5" y="8" width="13.5" height="12" rx="2.5" />
      <path d="M3.5 17.5l4-4 3 3 2-2 4.5 4.5" />
      <circle cx="12.5" cy="11.6" r="1.2" />
    </>
  ),
  barcode: (
    <>
      <path d="M3 8V5.5A1.5 1.5 0 0 1 4.5 4H7M17 4h2.5A1.5 1.5 0 0 1 21 5.5V8" />
      <path d="M21 16v2.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H4.5A1.5 1.5 0 0 1 3 18.5V16" />
      <path d="M7.5 8v8M10.5 8v8M13 8v8M16.5 8v8" />
    </>
  ),
  text: <path d="M5 6.5h14M5 11h14M5 15.5h14M5 20h8" />,
  pencil: (
    <>
      <path d="M15.2 4.8l4 4L9 19H5v-4z" />
      <path d="M13 7l4 4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  drop: (
    <>
      <path d="M12 3.5c3.2 4 6 7.4 6 10.6a6 6 0 0 1-12 0c0-3.2 2.8-6.6 6-10.6z" />
      <path d="M9.4 14.6a2.6 2.6 0 0 0 2.1 2.3" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M7.5 3.5c0 4.5 4.5 5.5 4.5 8.5s-4.5 4-4.5 8.5" />
      <path d="M16.5 3.5c0 4.5-4.5 5.5-4.5 8.5s4.5 4 4.5 8.5" />
    </>
  ),
  scale: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 9.5a5 5 0 0 1 8 0" />
      <path d="M12 10l1.3-2.2" />
    </>
  ),
  chart: <path d="M3.5 20h17M6.5 16.5V13M10.5 16.5V8M14.5 16.5V11M18.5 16.5V5.5" />,
  chat: (
    <path d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17h-1A2.5 2.5 0 0 1 3 14.5v-7A2.5 2.5 0 0 1 5.5 5z" />
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <circle cx="12" cy="12" r="6.6" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6" />
      <path d="M5.5 5.5l1.85 1.85M16.65 16.65l1.85 1.85M5.5 18.5l1.85-1.85M16.65 7.35l1.85-1.85" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2" />
      <path d="M6.5 6.5l1 13A1.5 1.5 0 0 0 9 21h6a1.5 1.5 0 0 0 1.5-1.5l1-13" />
      <path d="M10.5 10.5V17M13.5 10.5V17" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4.9L3.4 17.2a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5M12 17v.1" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" />
      <path d="M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5.5A1.5 1.5 0 0 0 4 5v8.5A1.5 1.5 0 0 0 5.5 15H6" />
    </>
  ),
  sort: <path d="M8 19.5v-15M4.5 8L8 4.5 11.5 8M16 4.5v15M12.5 16l3.5 3.5 3.5-3.5" />,
  plate: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.9-.8M12 14.5v2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof SHAPES;

/** Every icon in the set, in the order above. */
export const ICON_NAMES = Object.keys(SHAPES) as IconName[];

export interface IconProps {
  readonly name: IconName;
  /** Names the icon for assistive tech. Without it the icon is decoration and hidden. */
  readonly label?: string;
  /** Width and height: a number is px, a string any CSS length (default 24). */
  readonly size?: number | string;
  readonly className?: string;
}

export function Icon({ name, label, size = 24, className }: IconProps) {
  const named = label !== undefined && label !== '';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={className}
      data-icon={name}
      {...(named ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {SHAPES[name]}
    </svg>
  );
}
