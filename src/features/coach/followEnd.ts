// Keeping the Coach's conversation at its newest message (P13, the owner's "easy to use" chat).
// The list follows a reply, the waiting dots, a reply growing as it streams in (D-16.106) and
// anything that grows while the person is at the end or close to it; once they scroll up to read,
// it stays where they are and counts what arrives, for the "Jump to latest" button. Their own
// question always brings the end back.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { CoachMessage } from '../../domain/model';

/** This close to the end (px) still counts as reading the newest message. */
export const FOLLOW_SLACK_PX = 80;

/** The three numbers of a scrolling box that say where in it the reader is. */
export interface ScrollMetrics {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/** How far below the visible part the end is, in px (never below 0). */
export function distanceToEnd({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): number {
  return Math.max(0, scrollHeight - clientHeight - scrollTop);
}

export function isNearEnd(metrics: ScrollMetrics, slack: number = FOLLOW_SLACK_PX): boolean {
  return distanceToEnd(metrics) <= slack;
}

/**
 * How many messages came after the one with `seenId`, the newest the person had in view; every
 * message when that one is gone (the 200-message cap took it), none when nothing was seen yet.
 */
export function unseenAfter(
  messages: readonly Pick<CoachMessage, 'id'>[],
  seenId: string | null,
): number {
  if (seenId === null) return 0;
  const at = messages.findIndex((message) => message.id === seenId);
  return at === -1 ? messages.length : messages.length - 1 - at;
}

/** Whether the device asks for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A jump glides, unless motion is reduced: then it is instant. */
export function jumpBehaviour(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'instant' : 'smooth';
}

/** Puts the end of `list` in view; `smooth` and `instant` override the stylesheet's own. */
function showEnd(list: HTMLElement, behaviour?: ScrollBehavior): void {
  const top = list.scrollHeight;
  if (behaviour !== undefined && typeof list.scrollTo === 'function') {
    list.scrollTo({ top, behavior: behaviour });
  } else {
    list.scrollTop = top;
  }
}

export interface FollowEnd {
  /** The person has scrolled away from the end: Jump to latest shows. */
  readonly away: boolean;
  /** Messages that arrived since they left the end. */
  readonly unseen: number;
  /** Brings the newest message into view: a glide, instant with reduced motion. */
  readonly jump: () => void;
}

export interface FollowEndInput {
  readonly listRef: RefObject<HTMLElement | null>;
  /** The list's content, watched for growth (a photo loading, Details opening, a card). */
  readonly threadRef: RefObject<HTMLElement | null>;
  readonly messages: readonly CoachMessage[];
  readonly pending: boolean;
  /** The reply streaming in, as far as it came; the end follows it while it grows. */
  readonly live?: string;
  /** The on-screen keyboard's cover; the end stays in view when it moves. */
  readonly keyboardInset: number;
}

/**
 * Follows the end of the conversation (see the file's header). It opens at the end at once; later
 * moves follow the stylesheet's glide, which reduced motion turns off.
 */
export function useFollowEnd({
  listRef,
  threadRef,
  messages,
  pending,
  live,
  keyboardInset,
}: FollowEndInput): FollowEnd {
  /** Following the end. A ref: scroll events and observers read it between renders. */
  const following = useRef(true);
  const lastTop = useRef(0);
  const opened = useRef(false);
  const [away, setAway] = useState(false);
  // By id: a live re-read hands in new objects for the same messages, which is no news.
  const newestId = messages.at(-1)?.id;
  const newestRole = messages.at(-1)?.role;
  const [seenId, setSeenId] = useState<string | null>(newestId ?? null);

  const settle = useCallback((now: boolean): void => {
    following.current = now;
    setAway(!now);
  }, []);

  /** Shows the end, and takes where the list is now as the start of any glide down. */
  const toEnd = useCallback((list: HTMLElement, behaviour?: ScrollBehavior): void => {
    showEnd(list, behaviour);
    lastTop.current = list.scrollTop;
  }, []);

  // A new message: at the end (or the person's own question) the list follows and it counts as
  // seen; away from the end it only adds to the count.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || newestId === undefined) return;
    if (!opened.current) {
      opened.current = true;
      toEnd(list);
      // From now on the moves glide (unless motion is reduced, see the stylesheet).
      list.dataset.settled = '';
    } else if (newestRole === 'user' || following.current) {
      settle(true);
      toEnd(list);
    }
    if (following.current) setSeenId(newestId);
  }, [listRef, newestId, newestRole, settle, toEnd]);

  // The waiting dots, a growing reply and the keyboard move the end; the list follows only while
  // it follows.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && opened.current && following.current) toEnd(list);
  }, [listRef, pending, live, keyboardInset, toEnd]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const onScroll = (): void => {
      const top = list.scrollTop;
      // Only moving up leaves the end: a glide on its way down passes far from it too.
      if (isNearEnd(list)) settle(true);
      else if (top < lastTop.current) settle(false);
      lastTop.current = top;
    };
    list.addEventListener('scroll', onScroll, { passive: true });
    return () => list.removeEventListener('scroll', onScroll);
  }, [listRef, settle]);

  useEffect(() => {
    const list = listRef.current;
    const thread = threadRef.current;
    if (!list || !thread || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => {
      if (following.current) toEnd(list);
    });
    observer.observe(list);
    observer.observe(thread);
    return () => observer.disconnect();
  }, [listRef, threadRef, toEnd]);

  // Back at the end: everything there is has been seen.
  useEffect(() => {
    if (!away && newestId !== undefined) setSeenId(newestId);
  }, [away, newestId]);

  const jump = useCallback((): void => {
    const list = listRef.current;
    if (!list) return;
    settle(true);
    toEnd(list, jumpBehaviour(prefersReducedMotion()));
  }, [listRef, settle, toEnd]);

  return { away, unseen: away ? unseenAfter(messages, seenId) : 0, jump };
}
