// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CANONICAL,
  DEFAULT_OPTIONS,
  DIVERGENCE_KINDS,
  FIXTURES,
  PRODUCT_ROOT,
  OFF_PRODUCT_CODE,
  TEMPLATE_SCENARIO,
  browserWrapper,
  checkAll,
  checkScenario,
  foodDatabaseAnswer,
  formatTable,
  isAlive,
  joinScripts,
  ledgerSummary,
  main,
  parseArgs,
  readLedger,
  readScenario,
  reaLedgerInput,
  resolveScenario,
  scenarioNames,
  stepsOf,
  stillAlive,
  utcDayKey,
  verdictOf,
  type EvidenceRecord,
  type FoodFixtures,
  type Scenario,
} from './parity';

const template = readScenario(TEMPLATE_SCENARIO);

/** The template with its steps replaced. */
function withSteps(...actions: Record<string, unknown>[]): Scenario {
  return { ...template, actions };
}

const waitFor = (id: string, selector: string, extra: Record<string, unknown> = {}) => ({
  step_id: id,
  action: 'wait_for',
  locator: { kind: 'css', selector },
  state: 'visible',
  timeout_ms: 10_000,
  ...extra,
});

/** A REA capture result with these step statuses (the start step first) and events. */
function reaResult(
  steps: readonly { id: string; status: string; error?: string }[],
  events: readonly Record<string, unknown>[] = [],
): unknown {
  return {
    evidence_id: `ev_${'a'.repeat(64)}`,
    normalized_result: {
      duration_ms: 12_345,
      steps: [
        { step_id: 'scenario_start', status: 'completed', error: null },
        ...steps.map((step) => ({
          step_id: step.id,
          status: step.status,
          error: step.error ?? null,
        })),
      ],
      events: { retained: events.length, dropped: 0, items: events },
    },
  };
}

describe('parseArgs', () => {
  it('runs everything on the canonical ports by default', () => {
    expect(parseArgs([])).toEqual(DEFAULT_OPTIONS);
    expect(DEFAULT_OPTIONS.port).toBe(4173);
    expect(DEFAULT_OPTIONS.aiPort).toBe(4320);
  });

  it('reads the flags', () => {
    const options = parseArgs([
      '--dry-run',
      '--no-build',
      '--only',
      'onboarding, coach',
      '--port',
      '4183',
      '--ai-port',
      '4333',
    ]);
    expect(options).toMatchObject({
      dryRun: true,
      build: false,
      only: ['onboarding', 'coach'],
      port: 4183,
      aiPort: 4333,
    });
  });

  it('refuses an unknown flag, a bad port, a missing value and one port for both servers', () => {
    expect(parseArgs(['--fast'])).toEqual({ problem: 'unknown argument "--fast"' });
    expect(parseArgs(['--port', 'eighty'])).toEqual({
      problem: '--port must be a port number, not "eighty"',
    });
    expect(parseArgs(['--only'])).toEqual({ problem: '--only needs a value' });
    expect(parseArgs(['--port', '4320'])).toEqual({
      problem: 'the app and the fake AI need two ports',
    });
  });
});

