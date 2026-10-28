import { toHex } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SPACE_REGISTRY_ADDRESS_HEX } from '~/core/sdk/geo-network';

import { hasDeclaredPersonalTopic, parseRegisteredSpaceId } from './create-personal-space-on-chain';

const request = vi.fn();
const getBlockNumber = vi.fn();

vi.mock('viem', async importOriginal => ({
  ...(await importOriginal<typeof import('viem')>()),
  createPublicClient: () => ({ request, getBlockNumber }),
}));

beforeEach(() => {
  request.mockReset();
  getBlockNumber.mockReset();
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

describe('hasDeclaredPersonalTopic', () => {
  // A real testnet declaration (2026-10): personal space 36f751cd… declared its page c5636591….
  // The registry logs it as raw topics [from space, to space, action, topic], each bytes16 id
  // right-padded to 32 bytes.
  const SPACE_ID = '36f751cdc6c147d5b1b17b4d19a7fd56';
  const PADDED_SPACE = '0x36f751cdc6c147d5b1b17b4d19a7fd5600000000000000000000000000000000';
  const TOPIC_DECLARED = '0xd020fbe5a0270daba9a9031c59402c03d5093ebfa8c4caa2203c2c72f95ce30c';

  it('asks the registry for the space declaring its own topic, over a bounded recent window', async () => {
    // A full-history range runs into RPC block-range caps as the chain grows; only declarations
    // recent enough for the index to have missed matter.
    request.mockResolvedValue([]);

    await hasDeclaredPersonalTopic(SPACE_ID);

    expect(request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [
        {
          address: SPACE_REGISTRY_ADDRESS_HEX,
          fromBlock: toHex(88_483n),
          toBlock: toHex(98_482n),
          topics: [PADDED_SPACE, PADDED_SPACE, TOPIC_DECLARED],
        },
      ],
    });
  });

  it('starts the window at genesis on a chain younger than it', async () => {
    getBlockNumber.mockResolvedValue(4_000n);
    request.mockResolvedValue([]);

    await hasDeclaredPersonalTopic(SPACE_ID);

    expect(request.mock.calls[0][0].params[0]).toMatchObject({ fromBlock: toHex(0n), toBlock: toHex(4_000n) });
  });

  it('reports a declaration when the registry has one', async () => {
    request.mockResolvedValue([
      {
        topics: [
          PADDED_SPACE,
          PADDED_SPACE,
          TOPIC_DECLARED,
          '0xc56365911a5640eb9b11e434f467d53700000000000000000000000000000000',
        ],
      },
    ]);

    await expect(hasDeclaredPersonalTopic(SPACE_ID)).resolves.toBe(true);
  });

  it('reports none when the registry has none', async () => {
    request.mockResolvedValue([]);

    await expect(hasDeclaredPersonalTopic(SPACE_ID)).resolves.toBe(false);
  });
});
