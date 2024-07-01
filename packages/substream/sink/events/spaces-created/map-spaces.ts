import { NETWORK_IDS } from '@geogenesis/sdk/src/system-ids';
import type * as S from 'zapatos/schema';

import type { GovernancePluginsCreated, PersonalPluginsCreated, SpacePluginCreatedWithSpaceId } from './parser';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { createSpaceId } from '~/sink/utils/id';

export function mapSpaces(spaces: SpacePluginCreatedWithSpaceId[], createdAtBlock: number): S.spaces.Insertable[] {
  return spaces.map(s => {
    const daoAddress = getChecksumAddress(s.daoAddress);

    return {
      id: s.id ?? createSpaceId({ network: NETWORK_IDS.GEO, address: daoAddress }),
      dao_address: daoAddress,
      space_plugin_address: getChecksumAddress(s.spaceAddress),
      is_root_space: false,
      type: 'public',
      created_at_block: createdAtBlock,
    };
  });
}

type GovernancePluginsCreatedWithSpaceId = GovernancePluginsCreated & {
  // The id here is required as we can't derive it from the dao address + the network.
  // We don't know which network this space was originally created on, so we need to
  // know the id ahead of time before updating the space with the governance data.
  id: string;
};

export function mapGovernanceToSpaces(
  spaces: GovernancePluginsCreatedWithSpaceId[],
  createdAtBlock: number
): S.spaces.Insertable[] {
  return spaces.map(s => ({
    id: s.id,
    type: 'public',
    is_root_space: false,
    created_at_block: createdAtBlock,
    dao_address: getChecksumAddress(s.daoAddress),
    main_voting_plugin_address: getChecksumAddress(s.mainVotingAddress),
    member_access_plugin_address: getChecksumAddress(s.memberAccessAddress),
  }));
}

type PersonalPluginsCreatedWithSpaceId = PersonalPluginsCreated & {
  // The id here is required as we can't derive it from the dao address + the network.
  // We don't know which network this space was originally created on, so we need to
  // know the id ahead of time before updating the space with the governance data.
  id: string;
};

export function mapPersonalToSpaces(
  spaces: PersonalPluginsCreatedWithSpaceId[],
  createdAtBlock: number
): S.spaces.Insertable[] {
  return spaces.map(s => ({
    id: s.id,
    type: 'personal',
    is_root_space: false,
    created_at_block: createdAtBlock,
    dao_address: getChecksumAddress(s.daoAddress),
    personal_space_admin_plugin_address: getChecksumAddress(s.personalAdminAddress),
  }));
}
