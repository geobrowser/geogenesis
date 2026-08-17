import { IS_TESTNET } from '~/core/sdk/geo-network';

/**
 * DAO spaces that participate in the bounty program, per network.
 *
 * Deliberately hardcoded, not queried: the list encodes which spaces have a
 * points ledger provisioned in curator-backend (Neo4j `Space.balance`, topped
 * up out-of-band) — that is not discoverable from the knowledge graph, and
 * showing bounties from an unprovisioned space would offer work that can
 * never pay out. Keep in sync with curator-app's `ALLOWED_SPACE_IDS`
 * (`packages/curator-utils/src/ids.ts`); the two lists must move together.
 */
export const BOUNTY_SPACE_IDS: Record<'TESTNET' | 'MAINNET', readonly string[]> = {
  TESTNET: [
    'a19c345ab9866679b001d7d2138d88a1',
    '52c7ae149838b6d47ce0f3b2a5974546',
    'c9f267dcb0d270718c2a3c45a64afd32',
    '41e851610e13a19441c4d980f2f2ce6b',
    '89bd89bf28ff8a0963faf92a8c905e20',
    'ec349623f33236aee13c12dcd629ee81',
    '19f11bc6f1a62ac434936af814d1f8b5',
    '4582fbbee28a16589154f7e36f1ee3c5',
  ],
  // The bounty ontology has not shipped on mainnet and no mainnet space has a
  // provisioned ledger. Stays empty until the mainnet cutover.
  MAINNET: [],
};

export const CURRENT_BOUNTY_SPACE_IDS: readonly string[] = IS_TESTNET
  ? BOUNTY_SPACE_IDS.TESTNET
  : BOUNTY_SPACE_IDS.MAINNET;

const currentBountySpaceIdSet = new Set(CURRENT_BOUNTY_SPACE_IDS.map(id => id.toLowerCase().replace(/-/g, '')));

/** True when the space participates in the bounty program on the current network. */
export function isBountySpace(spaceId: string | null | undefined): boolean {
  if (!spaceId) return false;
  return currentBountySpaceIdSet.has(spaceId.toLowerCase().replace(/-/g, ''));
}
