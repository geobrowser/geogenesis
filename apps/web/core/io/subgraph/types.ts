import { GovernanceType } from '~/core/types';

import { SubstreamEntity } from './network-local-mapping';

export type NetworkSpaceResult = {
  id: string;
  type: GovernanceType;
  isRootSpace: boolean;
  mainVotingPluginAddress: string | null;
  memberAccessPluginAddress: string | null;
  personalSpaceAdminPluginAddress: string | null;
  spacePluginAddress: string;
  spaceEditors: { nodes: { accountId: string }[] };
  spaceMembers: { nodes: { accountId: string }[] };
  createdAt: string;
  metadata: { nodes: SubstreamEntity[] };
};
