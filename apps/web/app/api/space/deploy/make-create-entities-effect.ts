import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';

import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { StorageClient } from '~/core/io/storage/storage';
import { CreateTripleAction, OmitStrict, SpaceType, Triple } from '~/core/types';
import { generateTriplesForNonprofit } from '~/core/utils/contracts/generate-triples-for-nonprofit';
import { slog } from '~/core/utils/utils';

import { CreateSpaceEntitiesFailedError } from '../../errors';
import { makeProposalServer } from '../../make-proposal-server';
import { geoAccount, publicClient, walletClient } from '../../client';

interface UserConfig {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string | null;
  spaceAddress: string;
}

export function makeCreateEntitiesEffect(
  requestId: string,
  { type, spaceName, spaceAvatarUri, spaceAddress }: UserConfig
) {
  // Create the profile entity representing the new user and space configuration for this space
  // in the Geo knowledge graph.
  //
  // The id for this entity is the same as the on-chain profile id.
  const createEntitiesEffect = Effect.tryPromise({
    try: async () => {
      const actions: CreateTripleAction[] = [];
      const newEntityId = ID.createEntityId();

      // Add triples for a Person entity
      const nameTriple: OmitStrict<Triple, 'id'> = {
        entityId: newEntityId,
        entityName: spaceName,
        attributeId: SYSTEM_IDS.NAME,
        attributeName: 'Name',
        space: spaceAddress,
        value: {
          type: 'string',
          value: spaceName,
          id: ID.createValueId(),
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(nameTriple),
        ...nameTriple,
      });

      const spaceTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        entityId: newEntityId,
        entityName: spaceName,
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Space',
          id: SYSTEM_IDS.SPACE_CONFIGURATION,
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(spaceTypeTriple),
        ...spaceTypeTriple,
      });

      if (spaceAvatarUri) {
        const avatarTripleWithoutId: OmitStrict<Triple, 'id'> = {
          entityId: newEntityId,
          entityName: spaceName,
          attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
          attributeName: 'Avatar',
          space: spaceAddress,
          value: {
            type: 'image',
            value: spaceAvatarUri,
            id: ID.createValueId(),
          },
        };

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(avatarTripleWithoutId),
          ...avatarTripleWithoutId,
        });
      }

      if (type === 'company') {
        const companyTypeTriple: OmitStrict<Triple, 'id'> = {
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Types',
          entityId: newEntityId,
          entityName: spaceName,
          space: spaceAddress,
          value: {
            type: 'entity',
            name: 'Company',
            id: SYSTEM_IDS.COMPANY_TYPE,
          },
        };

        actions.push({
          ...companyTypeTriple,
          type: 'createTriple',
          id: ID.createTripleId(companyTypeTriple),
        });
      }

      // Nonprofit spaces have both Nonprofit _and_ Project added as types
      if (type === 'nonprofit') {
        const nonprofitTypeTriple: OmitStrict<Triple, 'id'> = {
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Types',
          entityId: newEntityId,
          entityName: spaceName,
          space: spaceAddress,
          value: {
            type: 'entity',
            name: 'Nonprofit Organization',
            id: SYSTEM_IDS.NONPROFIT_TYPE,
          },
        };

        const projectTypeTriple: OmitStrict<Triple, 'id'> = {
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Types',
          entityId: newEntityId,
          entityName: spaceName,
          space: spaceAddress,
          value: {
            type: 'entity',
            name: 'Project',
            id: SYSTEM_IDS.PROJECT_TYPE,
          },
        };

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(nonprofitTypeTriple),
          ...nonprofitTypeTriple,
        });

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(projectTypeTriple),
          ...projectTypeTriple,
        });

        const nonprofitActions = generateTriplesForNonprofit(newEntityId, spaceName, spaceAddress);

        actions.push(...nonprofitActions);
      }

      slog({
        requestId,
        message: `Adding profile to space ${spaceAddress}`,
      });

      const proposalEffect = await makeProposalServer({
        actions,
        name: `Creating entities for new space ${spaceAddress}`,
        space: spaceAddress,
        storageClient: new StorageClient(Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).ipfs),
        account: geoAccount,
        wallet: walletClient,
        publicClient: publicClient,
      });

      await Effect.runPromise(proposalEffect);

      slog({
        requestId,
        message: `Successfully added profile to space ${spaceAddress}`,
      });
    },
    catch: error => {
      slog({
        level: 'error',
        requestId,
        message: `Creating Geo entity Profile in space address ${spaceAddress} failed: ${(error as Error).message}`,
      });
      return new CreateSpaceEntitiesFailedError();
    },
  });

  return createEntitiesEffect;
}
