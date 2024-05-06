'use client';

import { Client, Context, CreateDaoParams, DaoCreationSteps } from '@aragon/sdk-client';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { VotingMode, createContentProposal, createGeoId } from '@geogenesis/sdk';
import { getAddress } from 'viem';

import { useWalletClient } from 'wagmi';

import { Environment } from '~/core/environment';
import { useAragon } from '~/core/hooks/use-aragon';
import { StorageClient } from '~/core/io/storage/storage';

import { Button } from '~/design-system/button';

import { getGovernancePluginInstallItem, getSpacePluginInstallItem } from './encodings';

// this route is only for testing creating a DAO on the frontend
export function CreateDao() {
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

    const initialContent = createContentProposal('Initial proposal for space', [
      {
        entityId: entityA,
        attributeId: SYSTEM_IDS.NAME,
        type: 'createTriple',
        value: {
          type: 'string',
          id: createGeoId(),
          value: 'Entity A is in a Collection',
        },
      },
      {
        entityId,
        attributeId: SYSTEM_IDS.NAME,
        type: 'createTriple',
        value: {
          type: 'string',
          id: createGeoId(),
          value: 'Collections test space',
        },
      },
      {
        entityId,
        attributeId: SYSTEM_IDS.TYPES,
        type: 'createTriple',
        value: {
          type: 'entity',
          id: SYSTEM_IDS.SPACE_CONFIGURATION,
        },
      },
      {
        entityId: collectionId,
        type: 'createTriple',
        attributeId: SYSTEM_IDS.TYPES,
        value: {
          type: 'entity',
          id: SYSTEM_IDS.COLLECTION_TYPE,
        },
      },
      {
        entityId: collectionItemId,
        attributeId: SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE,
        type: 'createTriple',
        value: {
          type: 'entity',
          id: collectionId,
        },
      },
      {
        attributeId: SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE,
        entityId: collectionItemId,
        type: 'createTriple',
        value: {
          type: 'entity',
          id: entityA,
        },
      },
      {
        attributeId: 'types',
        entityId: collectionItemId,
        type: 'createTriple',
        value: {
          type: 'entity',
          id: SYSTEM_IDS.COLLECTION_ITEM_TYPE,
        },
      },
      {
        attributeId: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
        entityId: collectionItemId,
        type: 'createTriple',
        value: {
          type: 'string',
          id: createGeoId(),
          value: 'a0',
        },
      },
    ]);

    const storage = new StorageClient(Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).ipfs);
    const firstBlockContentUri = await storage.uploadObject(initialContent);

    const spacePluginInstallItem = getSpacePluginInstallItem({
      firstBlockContentUri: `ipfs://${firstBlockContentUri}`,
      // @HACK: Using a different upgrader from the governance plugin to work around
      // a limitation in Aragon.
      pluginUpgrader: getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
      precedessorSpace: getAddress('0xd93A5fCf65b520BA24364682aCcf50dd2F9aC18B'), // Agriculture
    });

    // const RATIO_BASE = ethers.BigNumber.from(10).pow(6); // 100% => 10**6
    // const pctToRatio = (x: number) => RATIO_BASE.mul(x).div(100);

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
  };

  return (
    <Button variant="primary" onClick={handleCreateDao}>
      Create DAO
    </Button>
  );
}
