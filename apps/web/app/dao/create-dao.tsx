'use client';

import { Client, Context, CreateDaoParams, DaoCreationSteps } from '@aragon/sdk-client';
import { VotingMode } from '@geogenesis/sdk';
import { getAddress } from 'viem';

import { useWalletClient } from 'wagmi';

import { useAragonSDKContext } from '~/core/state/aragon-dao-store';

import { Button } from '~/design-system/button';

import { getGovernancePluginInstallItem, getSpacePluginInstallItem } from './encodings';

// this route is only for testing creating a DAO on the frontend
export function CreateDao() {
  const { sdkContextParams } = useAragonSDKContext();
  const { data: wallet } = useWalletClient();

  if (!sdkContextParams) throw new Error('geoPluginContext is undefined');
  const client: Client = new Client(new Context(sdkContextParams));

  const handleCreateDao = async () => {
    if (!wallet) return;

    const spacePluginInstallItem = getSpacePluginInstallItem({
      firstBlockContentUri: 'ipfs://QmVnJgMByupANQ544rmPqNgr5vNqaYvCLDML4nZowfHMrt',
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
        supportThreshold: 1, // example value
        minParticipation: 1, // example value
        // duration: BigInt(60 * 60 * 24), // 1 day in seconds
        duration: BigInt(60 * 60 * 1), // 1 hour seems to be the minimum we can do
      },
      memberAccessProposalDuration: BigInt(60 * 60 * 1), // one hour in seconds
      initialEditors: [
        getAddress(wallet.account.address),
        getAddress('0xE343E47d821a9bcE54F12237426A6ef391066b60'),
        getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
      ], // @TODO: change to user's wallet address
      pluginUpgrader: getAddress('0x66703c058795B9Cb215fbcc7c6b07aee7D216F24'), // @TODO: Use deployer wallet
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