describe('checkScenario', () => {
  it('passes every scenario file in parity/, each with its FIXTURES entry', () => {
    const names = scenarioNames();
    expect(names).toEqual(expect.arrayContaining(['walking-skeleton', ...Object.keys(FIXTURES)]));
    expect(checkAll(names)).toEqual([]);
  });

  it('refuses a step without its own timeout', () => {
    const { timeout_ms: _dropped, ...step } = waitFor('home.shown', '[data-ui="home.gauge"]');
    expect(checkScenario('x', withSteps(step), template)).toEqual([
      'x step 1 (home.shown): no timeout_ms',
    ]);
  });

  it('refuses a locator that does not start at a data-ui hook', () => {
    const steps = withSteps(
      waitFor('by-class', '.gauge'),
      waitFor('by-role', 'button', { locator: { kind: 'role', role: 'button', name: 'Save' } }),
      waitFor('inside-hook', '[data-ui="home.gauge"] :text-is("0")'),
      waitFor('hook-prefix', '[data-ui^="home.meal."] [data-ui="entry.row"]'),
    );
    expect(checkScenario('x', steps, template)).toEqual([
      'x step 1 (by-class): the locator must be a CSS selector that starts at a data-ui hook',
      'x step 2 (by-role): the locator must be a CSS selector that starts at a data-ui hook',
    ]);
  });

  it('refuses a step id used twice, a fixed sleep and a goto off the app', () => {
    const steps = withSteps(
      waitFor('same', '[data-ui="a"]'),
      waitFor('same', '[data-ui="b"]'),
      { step_id: 'nap', action: 'wait_for_timeout', duration_ms: 500, timeout_ms: 1_000 },
      {
        step_id: 'away',
        action: 'goto',
        destination: { url: 'https://example.com/' },
        wait_until: 'load',
        timeout_ms: 1_000,
      },
    );
    expect(checkScenario('x', steps, template)).toEqual([
      'x step 2 (same): step_id used twice',
      'x step 3 (nap): a fixed sleep',
      `x step 4 (away): a goto must stay on ${CANONICAL.app}`,
    ]);
  });

  it("refuses blocks that differ from the template's and keys REA would refuse", () => {
    const environment = { ...(template.environment as object), color_scheme: 'dark' };
    const scenario = { ...template, environment, notes: 'mine' };
    expect(checkScenario('x', scenario, template)).toEqual([
      'x: unexpected top-level key "notes"',
      `x: "environment" differs from ${TEMPLATE_SCENARIO}'s`,
    ]);
  });
});

describe('resolveScenario', () => {
  const addresses = {
    app: 'http://127.0.0.1:4183',
    ai: 'http://127.0.0.1:4333',
    browser: '/tmp/lab/browser.sh',
  };

  it("puts this run's addresses and browser in place of the canonical ones, and nothing else", () => {
    const scenario = withSteps(
      {
        step_id: 'server',
        action: 'fill',
        locator: { kind: 'css', selector: '[data-ui="wizard.ai.server"]' },
        value: { source: 'literal', value: `${CANONICAL.ai}/v1` },
        timeout_ms: 10_000,
      },
      {
        step_id: 'reload',
        action: 'goto',
        destination: { url: `${CANONICAL.app}/` },
        wait_until: 'load',
        timeout_ms: 30_000,
      },
    );
    const resolved = resolveScenario(scenario, addresses);
    expect(resolved.start_url).toEqual({ url: 'http://127.0.0.1:4183/' });
    expect(resolved.browser).toEqual({
      ...(template.browser as object),
      executable_path: addresses.browser,
    });
    expect(resolved.actions).toEqual([
      expect.objectContaining({ value: { source: 'literal', value: 'http://127.0.0.1:4333/v1' } }),
      expect.objectContaining({ destination: { url: 'http://127.0.0.1:4183/' } }),
    ]);
    expect(resolved.environment).toEqual(template.environment);
    expect(resolved.capture).toEqual(template.capture);
    // The file as read is left as it was.
    expect(scenario.start_url).toEqual({ url: `${CANONICAL.app}/` });
  });
});

