import { afterEach, describe, expect, it, vi } from 'vitest';
import { FACTORY_NOW, makeWalk } from '../../test/factories';
import { CATCH_UP_DAYS, type WalkPhase } from './service';
import { walkHarness, type WalkHarness, type WalkHarnessOptions } from './testing/walkHarness';

const DAY = 86_400_000;
const harnesses: WalkHarness[] = [];

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.close();
  vi.restoreAllMocks();
});

async function setup(options: WalkHarnessOptions = {}): Promise<WalkHarness> {
  const harness = await walkHarness(options);
  harnesses.push(harness);
  return harness;
}

function phaseOf(harness: WalkHarness): WalkPhase {
  return harness.service.getSnapshot();
}

function finishedWalk(harness: WalkHarness) {
  const phase = phaseOf(harness);
  if (phase.kind !== 'finished') throw new Error(`not finished: ${phase.kind}`);
  return phase.walk;
}

describe('starting a walk', () => {
  it('explains first when Android has not been asked, then asks and starts with the route', async () => {
    const h = await setup({ permissions: { location: 'prompt', activity: 'prompt' } });
    await h.service.start();
    expect(phaseOf(h)).toEqual({
      kind: 'asking',
      permissions: { location: 'prompt', activity: 'prompt', notifications: 'granted' },
    });
    expect(h.tracker.calls).toEqual(['checkPermissions']);

    await h.service.confirmStart();
    expect(h.tracker.calls).toEqual([
      'checkPermissions',
      'requestPermissions',
      'start',
      'addListener',
    ]);
    const phase = phaseOf(h);
    expect(phase.kind).toBe('active');
    if (phase.kind !== 'active') return;
    expect(phase.walk).toMatchObject({
      state: 'running',
      startedAt: FACTORY_NOW,
      locationGranted: true,
      stepsGranted: true,
    });
  });

  it('starts at once when Android was asked before, without the route when location was refused', async () => {
    const h = await setup({ permissions: { location: 'denied', activity: 'granted' } });
    await h.service.start();
    expect(h.tracker.calls).toEqual(['checkPermissions', 'start', 'addListener']);
    const phase = phaseOf(h);
    expect(phase.kind === 'active' && phase.walk.locationGranted).toBe(false);
  });

  it('starts with what was allowed when the person refuses in Android', async () => {
    const h = await setup({ permissions: { location: 'prompt', activity: 'prompt' } });
    h.tracker.grantOnRequest(false);
    await h.service.start();
    await h.service.confirmStart();
    const phase = phaseOf(h);
    expect(phase.kind).toBe('active');
    expect(
      phase.kind === 'active' && [phase.walk.locationGranted, phase.walk.stepsGranted],
    ).toEqual([false, false]);
  });

  it('goes back to idle from the explanation, and says so when the tracker cannot start', async () => {
    const h = await setup({ permissions: { location: 'prompt' } });
    await h.service.start();
    h.service.cancelStart();
    expect(phaseOf(h)).toEqual({ kind: 'idle' });

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.tracker.setPermissions({ location: 'granted' });
    h.tracker.failNext('start');
    await h.service.start();
    expect(phaseOf(h)).toEqual({ kind: 'failed', step: 'start' });
    h.service.dismiss();
    expect(phaseOf(h)).toEqual({ kind: 'idle' });
  });
});

describe('the tracker’s own rules', () => {
  it('takes up the walk the tracker still holds when Start is pressed again', async () => {
    const h = await setup();
    await h.tracker.start({ withRoute: true });
    h.tracker.walk(120);
    await h.service.start();
    const phase = phaseOf(h);
    expect(phase.kind === 'active' && [phase.walk.id, phase.walk.activeSeconds]).toEqual([
      'tracked-1',
      120,
    ]);
  });

  it('goes back to idle when Pause finds no walk (it was let go elsewhere)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = await setup();
    await h.service.start();
    await h.tracker.discard();
    h.tracker.failNext('pause');
    await h.service.pause();
    expect(phaseOf(h)).toEqual({ kind: 'idle' });
    expect(h.tracker.listenerCount()).toBe(0);
  });
});

