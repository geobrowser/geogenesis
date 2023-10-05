'use client';

import {
  AddresslistVotingClient,
  AddresslistVotingPluginInstall,
  Client,
  CreateDaoParams,
  DaoCreationSteps,
  DaoMetadata,
  VotingMode,
} from '@aragon/sdk-client';
import { GasFeeEstimation } from '@aragon/sdk-client-common';

import { useAragonSDKContext } from '~/core/state/aragon-dao-store';

import { Button } from '~/design-system/button';

// import { useAragonSDKContext } from '../context/aragon-context';

export default function CreateDao() {
  const { geoPluginClient, geoPluginContext } = useAragonSDKContext();

  if (!geoPluginContext) throw new Error('geoPluginContext is undefined');
  const client: Client = new Client(geoPluginContext);

  const handleCreateDao = async () => {
    const metadata: DaoMetadata = {
      name: 'Hack the Planet Test DAO',
      description: 'A test DAO for Hack the Planet',
      avatar:
        'https://legendary-digital-network-assets.s3.amazonaws.com/wp-content/uploads/2020/09/13021324/Hackers-cast-Featured.jpg',
      links: [
        {
          name: 'Hackers (film) - Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Hackers_(film)',
        },
      ],
    };

    const metadataUri = await client.methods.pinMetadata(metadata);

    // const addresslistVotingPluginInstallParams: AddresslistVotingPluginInstall = {
    //   votingSettings: {
    //     minDuration: 60 * 60 * 24 * 2,
    //     minParticipation: 0.25,
    //     supportThreshold: 0.5,
    //   },
    //   addresses: ['0x25709998B542f1Be27D19Fa0B3A9A67302bc1b94', '0x04EA475026a0AB3e280F749b206fC6332E6939F1'],
    // };

    // const addresslistVotingPluginInstallItem = AddresslistVotingClient.encoding.getPluginInstallItem(
    //   addresslistVotingPluginInstallParams,
    //   'goerli'
    // );

    // const geoSpacePluginInstallItem = geoPluginClient.encoding.getSpacePluginInstallItem();

    if (!geoPluginClient) throw new Error('geoPluginClient is undefined');

    const geoSpacePluginInstallItem = geoPluginClient.encoding.getMainVotingPluginInstallItem({
      votingSettings: {
        minDuration: 60 * 60 * 24 * 2, // seconds
        minParticipation: 0.25, // 25%
        supportThreshold: 0.5, // 50%
        minProposerVotingPower: BigInt('5000'), // default 0
        votingMode: VotingMode.EARLY_EXECUTION,
      },
      addresses: ['0x25709998B542f1Be27D19Fa0B3A9A67302bc1b94'],
    });
    // const geoMemberAcccessPluginInstallItem = geoPluginClient.encoding.getMemberAccessPluginInstallItem();

    const createParams: CreateDaoParams = {
      metadataUri,
      ensSubdomain: 'test-hack-the-planet-mumbai-1',
      plugins: [geoSpacePluginInstallItem],
    };

    const estimatedGas: GasFeeEstimation = await client.estimation.createDao(createParams);
    console.log({ avg: estimatedGas.average, max: estimatedGas.max });

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
        console.error(err);
      }
    }
  };

  return (
    <div className="flex flex-col">
      <Button variant="primary" onClick={handleCreateDao}>
        Create DAO
      </Button>
    </div>
  );
}