describe('verdictOf', () => {
  it('passes a run where every step completed and the page threw nothing', () => {
    const verdict = verdictOf(
      reaResult([
        { id: 'a', status: 'completed' },
        { id: 'b', status: 'completed' },
      ]),
      2,
    );
    expect(verdict).toMatchObject({
      pass: true,
      completed: 3,
      expected: 3,
      failedStep: null,
      reason: null,
      durationMs: 12_345,
    });
  });

  it('fails a scenario with a missing hook at that step, with REA’s reason', () => {
    const verdict = verdictOf(
      reaResult([
        { id: 'manual.sheet', status: 'completed' },
        {
          id: 'manual.no-such-hook',
          status: 'failed',
          error: 'locator.waitFor: Timeout 10000ms exceeded.',
        },
        { id: 'manual.save', status: 'cancelled', error: 'not executed' },
      ]),
      3,
    );
    expect(verdict).toMatchObject({
      pass: false,
      completed: 2,
      failedStep: 'manual.no-such-hook',
      reason: 'locator.waitFor: Timeout 10000ms exceeded.',
    });
    expect(formatTable([{ name: 'log-manual', verdict }])).toContain(
      'FAIL at manual.no-such-hook: locator.waitFor: Timeout 10000ms exceeded.',
    );
  });

  it('fails a run whose steps all completed when the page threw an uncaught error', () => {
    const verdict = verdictOf(
      reaResult(
        [{ id: 'a', status: 'completed' }],
        [{ kind: 'page-error', message: 'boom', stack: null }],
      ),
      1,
    );
    expect(verdict).toMatchObject({ pass: false, failedStep: null, pageErrors: ['boom'] });
    expect(verdict.reason).toBe('page error: boom');
  });

  it('fails a run REA cut short, and anything that is not a capture', () => {
    expect(verdictOf(reaResult([{ id: 'a', status: 'completed' }]), 2)).toMatchObject({
      pass: false,
      reason: 'REA ran 2 of 3 steps',
    });
    expect(verdictOf(null, 2)).toMatchObject({ pass: false, reason: 'REA returned no capture' });
  });

  it('lists the hosts off loopback the page asked for', () => {
    const request = (url: string) => ({ kind: 'request', url: { url } });
    const verdict = verdictOf(
      reaResult(
        [{ id: 'a', status: 'completed' }],
        [
          request('http://127.0.0.1:4173/assets/app.js'),
          request('https://world.openfoodfacts.org/api/v2/product/1.json'),
          request('https://world.openfoodfacts.org/api/v2/product/2.json'),
        ],
      ),
      1,
    );
    expect(verdict.hosts).toEqual(['world.openfoodfacts.org']);
  });
});

describe('joinScripts', () => {
  it("joins the named scripts' replies in order", () => {
    const scripts: Record<string, { replies: string[] }> = {
      'plan-ok': { replies: ['plan'] },
      'coach-tool': { replies: ['tool call', 'answer'] },
    };
    expect(joinScripts(['plan-ok', 'coach-tool'], (name) => scripts[name]!)).toEqual({
      description: 'Parity replies: plan-ok + coach-tool.',
      replies: ['plan', 'tool call', 'answer'],
    });
    expect(joinScripts([], () => ({ replies: [] })).replies).toEqual([]);
  });
});

describe('foodDatabaseAnswer', () => {
  const bytes = (text: string) => new TextEncoder().encode(text);
  const fixtures: FoodFixtures = {
    productCode: OFF_PRODUCT_CODE,
    product: bytes('{"status":1}'),
    notFound: bytes('{"status":0}'),
    photo: bytes('jpeg'),
  };
  const answer = (url: string, method = 'GET') =>
    foodDatabaseAnswer(new URL(url), method, fixtures);

  it('lets loopback through and refuses every host the run does not serve', () => {
    expect(answer('http://127.0.0.1:4183/assets/app.js')).toEqual({ kind: 'continue' });
    expect(answer('http://localhost:4333/v1/chat/completions', 'POST')).toEqual({
      kind: 'continue',
    });
    expect(answer('https://api.openai.com/v1/chat/completions', 'POST')).toEqual({
      kind: 'refuse',
    });
  });

  it('answers Open Food Facts from our fixtures: our product, else not found', () => {
    expect(
      answer(`https://world.openfoodfacts.org/api/v2/product/${OFF_PRODUCT_CODE}.json?lc=en`),
    ).toMatchObject({ kind: 'fulfil', status: 200, body: fixtures.product });
    expect(
      answer('https://world.openfoodfacts.org/api/v2/product/2009876543213.json'),
    ).toMatchObject({ kind: 'fulfil', status: 404, body: fixtures.notFound });
    expect(answer('https://images.openfoodfacts.org/images/products/1.jpg')).toMatchObject({
      kind: 'fulfil',
      status: 200,
      headers: expect.objectContaining({ 'content-type': 'image/jpeg' }),
    });
  });

  it('answers FoodData Central with no hits, its preflight included', () => {
    const search = 'https://api.nal.usda.gov/fdc/v1/foods/search';
    expect(answer(search, 'OPTIONS')).toMatchObject({ kind: 'fulfil', status: 204 });
    expect(answer(search, 'POST')).toMatchObject({ kind: 'fulfil', status: 200 });
  });
});