describe('while walking', () => {
  it('follows the tracker’s updates, and pauses and resumes', async () => {
    const h = await setup();
    await h.service.start();
    h.tracker.walk(60);
    h.tracker.emit();
    let phase = phaseOf(h);
    expect(phase.kind === 'active' && phase.walk.activeSeconds).toBe(60);
    expect(phase.kind === 'active' && phase.walk.points.length).toBe(31);
    expect(phase.kind === 'active' && phase.walk.receivedAt).toBe(FACTORY_NOW + 60_000);

    await h.service.pause();
    phase = phaseOf(h);
    expect(phase.kind === 'active' && phase.walk.state).toBe('paused');
    h.tracker.walk(30);
    await h.service.resume();
    phase = phaseOf(h);
    expect(phase.kind === 'active' && [phase.walk.state, phase.walk.activeSeconds]).toEqual([
      'running',
      60,
    ]);
  });

  it('reads the walk again when the page comes back, finishing one stopped from the notification', async () => {
    const h = await setup();
    await h.service.start();
    h.tracker.walk(120);
    h.page.hide();
    h.tracker.stopFromNotification();
    h.page.show();
    await h.service.idle();
    await vi.waitFor(() => expect(phaseOf(h).kind).toBe('finished'));
    expect(await h.walkRepo.list()).toHaveLength(1);
    expect(h.tracker.held()).toBeNull();
    expect(h.tracker.listenerCount()).toBe(0);
  });
});

describe('stopping', () => {
  it('works the walk out, stores it and lets the tracker’s copy go', async () => {
    const h = await setup();
    await h.service.start();
    h.tracker.walk(20 * 60, { speed: 1.5, cadence: 112 });
    await h.service.stop();

    const walk = finishedWalk(h);
    expect(walk).toMatchObject({
      id: 'tracked-1',
      startedAt: FACTORY_NOW,
      endedAt: FACTORY_NOW + 20 * 60_000,
      activeSeconds: 1200,
      steps: 2240,
      cadence: 112,
      briskMinutes: 20,
      speedFrom: 'route',
      met: 3.8,
      weightKg: 70,
      heartRate: null,
      writtenToHealth: false,
    });
    expect(walk.distanceM).toBeGreaterThan(1790);
    expect(walk.score).toBeGreaterThan(0);
    expect(await h.walkRepo.list()).toEqual([walk]);
    expect(h.tracker.calls.slice(-2)).toEqual(['stop', 'discard']);
    expect(h.tracker.listenerCount()).toBe(0);
  });

  it('keeps the heart-rate zones Health Connect holds for the walk while it is connected', async () => {
    const h = await setup({ settings: { 'health.connected': true } });
    const at = (seconds: number) => new Date(FACTORY_NOW + seconds * 1000).toISOString();
    h.health.set({
      heartRate: [
        { t: at(0), bpm: 100 },
        { t: at(30), bpm: 120 },
        { t: at(60), bpm: 140 },
      ],
    });
    await h.service.start();
    h.tracker.walk(90);
    await h.service.stop();
    // 40 years old: 180 at the top; 100 is zone 1, 120 zone 2, 140 zone 3.
    expect(finishedWalk(h).heartRate).toEqual({
      avgBpm: 120,
      maxBpm: 140,
      maxHr: 180,
      zoneSeconds: [30, 30, 30, 0, 0],
    });
  });

  it('reads no heart rate while Health Connect is not connected', async () => {
    const h = await setup();
    await h.service.start();
    h.tracker.walk(60);
    await h.service.stop();
    expect(finishedWalk(h).heartRate).toBeNull();
    expect(h.health.callsOf('readHeartRate')).toEqual([]);
  });

  it('keeps the tracker’s copy when the walk cannot be stored, and finishes it on Try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = await setup();
    await h.service.start();
    h.tracker.walk(60);
    const put = vi.spyOn(h.walkRepo, 'put').mockRejectedValueOnce(new Error('disk full'));
    await h.service.stop();
    expect(phaseOf(h)).toEqual({ kind: 'failed', step: 'store' });
    expect(h.tracker.held()?.endedAt).toBeDefined();

    put.mockRestore();
    expect(await h.service.open()).toBe('finished');
    expect(await h.walkRepo.list()).toHaveLength(1);
    expect(h.tracker.held()).toBeNull();
  });
});

