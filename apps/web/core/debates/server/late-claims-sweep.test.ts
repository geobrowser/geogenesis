import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClaimPublishCandidate } from './claim-publish-candidates';
import { DebateNotPublishableError } from './debate-source';
import {
  type LateClaimsMarkerStore,
  isFinished,
  isLateClaimSweepEnabled,
  lateClaimsMarkerKey,
  runLateClaimsSweep,
} from './late-claims-sweep';
import type { LateClaimsPlan, PublishMissingDebateClaimsResult } from './publish-missing-debate-claims';

const AT = '2026-11-12T21:40:03.123456Z';
const plan = { statements: [{}, {}], held: [{}] } as unknown as LateClaimsPlan;

function markers(initial: Record<string, string> = {}): LateClaimsMarkerStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: vi.fn(async (id: string) => values.get(id) ?? null),
    set: vi.fn(async (id: string, at: string) => {
      values.set(id, at);
    }),
  };
}

const candidates = (...ids: string[]): ClaimPublishCandidate[] =>
  ids.map(debateId => ({ debateId, claimsGeneratedAt: AT }));
const always = () => true;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('runLateClaimsSweep', () => {
  it('skips a debate whose claims have not changed since it was finished, by exact string', async () => {
    const store = markers({ a: AT, b: '2026-11-12T21:40:03.123Z' });
    const publish = vi.fn(async (_id: string): Promise<PublishMissingDebateClaimsResult> => ({
      status: 'up_to_date',
      plan,
    }));
    const report = await runLateClaimsSweep(['s'], always, {
      listCandidates: async () => candidates('a', 'b'),
      markers: store,
      publish,
    });
    expect(publish.mock.calls.map(([id]) => id)).toEqual(['b']);
    expect(report).toMatchObject({ unchanged: 1, finished: 1 });
    expect(store.values.get('b')).toBe(AT);
  });

  it.each<[PublishMissingDebateClaimsResult['status'], boolean]>([
    ['up_to_date', true],
    ['no_claims', true],
    ['not_editor', true],
    ['dedup_pending', false],
    ['submission_pending', false],
    ['debate_not_published', false],
    ['acceptor_not_configured', false],
    ['published', false],
    ['dry_run', false],
    ['changed_since_dry_run', false],
  ])('marks %s as finished: %s', (status, finished) => {
    expect(isFinished({ status, plan, spaceId: 's' } as unknown as PublishMissingDebateClaimsResult)).toBe(finished);
  });

  it('does not mark a published debate, a wait or a failure, so a later tick looks again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = markers();
    const results: Record<string, () => Promise<PublishMissingDebateClaimsResult>> = {
      pub: async () => ({ status: 'published', plan, userOpHash: '0x' }),
      wait: async () => ({ status: 'dedup_pending' }),
      gate: async () => {
        throw new DebateNotPublishableError('not_complete', 'x');
      },
      boom: async () => {
        throw new Error('graph down');
      },
    };
    const report = await runLateClaimsSweep(['s'], always, {
      listCandidates: async () => candidates('pub', 'wait', 'gate', 'boom'),
      markers: store,
      publish: id => results[id]!(),
    });
    expect(store.set).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      published: [{ debateId: 'pub', statements: 2, held: 1 }],
      waiting: 2,
      failed: [{ debateId: 'boom', error: 'graph down' }],
    });
  });

  it('stops when the budget says so, counting checks and submits', async () => {
    const seen: Array<{ checked: number; submitted: number }> = [];
    const publish = vi.fn(async (_id: string): Promise<PublishMissingDebateClaimsResult> => ({
      status: 'published',
      plan,
      userOpHash: '0x',
    }));
    await runLateClaimsSweep(
      ['s'],
      spent => {
        seen.push({ ...spent });
        return spent.submitted < 2;
      },
      { listCandidates: async () => candidates('a', 'b', 'c'), markers: markers(), publish }
    );
    expect(publish).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toEqual({ checked: 2, submitted: 2 });
  });

  it('stops at a geo-chat without the endpoint, and carries on past a space that fails to list', async () => {
    const publish = vi.fn(async (_id: string): Promise<PublishMissingDebateClaimsResult> => ({
      status: 'up_to_date',
      plan,
    }));
    const failing = await runLateClaimsSweep(['bad', 'good'], always, {
      listCandidates: async space => {
        if (space === 'bad') throw new Error('500');
        return candidates('a');
      },
      markers: markers(),
      publish,
    });
    expect(failing).toMatchObject({ failed: [{ debateId: 'space:bad' }], finished: 1 });
    const old = await runLateClaimsSweep(['s', 't'], always, {
      listCandidates: async () => null,
      markers: markers(),
      publish,
    });
    expect(old.unsupported).toBe(true);
  });
});

describe('isLateClaimSweepEnabled', () => {
  it('is off unless switched on', () => {
    vi.stubEnv('DEBATE_LATE_CLAIM_SWEEP_ENABLED', '');
    expect(isLateClaimSweepEnabled()).toBe(false);
    vi.stubEnv('DEBATE_LATE_CLAIM_SWEEP_ENABLED', '"true"');
    expect(isLateClaimSweepEnabled()).toBe(true);
  });

  it('keys markers on the dashless debate id', () => {
    expect(lateClaimsMarkerKey('01A1D0D5-7658-7fc0-9bff-0447f535f4b0')).toBe(
      'debate-acceptor:late-claims-checked:01a1d0d576587fc09bff0447f535f4b0'
    );
  });
});
