import type * as S from 'zapatos/schema';

import type { GovernancePluginsCreated, SpacePluginCreated } from '../events/spaces-created/parser';
import { getChecksumAddress } from '../utils/get-checksum-address';

export function mapSpaces(spaces: SpacePluginCreated[], createdAtBlock: number): S.spaces.Insertable[] {
  return spaces.map(s => ({
    id: getChecksumAddress(s.daoAddress),
    space_plugin_address: getChecksumAddress(s.spaceAddress),
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
