import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it, vi } from 'vitest';

import { RANK_VOTES_RELATION_TYPE_ID } from '~/core/ranking-block-ids';
import type { Relation } from '~/core/types';

import { DEBATES_SPACE_ID } from './best-debates';
import {
  PUSH_DOWN_LIVE_NOTE,
  ballotVoteSpaceIds,
  ballotWithout,
  debateOwnSpaceId,
  pushDownChoiceDescription,
  pushDownToastCopy,
  runInOrder,
} from './push-down';

const PERSONAL = 'd4bee0928fb5405baba3b1513f085835';
const CRYPTO = '1234567890abcdef1234567890abcdef';
const OTHER = 'abcdefabcdefabcdefabcdefabcdefab';

function deferred() {
  let resolve!: (value: { ok: true } | { ok: false; message: string }) => void;
  const promise = new Promise<{ ok: true } | { ok: false; message: string }>(r => (resolve = r));
  return { promise, resolve };
}

describe('runInOrder', () => {
  it('starts each step only after the one before it has landed', async () => {
    const vote = deferred();
    const ballot = vi.fn(async () => ({ ok: true as const }));
    const running = runInOrder([
      { step: 'vote', run: () => vote.promise },
      { step: 'ballot', run: ballot },
    ]);

    await Promise.resolve();
    await Promise.resolve();
    expect(ballot).not.toHaveBeenCalled();

    vote.resolve({ ok: true });
    await expect(running).resolves.toEqual({ ok: true });
    expect(ballot).toHaveBeenCalledTimes(1);
  });

  it('runs nothing after a failed step, and says nothing had landed yet', async () => {
    const ballot = vi.fn(async () => ({ ok: true as const }));
    const result = await runInOrder([
      { step: 'vote', run: async () => ({ ok: false, message: 'nope' }) },
      { step: 'ballot', run: ballot },
    ]);
    expect(result).toEqual({ ok: false, step: 'vote', partly: false, message: 'nope' });
    expect(ballot).not.toHaveBeenCalled();
  });

  it('marks a failure after an earlier step landed as partly done', async () => {
    const result = await runInOrder([
      { step: 'vote', run: async () => ({ ok: true }) },
      { step: 'ballot', run: async () => ({ ok: false, message: 'ballot down' }) },
    ]);
    expect(result).toEqual({ ok: false, step: 'ballot', partly: true, message: 'ballot down' });
  });

  it('skips empty steps and treats a thrown step as a failure of that step', async () => {
    const result = await runInOrder([
      null,
      {
        step: 'ballot',
        run: async () => {
          throw new Error('boom');
        },
      },
    ]);
    expect(result).toEqual({ ok: false, step: 'ballot', partly: false, message: 'boom' });
  });

  it('reports each step as it starts', async () => {
    const steps: string[] = [];
    await runInOrder(
      [
        { step: 'ballot', run: async () => ({ ok: true }) },
        { step: 'vote', run: async () => ({ ok: true }) },
      ],
      step => steps.push(step)
    );
    expect(steps).toEqual(['ballot', 'vote']);
  });
});

describe('ballot helpers', () => {
  it('takes the debate out and keeps the order', () => {
    expect(ballotWithout(['a1', 'b2', 'c3'], 'b2')).toEqual(['a1', 'c3']);
  });

  it('reads the space each existing vote points at', () => {
    const relation = (to: string, toSpaceId: string | undefined, extra: Partial<Relation> = {}): Relation =>
      ({
        id: `r-${to}`,
        entityId: `r-${to}`,
        type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
        fromEntity: { id: 'rank1', name: null },
        toEntity: { id: to, name: null, value: to },
        renderableType: 'RELATION',
        spaceId: PERSONAL,
        toSpaceId,
        ...extra,
      }) as Relation;

    const spaces = ballotVoteSpaceIds(
      [
        relation('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', CRYPTO),
        relation('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', undefined),
        relation('cccccccccccccccccccccccccccccccc', OTHER, { isDeleted: true }),
      ],
      'rank1',
      PERSONAL
    );
    expect([...spaces]).toEqual([['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', CRYPTO]]);
  });
});

describe('debateOwnSpaceId', () => {
  const named = (spaceId: string) => ({
    property: { id: SystemIds.NAME_PROPERTY },
    spaceId,
    value: 'A debate',
  });

  it('is the space the debate is named in', () => {
    expect(debateOwnSpaceId({ values: [named(CRYPTO)], spaces: [CRYPTO] }, PERSONAL)).toBe(CRYPTO);
  });

  it('is never the Debates space or the member’s personal space', () => {
    expect(
      debateOwnSpaceId({ values: [named(DEBATES_SPACE_ID), named(PERSONAL), named(OTHER)], spaces: [] }, PERSONAL)
    ).toBe(OTHER);
    expect(
      debateOwnSpaceId({ values: [named(DEBATES_SPACE_ID)], spaces: [DEBATES_SPACE_ID, PERSONAL] }, PERSONAL)
    ).toBe(null);
  });

  it('falls back to the spaces the debate lives in when it has no name anywhere usable', () => {
    expect(debateOwnSpaceId({ values: [], spaces: [DEBATES_SPACE_ID, CRYPTO] }, PERSONAL)).toBe(CRYPTO);
  });
});

describe('push-down copy', () => {
  it('promises nothing about the feed before the cutover', () => {
    expect(pushDownChoiceDescription(false)).not.toMatch(/feed/i);
    expect(pushDownToastCopy({ rankingLive: false, noteSeen: false })).not.toMatch(/feed/i);
    expect(pushDownToastCopy({ rankingLive: false, noteSeen: false })).toBe('Pushed down.');
  });

  it('shows the live note once the ranking is live, the first time only', () => {
    expect(pushDownChoiceDescription(true)).toContain(PUSH_DOWN_LIVE_NOTE);
    expect(pushDownToastCopy({ rankingLive: true, noteSeen: false })).toBe(PUSH_DOWN_LIVE_NOTE);
    expect(pushDownToastCopy({ rankingLive: true, noteSeen: true })).toBe('Pushed down.');
  });
});
