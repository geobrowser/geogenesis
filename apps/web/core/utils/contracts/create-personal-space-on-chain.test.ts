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
import { ProfileRecoveryError } from './personal-profile-recovery';
import { GOVERNANCE_ACTIONS } from './space-registry';

const request = vi.fn();
const getBlockNumber = vi.fn();
const getBlock = vi.fn();
const publishEdit = vi.fn();
const getSpace = vi.fn();

vi.mock('viem', async importOriginal => ({
  ...(await importOriginal<typeof import('viem')>()),
  createPublicClient: () => ({ request, getBlockNumber, getBlock }),
}));

vi.mock('~/core/sdk/geo-client', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/sdk/geo-client')>()),
  geo: { personalSpaces: { publishEdit: (args: unknown) => publishEdit(args) } },
}));

vi.mock('~/core/io/queries', () => ({ getSpace: (id: string) => getSpace(id) }));

beforeEach(() => {
  request.mockReset();
  getBlockNumber.mockReset();
  getBlock.mockReset();
  publishEdit.mockReset();
  getSpace.mockReset();
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
  const declaration = {
    topicId: TOPIC_ID,
    blockNumber: 126_690n,
    transactionHash: TX,
    declaredAtMs: Number(DECLARED_AT_SECONDS) * 1000,
    editUri: EDIT_URI,
    lastPublishedAtMs: Number(DECLARED_AT_SECONDS) * 1000,
    publishCount: 1,
  } as const;

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

    await expect(
      republishPersonalProfile({ smartAccount, spaceId: SPACE_ID, declaration, spaceName: 'Bryan', onRegistered })
    ).resolves.toBe(SPACE_ID);

    expect(publishEdit).toHaveBeenCalledTimes(1);
    const { ops, spaceId, author } = publishEdit.mock.calls[0][0];
    expect({ spaceId, author }).toEqual({ spaceId: SPACE_ID, author: SPACE_ID });
    expect(ops.map((op: { id: Uint8Array }) => formatId(op.id as never))).toEqual([
      TOPIC_ID,
      'f7e717740dcf4e72894779e168846db5',
      '48bbae2340244813b9f7e5b013892a33',
      'cc4990b3fd5046b194864918e7803978',
      'a7fe5329e32f44bf84a6470b3bf72d25',
      'ea27595ba70b40aea0e131a5a08e9611',
      '6c410f068ad548d08b86f0fbb64f4043',
    ]);

    expect(sendUserOperation).toHaveBeenCalledTimes(1);
    const { calls } = sendUserOperation.mock.calls[0][0];
    expect(calls).toEqual([{ to: SPACE_REGISTRY_ADDRESS_HEX, value: 0n, data: '0xfeed' }]);
    expect(onRegistered).toHaveBeenCalledWith(SPACE_ID, TOPIC_ID);
  });

  it('sends nothing and never rebuilds with fresh ids when the original edit cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Too many requests', { status: 429 })));

    await expect(
      republishPersonalProfile({ smartAccount, spaceId: SPACE_ID, declaration, spaceName: 'Bryan' })
    ).rejects.toThrow(ProfileRecoveryError);

    expect(publishEdit).not.toHaveBeenCalled();
    expect(sendUserOperation).not.toHaveBeenCalled();
  });

  it('sends nothing when the declaring transaction published no edit', async () => {
    await expect(
      republishPersonalProfile({
        smartAccount,
        spaceId: SPACE_ID,
        declaration: { ...declaration, editUri: null },
        spaceName: 'Bryan',
      })
    ).rejects.toThrow(ProfileRecoveryError);

    expect(sendUserOperation).not.toHaveBeenCalled();
  });
});

describe('GOVERNANCE_ACTIONS', () => {
  it('pins the action hashes the profile lookup reads', () => {
    expect(GOVERNANCE_ACTIONS.SPACE_ID_REGISTERED).toBe(keccak256(toHex('GOVERNANCE.SPACE_ID_REGISTERED')));
    expect(GOVERNANCE_ACTIONS.EDITS_PUBLISHED).toBe(keccak256(toHex('GOVERNANCE.EDITS_PUBLISHED')));
    expect(GOVERNANCE_ACTIONS.TOPIC_DECLARED).toBe(keccak256(toHex('GOVERNANCE.TOPIC_DECLARED')));
  });
});