describe('processes', () => {
  it('reports the PIDs still alive', () => {
    expect(stillAlive([11, 12, 13], (pid) => pid === 12)).toEqual([12]);
    expect(isAlive(process.pid)).toBe(true);
  });

  it("writes a browser wrapper that notes the browser's PID and profile, then starts it with a DevTools port", () => {
    const script = browserWrapper("/opt/it's/chrome", '/tmp/lab');
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(script).toContain(`> '/tmp/lab/browser.profile'`);
    expect(script).toContain(`printf '%s\\n' "$$" > '/tmp/lab/browser.pid'`);
    expect(script).toContain(`exec '/opt/it'\\''s/chrome' --remote-debugging-port=0 "$@"`);
  });
});

describe('main', () => {
  let out = '';
  afterEach(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it('lists every scenario on --dry-run and starts nothing', async () => {
    out = join(mkdtempSync(join(tmpdir(), 'parity-')), 'captures');
    const lines: string[] = [];
    const code = await main(['--dry-run', '--out', out, '--rea', '/nowhere/rea'], (line) =>
      lines.push(line),
    );
    expect(code).toBe(0);
    const names = scenarioNames();
    expect(lines).toHaveLength(names.length + 1);
    names.forEach((name, index) =>
      expect(lines[index]).toMatch(new RegExp(`^${name}: \\d+ steps`)),
    );
    expect(lines.at(-1)).toBe(`${names.length} scenarios; 0 problems; nothing was started`);
    // Nothing was written either: the capture folder was never made.
    expect(existsSync(out)).toBe(false);
  });

  it('refuses a scenario name it does not have', async () => {
    const lines: string[] = [];
    expect(await main(['--dry-run', '--only', 'nope'], (line) => lines.push(line))).toBe(2);
    expect(lines[0]).toMatch(/^parity: no scenario named nope/);
  });
});

describe('utcDayKey', () => {
  it("is the day in UTC, the scenarios' zone", () => {
    expect(utcDayKey(Date.parse('2026-10-27T23:30:00-04:00'))).toBe('2026-10-28');
  });
});

// ---- The obligations ledger (P10-04) ----------------------------------------------------------

/** Each ACC id of the acceptance map with its `Test:` lines. */
function acceptanceTests(): Map<string, string[]> {
  const text = readFileSync(join(PRODUCT_ROOT, 'docs/internals/acceptance-map.md'), 'utf8');
  const ids = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of text.split('\n')) {
    const id = /^- \*\*(ACC-[A-Z]+\d+-\d+)\*\*/.exec(line)?.[1];
    if (id) ids.set(id, (current = []));
    else if (line.startsWith('  - Test: ') && current)
      current.push(line.slice('  - Test: '.length));
    else if (!line.startsWith('  ')) current = null;
  }
  return ids;
}

/** True when the test `file > describe > name` is written in that file. */
function testExists(reference: string): boolean {
  const [file, ...titles] = reference.split(' > ');
  if (!file || titles.length < 2) return false;
  const source = readFileSync(join(PRODUCT_ROOT, file), 'utf8');
  return titles.every((title) => source.includes(title));
}

