'use client';

import { Client, Context, CreateDaoParams, DaoCreationSteps } from '@aragon/sdk-client';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { VotingMode, createContentProposal, createEditProposal, createGeoId } from '@geogenesis/sdk';
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
        name: 'Proposal for space with binary-based edits proposal',
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
