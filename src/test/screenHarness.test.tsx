import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeHarnesses, until, untilShown } from './screenHarness';

afterEach(closeHarnesses);

/** Says the answer once `answer` settles: a state set from a promise, outside any event. */
function Answer({ answer }: { readonly answer: Promise<string> }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => void answer.then(setSaid)}>
        Ask
      </button>
      {said === null ? null : <p data-ui="answer">{said}</p>}
    </>
  );
}

describe('until', () => {
  it('sees a state set while it waits, as when a promise settles, with no act warning', async () => {
    const warn = vi.spyOn(console, 'error');
    let release!: (said: string) => void;
    render(<Answer answer={new Promise((resolve) => (release = resolve))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    const shown = untilShown('[data-ui="answer"]');
    release('Yes');
    await shown;

    expect(screen.getByText('Yes')).toBeVisible();
    expect(warn).not.toHaveBeenCalled();
  });

  it('stops a wait its test left open, so it cannot run on into the next test', async () => {
    const never = vi.fn(() => false);
    void until(never);
    await closeHarnesses();
    never.mockClear();

    const marker = document.createElement('p');
    marker.dataset.ui = 'marker';
    const shown = untilShown('[data-ui="marker"]');
    document.body.append(marker);
    await shown;
    marker.remove();

    expect(never).not.toHaveBeenCalled();
  });
});
