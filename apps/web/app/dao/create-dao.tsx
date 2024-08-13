'use client';

import { Client, Context, CreateDaoParams, DaoCreationSteps } from '@aragon/sdk-client';
import { SYSTEM_IDS } from '@geogenesis/sdk';
import { VotingMode, createGeoId } from '@geogenesis/sdk';
import { createEditProposal } from '@geogenesis/sdk/proto';
import { getAddress, hexToBytes } from 'viem';

import { useAragon } from '~/core/hooks/use-aragon';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { IpfsEffectClient } from '~/core/io/ipfs-client';

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

    const initialContent = createEditProposal({
      name: '1.0.3: Governance v3 test space',
      author: getAddress(smartAccount.account.address),
      ops: [
        {
          type: 'SET_TRIPLE',
          triple: {
            entity: entityId,
            attribute: SYSTEM_IDS.NAME,
            value: {
              type: 'TEXT',
              value: 'Governance v3 test space',
            },
          },
        },
        {
          type: 'SET_TRIPLE',
          triple: {
            entity: entityId,
            attribute: SYSTEM_IDS.TYPES,
            value: {
              type: 'ENTITY',
              value: SYSTEM_IDS.SPACE_CONFIGURATION,
            },
          },
        },
      ],
    });

    const firstBlockContentUri = await IpfsEffectClient.upload(initialContent);

    const spacePluginInstallItem = getSpacePluginInstallItem({
      // firstBlockContentUri: `ipfs://bafkreihi2yp3mg3ww3dbxprsblkr7zst2gztxwym44ewlkqmfwiva6uxii`, // Root
      firstBlockContentUri: `ipfs://bafkreiciryzjzov2py2gys3httqxxxoin2dhqfsy2s4ui3cc3mbvgo3mwe`, // Construction
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
        initialEditors: [getAddress(smartAccount.account.address)],
        pluginUpgrader: getAddress(smartAccount.account.address),
      };

      const governancePluginInstallItem = getGovernancePluginInstallItem(governancePluginConfig);

      const createParams: CreateDaoParams = {
        metadataUri: 'ipfs://QmVnJgMByupANQ544rmPqNgr5vNqaYvCLDML4nZowfHMrt',
        plugins: [
          {
            id: governancePluginInstallItem.id,
            data: hexToBytes(governancePluginInstallItem.data),
          },
          {
            id: spacePluginInstallItem.id,
            data: hexToBytes(spacePluginInstallItem.data),
          },
        ],
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
        plugins: [
          {
            id: personalSpacePluginItem.id,
            data: hexToBytes(personalSpacePluginItem.data),
          },
          {
            id: spacePluginInstallItem.id,
            data: hexToBytes(spacePluginInstallItem.data),
          },
        ],
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
