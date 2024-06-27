import type * as S from 'zapatos/schema';

import type { GovernancePluginsCreated, PersonalPluginsCreated, SpacePluginCreated } from './parser';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';

export function mapSpaces(spaces: SpacePluginCreated[], createdAtBlock: number): S.spaces.Insertable[] {
  return spaces.map(s => ({
    id: getChecksumAddress(s.daoAddress),
    dao_address: getChecksumAddress(s.daoAddress),
    space_plugin_address: getChecksumAddress(s.spaceAddress),
    is_root_space: false,
    type: 'public',
    created_at_block: createdAtBlock,
  }));
}

export function mapGovernanceToSpaces(
  spaces: GovernancePluginsCreated[],
  createdAtBlock: number
): S.spaces.Insertable[] {
  return spaces.map(s => ({
    id: getChecksumAddress(s.daoAddress),
    is_root_space: false,
    created_at_block: createdAtBlock,
    type: 'public',
    dao_address: getChecksumAddress(s.daoAddress),
    main_voting_plugin_address: getChecksumAddress(s.mainVotingAddress),
    member_access_plugin_address: getChecksumAddress(s.memberAccessAddress),
  }));
}

export function mapPersonalToSpaces(spaces: PersonalPluginsCreated[], createdAtBlock: number): S.spaces.Insertable[] {
  return spaces.map(s => ({
    id: getChecksumAddress(s.daoAddress),
    is_root_space: false,
    created_at_block: createdAtBlock,
    type: 'personal',
    dao_address: getChecksumAddress(s.daoAddress),
    personal_space_admin_plugin_address: getChecksumAddress(s.personalAdminAddress),
  }));
}
