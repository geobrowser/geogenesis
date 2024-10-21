'use client';

import { useMutation } from '@tanstack/react-query';

import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { SpaceGovernanceType } from '../types';

// Governance type is only manually set if the space is a "Blank"/default space.
// Otherwise we manually set the governance type depending on the space type.
type DeployArgs =
  | {
      type: 'personal' | 'company';
      spaceName: string;
      spaceAvatarUri?: string;
      governanceType?: SpaceGovernanceType;
    }
  | {
      type:
        | 'default'
        | 'nonprofit'
        | 'academic-field'
        | 'region'
        | 'industry'
        | 'protocol'
        | 'dao'
        | 'government-org'
        | 'interest-group';
      spaceName: string;
      spaceCoverUri?: string;
      governanceType?: SpaceGovernanceType;
    };

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

      const { spaceName, type, governanceType } = args;

      const url = new URL(
        `/api/space/deploy?spaceName=${spaceName}&type=${type}&initialEditorAddress=${initialEditorAddress}`,
        window.location.href
      );

      if (args.type === 'personal' || args.type === 'company') {
        if (args.spaceAvatarUri && args.spaceAvatarUri !== '') {
          url.searchParams.set('spaceAvatarUri', args.spaceAvatarUri);
        }
      } else if (
        args.type === 'default' ||
        args.type === 'nonprofit' ||
        args.type === 'academic-field' ||
        args.type === 'region' ||
        args.type === 'industry' ||
        args.type === 'protocol' ||
        args.type === 'dao' ||
        args.type === 'government-org' ||
        args.type === 'interest-group'
      ) {
        if (args.spaceCoverUri && args.spaceCoverUri !== '') {
          url.searchParams.set('spaceCoverUri', args.spaceCoverUri);
        }
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
