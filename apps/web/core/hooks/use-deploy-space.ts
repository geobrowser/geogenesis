'use client';

import { useMutation } from '@tanstack/react-query';

import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { SpaceGovernanceType, SpaceType } from '../types';

interface DeployArgs {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string;

  // Governance type is only manually set if the space is a "Blank"/default space.
  // Otherwise we manually set the governance type depending on the space type.
  governanceType?: SpaceGovernanceType;
}

export function useDeploySpace() {
  const smartAccount = useSmartAccount();

  const { mutateAsync } = useMutation({
    mutationFn: async (args: DeployArgs) => {
      if (!smartAccount) {
        return null;
      }

      const initialEditorAddress = smartAccount?.account.address;

      if (!initialEditorAddress) {
        return null;
      }

      const { spaceAvatarUri, spaceName, type, governanceType } = args;

      const url = new URL(
        `/api/space/deploy?spaceName=${spaceName}&type=${type}&initialEditorAddress=${initialEditorAddress}`,
        window.location.href
      );

      if (spaceAvatarUri !== '') {
        url.searchParams.set('spaceAvatarUri', spaceAvatarUri);
      }

      if (governanceType) {
        url.searchParams.set('governanceType', governanceType);
      }

      const deployResult = await fetch(url);
      const json: { spaceId: string } = await deployResult.json();
      return json.spaceId;
    },
  });

  return {
    deploy: mutateAsync,
  };
}
