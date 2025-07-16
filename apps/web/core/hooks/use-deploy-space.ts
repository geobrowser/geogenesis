'use client';

import { useMutation } from '@tanstack/react-query';

import { Environment } from '~/core/environment';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { generateOpsForSpaceType } from '~/core/utils/contracts/generate-ops-for-space-type';
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

        const { spaceName, type, entityId } = args;

        let spaceAvatarUri: string | null = null;
        let spaceCoverUri: string | null = null;

        if (args.type === 'personal' || args.type === 'company') {
          if (args.spaceImage && args.spaceImage !== '') {
            spaceAvatarUri = args.spaceImage;
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
            spaceCoverUri = args.spaceImage;
          }
        }

        const ops = await generateOpsForSpaceType({
          type,
          spaceName,
          spaceAvatarUri,
          spaceCoverUri,
          initialEditorAddress,
          entityId,
        });

        const config = Environment.getConfig();
        const apiUrl = config.api.replace('/graphql', '/deploy');

        const deployResult = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            initialEditorAddress,
            spaceName,
            spaceEntityId: validateEntityId(entityId) ? entityId : undefined,
            ops,
          }),
        });

        if (!deployResult.ok) {
          throw new Error('Space deployment failed');
        }

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
