import { act, render, screen } from '@testing-library/react';
import { Suspense, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { shell } from '../i18n/en/shell';
import { ErrorBoundary } from './ErrorBoundary';
import { onDemand } from './onDemand';
import { Skeleton } from './Skeleton';

/** A loader the test settles by hand. */
function controlledLoad<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { load: vi.fn(() => promise), resolve, reject };
}

function Greeting({ name }: { readonly name: string }) {
  return <p>Hello {name}</p>;
}

function drawn(Piece: ComponentType<{ readonly name: string }>) {
  render(
    <ErrorBoundary onReload={() => {}}>
      <Suspense fallback={<Skeleton data-ui="test.loading" />}>
        <Piece name="Ada" />
      </Suspense>
    </ErrorBoundary>,
  );
}

describe('onDemand', () => {
  it('fetches nothing until it is drawn, shows the fallback meanwhile, then the component', async () => {
    const chunk = controlledLoad<typeof Greeting>();
    const Piece = onDemand(chunk.load);
    expect(chunk.load).not.toHaveBeenCalled();

    drawn(Piece);
    expect(chunk.load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: shell.shell.loading })).toHaveAttribute(
      'data-ui',
      'test.loading',
    );

    await act(async () => chunk.resolve(Greeting));
    expect(screen.getByText('Hello Ada')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('falls into the crash card with Reload when its chunk cannot be fetched', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const chunk = controlledLoad<typeof Greeting>();
    drawn(onDemand(chunk.load));

    await act(async () =>
      chunk.reject(new TypeError('Failed to fetch dynamically imported module')),
    );
    expect(screen.getByRole('alert', { name: shell.shell.crash.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: shell.shell.crash.reload })).toBeInTheDocument();
  });
});
