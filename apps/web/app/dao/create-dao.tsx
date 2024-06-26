'use client';

import { Client, Context, CreateDaoParams, DaoCreationSteps } from '@aragon/sdk-client';
import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Op, VotingMode, createGeoId } from '@geogenesis/sdk';
import { GovernanceSetupAbi, MainVotingAbi } from '@geogenesis/sdk/abis';
import { createEditProposal } from '@geogenesis/sdk/proto';
import { decodeErrorResult, getAddress } from 'viem';

import { useWalletClient } from 'wagmi';

import { Environment } from '~/core/environment';
import { useAragon } from '~/core/hooks/use-aragon';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { StorageClient } from '~/core/io/storage/storage';

import { Button } from '~/design-system/button';

import {
  getGovernancePluginInstallItem,
  getPersonalSpaceGovernancePluginInstallItem,
  getSpacePluginInstallItem,
} from './encodings';

interface Prtypes {
  type: 'personal' | 'governance';
}

// this route is only for testing creating a DAO on the frontend
export function CreateDao({ type }: Prtypes) {
  const sdkContextParams = useAragon();
  const smartAccount = useSmartAccount();

  if (!sdkContextParams) throw new Error('getypeluginContext is undefined');
  const client: Client = new Client(new Context(sdkContextParams));

  const handleCreateDao = async () => {
    if (!smartAccount) return;

    const entityId = createGeoId();
    const collectionId = createGeoId();
    const collectionItemId = createGeoId();
    const entityA = createGeoId();

    const initialContent = createEditProposal(
      {
        name: '1.0.3: Governance v3 test space',
        author: getAddress(smartAccount.account.address),
        ops: [
          {
            type: 'SET_TRIPLE',
            payload: {
              entityId,
              attributeId: SYSTEM_IDS.NAME,
              value: {
                type: 'TEXT',
                value: 'Governance v3 test space',
              },
            },
          },
          {
            type: 'SET_TRIPLE',
            payload: {
              entityId,
              attributeId: SYSTEM_IDS.TYPES,
              value: {
                type: 'ENTITY',
                value: SYSTEM_IDS.SPACE_CONFIGURATION,
              },
            },
          },
          ...types,
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

    const storage = new StorageClient(Environment.getConfig().ipfs);
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
          duration: BigInt(60 * 60 * 1), // 1 hour seems to be the minimum we can do
        },
        memberAccessProposalDuration: BigInt(60 * 60 * 1), // one hour in seconds
        initialEditors: [
          getAddress(smartAccount.account.address),
          // getAddress('0x35483105944CD199BD336D6CEf476ea20547a9b5'),
          // getAddress('0xE343E47d821a9bcE54F12237426A6ef391066b60'),
          // getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
        ],
        pluginUpgrader: getAddress(smartAccount.account.address),
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
        initialEditor: getAddress(smartAccount.account.address),
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
