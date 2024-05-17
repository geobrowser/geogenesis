'use client';

import { Client, Context, CreateDaoParams, DaoCreationSteps } from '@aragon/sdk-client';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { Op, VotingMode, createEditProposal, createGeoId } from '@geogenesis/sdk';
import { getAddress } from 'viem';

import { useWalletClient } from 'wagmi';

import { Environment } from '~/core/environment';
import { useAragon } from '~/core/hooks/use-aragon';
import { StorageClient } from '~/core/io/storage/storage';

import { Button } from '~/design-system/button';

import {
  getGovernancePluginInstallItem,
  getPersonalSpaceGovernancePluginInstallItem,
  getSpacePluginInstallItem,
} from './encodings';

interface Props {
  type: 'personal' | 'governance';
}

const ops: Op[] = [
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: '30314f95b10d4d08972552306de3b677',
      attributeId: 'c1f4cb6fece44c3ca447ab005b756972',
      value: { type: 'ENTITY', value: 'e9b2ca5149f743b7ab1e57f5a65d8009' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: 'f1b9fd886388436e95b551aafaea77e5',
      attributeId: '8f151ba4de204e3c9cb499ddf96f48f1',
      value: { type: 'ENTITY', value: '1d5d0c2adb23466ca0b09abe879df457' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: 'f1b9fd886388436e95b551aafaea77e5',
      attributeId: 'beaba5cba67741a8b35377030613fc70',
      value: { type: 'COLLECTION', value: '7e3178e1e50f4c5ebc783889377a2309' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: 'f1b9fd886388436e95b551aafaea77e5',
      attributeId: '34f535072e6b42c5a84443981a77cfa2',
      value: { type: 'ENTITY', value: '43f688823e3f4fff82d15f2ebafab79e' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: '7e3178e1e50f4c5ebc783889377a2309',
      attributeId: '8f151ba4de204e3c9cb499ddf96f48f1',
      value: { type: 'ENTITY', value: 'c373a33052df47b3a6d2df552bda4b44' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: '30314f95b10d4d08972552306de3b677',
      attributeId: 'c43b537bcff742718822717fdf2c9c01',
      value: { type: 'ENTITY', value: '7e3178e1e50f4c5ebc783889377a2309' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: 'f1b9fd886388436e95b551aafaea77e5',
      attributeId: '9b1f76ff9711404c861e59dc3fa7d037',
      value: { type: 'TEXT', value: 'The Root space is the top level space for the canonical global graph.' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: 'f1b9fd886388436e95b551aafaea77e5',
      attributeId: 'a126ca530c8e48d5b88882c734c38935',
      value: { type: 'TEXT', value: 'Root' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: 'e9b2ca5149f743b7ab1e57f5a65d8009',
      attributeId: 'a126ca530c8e48d5b88882c734c38935',
      value: { type: 'TEXT', value: 'The Root space is th' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: 'e9b2ca5149f743b7ab1e57f5a65d8009',
      attributeId: 'dd4999b977f04c2ba02b5a26b233854e',
      value: { type: 'ENTITY', value: 'f1b9fd886388436e95b551aafaea77e5' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: 'e9b2ca5149f743b7ab1e57f5a65d8009',
      attributeId: 'f88047cebd8d4fbf83f658e84ee533e4',
      value: {
        type: 'TEXT',
        value:
          'The Root space is the top level space for the canonical global graph. Its subspaces are the top level spaces that people see on the home page. It also defines Types, Attributes, Goals, and Policies that are global in nature and can be used by other spaces.\n\n',
      },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: '30314f95b10d4d08972552306de3b677',
      attributeId: 'ede47e6930b044998ea4aafbda449609',
      value: { type: 'TEXT', value: 'a0' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: '43f688823e3f4fff82d15f2ebafab79e',
      attributeId: '8f151ba4de204e3c9cb499ddf96f48f1',
      value: { type: 'ENTITY', value: '11618d1215d749a181abf03447d72e86' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: '30314f95b10d4d08972552306de3b677',
      attributeId: '8f151ba4de204e3c9cb499ddf96f48f1',
      value: { type: 'ENTITY', value: 'c167ef23fb2a40449ed945123ce7d2a9' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: 'e9b2ca5149f743b7ab1e57f5a65d8009',
      attributeId: '8f151ba4de204e3c9cb499ddf96f48f1',
      value: { type: 'ENTITY', value: '8426caa143d647d4a6f100c7c1a9a320' },
    },
  },
  {
    op: 'SET_TRIPLE',
    payload: {
      entityId: '43f688823e3f4fff82d15f2ebafab79e',
      attributeId: '334b8ac01be14079b1707e11d0f9eb8d',
      value: {
        type: 'TEXT',
        value: 'https://api.thegraph.com/ipfs/api/v0/cat?arg=QmX8tHpruktURDhcZ7LyN3fL9dRpuwBdv3NzSjxAzDfeX8',
      },
    },
  },
];

// this route is only for testing creating a DAO on the frontend
export function CreateDao({ type }: Props) {
  const sdkContextParams = useAragon();
  const { data: wallet } = useWalletClient();

  if (!sdkContextParams) throw new Error('geoPluginContext is undefined');
  const client: Client = new Client(new Context(sdkContextParams));

  const handleCreateDao = async () => {
    if (!wallet) return;

    const entityId = createGeoId();
    const collectionId = createGeoId();
    const collectionItemId = createGeoId();
    const entityA = createGeoId();

    const initialContent = createEditProposal(
      {
        name: '1.0.1: Proposal for space with binary-based edits proposal',
        author: getAddress(wallet.account.address),
        ops: [
          {
            op: 'SET_TRIPLE',
            payload: {
              entityId,
              attributeId: SYSTEM_IDS.NAME,
              value: {
                type: 'TEXT',
                value: 'Binary encoding test space',
              },
            },
          },
          {
            op: 'SET_TRIPLE',
            payload: {
              entityId,
              attributeId: SYSTEM_IDS.TYPES,
              value: {
                type: 'ENTITY',
                value: SYSTEM_IDS.SPACE_CONFIGURATION,
              },
            },
          },
          ...ops,
        ],
      }

      // {
      //   entityId: entityA,
      //   attributeId: SYSTEM_IDS.NAME,
      //   type: 'createTriple',
      //   value: {
      //     type: 'string',
      //     id: createGeoId(),
      //     value: 'Entity A is in a Collection',
      //   },
      // },
      // },
      // {
      //   entityId: collectionId,
      //   type: 'createTriple',
      //   attributeId: SYSTEM_IDS.TYPES,
      //   value: {
      //     type: 'entity',
      //     id: SYSTEM_IDS.COLLECTION_TYPE,
      //   },
      // },
      // {
      //   entityId: collectionItemId,
      //   attributeId: SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE,
      //   type: 'createTriple',
      //   value: {
      //     type: 'entity',
      //     id: collectionId,
      //   },
      // },
      // {
      //   attributeId: SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE,
      //   entityId: collectionItemId,
      //   type: 'createTriple',
      //   value: {
      //     type: 'entity',
      //     id: entityA,
      //   },
      // },
      // {
      //   attributeId: 'types',
      //   entityId: collectionItemId,
      //   type: 'createTriple',
      //   value: {
      //     type: 'entity',
      //     id: SYSTEM_IDS.COLLECTION_ITEM_TYPE,
      //   },
      // },
      // {
      //   attributeId: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
      //   entityId: collectionItemId,
      //   type: 'createTriple',
      //   value: {
      //     type: 'string',
      //     id: createGeoId(),
      //     value: 'a0',
      //   },
      // },
    );

    const storage = new StorageClient(Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).ipfs);
    const firstBlockContentUri = await storage.uploadBinary(initialContent);

    const spacePluginInstallItem = getSpacePluginInstallItem({
      firstBlockContentUri: `ipfs://${firstBlockContentUri}`,
      // @HACK: Using a different upgrader from the governance plugin to work around
      // a limitation in Aragon.
      pluginUpgrader: getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
    });

    if (type === 'governance') {
      const governancePluginConfig: Parameters<typeof getGovernancePluginInstallItem>[0] = {
        votingSettings: {
          votingMode: VotingMode.Standard,
          supportThreshold: 50_000,
          minParticipation: 50_000,
          duration: BigInt(60 * 60 * 1), // 1 hour seems to be the minimum we can do
        },
        memberAccessProposalDuration: BigInt(60 * 60 * 1), // one hour in seconds
        initialEditors: [
          getAddress(wallet.account.address),
          getAddress('0xE343E47d821a9bcE54F12237426A6ef391066b60'),
          getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
        ],
        pluginUpgrader: getAddress('0x66703c058795B9Cb215fbcc7c6b07aee7D216F24'),
      };

      const governancePluginInstallItem = getGovernancePluginInstallItem(governancePluginConfig);

      const createParams: CreateDaoParams = {
        metadataUri: 'ipfs://QmVnJgMByupANQ544rmPqNgr5vNqaYvCLDML4nZowfHMrt',
        plugins: [governancePluginInstallItem, spacePluginInstallItem],
      };

      console.log('Creating DAO!', createParams);
      const steps = client.methods.createDao(createParams);

      for await (const step of steps) {
        try {
          switch (step.key) {
            case DaoCreationSteps.CREATING:
              console.log({ txHash: step.txHash });
              break;
            case DaoCreationSteps.DONE:
              console.log({
                daoAddress: step.address,
                pluginAddresses: step.pluginAddresses,
              });
              break;
          }
        } catch (err) {
          console.error('Failed creating DAO', err);
        }
      }
    }

    if (type === 'personal') {
      const personalSpacePluginItem = getPersonalSpaceGovernancePluginInstallItem({
        initialEditor: getAddress(wallet.account.address),
      });

      const createParams: CreateDaoParams = {
        metadataUri: 'ipfs://QmVnJgMByupANQ544rmPqNgr5vNqaYvCLDML4nZowfHMrt',
        plugins: [personalSpacePluginItem, spacePluginInstallItem],
      };

      const steps = client.methods.createDao(createParams);

      for await (const step of steps) {
        try {
          switch (step.key) {
            case DaoCreationSteps.CREATING:
              console.log({ txHash: step.txHash });
              break;
            case DaoCreationSteps.DONE:
              console.log({
                daoAddress: step.address,
                pluginAddresses: step.pluginAddresses,
              });
              break;
          }
        } catch (err) {
          console.error('Failed creating DAO', err);
        }
      }
    }
  };

  return (
    <Button variant="primary" onClick={handleCreateDao}>
      Create DAO
    </Button>
  );
}
