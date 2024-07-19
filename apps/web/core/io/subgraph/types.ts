import { SpaceGovernanceType } from '~/core/types';

import { SubstreamEntity } from './network-local-mapping';

export type NetworkSpaceResult = {
  id: string;
  type: SpaceGovernanceType;
  isRootSpace: boolean;
  mainVotingPluginAddress: string | null;
  memberAccessPluginAddress: string | null;
  personalSpaceAdminPluginAddress: string | null;
  spacePluginAddress: string;
  spaceEditors: { nodes: { accountId: string }[] };
  spaceMembers: { nodes: { accountId: string }[] };
  createdAtBlock: string;
  spacesMetadata: { nodes: { entity: SubstreamEntity }[] };
};
