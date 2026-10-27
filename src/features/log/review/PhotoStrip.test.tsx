import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { common } from '../../../i18n/en/common';
import { review } from '../../../i18n/en/review';
import { fixedClock } from '../../../lib/clock';
import { ServicesProvider, type Services } from '../../../services/context';
import type { PhotoService } from '../../../services/photos';
import { FACTORY_NOW } from '../../../test/factories';
import { PhotoStrip, type PhotoStripProps } from './PhotoStrip';

const words = review.review.photos;

// ---- Object URLs: jsdom has none, so each one is recorded with the blob it stands for ---------

let urls = new Map<string, Blob>();
const urlMethods = ['createObjectURL', 'revokeObjectURL'] as const;
const savedUrlMethods = urlMethods.map((name) => Object.getOwnPropertyDescriptor(URL, name));

beforeEach(() => {
  urls = new Map();
  let made = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:review-test/${++made}`;
      urls.set(url, blob);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => void urls.delete(url),
  });
});

afterEach(() => {
  urlMethods.forEach((name, index) => {
    const saved = savedUrlMethods[index];
    if (saved) Object.defineProperty(URL, name, saved);
    else Reflect.deleteProperty(URL, name);
  });
});

/** A photo service whose display copies are blobs typed with the photo id and the size. */
function photoService(missing: readonly string[] = []): PhotoService {
  const copy = (size: string) => (id: string) =>
    Promise.resolve(missing.includes(id) ? null : new Blob([id], { type: `image/${size}-${id}` }));
  return {
    store: vi.fn(),
    thumbnail: vi.fn(),
    preview: vi.fn(copy('preview')),
    viewer: vi.fn(copy('viewer')),
  };
}

async function renderStrip(props: PhotoStripProps, photos: PhotoService | undefined) {
  const services: Services = {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
    onboarding: { complete: vi.fn() },
    aiSetup: {
      saveChoice: vi.fn(),
      savedKeyMask: vi.fn(),
      setTermsAccepted: vi.fn(),
      setUpLater: vi.fn(),
    },
    planBuilder: { build: vi.fn() },
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
    ...(photos ? { photos } : {}),
  };
  // Let the display copies resolve inside act.
  await act(async () => {
    render(
      <ServicesProvider services={services}>
        <PhotoStrip {...props} />
      </ServicesProvider>,
    );
  });
  return userEvent.setup();
}

/** The blob type behind an image's object URL ("image/preview-photo-1"). */
const blobOf = (image: HTMLElement) => urls.get(image.getAttribute('src') ?? '')?.type;

describe('PhotoStrip', () => {
  it('shows every photo at card size with an i/n badge when there are several', async () => {
    await renderStrip({ photoIds: ['photo-1', 'photo-2', 'photo-3'] }, photoService());
    const strip = within(screen.getByRole('list', { name: words.label }));
    const buttons = strip.getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Open photo 1 of 3',
      'Open photo 2 of 3',
      'Open photo 3 of 3',
    ]);
    expect(buttons.map((button) => button.textContent)).toEqual(['1/3', '2/3', '3/3']);
    const images = buttons.map((button) => button.querySelector('img') as HTMLElement);
    expect(images.map(blobOf)).toEqual([
      'image/preview-photo-1',
      'image/preview-photo-2',
      'image/preview-photo-3',
    ]);
  });

  it('shows no badge for a single photo, and an empty frame for one that cannot be shown', async () => {
    await renderStrip({ photoIds: ['photo-9'] }, photoService(['photo-9']));
    const button = screen.getByRole('button', { name: 'Open photo 1 of 1' });
    expect(button.textContent).toBe('');
    expect(button.querySelector('img')).toBeNull();
  });

  it('opens the viewer on the tapped photo at viewer size, steps through and closes', async () => {
    const user = await renderStrip({ photoIds: ['photo-1', 'photo-2'] }, photoService());
    await user.click(screen.getByRole('button', { name: 'Open photo 2 of 2' }));

    const viewer = screen.getByRole('dialog', { name: 'Photo 2 of 2' });
    expect(within(viewer).getByRole('button', { name: common.common.close })).toHaveFocus();
    expect(blobOf(within(viewer).getByRole('img', { name: 'Photo 2 of 2' }))).toBe(
      'image/viewer-photo-2',
    );

    // Next from the last photo goes round to the first.
    await user.click(within(viewer).getByRole('button', { name: words.next }));
    const first = screen.getByRole('dialog', { name: 'Photo 1 of 2' });
    expect(blobOf(within(first).getByRole('img', { name: 'Photo 1 of 2' }))).toBe(
      'image/viewer-photo-1',
    );
    await user.click(within(first).getByRole('button', { name: words.previous }));
    expect(screen.getByRole('dialog', { name: 'Photo 2 of 2' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open photo 1 of 2' }));
    await user.click(screen.getByRole('button', { name: common.common.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has no Previous or Next for a single photo', async () => {
    const user = await renderStrip({ photoIds: ['photo-1'] }, photoService());
    await user.click(screen.getByRole('button', { name: 'Open photo 1 of 1' }));
    expect(screen.queryByRole('button', { name: words.next })).toBeNull();
    expect(screen.queryByRole('button', { name: words.previous })).toBeNull();
  });

  it("shows the food's emoji large when there are no photos", async () => {
    await renderStrip({ photoIds: [], emoji: ' 🍲 ' }, photoService());
    expect(document.querySelector('[data-ui="review.emoji"]')).toHaveTextContent('🍲');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('draws a plate icon for a food with neither photos nor an emoji', async () => {
    await renderStrip({ photoIds: [] }, undefined);
    const none = document.querySelector('[data-ui="review.photos.none"]');
    expect(none?.querySelector('[data-icon="plate"]')).not.toBeNull();
  });

  it('leaves the frames empty when there is no photo service', async () => {
    await renderStrip({ photoIds: ['photo-1', 'photo-2'] }, undefined);
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
