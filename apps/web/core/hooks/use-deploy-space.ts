'use client';

import { useMutation } from '@tanstack/react-query';

import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { SpaceType } from '../types';

interface DeployArgs {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string;
}

export function useDeploySpace() {
  const smartAccount = useSmartAccount();

  const { mutate, status, error } = useMutation({
    mutationFn: async (args: DeployArgs) => {
      if (!smartAccount) {
        return;
      }

      const initialEditorAddress = smartAccount?.account.address;

      if (!initialEditorAddress) {
        return;
      }

      const { spaceAvatarUri, spaceName, type } = args;

      const url = new URL(
        `/api/space/deploy?spaceName=${spaceName}&type=${type}&initialEditorAddress=${initialEditorAddress}`,
        window.location.href
      );

      if (spaceAvatarUri) {
        url.searchParams.set('spaceAvatarUri', spaceAvatarUri);
      }

      const deployResult = await fetch(url);

      const json: { spaceId: string } = await deployResult.json();
      return json.spaceId;
    },
  });

  return {
    deploy: mutate,
    status,
  };
}
