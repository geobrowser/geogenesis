import { SpaceArtifact } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';

import { ADMIN_ROLE_BINARY, EDITOR_CONTROLLER_ROLE_BINARY, EDITOR_ROLE_BINARY } from '~/core/constants';
import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { StorageClient } from '~/core/io/storage/storage';
import { CreateTripleAction, OmitStrict, Triple } from '~/core/types';
import { slog } from '~/core/utils/utils';

import { makeProposalServer } from '../../make-proposal-server';

type Role = {
  role: string;
  binary: string;
};

const ROLES: Role[] = [
  {
    role: 'EDITOR_ROLE',
    binary: EDITOR_ROLE_BINARY,
  },
  {
    role: 'EDITOR_CONTROLLER_ROLE',
    binary: EDITOR_CONTROLLER_ROLE_BINARY,
  },
  {
    role: 'ADMIN_ROLE',
    binary: ADMIN_ROLE_BINARY,
  },
];

class GrantRoleError extends Error {
  readonly _tag = 'GrantAdminRole';
}

class RenounceRoleError extends Error {
  readonly _tag = 'RenounceRoleError';
}

class CreateProfileGeoEntityFailedError extends Error {
  readonly _tag = 'CreateProfileGeoEntityFailedError';
}

interface UserConfig {
  profileId: string;
  account: `0x${string}`;
  username: string | null;
  avatarUri: string | null;
  spaceAddress: string;
}

/**
 * This function creates the off-chain profile entity representing the new user in the Geo knowledge
 * graph and makes sure that it is correctly associated with the on-chain profile.
 *
 * Profiles in Geo are comprised of two elements:
 * 1. The on-chain profile with an identifier and home space address
 * 2. The off-chain profile entity in the Geo knowledge graph. This has the same id as the
 *    on-chain id and has arbitrary metadata in the form of triples.
 *
 * Additionally, it grants the new user each role in the space and removes the deployer from
 * each role.
 */
