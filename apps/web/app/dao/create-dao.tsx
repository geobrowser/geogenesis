'use client';

import { Client, CreateDaoParams, DaoCreationSteps, DaoMetadata } from '@aragon/sdk-client';

import { useWalletClient } from 'wagmi';

import { useAragonSDKContext } from '~/core/state/aragon-dao-store';

import { Button } from '~/design-system/button';

export default function CreateDao() {
  const { geoPluginClient, geoPluginContext } = useAragonSDKContext();
  console.log('context', geoPluginContext);
  console.log('client', geoPluginClient);
  const { data: wallet } = useWalletClient();

  if (!geoPluginContext) throw new Error('geoPluginContext is undefined');
  const client: Client = new Client(geoPluginContext);

  // const handleCreateDao = async () => {
  //   const metadata: DaoMetadata = {
  //     name: 'Hack the Planet Test DAO',
  //     description: 'A test DAO for Hack the Planet',
  //     avatar:
  //       'https://legendary-digital-network-assets.s3.amazonaws.com/wp-content/uploads/2020/09/13021324/Hackers-cast-Featured.jpg',
  //     links: [
  //       {
  //         name: 'Hackers (film) - Wikipedia',
  //         url: 'https://en.wikipedia.org/wiki/Hackers_(film)',
  //       },
  //     ],
  //   };

  //   const metadataUri = await client.methods.pinMetadata(metadata);
  // };

  // if (!geoPluginClient) throw new Error('geoPluginClient is undefined');

  if (!wallet) return;

  const handleInitialize = async () => {
    console.log('initializing');
    if (!geoPluginClient) throw new Error('geoPluginClient is undefined');
    console.log('wallet', wallet);
    const initializeSpacePlugin = await geoPluginClient.methods.initializeMainVotingPlugin({
      wallet: wallet,
      daoAddress: '0xfba9cef0159fcaf31ee29edafcf8a6e8567da80b',
      votingSettings: {
        votingMode: 1,
        supportThreshold: 1,
        minParticipation: 1,
        minProposerVotingPower: BigInt(0),
        minDuration: BigInt(86400),
      },
      initialEditors: ['0x04EA475026a0AB3e280F749b206fC6332E6939F1'],
    });
    return initializeSpacePlugin;
  };

  //   const geoMainVotingPluginInstallItem = GeoPluginClientEncoding.getMainVotingPluginInstallItem({
  //     votingSettings: {
  //       votingMode: 1, // example value
  //       supportThreshold: 50, // example value
  //       minParticipation: 10, // example value
  //       minDuration: 86400, // example value
  //       minProposerVotingPower: 1000, // example value
  //     },
  //     initialEditors: ['0x25709998B542f1Be27D19Fa0B3A9A67302bc1b94'], // example values
  //     pluginUpgrader: '0x25709998B542f1Be27D19Fa0B3A9A67302bc1b94',
  //   });

  //   const geoMemberAccessPluginInstallItem = GeoPluginClientEncoding.getMemberAccessPluginInstallItem({
  //     multisigSettings: {
  //       proposalDuration: 12345, // example value
  //       mainVotingPlugin: DEFAULT_GEO_MAIN_VOTING_PLUGIN_REPO_ADDRESS,
  //     },
  //     pluginUpgrader: '0x25709998B542f1Be27D19Fa0B3A9A67302bc1b94',
  //   });

  //   const createParams: CreateDaoParams = {
  //     metadataUri,
  //     ensSubdomain: 'test-hack-the-planet-mumbai-1',
  //     // plugins: [geoMainVotingPluginInstallItem, geoMemberAccessPluginInstallItem],
  //     plugins: [geoMainVotingPluginInstallItem],
  //   };

  //   const estimatedGas: GasFeeEstimation = await client.estimation.createDao(createParams);
  //   console.log({ avg: estimatedGas.average, max: estimatedGas.max });

  //   const steps = client.methods.createDao(createParams);

  //   for await (const step of steps) {
  //     try {
  //       switch (step.key) {
  //         case DaoCreationSteps.CREATING:
  //           console.log({ txHash: step.txHash });
  //           break;
  //         case DaoCreationSteps.DONE:
  //           console.log({
  //             daoAddress: step.address,
  //             pluginAddresses: step.pluginAddresses,
  //           });
  //           break;
  //       }
  //     } catch (err) {
  //       console.error(err);
  //     }
  //   }
  // };

  return (
    <div className="flex flex-col">
      <Button variant="primary" onClick={handleInitialize}>
        Create DAO
      </Button>
    </div>
  );
}
