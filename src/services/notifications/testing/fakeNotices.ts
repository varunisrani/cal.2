// A stand-in for the `Notices` service (P17): records every notice posted and answers what the test
// set (`posted` unless told otherwise); a onceKey answers `already` the second time, as the real
// one does.

import type { Notice, Notices, PostOutcome } from '../contract';

export class FakeNotices implements Notices {
  /** Every notice asked for, in order. */
  readonly asked: Notice[] = [];
  /** The notices that were posted (answered `posted`). */
  readonly posted: Notice[] = [];
  /** What a new onceKey is answered; `posted` by default. */
  answer: Exclude<PostOutcome, 'already'> = 'posted';
  private readonly keys = new Set<string>();

  async post(notice: Notice): Promise<PostOutcome> {
    this.asked.push(notice);
    if (this.answer !== 'posted') return this.answer;
    if (this.keys.has(notice.onceKey)) return 'already';
    this.keys.add(notice.onceKey);
    this.posted.push(notice);
    return 'posted';
  }

  /** The kinds posted, in order. */
  kinds(): string[] {
    return this.posted.map((notice) => notice.kind);
  }
}
