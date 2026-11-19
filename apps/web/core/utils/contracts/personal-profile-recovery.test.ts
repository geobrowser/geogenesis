import { ContentIds, Graph, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { type Op, formatId } from '@geoprotocol/grc-20';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  INDEX_LAG_WINDOW_MS,
  type ProfileDeclaration,
  ProfileRecoveryError,
  UNREADABLE_ORIGINAL_FALLBACK_MS,
  buildRecoveryOps,
  canPublishFreshUnderDeclaredTopic,
  decideProfileRetry,
  fetchOriginalProfileEdit,
  parseEditUriFromLogData,
  parseOriginalProfileEdit,
} from './personal-profile-recovery';

// GEO-3803: a real testnet sign-up (2026-11-19, block 126690) whose edit the indexer dropped.
const SPACE_ID = '86892daf69e2411eb9906077c166efdf';
const TOPIC_ID = '5cc83bb5b39540b3922f9a8664bf6831';
const EDIT_URI = 'ipfs://QmX65gRctsCHnBZSG7izR4vhMUTH3HbMuCuHRYP8tu5BVv';
const EDIT_BYTES = new Uint8Array(readFileSync(path.join(__dirname, '__fixtures__/signup-profile-edit.bin')));
// The EDITS_PUBLISHED log's data from the same transaction.
const EDIT_LOG_DATA =
  '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000035697066733a2f2f516d583635675263747343486e425a534737697a523476684d5554483348624d75437548525950387475354256760000000000000000000000';

const NOW = Date.UTC(2026, 10, 19, 19, 0, 0);

function declaration(declaredAtMs: number, lastPublishedAtMs = declaredAtMs): ProfileDeclaration {
  return {
    topicId: TOPIC_ID,
    blockNumber: 126_690n,
    transactionHash: '0x383a5c65fc018b74fedce51cb018745c937ab406bbbf5334cc27f1bb330cd800',
    declaredAtMs,
    editUri: EDIT_URI,
    lastPublishedAtMs,
    publishCount: 1,
  };
}

function personName(ops: readonly Op[]) {
  const person = ops.find(op => op.type === 'createEntity' && formatId(op.id) === TOPIC_ID);
  if (person?.type !== 'createEntity') throw new Error('no person entity');
  const name = person.values.find(value => formatId(value.property) === SystemIds.NAME_PROPERTY);
  return name?.value.type === 'text' ? name.value.value : null;
}

function opIds(ops: readonly Op[]) {
  return ops.map(op => ('id' in op ? formatId(op.id) : null));
}

describe('decideProfileRetry', () => {
  const at = (now: number, recentLocalPublish = false) => ({ now, recentLocalPublish });

  it('publishes a fresh profile when the chain has no profile publish at all', () => {
    expect(decideProfileRetry(null, at(NOW))).toEqual({ kind: 'publish-fresh' });
  });

  it('waits on a publish this browser just sent that the chain does not show yet', () => {
    expect(decideProfileRetry(null, at(NOW, true))).toEqual({ kind: 'processing', declaration: null });
  });

  it('waits on a declaration younger than the index lag window, and publishes nothing', () => {
    const recent = declaration(NOW - 60_000);
    expect(decideProfileRetry(recent, at(NOW))).toEqual({ kind: 'processing', declaration: recent });
  });

  it('republishes a declaration older than the window that the index still shows nothing for', () => {
    const old = declaration(NOW - INDEX_LAG_WINDOW_MS - 60_000);
    expect(decideProfileRetry(old, at(NOW))).toEqual({ kind: 'republish', declaration: old });
  });

  it('republishes an old declaration even inside this browser grace window', () => {
    const old = declaration(NOW - INDEX_LAG_WINDOW_MS - 60_000);
    expect(decideProfileRetry(old, at(NOW, true)).kind).toBe('republish');
  });

  it('republishes at exactly the window edge', () => {
    const edge = declaration(NOW - INDEX_LAG_WINDOW_MS);
    expect(decideProfileRetry(edge, at(NOW)).kind).toBe('republish');
  });

  it('waits after a recent republish from any browser, not only after the declaration', () => {
    const republished = declaration(NOW - 60 * 60_000, NOW - 30_000);
    expect(decideProfileRetry(republished, at(NOW)).kind).toBe('processing');
  });
});

describe('canPublishFreshUnderDeclaredTopic', () => {
  it('waits out the fallback age after the last publish', () => {
    expect(canPublishFreshUnderDeclaredTopic(declaration(NOW - UNREADABLE_ORIGINAL_FALLBACK_MS), NOW)).toBe(false);
    expect(canPublishFreshUnderDeclaredTopic(declaration(NOW - UNREADABLE_ORIGINAL_FALLBACK_MS - 1), NOW)).toBe(true);
  });

  it('counts from the latest publish, not the declaration', () => {
    const republishedRecently = declaration(NOW - 2 * UNREADABLE_ORIGINAL_FALLBACK_MS, NOW - 60_000);
    expect(canPublishFreshUnderDeclaredTopic(republishedRecently, NOW)).toBe(false);
  });
});

