import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../utils/get-checksum-address';
import type { GovernancePluginsCreated, SpacePluginCreated } from '../zod';

/**
 * We currently index two sets of contracts representing spaces:
 * 1. The original Space contract with simple permissions rules and no proposals.
 * 2. The new (as of January 23rd, 2024) DAO-based contracts with Plugins representing
 *    the Space and any governance and permissions rules.
 *
 * Having multiple sets of contracts means that we support multiple methods for
 * indexing data from these contracts, including the data representing the contracts
 * themselves like the address of the contract and any plugins (if they exist).
 *
 * This file is used to map the space metadata for the _new_ contracts. Currently
 * we index the old contracts in `map-entries.ts` by simply taking the space address
 * of any content added to the old contracts and putting it into the 'spaces' table.
 *
 * We will eventually deprecate the existing contracts and migrate data and permissions
 * in them to the new contract implementation. To do this we will likely only index the
 * old contracts up to a specific block number and then index the new contracts from that
 * block.
 *
 * Alternatively we might look to "snapshot" the state of Geo at a specific timepoint
 * and migrate fully to the new contracts. This would likely coincide with a migration
 * to a separate blockchain.
 */

export function mapSpaces(spaces: SpacePluginCreated[], createdAtBlock: number): S.spaces.Insertable[] {
  return spaces.map(s => ({
    id: getChecksumAddress(s.daoAddress),
    is_root_space: false, // @TODO: it _might_ be the root space
    created_at_block: createdAtBlock,
  }));
}

export function mapGovernanceToSpaces(
  spaces: GovernancePluginsCreated[],
  createdAtBlock: number
): S.spaces.Insertable[] {
  return spaces.map(s => ({
    id: getChecksumAddress(s.daoAddress),
    is_root_space: false, // @TODO: it _might_ be the root space
    created_at_block: createdAtBlock,
    main_voting_plugin_address: getChecksumAddress(s.mainVotingAddress),
    member_access_plugin_address: getChecksumAddress(s.memberAccessAddress),
  }));
}

/**
 * @TODO: It might make sense to have a separate function that takes the mapSpaces and
 * mapGovernanceToSpaces functions and merges any duplicate entries into a single DB call.
 * Otherwise we're making multiple writes to the DB with duplicate data which is blocking
 * and slow.
 *
 * Maybe this can happen when we create the Queue implementation.
 */
