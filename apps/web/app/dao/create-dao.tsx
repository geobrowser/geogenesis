'use client';

import { Client, CreateDaoParams, DaoCreationSteps, DaoMetadata } from '@aragon/sdk-client';
import { GasFeeEstimation } from '@aragon/sdk-client-common';

import { GeoPluginClient } from '~/core/io/governance-space-plugin';
import { GeoPluginClientEncoding } from '~/core/io/governance-space-plugin/internal';
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

    if (!geoPluginClient) throw new Error('geoPluginClient is undefined');

    // const geoMemberAccessPluginInstallItem = GeoPluginClient.encoding.getMemberAccessPluginInstallItem('');

    const members: string[] = ['0x25709998B542f1Be27D19Fa0B3A9A67302bc1b94'];

    const memberAccessPluginInstallParams = {
      votingSettings: {
        minApprovals: 1,
        onlyListed: true,
      },
      members,
    };

    const geoMemberAccessPluginInstallItem = GeoPluginClientEncoding.getMemberAccessPluginInstallItem(
      memberAccessPluginInstallParams
    );

    const createParams: CreateDaoParams = {
      metadataUri,
      ensSubdomain: 'test-hack-the-planet-mumbai-1',
      plugins: [geoMemberAccessPluginInstallItem],
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