export async function makeNonprofitEffect(
  requestId: string,
  { account: userAccount, username, avatarUri, spaceAddress, profileId }: UserConfig
) {
  const account = privateKeyToAccount(process.env.GEO_PK as `0x${string}`);

  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL, { batch: true }),
    // transport: http(Environment.options.testnet.rpc, { batch: true }),
  });

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL, { batch: true }),
    // transport: http(Environment.options.testnet.rpc, { batch: true }),
  });

  // Create the profile entity representing the new user and space configuration for this space
  // in the Geo knowledge graph.
  //
  // The id for this entity is the same as the on-chain profile id.
  const profileEffect = Effect.tryPromise({
    try: async () => {
      const actions: CreateTripleAction[] = [];

      // Add triples for a Person entity
      if (username) {
        const nameTripleWithoutId: OmitStrict<Triple, 'id'> = {
          entityId: profileId,
          entityName: username ?? '',
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          space: spaceAddress,
          value: {
            type: 'string',
            value: username,
            id: ID.createValueId(),
          },
        };

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(nameTripleWithoutId),
          ...nameTripleWithoutId,
        });
      }

      if (avatarUri) {
        const avatarTripleWithoutId: OmitStrict<Triple, 'id'> = {
          entityId: profileId,
          entityName: username ?? '',
          attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
          attributeName: 'Avatar',
          space: spaceAddress,
          value: {
            type: 'image',
            value: avatarUri,
            id: ID.createValueId(),
          },
        };

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(avatarTripleWithoutId),
          ...avatarTripleWithoutId,
        });
      }

      // Add Types: Nonprofit Organization and Project to the profile entity
      const nonprofitTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        entityId: profileId,
        entityName: username ?? '',
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
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Project',
          id: SYSTEM_IDS.PROJECT_TYPE,
        },
      };

      const spaceTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Space',
          id: SYSTEM_IDS.SPACE_CONFIGURATION,
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

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(spaceTypeTriple),
        ...spaceTypeTriple,
      });

      // Add Page foreign type
      const pageForeignTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.FOREIGN_TYPES,
        attributeName: 'Foreign Types',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Page',
          id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(pageForeignTypeTriple),
        ...pageForeignTypeTriple,
      });

      // Add Tag foreign type
      const tagForeignTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.FOREIGN_TYPES,
        attributeName: 'Foreign Types',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Tag',
          id: '3d31f766-b651-48af-a357-271343a773de',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(tagForeignTypeTriple),
        ...tagForeignTypeTriple,
      });

      // Add Post foreign type
      const postForeignTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.FOREIGN_TYPES,
        attributeName: 'Foreign Types',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Post',
          id: '682fbeff-41e2-42cd-a7f9-c4909136a8c5',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(postForeignTypeTriple),
        ...postForeignTypeTriple,
      });

      // Add Project foreign type
      const projectForeignTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.FOREIGN_TYPES,
        attributeName: 'Foreign Types',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Project',
          id: 'cb9d261d-456b-4eaf-87e5-1e9faa441867',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(projectForeignTypeTriple),
        ...projectForeignTypeTriple,
      });

      // Add Finance Summary foreign type
      const financeSummaryForeignTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.FOREIGN_TYPES,
        attributeName: 'Foreign Types',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Finance Summary',
          id: 'ce59ccc1-2ac5-4ace-8f82-09322434733d',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(financeSummaryForeignTypeTriple),
        ...financeSummaryForeignTypeTriple,
      });

      // Add space page table block entity
      const spacePageTableBlockEntityId = ID.createEntityId();

      const rowTypeSpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '577bd9fb-b29e-4e2b-b5f8-f48aedbd26ac',
        attributeName: 'Row Type',
        entityId: spacePageTableBlockEntityId,
        entityName: 'Pages',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Page',
          id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
        },
      };

      const filterSpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'b0f2d71a-79ca-4dc4-9218-e3e40dfed103',
        attributeName: 'Filter',
        entityId: spacePageTableBlockEntityId,
        entityName: 'Pages',
        space: spaceAddress,
        value: {
          type: 'string',
          value: `{typeIds_contains_nocase: ["1a9fc4a0-0fec-4eea-a075-eec7ebd0d043"], entityOf_: {space: "${spaceAddress}"}}`,
          id: ID.createValueId(),
        },
      };

      const parentEntitySpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        entityId: spacePageTableBlockEntityId,
        entityName: 'Pages',
        attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
        attributeName: 'Parent Entity',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: username ?? '',
          id: profileId,
        },
      };

      const nameSpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'name',
        attributeName: 'Name',
        entityId: spacePageTableBlockEntityId,
        entityName: 'Pages',
        space: spaceAddress,
        value: {
          type: 'string',
          value: 'Pages',
          id: ID.createValueId(),
        },
      };

      const typesSpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'type',
        attributeName: 'Types',
        entityId: spacePageTableBlockEntityId,
        entityName: 'Pages',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Table Block',
          id: '88d59252-17ae-4d9a-a367-24710129eb47',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(rowTypeSpacePageTableBlockTriple),
        ...rowTypeSpacePageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(filterSpacePageTableBlockTriple),
        ...filterSpacePageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(parentEntitySpacePageTableBlockTriple),
        ...parentEntitySpacePageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(nameSpacePageTableBlockTriple),
        ...nameSpacePageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typesSpacePageTableBlockTriple),
        ...typesSpacePageTableBlockTriple,
      });

      // Add space page blocks
      const spacePageBlocksTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'beaba5cb-a677-41a8-b353-77030613fc70',
        attributeName: 'Blocks',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'string',
          value: `["${spacePageTableBlockEntityId}"]`,
          id: ID.createValueId(),
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(spacePageBlocksTriple),
        ...spacePageBlocksTriple,
      });

      // Add posts page
      const postsPageEntityId = ID.createEntityId();

      const namePostsPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'name',
        attributeName: 'Name',
        entityId: postsPageEntityId,
        entityName: 'Posts',
        space: spaceAddress,
        value: {
          type: 'string',
          value: 'Posts',
          id: ID.createValueId(),
        },
      };

      const typesPostsPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'type',
        attributeName: 'Types',
        entityId: postsPageEntityId,
        entityName: 'Posts',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Page',
          id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(namePostsPageTriple),
        ...namePostsPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typesPostsPageTriple),
        ...typesPostsPageTriple,
      });

      // Add posts page table block
      const postsPageTableBlockEntityId = ID.createEntityId();

      const rowTypePostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '577bd9fb-b29e-4e2b-b5f8-f48aedbd26ac',
        attributeName: 'Row Type',
        entityId: postsPageTableBlockEntityId,
        entityName: 'Posts',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Post',
          id: '682fbeff-41e2-42cd-a7f9-c4909136a8c5',
        },
      };

      const filterPostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'b0f2d71a-79ca-4dc4-9218-e3e40dfed103',
        attributeName: 'Filter',
        entityId: postsPageTableBlockEntityId,
        entityName: 'Posts',
        space: spaceAddress,
        value: {
          type: 'string',
          value: `{typeIds_contains_nocase: ["682fbeff-41e2-42cd-a7f9-c4909136a8c5"], entityOf_: {space: "${spaceAddress}"}}`,
          id: ID.createValueId(),
        },
      };

      const parentEntityPostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        entityId: spacePageTableBlockEntityId,
        entityName: 'Posts',
        attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
        attributeName: 'Parent Entity',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: username ?? '',
          id: postsPageEntityId,
        },
      };

      const namePostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'name',
        attributeName: 'Name',
        entityId: postsPageTableBlockEntityId,
        entityName: 'Posts',
        space: spaceAddress,
        value: {
          type: 'string',
          value: 'Posts',
          id: ID.createValueId(),
        },
      };

      const typesPostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'type',
        attributeName: 'Types',
        entityId: spacePageTableBlockEntityId,
        entityName: 'Posts',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Table Block',
          id: '88d59252-17ae-4d9a-a367-24710129eb47',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(rowTypePostsPageTableBlockTriple),
        ...rowTypePostsPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(filterPostsPageTableBlockTriple),
        ...filterPostsPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(parentEntityPostsPageTableBlockTriple),
        ...parentEntityPostsPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(namePostsPageTableBlockTriple),
        ...namePostsPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typesPostsPageTableBlockTriple),
        ...typesPostsPageTableBlockTriple,
      });

      // Add posts page blocks
      const postsPageBlocksTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'beaba5cb-a677-41a8-b353-77030613fc70',
        attributeName: 'Blocks',
        entityId: postsPageEntityId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'string',
          value: `["${postsPageTableBlockEntityId}"]`,
          id: ID.createValueId(),
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(postsPageBlocksTriple),
        ...postsPageBlocksTriple,
      });

      // Add finances page
      const financesPageEntityId = ID.createEntityId();

      const nameFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'name',
        attributeName: 'Name',
        entityId: financesPageEntityId,
        entityName: 'Finances',
        space: spaceAddress,
        value: {
          type: 'string',
          value: 'Finances',
          id: ID.createValueId(),
        },
      };

      const typesFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'type',
        attributeName: 'Types',
        entityId: financesPageEntityId,
        entityName: 'Finances',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Page',
          id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(nameFinancesPageTriple),
        ...nameFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typesFinancesPageTriple),
        ...typesFinancesPageTriple,
      });

      // Add finances page table block
      const financesPageTableBlockEntityId = ID.createEntityId();

      const shownColumnsOtherRevenueSourcesFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
        attributeName: 'Shown Columns',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          id: '0b623cb1-ba1d-407a-b9cc-58becb52b531',
          name: 'Other revenue sources',
        },
      };

      const shownColumnsNonFinancialAssetsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
        attributeName: 'Shown Columns',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          id: '15645106-d203-4db1-8692-012a6e06349f',
          name: 'Non-financial assets',
        },
      };

      const shownColumnsConstructionCostsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
        attributeName: 'Shown Columns',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          id: '5572bb78-1e9b-4752-8333-72e7c2c90c8b',
          name: 'Construction costs',
        },
      };

      const shownColumnsOtherExpensesFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
        attributeName: 'Shown Columns',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          id: '6c90a975-5da7-4f5a-9401-514d30dd9926',
          name: 'Other expenses',
        },
      };

      const shownColumnsGrantsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
        attributeName: 'Shown Columns',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          id: '73984ff3-11e6-4b42-bd09-07f34d4be0e2',
          name: 'Grants',
        },
      };

      const shownColumnsProgramServicesFeesFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
        attributeName: 'Shown Columns',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          id: '8a573366-1d86-48b6-b861-c48aad11486f',
          name: 'Program services fees',
        },
      };

      const shownColumnsContributionsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
        attributeName: 'Shown Columns',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          id: '9e94fc0c-2f6e-4fd6-894b-eef6bfe64d49',
          name: 'Contributions',
        },
      };

      const shownColumnsSalariesAndBenefitsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
        attributeName: 'Shown Columns',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          id: 'bc6d8191-1626-42b2-a8fc-6d639535306c',
          name: 'Salaries + Benefits',
        },
      };

      const shownColumnsTotalRevenueFinancesPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
        attributeName: 'Shown Columns',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          id: 'e769b6ac-2387-4b37-919b-9cab193868fd',
          name: 'Total revenue',
        },
      };

      const rowTypeFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '577bd9fb-b29e-4e2b-b5f8-f48aedbd26ac',
        attributeName: 'Row Type',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Finance Summary',
          id: 'ce59ccc1-2ac5-4ace-8f82-09322434733d',
        },
      };

      const filterFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'b0f2d71a-79ca-4dc4-9218-e3e40dfed103',
        attributeName: 'Filter',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'string',
          value: `{typeIds_contains_nocase: ["682fbeff-41e2-42cd-a7f9-c4909136a8c5"], entityOf_: {space: "${spaceAddress}"}}`,
          id: ID.createValueId(),
        },
      };

      const parentEntityFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        entityId: spacePageTableBlockEntityId,
        entityName: 'Finance Summaries',
        attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
        attributeName: 'Parent Entity',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Finances',
          id: financesPageEntityId,
        },
      };

      const nameFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'name',
        attributeName: 'Name',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'string',
          value: 'Finance Summary',
          id: ID.createValueId(),
        },
      };

      const typesFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'type',
        attributeName: 'Types',
        entityId: financesPageTableBlockEntityId,
        entityName: 'Finance Summaries',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Table Block',
          id: '88d59252-17ae-4d9a-a367-24710129eb47',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(shownColumnsOtherRevenueSourcesFinancesPageTriple),
        ...shownColumnsOtherRevenueSourcesFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(shownColumnsNonFinancialAssetsFinancesPageTriple),
        ...shownColumnsNonFinancialAssetsFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(shownColumnsConstructionCostsFinancesPageTriple),
        ...shownColumnsConstructionCostsFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(shownColumnsOtherExpensesFinancesPageTriple),
        ...shownColumnsOtherExpensesFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(shownColumnsGrantsFinancesPageTriple),
        ...shownColumnsGrantsFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(shownColumnsProgramServicesFeesFinancesPageTriple),
        ...shownColumnsProgramServicesFeesFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(shownColumnsContributionsFinancesPageTriple),
        ...shownColumnsContributionsFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(shownColumnsSalariesAndBenefitsFinancesPageTriple),
        ...shownColumnsSalariesAndBenefitsFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(shownColumnsTotalRevenueFinancesPageTriple),
        ...shownColumnsTotalRevenueFinancesPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(rowTypeFinancesPageTableBlockTriple),
        ...rowTypeFinancesPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(filterFinancesPageTableBlockTriple),
        ...filterFinancesPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(parentEntityFinancesPageTableBlockTriple),
        ...parentEntityFinancesPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(nameFinancesPageTableBlockTriple),
        ...nameFinancesPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typesFinancesPageTableBlockTriple),
        ...typesFinancesPageTableBlockTriple,
      });

      // Add finances page blocks
      const financesPageBlocksTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'beaba5cb-a677-41a8-b353-77030613fc70',
        attributeName: 'Blocks',
        entityId: financesPageEntityId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'string',
          value: `["${financesPageTableBlockEntityId}"]`,
          id: ID.createValueId(),
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(financesPageBlocksTriple),
        ...financesPageBlocksTriple,
      });

      // Add projects page
      const projectsPageEntityId = ID.createEntityId();

      const nameProjectsPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'name',
        attributeName: 'Name',
        entityId: projectsPageEntityId,
        entityName: 'Projects',
        space: spaceAddress,
        value: {
          type: 'string',
          value: 'Projects',
          id: ID.createValueId(),
        },
      };

      const typesProjectsPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'type',
        attributeName: 'Types',
        entityId: projectsPageEntityId,
        entityName: 'Projects',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Page',
          id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(nameProjectsPageTriple),
        ...nameProjectsPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typesProjectsPageTriple),
        ...typesProjectsPageTriple,
      });

      // Add projects page table block
      const projectsPageTableBlockEntityId = ID.createEntityId();

      const rowTypeProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: '577bd9fb-b29e-4e2b-b5f8-f48aedbd26ac',
        attributeName: 'Row Type',
        entityId: projectsPageTableBlockEntityId,
        entityName: 'Projects',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Project',
          id: '682fbeff-41e2-42cd-a7f9-c4909136a8c5',
        },
      };

      const filterProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'b0f2d71a-79ca-4dc4-9218-e3e40dfed103',
        attributeName: 'Filter',
        entityId: projectsPageTableBlockEntityId,
        entityName: 'Projects',
        space: spaceAddress,
        value: {
          type: 'string',
          value: `{typeIds_contains_nocase: ["682fbeff-41e2-42cd-a7f9-c4909136a8c5"], entityOf_: {space: "${spaceAddress}"}}`,
          id: ID.createValueId(),
        },
      };

      const parentEntityProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        entityId: projectsPageTableBlockEntityId,
        entityName: 'Projects',
        attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
        attributeName: 'Parent Entity',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Projects',
          id: projectsPageEntityId,
        },
      };

      const nameProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'name',
        attributeName: 'Name',
        entityId: projectsPageTableBlockEntityId,
        entityName: 'Projects',
        space: spaceAddress,
        value: {
          type: 'string',
          value: 'Projects',
          id: ID.createValueId(),
        },
      };

      const typesProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'type',
        attributeName: 'Types',
        entityId: spacePageTableBlockEntityId,
        entityName: 'Projects',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Table Block',
          id: '88d59252-17ae-4d9a-a367-24710129eb47',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(rowTypeProjectsPageTableBlockTriple),
        ...rowTypeProjectsPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(filterProjectsPageTableBlockTriple),
        ...filterProjectsPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(parentEntityProjectsPageTableBlockTriple),
        ...parentEntityProjectsPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(nameProjectsPageTableBlockTriple),
        ...nameProjectsPageTableBlockTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typesProjectsPageTableBlockTriple),
        ...typesProjectsPageTableBlockTriple,
      });

      // Add projects page blocks
      const projectsPageBlocksTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'beaba5cb-a677-41a8-b353-77030613fc70',
        attributeName: 'Blocks',
        entityId: projectsPageEntityId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'string',
          value: `["${projectsPageTableBlockEntityId}"]`,
          id: ID.createValueId(),
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(projectsPageBlocksTriple),
        ...projectsPageBlocksTriple,
      });

      // Add about us page
      const aboutUsPageEntityId = ID.createEntityId();

      const nameAboutUsPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'name',
        attributeName: 'Name',
        entityId: aboutUsPageEntityId,
        entityName: 'About Us',
        space: spaceAddress,
        value: {
          type: 'string',
          value: 'About Us',
          id: ID.createValueId(),
        },
      };

      const typesAboutUsPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'type',
        attributeName: 'Types',
        entityId: aboutUsPageEntityId,
        entityName: 'About Us',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Page',
          id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(nameAboutUsPageTriple),
        ...nameAboutUsPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typesAboutUsPageTriple),
        ...typesAboutUsPageTriple,
      });

      // Add get involved page
      const getInvolvedPageEntityId = ID.createEntityId();

      const nameGetInvolvedPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'name',
        attributeName: 'Name',
        entityId: getInvolvedPageEntityId,
        entityName: 'Get Involved',
        space: spaceAddress,
        value: {
          type: 'string',
          value: 'Get Involved',
          id: ID.createValueId(),
        },
      };

      const typesGetInvolvedPageTriple: OmitStrict<Triple, 'id'> = {
        attributeId: 'type',
        attributeName: 'Types',
        entityId: getInvolvedPageEntityId,
        entityName: 'Get Involved',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Page',
          id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(nameGetInvolvedPageTriple),
        ...nameGetInvolvedPageTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typesGetInvolvedPageTriple),
        ...typesGetInvolvedPageTriple,
      });

      slog({
        requestId,
        message: `Adding profile to space ${spaceAddress}`,
        account: userAccount,
      });

      const proposalEffect = await makeProposalServer({
        actions,
        name: `Creating profile for ${userAccount}`,
        space: spaceAddress,
        storageClient: new StorageClient(Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).ipfs),
        account,
        wallet: client,
        publicClient,
      });

      await Effect.runPromise(proposalEffect);

      slog({
        requestId,
        message: `Successfully added profile to space ${spaceAddress}`,
        account: userAccount,
      });
    },
    catch: error => {
      slog({
        level: 'error',
        requestId,
        message: `Creating Geo entity Profile in space address ${spaceAddress} failed: ${(error as Error).message}`,
        account: userAccount,
      });
      return new CreateProfileGeoEntityFailedError();
    },
  });

  // Grant each role to the new user
  const createGrantRoleEffect = (role: Role) => {
    return Effect.tryPromise({
      try: async () => {
        const simulateGrantRoleResult = await publicClient.simulateContract({
          abi: SpaceArtifact.abi,
          address: spaceAddress as `0x${string}`,
          functionName: 'grantRole',
          account,
          args: [role.binary, userAccount],
        });

        const grantRoleSimulateHash = await client.writeContract(simulateGrantRoleResult.request);
        slog({
          requestId,
          message: `Grant ${role.role} role hash: ${grantRoleSimulateHash}`,
          account: userAccount,
        });

        const grantRoleTxHash = await publicClient.waitForTransactionReceipt({
          hash: grantRoleSimulateHash,
        });
        slog({
          requestId,
          message: `Granted ${role.role} role for ${spaceAddress}: ${grantRoleTxHash.transactionHash}`,
          account: userAccount,
        });

        return grantRoleSimulateHash;
      },
      catch: error => {
        slog({
          level: 'error',
          requestId,
          message: `Granting ${role.role} role failed: ${(error as Error).message}`,
          account: userAccount,
        });
        return new GrantRoleError();
      },
    });
  };

  // Renounce each role from the deployer
  const createRenounceRoleEffect = (role: Role) => {
    return Effect.tryPromise({
      try: async () => {
        const simulateRenounceRoleResult = await publicClient.simulateContract({
          abi: SpaceArtifact.abi,
          address: spaceAddress as `0x${string}`,
          functionName: 'renounceRole',
          account,
          args: [role.binary, account.address],
        });

        const grantRoleSimulateHash = await client.writeContract(simulateRenounceRoleResult.request);
        slog({
          requestId,
          message: `Renounce ${role.role} role hash: ${grantRoleSimulateHash}`,
          account: userAccount,
        });

        const renounceRoleTxResult = await publicClient.waitForTransactionReceipt({
          hash: grantRoleSimulateHash,
        });
        slog({
          requestId,
          message: `Renounced ${role.role} role for Geo deployer ${spaceAddress}: ${renounceRoleTxResult.transactionHash}`,
          account: userAccount,
        });

        return renounceRoleTxResult;
      },
      catch: error => {
        slog({
          level: 'error',
          requestId,
          message: `Renouncing ${role.role} role failed: ${(error as Error).message}`,
          account: userAccount,
        });
        return new RenounceRoleError();
      },
    });
  };

  const onboardEffect = Effect.gen(function* (unwrap) {
    // Add geo profile entity to new space
    yield* unwrap(Effect.retry(profileEffect, Schedule.exponential('100 millis').pipe(Schedule.jittered)));

    // @TODO: Batch?
    // Configure roles in proxy contract
    for (const role of ROLES) {
      const grantRoleEffect = createGrantRoleEffect(role);
      yield* unwrap(Effect.retry(grantRoleEffect, Schedule.exponential('100 millis').pipe(Schedule.jittered)));
    }

    // @TODO Batch?
    // Renounce deployer roles in proxy contract
    for (const role of ROLES) {
      const renounceRoleEffect = createRenounceRoleEffect(role);
      yield* unwrap(Effect.retry(renounceRoleEffect, Schedule.exponential('100 millis').pipe(Schedule.jittered)));
    }
  });

  return onboardEffect;
}
