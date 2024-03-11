import {
  GovernancePluginsSetupParams,
  PersonalSpaceAdminPluginSetupParams,
  PluginSetupParams,
  SpacePluginSetupParams,
} from '../../plugin-setup-params';
import {toHex} from '../../utils/ipfs';
import {uploadToIPFS} from '../../utils/ipfs';
import {
  addDeployedVersion,
  getPluginRepoInfo,
  PluginRepoBuild,
} from '../../utils/plugin-repo-info';
import {PluginRepo__factory, PluginSetup__factory} from '@aragon/osx-ethers';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = function (hre: HardhatRuntimeEnvironment) {
  return publishPlugin(hre, SpacePluginSetupParams)
    .then(() => publishPlugin(hre, PersonalSpaceAdminPluginSetupParams))
    .then(() => publishPlugin(hre, GovernancePluginsSetupParams));
};

async function publishPlugin(
  hre: HardhatRuntimeEnvironment,
  pluginSetupParams: PluginSetupParams
) {
  console.log(
    `Publishing ${pluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME} as v${pluginSetupParams.VERSION.release}.${pluginSetupParams.VERSION.build} in the "${pluginSetupParams.PLUGIN_REPO_ENS_NAME}" plugin repo`
  );

  const {deployments, network} = hre;
  const [deployer] = await hre.ethers.getSigners();

  // Upload the metadata to IPFS
  const releaseMetadataURI = `ipfs://${await uploadToIPFS(
    JSON.stringify(pluginSetupParams.METADATA.release),
    false
  )}`;
  const buildMetadataURI = `ipfs://${await uploadToIPFS(
    JSON.stringify(pluginSetupParams.METADATA.build),
    false
  )}`;

  console.log(`Uploaded release metadata: ${releaseMetadataURI}`);
  console.log(`Uploaded build metadata: ${buildMetadataURI}`);

  // Get PluginSetup
  const setup = await deployments.get(
    pluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME
  );

  // Get PluginRepo
  const pluginRepoInfo = getPluginRepoInfo(
    pluginSetupParams.PLUGIN_REPO_ENS_NAME,
    network.name
  );
  if (!pluginRepoInfo) throw new Error('The plugin repo cannot be found');
  const pluginRepo = PluginRepo__factory.connect(
    pluginRepoInfo.address,
    deployer
  );

  // Check release number
  const latestRelease = await pluginRepo.latestRelease();
  if (pluginSetupParams.VERSION.release > latestRelease + 1) {
    throw Error(
      `Publishing with release number ${
        pluginSetupParams.VERSION.release
      } is not possible. 
      The latest release is ${latestRelease} and the next release you can publish is release number ${
        latestRelease + 1
      }.`
    );
  }

  // Check build number
  const latestBuild = (
    await pluginRepo.buildCount(pluginSetupParams.VERSION.release)
  ).toNumber();
  if (pluginSetupParams.VERSION.build <= latestBuild) {
    throw Error(
      `Publishing with build number ${pluginSetupParams.VERSION.build} is not possible. 
      The latest build is ${latestBuild} and build ${pluginSetupParams.VERSION.build} has been deployed already.`
    );
  }
  if (pluginSetupParams.VERSION.build > latestBuild + 1) {
    throw Error(
      `Publishing with build number ${
        pluginSetupParams.VERSION.build
      } is not possible. 
      The latest build is ${latestBuild} and the next release you can publish is release number ${
        latestBuild + 1
      }.`
    );
  }

  // Create Version
  const tx = await pluginRepo.createVersion(
    pluginSetupParams.VERSION.release,
    setup.address,
    toHex(buildMetadataURI),
    toHex(releaseMetadataURI)
  );

  const blockNumberOfPublication = (await tx.wait()).blockNumber;

  if (setup == undefined || setup?.receipt == undefined) {
    throw Error('setup deployment unavailable');
  }

  const version = await pluginRepo['getLatestVersion(uint8)'](
    pluginSetupParams.VERSION.release
  );
  if (pluginSetupParams.VERSION.release !== version.tag.release) {
    throw Error('something went wrong');
  }

  const implementationAddress = await PluginSetup__factory.connect(
    setup.address,
    deployer
  ).implementation();

  console.log(
    `Published ${pluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME} at ${setup.address} in PluginRepo ${pluginSetupParams.PLUGIN_REPO_ENS_NAME} at ${pluginRepo.address} at block ${blockNumberOfPublication}.`
  );

  const pluginBuild: PluginRepoBuild = {
    setup: {
      name: pluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
      address: setup.address,
      blockNumberOfDeployment: setup.receipt.blockNumber,
    },
    implementation: {
      name: pluginSetupParams.PLUGIN_CONTRACT_NAME,
      address: implementationAddress,
      blockNumberOfDeployment: setup.receipt.blockNumber,
    },
    helpers: [],
    buildMetadataURI: buildMetadataURI,
    blockNumberOfPublication: blockNumberOfPublication,
  };
  addDeployedVersion(
    pluginSetupParams.PLUGIN_REPO_ENS_NAME,
    network.name,
    releaseMetadataURI,
    {release: pluginSetupParams.VERSION.release, build: version.tag.build},
    pluginBuild
  );
}

export default func;
func.tags = [
  SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  PersonalSpaceAdminPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  GovernancePluginsSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  'Publication',
];
