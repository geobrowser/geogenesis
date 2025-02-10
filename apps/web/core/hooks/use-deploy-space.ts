'use client';

import { useMutation } from '@tanstack/react-query';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { EntityId } from '~/core/io/schema';
import { validateEntityId } from '~/core/utils/utils';

import { SpaceGovernanceType } from '../types';

// Governance type is only manually set if the space is a "Blank"/default space.
// Otherwise we manually set the governance type depending on the space type.
type DeployArgs = {
  type:
    | 'personal'
    | 'company'
    | 'default'
    | 'nonprofit'
    | 'academic-field'
    | 'region'
    | 'industry'
    | 'protocol'
    | 'dao'
    | 'government-org'
    | 'interest';
  spaceName: string;
  spaceImage?: string;
  governanceType?: SpaceGovernanceType;
  entityId?: string;
};

export function useDeploySpace() {
  const { smartAccount } = useSmartAccount();

  const { mutateAsync } = useMutation({
    mutationFn: async (args: DeployArgs) => {
      try {
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

        if (validateEntityId(args.entityId)) {
          url.searchParams.set('entityId', args.entityId as EntityId);
        }

        if (args.type === 'personal' || args.type === 'company') {
          if (args.spaceImage && args.spaceImage !== '') {
            url.searchParams.set('spaceAvatarUri', args.spaceImage);
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
          args.type === 'interest'
        ) {
          if (args.spaceImage && args.spaceImage !== '') {
            url.searchParams.set('spaceCoverUri', args.spaceImage);
          }
        }

        if (governanceType) {
          url.searchParams.set('governanceType', governanceType);
        }

        const deployResult = await fetch(url);
        const json: { spaceId: string } = await deployResult.json();
        return json.spaceId;
      } catch (error) {
        console.error(error);
        throw new Error(`Space deployment failed`);
      }
    },
  });

  return {
    deploy: mutateAsync,
  };
}