describe('parity ledger', () => {
  const { obligations, bindings } = readLedger();
  const acceptance = acceptanceTests();

  it('holds one claim per ACC row of a parity flow, each on steps its flow has', () => {
    const ids = obligations.map((claim) => claim.id);
    expect(new Set(ids).size).toBe(ids.length);
    const flows = new Set(scenarioNames());
    for (const claim of obligations) {
      expect(claim.id).toBe(`PC-${claim.acc}`);
      expect(acceptance.has(claim.acc), claim.acc).toBe(true);
      expect(flows.has(claim.flow), claim.flow).toBe(true);
      const stepIds = new Set(stepsOf(readScenario(claim.flow)).map((step) => step.step_id));
      for (const step of claim.steps) expect(stepIds.has(step), `${claim.id}: ${step}`).toBe(true);
      if (claim.status === 'verified') expect(claim.steps.length, claim.id).toBeGreaterThan(0);
      else expect(claim.blockedBy, claim.id).toBeTruthy();
    }
  });

  it('classifies every divergence: intended with its D-id, a bug with the test that failed first', () => {
    for (const claim of obligations) {
      for (const divergence of claim.divergences) {
        expect(DIVERGENCE_KINDS, claim.id).toContain(divergence.kind);
        expect(divergence.what, claim.id).not.toBe('');
        if (divergence.kind === 'intended')
          expect(divergence.ref, claim.id).toMatch(/^D-[\d.]+(NEW)?/);
        if (divergence.kind === 'bug')
          expect(testExists(divergence.ref ?? ''), claim.id).toBe(true);
      }
    }
  });

  it("binds each claim to its owner module and the acceptance map's tests for its ACC row", () => {
    expect(bindings.map((binding) => binding.id)).toEqual(obligations.map((claim) => claim.id));
    for (const [index, binding] of bindings.entries()) {
      const claim = obligations[index]!;
      const source = readFileSync(join(PRODUCT_ROOT, binding.module), 'utf8');
      expect(source, binding.id).toMatch(
        new RegExp(`export (?:async )?(?:function|const) ${binding.symbol}\\b`),
      );
      expect(binding.tests, binding.id).toEqual(acceptance.get(claim.acc));
      for (const test of binding.tests) expect(testExists(test), test).toBe(true);
    }
  });

  it("gives REA its ledger input in REA's canonical bundle form, every claim blocked on the reference side", () => {
    const record = (id: string): EvidenceRecord => ({
      evidence_id: `ev_${id.repeat(64)}`,
      provider: { id: 'p', name: 'P', version: '1' },
      environment: {
        id: 'Chromium',
        platform: 'unknown',
        architecture: 'unknown',
        isolation: 'process',
      },
      operation: 'capture_browser_scenario',
      predicate_type: 'rea.browser-scenario-capture',
      authority: 'controlled-replay',
    });
    const ledger = {
      obligations: [
        { ...obligations[0]!, flow: 'b-flow' },
        { ...obligations[1]!, flow: 'a-flow', status: 'blocked' as const, blockedBy: 'no drag' },
      ],
      bindings: bindings.slice(0, 2),
    };
    const input = reaLedgerInput(ledger, { 'b-flow': record('b'), 'a-flow': record('a') }, () =>
      'f'.repeat(64),
    ) as {
      evidence_bundle: { records: EvidenceRecord[]; providers: unknown[]; scenarios: unknown[] };
      reviewed_obligations: { disposition: string; review_evidence_ids: string[] }[];
      manifest: { bindings: { verifier: unknown; fixtures: unknown[] }[] };
    };
    const ids = input.evidence_bundle.records.map((item) => item.evidence_id);
    expect(ids).toEqual([`ev_${'a'.repeat(64)}`, `ev_${'b'.repeat(64)}`]);
    expect(input.evidence_bundle.providers).toHaveLength(1);
    expect(input.evidence_bundle.scenarios).toHaveLength(2);
    expect(input.reviewed_obligations.map((item) => item.disposition)).toEqual([
      'blocked',
      'blocked',
    ]);
    expect(input.reviewed_obligations[1]!.review_evidence_ids).toEqual([`ev_${'a'.repeat(64)}`]);
    expect(input.manifest.bindings[0]!.verifier).not.toBeNull();
    expect(input.manifest.bindings[1]).toMatchObject({ verifier: null, fixtures: [] });
  });

  it("sums up REA's ledger result in one line", () => {
    const result = {
      evidence_id: 'ev_1',
      normalized_result: {
        status: 'open',
        closure_digest: 'abc',
        summary: {
          total: 3,
          by_status: [
            { key: 'verified', count: 0 },
            { key: 'blocked', count: 3 },
          ],
        },
        reports: { missing_verifier_obligation_ids: ['x'] },
      },
    };
    expect(ledgerSummary(result)).toBe(
      'REA ledger ev_1: open; closure abc; 3 obligations (blocked 3); 1 without a verifier',
    );
  });
});