describe('parseEditUriFromLogData', () => {
  it('reads the edit URI from a real EDITS_PUBLISHED log', () => {
    expect(parseEditUriFromLogData(EDIT_LOG_DATA)).toBe(EDIT_URI);
  });

  it('returns null for data that is not an edit URI', () => {
    expect(parseEditUriFromLogData('0x')).toBeNull();
    expect(
      parseEditUriFromLogData(
        '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000'
      )
    ).toBeNull();
  });
});

describe('parseOriginalProfileEdit', () => {
  it('decodes the real sign-up edit with its person entity and ids', () => {
    const edit = parseOriginalProfileEdit(EDIT_BYTES, SPACE_ID, TOPIC_ID);

    expect(edit.name).toBe('Bryan');
    expect(edit.ops).toHaveLength(7);
    expect(personName(edit.ops)).toBe('Bryan');
    expect(opIds(edit.ops)).toEqual([
      TOPIC_ID,
      'f7e717740dcf4e72894779e168846db5',
      '48bbae2340244813b9f7e5b013892a33',
      'cc4990b3fd5046b194864918e7803978',
      'a7fe5329e32f44bf84a6470b3bf72d25',
      'ea27595ba70b40aea0e131a5a08e9611',
      '6c410f068ad548d08b86f0fbb64f4043',
    ]);
  });

  it('rejects an edit authored by another space', () => {
    expect(() => parseOriginalProfileEdit(EDIT_BYTES, '00000000000000000000000000000001', TOPIC_ID)).toThrow(
      ProfileRecoveryError
    );
  });

  it('rejects an edit that does not create the declared entity', () => {
    expect(() => parseOriginalProfileEdit(EDIT_BYTES, SPACE_ID, '00000000000000000000000000000001')).toThrow(
      ProfileRecoveryError
    );
  });

  it('rejects bytes that are not an edit', () => {
    expect(() => parseOriginalProfileEdit(new Uint8Array([1, 2, 3]), SPACE_ID, TOPIC_ID)).toThrow(ProfileRecoveryError);
  });
});

describe('fetchOriginalProfileEdit', () => {
  it('falls through gateways that refuse until one serves the edit', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('Too many requests', { status: 429 }))
      .mockResolvedValueOnce(new Response(EDIT_BYTES, { status: 200 }));

    await expect(fetchOriginalProfileEdit(EDIT_URI, fetchFn)).resolves.toEqual(EDIT_BYTES);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toContain('QmX65gRctsCHnBZSG7izR4vhMUTH3HbMuCuHRYP8tu5BVv');
  });

  it('throws a recovery error when no gateway serves it', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValue(new Response('Payment required', { status: 402 }));

    await expect(fetchOriginalProfileEdit(EDIT_URI, fetchFn)).rejects.toThrow(ProfileRecoveryError);
  });
});

describe('buildRecoveryOps', () => {
  const originalOps = parseOriginalProfileEdit(EDIT_BYTES, SPACE_ID, TOPIC_ID).ops;

  it('republishes the original ops unchanged for the same name', () => {
    expect(buildRecoveryOps({ originalOps, topicId: TOPIC_ID, name: 'Bryan', avatarOps: [] })).toEqual(originalOps);
  });

  it('changes only the person name for a new name, keeping every id', () => {
    const ops = buildRecoveryOps({ originalOps, topicId: TOPIC_ID, name: 'Bryan Doss', avatarOps: [] });

    expect(personName(ops)).toBe('Bryan Doss');
    expect(opIds(ops)).toEqual(opIds(originalOps));
    // The account entity's name is its address, and stays.
    expect(ops.slice(1)).toEqual(originalOps.slice(1));
  });

  it('adds the avatar when the original has none', () => {
    const { ops: avatarOps } = Graph.createRelation({
      fromEntity: TOPIC_ID,
      toEntity: '11111111111111111111111111111111',
      type: ContentIds.AVATAR_PROPERTY,
    });

    const ops = buildRecoveryOps({ originalOps, topicId: TOPIC_ID, name: 'Bryan', avatarOps });

    expect(ops).toEqual([...originalOps, ...avatarOps]);
  });

  it('keeps the original avatar rather than adding a second one', () => {
    const { ops: originalAvatar } = Graph.createRelation({
      fromEntity: TOPIC_ID,
      toEntity: '11111111111111111111111111111111',
      type: ContentIds.AVATAR_PROPERTY,
    });
    const { ops: newAvatar } = Graph.createRelation({
      fromEntity: TOPIC_ID,
      toEntity: '22222222222222222222222222222222',
      type: ContentIds.AVATAR_PROPERTY,
    });
    const withAvatar = [...originalOps, ...originalAvatar];

    expect(
      buildRecoveryOps({ originalOps: withAvatar, topicId: TOPIC_ID, name: 'Bryan', avatarOps: newAvatar })
    ).toEqual(withAvatar);
  });
});
