import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { formatId } from '@geoprotocol/grc-20';

import { Effect } from 'effect';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { keccak256, toHex } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SPACE_REGISTRY_ADDRESS_HEX } from '~/core/sdk/geo-network';

import {
  findPersonalProfileDeclaration,
  parseRegisteredSpaceId,
  republishPersonalProfile,
} from './create-personal-space-on-chain';
import { ProfileRecoveryError, UNREADABLE_ORIGINAL_FALLBACK_MS } from './personal-profile-recovery';
import { GOVERNANCE_ACTIONS } from './space-registry';

const request = vi.fn();
const getBlockNumber = vi.fn();
const getBlock = vi.fn();
const publishEdit = vi.fn();
const getSpace = vi.fn();
const reportEvent = vi.fn();

vi.mock('viem', async importOriginal => ({
  ...(await importOriginal<typeof import('viem')>()),
  createPublicClient: () => ({ request, getBlockNumber, getBlock }),
}));

vi.mock('~/core/sdk/geo-client', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/sdk/geo-client')>()),
  geo: { personalSpaces: { publishEdit: (args: unknown) => publishEdit(args) } },
}));

vi.mock('~/core/io/queries', () => ({ getSpace: (id: string) => getSpace(id) }));

vi.mock('~/core/telemetry/logger', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/telemetry/logger')>()),
  reportEvent: (event: unknown) => reportEvent(event),
}));

beforeEach(() => {
  request.mockReset();
  getBlockNumber.mockReset();
  getBlock.mockReset();
  publishEdit.mockReset();
  getSpace.mockReset();
  reportEvent.mockReset();
  getBlockNumber.mockResolvedValue(98_482n);
});
describe('parseRegisteredSpaceId', () => {
  it('returns null for the empty/unregistered sentinel (any casing)', () => {
    expect(parseRegisteredSpaceId('0x00000000000000000000000000000000')).toBeNull();
    expect(parseRegisteredSpaceId('0X00000000000000000000000000000000')).toBeNull();
  });

  it('strips 0x and lowercases a registered id', () => {
    expect(parseRegisteredSpaceId('0xABCDEF00000000000000000000000123')).toBe('abcdef00000000000000000000000123');
  });
});

// GEO-3803: a real testnet sign-up (2026-11-19). The registry logs `enter` as raw topics
// [from space, to space, action, topic], each bytes16 id right-padded to 32 bytes.
const SPACE_ID = '86892daf69e2411eb9906077c166efdf';
const PADDED_SPACE = '0x86892daf69e2411eb9906077c166efdf00000000000000000000000000000000';
const TOPIC_ID = '5cc83bb5b39540b3922f9a8664bf6831';
const TX = '0x383a5c65fc018b74fedce51cb018745c937ab406bbbf5334cc27f1bb330cd800';
const EDIT_URI = 'ipfs://QmX65gRctsCHnBZSG7izR4vhMUTH3HbMuCuHRYP8tu5BVv';
const EDIT_BYTES = new Uint8Array(readFileSync(path.join(__dirname, '__fixtures__/signup-profile-edit.bin')));
const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

const registeredLog = {
  topics: [
    ZERO,
    PADDED_SPACE,
    GOVERNANCE_ACTIONS.SPACE_ID_REGISTERED,
    `0x1561d60df8b2840264dec7f508e911fd708dc41f${'0'.repeat(24)}`,
  ],
  data: '0x',
  blockNumber: toHex(126_689),
  transactionHash: '0xaaaa',
  logIndex: '0x0',
};
const editLog = {
  topics: [PADDED_SPACE, PADDED_SPACE, GOVERNANCE_ACTIONS.EDITS_PUBLISHED, ZERO],
  data: '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000035697066733a2f2f516d583635675263747343486e425a534737697a523476684d5554483348624d75437548525950387475354256760000000000000000000000',
  blockNumber: toHex(126_690),
  transactionHash: TX,
  logIndex: '0x1',
};
const declaredLog = {
  topics: [PADDED_SPACE, PADDED_SPACE, GOVERNANCE_ACTIONS.TOPIC_DECLARED, `0x${TOPIC_ID}${'0'.repeat(32)}`],
  data: '0x',
  blockNumber: toHex(126_690),
  transactionHash: TX,
  logIndex: '0x2',
};
const DECLARED_AT_SECONDS = 1_795_111_507n;

