'use client';

import { Client, CreateDaoParams, DaoCreationSteps, DaoMetadata } from '@aragon/sdk-client';
import { GasFeeEstimation } from '@aragon/sdk-client-common';

import { useWalletClient } from 'wagmi';

import { GEO_MEMBER_ACCESS_PLUGIN_REPO_ADDRESS } from '~/core/constants';
import { GeoPluginClientEncoding } from '~/core/io/governance-space-plugin/internal';
import { GeoPersonalSpacePluginClientEncoding } from '~/core/io/personal-space-plugin/internal';
import { useAragonSDKContext } from '~/core/state/aragon-dao-store';

import { Button } from '~/design-system/button';

// this route is only for testing creating a DAO on the frontend
export default function CreateDao() {
  const { geoPluginClient, geoPluginContext } = useAragonSDKContext();
  const { data: wallet } = useWalletClient();

  if (!geoPluginContext) throw new Error('geoPluginContext is undefined');
  const client: Client = new Client(geoPluginContext);

  const handleCreateDao = async () => {
    const metadata: DaoMetadata = {
      name: 'Hack the Planet Test Personal DAO',
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

    const metadataUri = await client.methods.pinMetadata(metadata); // test Metadata -- change Metadata or DAO settings to summon another test DAO

    if (!geoPluginClient) throw new Error('geoPluginClient is undefined');

    if (!wallet) return;

    const geoMainVotingPluginInstallItem = GeoPluginClientEncoding.getMainVotingPluginInstallItem({
      votingSettings: {
        votingMode: 1, // example value
        supportThreshold: 50, // example value
        minParticipation: 10, // example value
        minDuration: 86400, // example value
        minProposerVotingPower: 1000, // example value
      },
      initialEditors: [wallet?.account.address], // example values -- change to wallet address or whatever else
      pluginUpgrader: wallet?.account.address, // not sure what the best practice is here per Aragon
    });

    // @TODO: Check how the mainVotingPlugin address is used in the CreateDAO factory method
    const geoMemberAccessPluginInstallItem = GeoPluginClientEncoding.getMemberAccessPluginInstallItem({
      multisigSettings: {
        proposalDuration: 12345, // example value
        mainVotingPlugin: GEO_MEMBER_ACCESS_PLUGIN_REPO_ADDRESS, // unsure if this should be the plugin address from the DAO Factory or the plugin repo address
      },
      pluginUpgrader: wallet?.account.address, // not sure what the best practice is here per Aragon
    });

    const geoPersonalSpacePluginInstallItem = GeoPersonalSpacePluginClientEncoding.getPersonalSpacePluginInstallItem({
      initialEditorAddress: wallet?.account.address,
    });

    const createParams: CreateDaoParams = {
      metadataUri,
      ensSubdomain: 'test-hack-the-planet-mumbai-2',
      // plugins: [geoMainVotingPluginInstallItem],
      plugins: [geoPersonalSpacePluginInstallItem],
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
