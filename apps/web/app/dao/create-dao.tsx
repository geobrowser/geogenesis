'use client';

import { Client, CreateDaoParams, DaoCreationSteps, DaoMetadata, VotingMode } from '@aragon/sdk-client';
import { GasFeeEstimation } from '@aragon/sdk-client-common';
import { getAddress } from 'viem';

import { useWalletClient } from 'wagmi';

import { ZERO_ADDRESS } from '~/core/constants';
import { Environment } from '~/core/environment';
import { GeoPluginClientEncoding } from '~/core/io/governance-space-plugin/internal';
import { GeoPersonalSpacePluginClientEncoding } from '~/core/io/personal-space-plugin/internal';
import { StorageClient } from '~/core/io/storage/storage';
import { useAragonSDKContext } from '~/core/state/aragon-dao-store';
import { getImageHash } from '~/core/utils/utils';

import { Button } from '~/design-system/button';

// this route is only for testing creating a DAO on the frontend
export default function CreateDao() {
  const { geoPluginContext } = useAragonSDKContext();
  const { data: wallet } = useWalletClient();

  console.log('context', { geoPluginContext });

  if (!geoPluginContext) throw new Error('geoPluginContext is undefined');
  const client: Client = new Client(geoPluginContext);

  const handleCreateDao = async () => {
    const metadata: DaoMetadata = {
      name: 'Governance testing',
      description: 'A personal test DAO for Hack the Planet',
      avatar:
        'https://legendary-digital-network-assets.s3.amazonaws.com/wp-content/uploads/2020/09/13021324/Hackers-cast-Featured.jpg',
      links: [
        {
          name: 'Hackers (film) - Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Hackers_(film)',
        },
      ],
    };

    if (!wallet) return;
    // const metadataUri = await client.methods.pinMetadata(metadata); // test Metadata -- change Metadata or DAO settings to summon another test DAO

    // const metadataUri = await new StorageClient(
    //   Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).ipfs
    // ).uploadObject(metadata);

    console.log('context', geoPluginContext);

    const spacePluginInstallItem = await GeoPluginClientEncoding.getSpacePluginInstallItem({
      firstBlockContentUri: 'ipfs://QmVnJgMByupANQ544rmPqNgr5vNqaYvCLDML4nZowfHMrt',
      // @HACK: Using a different upgrader from the governance plugin to work around
      // a limitation in Aragon.
      pluginUpgrader: getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
      precedessorSpace: getAddress('0xd93A5fCf65b520BA24364682aCcf50dd2F9aC18B'), // Agriculture
    });

    const governancePluginConfig: Parameters<typeof GeoPluginClientEncoding.getGovernancePluginInstallItem>[0] = {
      votingSettings: {
        votingMode: 0, // example value
        supportThreshold: 1, // example value
        minParticipation: 1, // example value
        minDuration: BigInt(60 * 60 * 24), // example value
        minProposerVotingPower: BigInt(1000), // example value
      },
      memberAccessProposalDuration: BigInt(60 * 60 * 24), // one day in seconds
      initialEditors: [getAddress(wallet.account.address)], // example values -- @TODO: change to user's wallet address
      pluginUpgrader: getAddress('0x66703c058795B9Cb215fbcc7c6b07aee7D216F24'), // @TODO: Use deployer wallet
    };

    const governancePluginInstallItem =
      await GeoPluginClientEncoding.getGovernancePluginInstallItem(governancePluginConfig);

    const createParams: CreateDaoParams = {
      metadataUri: 'ipfs://QmVnJgMByupANQ544rmPqNgr5vNqaYvCLDML4nZowfHMrt',
      ensSubdomain: '',
      daoUri: 'https://geobrowser.io',
      plugins: [governancePluginInstallItem, spacePluginInstallItem],
    };

    console.log('encoded installation params', {
      governancePluginInstallItem,
      spacePluginInstallItem,
    });

    // const estimatedGas: GasFeeEstimation = await client.estimation.createDao(createParams);
    // console.log('estimation', estimatedGas);
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