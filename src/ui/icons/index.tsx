import type { ReactNode } from 'react';

/**
 * Platewise's own icon set, drawn for this app on a 24 × 24 grid: strokes only, one weight,
 * round ends and corners, all in `currentColor`, so an icon takes the colour of the text around
 * it and follows the theme with no extra rules.
 */

/** Every icon by name; a settings registry or a menu entry can store one of these. */
export const ICON_NAMES = [
  'plus',
  'camera',
  'photos',
  'barcode',
  'text',
  'pencil',
  'clock',
  'drop',
  'hourglass',
  'scale',
  'chart',
  'chat',
  'gear',
  'trash',
  'heart',
  'chevron-left',
  'chevron-right',
  'chevron-up',
  'chevron-down',
  'close',
  'check',
  'info',
  'copy',
  'sort',
  'home',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** The one line weight of the set, in grid units. */
export const ICON_STROKE = 1.75;

const DRAWINGS: Readonly<Record<IconName, ReactNode>> = {
  plus: <path d="M12 5v14M5 12h14" />,
  camera: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <path d="M8.5 7l1.5-2.5h4L15.5 7" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  photos: (
    <>
      <path d="M7 4h12a2 2 0 0 1 2 2v10" />
      <rect x="3" y="7" width="14" height="13" rx="2" />
      <path d="M3 17l4-4 4 4 2-2 4 4" />
      <circle cx="12.5" cy="10.5" r="1.25" />
    </>
  ),
  barcode: (
    <path d="M3 8V5a1 1 0 0 1 1-1h3M17 4h3a1 1 0 0 1 1 1v3M21 16v3a1 1 0 0 1-1 1h-3M7 20H4a1 1 0 0 1-1-1v-3M7.5 8v8M10.5 8v8M13 8v8M16.5 8v8" />
  ),
  text: <path d="M5 7V5h14v2M12 5v14M9.5 19h5" />,
  pencil: (
    <path d="M5 19l.9-4.1L15.6 5.2a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7L9.1 18.1zM13.8 7l3.2 3.2" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  drop: <path d="M12 3.5c3.2 4 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 2.8-6.5 6-10.5z" />,
  hourglass: (
    <path d="M7 3.5h10M7 20.5h10M8 3.5v2.2c0 1.8 1.2 3.3 4 6.3c2.8-3 4-4.5 4-6.3V3.5M8 20.5v-2.2c0-1.8 1.2-3.3 4-6.3c2.8 3 4 4.5 4 6.3v2.2" />
  ),
  scale: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 10a5 5 0 0 1 8 0M12 11l1.5-2.5" />
    </>
  ),
  chart: <path d="M4 20h16M7.5 16.5v-4M12 16.5v-9M16.5 16.5v-6" />,
  chat: (
    <path d="M6.5 4.5h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6L7 20v-3.5h-.5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" />
  ),
  gear: (
    <>
      <path d="M10.49 4.91L10.84 2.57L13.16 2.57L13.51 4.91A7.25 7.25 0 0 1 15.95 5.92L17.85 4.51L19.49 6.15L18.08 8.05A7.25 7.25 0 0 1 19.09 10.49L21.43 10.84L21.43 13.16L19.09 13.51A7.25 7.25 0 0 1 18.08 15.95L19.49 17.85L17.85 19.49L15.95 18.08A7.25 7.25 0 0 1 13.51 19.09L13.16 21.43L10.84 21.43L10.49 19.09A7.25 7.25 0 0 1 8.05 18.08L6.15 19.49L4.51 17.85L5.92 15.95A7.25 7.25 0 0 1 4.91 13.51L2.57 13.16L2.57 10.84L4.91 10.49A7.25 7.25 0 0 1 5.92 8.05L4.51 6.15L6.15 4.51L8.05 5.92A7.25 7.25 0 0 1 10.49 4.91Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  trash: (
    <path d="M4 7h16M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h7.2a1.5 1.5 0 0 0 1.5-1.4L18 7M10 11v5.5M14 11v5.5" />
  ),
  heart: (
    <path d="M12 19.5s-7.5-4.6-7.5-10a4.1 4.1 0 0 1 7.5-2.3a4.1 4.1 0 0 1 7.5 2.3c0 5.4-7.5 10-7.5 10z" />
  ),
  'chevron-left': <path d="M14.5 6l-6 6 6 6" />,
  'chevron-right': <path d="M9.5 6l6 6-6 6" />,
  'chevron-up': <path d="M6 14.5l6-6 6 6" />,
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.75h.01" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  sort: <path d="M8 18V6M5 9l3-3 3 3M16 6v12M13 15l3 3 3-3" />,
  home: (
    <path d="M4.5 10.5L12 4l7.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-3.5V15h-5v5.5H6A1.5 1.5 0 0 1 4.5 19z" />
  ),
};

export interface IconProps {
  readonly name: IconName;
  /**
   * Names the drawing for screen readers, for an icon that carries meaning on its own. Without
   * it the icon is decoration and hidden from them (the usual case: next to a text label, or in
   * a button that has its own name).
   */
  readonly label?: string;
  /** Edge length; by default 1em, so the icon follows the size of the text around it. */
  readonly size?: number | string;
  readonly className?: string;
}

/** One icon of the set as inline SVG. */
export function Icon({ name, label, size = '1em', className }: IconProps) {
  const named = label !== undefined && label !== '';
  const semantics = named ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg
      {...semantics}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={className}
      data-icon={name}
    >
      {DRAWINGS[name]}
    </svg>
  );
}