describe('Save and Discard', () => {
  async function stopped(options: WalkHarnessOptions = {}) {
    const h = await setup(options);
    await h.service.start();
    h.tracker.walk(600);
    await h.service.stop();
    return h;
  }

  it('writes the walk to Health Connect on Save while connected with writing on', async () => {
    const h = await stopped({ settings: { 'health.connected': true, 'health.writeBack': true } });
    const walk = finishedWalk(h);
    expect(await h.service.save()).toEqual({ written: true });
    expect(phaseOf(h)).toEqual({ kind: 'idle' });
    expect(h.health.walks.get(walk.id)).toEqual({
      clientId: walk.id,
      start: new Date(walk.startedAt).toISOString(),
      end: new Date(walk.endedAt).toISOString(),
      distanceM: walk.distanceM,
      activeKcal: walk.activeKcal,
      steps: walk.steps,
    });
    expect((await h.walkRepo.list())[0]?.writtenToHealth).toBe(true);
  });

  it('keeps the walk without writing it when writing is off or Health Connect is not connected', async () => {
    const off = await stopped({ settings: { 'health.connected': true } });
    expect(await off.service.save()).toEqual({ written: false });
    expect(off.health.walks.size).toBe(0);
    expect(await off.walkRepo.list()).toHaveLength(1);

    const none = await stopped({ withoutHealth: true });
    expect(await none.service.save()).toEqual({ written: false });
    expect(await none.walkRepo.list()).toHaveLength(1);
  });

  it('keeps the walk unwritten when Health Connect refuses it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = await stopped({ settings: { 'health.connected': true, 'health.writeBack': true } });
    h.health.failNext('writeWalk', 'permissionDenied');
    expect(await h.service.save()).toEqual({ written: false });
    expect((await h.walkRepo.list())[0]?.writtenToHealth).toBe(false);
  });

  it('removes the walk on Discard', async () => {
    const h = await stopped();
    await h.service.discard();
    expect(phaseOf(h)).toEqual({ kind: 'idle' });
    expect(await h.walkRepo.list()).toEqual([]);
  });
});

describe('open at start-up', () => {
  it('finds nothing when the tracker holds no walk', async () => {
    const h = await setup();
    expect(await h.service.open()).toBe('none');
    expect(phaseOf(h)).toEqual({ kind: 'idle' });
  });

  it('picks up a walk in progress and follows it', async () => {
    const h = await setup();
    await h.tracker.start({ withRoute: true });
    h.tracker.walk(300);
    expect(await h.service.open()).toBe('active');
    const phase = phaseOf(h);
    expect(phase.kind === 'active' && phase.walk.activeSeconds).toBe(300);
    expect(h.tracker.listenerCount()).toBe(1);
  });

  it('finishes and shows a walk stopped from the notification while the app was away', async () => {
    const h = await setup();
    await h.tracker.start({ withRoute: true });
    h.tracker.walk(300);
    h.tracker.stopFromNotification();
    expect(await h.service.open()).toBe('finished');
    expect(finishedWalk(h).activeSeconds).toBe(300);
    expect(h.tracker.held()).toBeNull();
  });

  it(`writes the walks of the last ${CATCH_UP_DAYS} days Health Connect has not been given`, async () => {
    const h = await setup({ settings: { 'health.connected': true, 'health.writeBack': true } });
    const recent = makeWalk({ startedAt: FACTORY_NOW - 3 * DAY });
    const old = makeWalk({ startedAt: FACTORY_NOW - 40 * DAY });
    const written = makeWalk({ startedAt: FACTORY_NOW - 2 * DAY, writtenToHealth: true });
    for (const walk of [recent, old, written]) await h.walkRepo.put(walk);

    await h.service.open();

    expect([...h.health.walks.keys()]).toEqual([recent.id]);
    const stored = new Map(
      (await h.walkRepo.list()).map((walk) => [walk.id, walk.writtenToHealth]),
    );
    expect(stored).toEqual(
      new Map([
        [written.id, true],
        [recent.id, true],
        [old.id, false],
      ]),
    );
  });

  it('never writes the walk the summary shows before Save or Discard', async () => {
    const h = await setup({ settings: { 'health.connected': true, 'health.writeBack': true } });
    await h.tracker.start({ withRoute: true });
    h.tracker.walk(120);
    h.tracker.stopFromNotification();
    expect(await h.service.open()).toBe('finished');
    expect(h.health.walks.size).toBe(0);
  });
});