describe('findPersonalProfileDeclaration', () => {
  beforeEach(() => {
    getBlockNumber.mockResolvedValue(126_821n);
    getBlock.mockResolvedValue({ timestamp: DECLARED_AT_SECONDS });
  });

  it('reads the declaration and the edit sent with it, in one window when registration is recent', async () => {
    request.mockResolvedValue([registeredLog, editLog, declaredLog]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toEqual({
      topicId: TOPIC_ID,
      blockNumber: 126_690n,
      transactionHash: TX,
      declaredAtMs: Number(DECLARED_AT_SECONDS) * 1000,
      editUri: EDIT_URI,
      lastPublishedAtMs: Number(DECLARED_AT_SECONDS) * 1000,
      publishCount: 1,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [
        {
          address: SPACE_REGISTRY_ADDRESS_HEX,
          fromBlock: toHex(116_822n),
          toBlock: toHex(126_821n),
          topics: [
            null,
            PADDED_SPACE,
            [
              GOVERNANCE_ACTIONS.SPACE_ID_REGISTERED,
              GOVERNANCE_ACTIONS.TOPIC_DECLARED,
              GOVERNANCE_ACTIONS.EDITS_PUBLISHED,
            ],
          ],
        },
      ],
    });
    expect(getBlock).toHaveBeenCalledWith({ blockNumber: 126_690n });
  });

  it('walks back past the first window to a declaration older than it', async () => {
    getBlockNumber.mockResolvedValue(150_000n);
    request
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([registeredLog, editLog, declaredLog]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toMatchObject({ topicId: TOPIC_ID });

    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1][0].params[0]).toMatchObject({ fromBlock: toHex(130_001n), toBlock: toHex(140_000n) });
    expect(request.mock.calls[2][0].params[0]).toMatchObject({ fromBlock: toHex(120_001n), toBlock: toHex(130_000n) });
  });

  it('returns null once it reaches genesis with no declaration', async () => {
    getBlockNumber.mockResolvedValue(25_000n);
    request.mockResolvedValue([]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toBeNull();

    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2][0].params[0]).toMatchObject({ fromBlock: toHex(0n), toBlock: toHex(5_000n) });
  });

  it('keeps walking in bounded windows to a registration far behind the head', async () => {
    getBlockNumber.mockResolvedValue(1_000_000n);
    for (let i = 0; i < 80; i++) request.mockResolvedValueOnce([]);
    request.mockResolvedValueOnce([registeredLog, editLog, declaredLog]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toMatchObject({ topicId: TOPIC_ID });
    expect(request).toHaveBeenCalledTimes(81);
    for (const [{ params }] of request.mock.calls) {
      expect(BigInt(params[0].toBlock) - BigInt(params[0].fromBlock)).toBeLessThan(10_000n);
    }
  });

  it('throws rather than reporting none when a window cannot be read', async () => {
    getBlockNumber.mockResolvedValue(1_000_000n);
    request.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('rpc unavailable'));

    await expect(findPersonalProfileDeclaration(SPACE_ID)).rejects.toThrow('rpc unavailable');
  });

  it('stops at registration when no profile was ever published', async () => {
    request.mockResolvedValue([registeredLog]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('uses the earliest declaration when there are several', async () => {
    const later = {
      ...declaredLog,
      topics: [...declaredLog.topics.slice(0, 3), `0x${'ab'.repeat(16)}${'0'.repeat(32)}`],
      blockNumber: toHex(126_800),
      transactionHash: '0xbbbb',
    };
    request.mockResolvedValue([registeredLog, editLog, declaredLog, later]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toMatchObject({
      topicId: TOPIC_ID,
      editUri: EDIT_URI,
    });
  });

  it('skips an earlier declaration sent without an edit for the earliest one sent with its edit', async () => {
    const alone = {
      ...declaredLog,
      topics: [...declaredLog.topics.slice(0, 3), `0x${'ab'.repeat(16)}${'0'.repeat(32)}`],
      blockNumber: toHex(126_689),
      transactionHash: '0xcccc',
    };
    request.mockResolvedValue([registeredLog, alone, editLog, declaredLog]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toMatchObject({
      topicId: TOPIC_ID,
      editUri: EDIT_URI,
    });
  });

  it('counts a later republish and dates the last publish from it', async () => {
    const republish = { ...editLog, blockNumber: toHex(126_800), transactionHash: '0xdddd' };
    getBlock.mockImplementation(async ({ blockNumber }: { blockNumber: bigint }) => ({
      timestamp: blockNumber === 126_800n ? DECLARED_AT_SECONDS + 3_600n : DECLARED_AT_SECONDS,
    }));
    request.mockResolvedValue([registeredLog, editLog, declaredLog, republish]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toMatchObject({
      declaredAtMs: Number(DECLARED_AT_SECONDS) * 1000,
      lastPublishedAtMs: Number(DECLARED_AT_SECONDS + 3_600n) * 1000,
      publishCount: 2,
    });
  });

  it('reports no edit URI when the declaring transaction published no edit', async () => {
    request.mockResolvedValue([registeredLog, declaredLog]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toMatchObject({ editUri: null });
  });

  it('ignores logs from other spaces into this one', async () => {
    const OTHER = '0x11111111111111111111111111111111' + '0'.repeat(32);
    request.mockResolvedValue([registeredLog, { ...declaredLog, topics: [OTHER, ...declaredLog.topics.slice(1)] }]);

    await expect(findPersonalProfileDeclaration(SPACE_ID)).resolves.toBeNull();
  });
});

describe('republishPersonalProfile', () => {
  const sendUserOperation = vi.fn();
  const smartAccount = { sendUserOperation } as unknown as Parameters<
    typeof republishPersonalProfile
  >[0]['smartAccount'];
  const WALLET = '0x1561d60DF8b2840264DEc7f508E911fd708dc41F';
  const ORIGINAL_IDS = [
    TOPIC_ID,
    'f7e717740dcf4e72894779e168846db5',
    '48bbae2340244813b9f7e5b013892a33',
    'cc4990b3fd5046b194864918e7803978',
    'a7fe5329e32f44bf84a6470b3bf72d25',
    'ea27595ba70b40aea0e131a5a08e9611',
    '6c410f068ad548d08b86f0fbb64f4043',
  ];

  function declarationPublishedAgo(ageMs: number, editUri: string | null = EDIT_URI) {
    const at = Date.now() - ageMs;
    return {
      topicId: TOPIC_ID,
      blockNumber: 126_690n,
      transactionHash: TX,
      declaredAtMs: at,
      editUri,
      lastPublishedAtMs: at,
      publishCount: 1,
    } as const;
  }

  function republish(declaration: ReturnType<typeof declarationPublishedAgo>, onRegistered = vi.fn()) {
    return republishPersonalProfile({
      smartAccount,
      walletAddress: WALLET,
      spaceId: SPACE_ID,
      declaration,
      spaceName: 'Bryan',
      onRegistered,
    });
  }

  function publishedOpIds() {
    return publishEdit.mock.calls[0][0].ops.map((op: { id: Uint8Array }) => formatId(op.id as never));
  }

  /** The single call sent: the edit publish, never a TOPIC_DECLARED to the registry. */
  function expectOnlyThePublishCall() {
    expect(sendUserOperation).toHaveBeenCalledTimes(1);
    expect(sendUserOperation.mock.calls[0][0].calls).toEqual([
      { to: SPACE_REGISTRY_ADDRESS_HEX, value: 0n, data: '0xfeed' },
    ]);
  }

  beforeEach(() => {
    sendUserOperation.mockReset();
    sendUserOperation.mockResolvedValue('0xuserop');
    publishEdit.mockResolvedValue({
      to: SPACE_REGISTRY_ADDRESS_HEX,
      calldata: '0xfeed',
      cid: 'ipfs://new',
      editId: 'e',
    });
    getSpace.mockReturnValue(Effect.succeed({ entity: { id: TOPIC_ID, name: 'Bryan' } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(EDIT_BYTES, { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('republishes the original ops by id, in one call, with no second topic declaration', async () => {
    const onRegistered = vi.fn();

    await expect(republish(declarationPublishedAgo(10 * 60_000), onRegistered)).resolves.toBe(SPACE_ID);

    expect(publishEdit).toHaveBeenCalledTimes(1);
    const { spaceId, author } = publishEdit.mock.calls[0][0];
    expect({ spaceId, author }).toEqual({ spaceId: SPACE_ID, author: SPACE_ID });
    expect(publishedOpIds()).toEqual(ORIGINAL_IDS);
    expectOnlyThePublishCall();
    expect(onRegistered).toHaveBeenCalledWith(SPACE_ID, TOPIC_ID);
    expect(reportEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'personal_profile_republished',
        tags: expect.objectContaining({ outcome: 'original' }),
      })
    );
  });

  it('always republishes a readable original, however old the publish', async () => {
    await republish(declarationPublishedAgo(30 * 24 * 60 * 60_000));

    expect(publishedOpIds()).toEqual(ORIGINAL_IDS);
    expectOnlyThePublishCall();
  });

  it('sends nothing for an unreadable original published under an hour ago', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Too many requests', { status: 429 })));

    await expect(republish(declarationPublishedAgo(UNREADABLE_ORIGINAL_FALLBACK_MS - 60_000))).rejects.toThrow(
      ProfileRecoveryError
    );

    expect(publishEdit).not.toHaveBeenCalled();
    expect(sendUserOperation).not.toHaveBeenCalled();
  });

  it('sends nothing for a declaration with no paired edit under an hour old', async () => {
    await expect(republish(declarationPublishedAgo(10 * 60_000, null))).rejects.toThrow(ProfileRecoveryError);

    expect(sendUserOperation).not.toHaveBeenCalled();
  });

  it('never replaces an original it could not reach, however old the publish', async () => {
    const old = declarationPublishedAgo(UNREADABLE_ORIGINAL_FALLBACK_MS + 60_000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Too many requests', { status: 429 })));
    await expect(republish(old)).rejects.toThrow(ProfileRecoveryError);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(republish(old)).rejects.toThrow(ProfileRecoveryError);

    expect(publishEdit).not.toHaveBeenCalled();
    expect(sendUserOperation).not.toHaveBeenCalled();
  });

  it('publishes a fresh profile under the declared topic once a missing original is over an hour old', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })));
    const onRegistered = vi.fn();

    await expect(
      republish(declarationPublishedAgo(UNREADABLE_ORIGINAL_FALLBACK_MS + 60_000), onRegistered)
    ).resolves.toBe(SPACE_ID);

    const ids = publishedOpIds();
    // The person entity is the declared one, so the page stays; the account and relations are new.
    expect(ids[0]).toBe(TOPIC_ID);
    expect(ids).not.toContain('cc4990b3fd5046b194864918e7803978');
    // Types → SPACE_TYPE on the declared entity is what makes the index serve it as the page.
    const ops = publishEdit.mock.calls[0][0].ops as { type: string; from?: never; to?: never; relationType?: never }[];
    expect(
      ops.some(
        op =>
          op.type === 'createRelation' &&
          formatId(op.from!) === TOPIC_ID &&
          formatId(op.relationType!) === SystemIds.TYPES_PROPERTY &&
          formatId(op.to!) === SystemIds.SPACE_TYPE
      )
    ).toBe(true);
    expectOnlyThePublishCall();
    expect(onRegistered).toHaveBeenCalledWith(SPACE_ID, TOPIC_ID);
    expect(reportEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tags: expect.objectContaining({ outcome: 'fresh_under_declared_topic' }) })
    );
  });

  it('falls back the same way for an old declaration with no paired edit', async () => {
    await republish(declarationPublishedAgo(UNREADABLE_ORIGINAL_FALLBACK_MS + 60_000, null));

    expect(publishedOpIds()[0]).toBe(TOPIC_ID);
    expectOnlyThePublishCall();
  });

  it('does not fall back when the send itself fails', async () => {
    sendUserOperation.mockRejectedValue(new Error('bundler down'));

    await expect(republish(declarationPublishedAgo(10 * 60_000))).rejects.toThrow(
      'Failed to republish personal profile'
    );
    expect(publishEdit).toHaveBeenCalledTimes(1);
  });
});

describe('GOVERNANCE_ACTIONS', () => {
  it('pins the action hashes the profile lookup reads', () => {
    expect(GOVERNANCE_ACTIONS.SPACE_ID_REGISTERED).toBe(keccak256(toHex('GOVERNANCE.SPACE_ID_REGISTERED')));
    expect(GOVERNANCE_ACTIONS.EDITS_PUBLISHED).toBe(keccak256(toHex('GOVERNANCE.EDITS_PUBLISHED')));
    expect(GOVERNANCE_ACTIONS.TOPIC_DECLARED).toBe(keccak256(toHex('GOVERNANCE.TOPIC_DECLARED')));
  });
});
