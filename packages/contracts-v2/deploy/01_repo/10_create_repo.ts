import {
  GovernancePluginsSetupParams,
  PersonalSpaceAdminPluginSetupParams,
  SpacePluginSetupParams,
} from '../../plugin-setup-params';
import {
  findEventTopicLog,
  getPluginRepoFactoryAddress,
} from '../../utils/helpers';
import {addDeployedRepo} from '../../utils/plugin-repo-info';
import {
  PluginRepo__factory,
  PluginRepoFactory__factory,
  PluginRepoRegistry__factory,
} from '@aragon/osx-ethers';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = function (hre: HardhatRuntimeEnvironment) {
  return deployRepo(hre, SpacePluginSetupParams.PLUGIN_REPO_ENS_NAME)
    .then(() =>
      deployRepo(hre, PersonalSpaceAdminPluginSetupParams.PLUGIN_REPO_ENS_NAME)
    )
    .then(() =>
      deployRepo(hre, GovernancePluginsSetupParams.PLUGIN_REPO_ENS_NAME)
    );
};

async function deployRepo(
  hre: HardhatRuntimeEnvironment,
  ensSubdomain: string
) {
  console.log(`\nDeploying the "${ensSubdomain}" plugin repo`);

  const {network} = hre;
  const [deployer] = await hre.ethers.getSigners();

  // Get the PluginRepoFactory address
  const pluginRepoFactoryAddr: string = getPluginRepoFactoryAddress(
    network.name
  );

  const pluginRepoFactory = PluginRepoFactory__factory.connect(
    pluginRepoFactoryAddr,
    deployer
  );

  // Create the PluginRepo
  const tx = await pluginRepoFactory.createPluginRepo(
    ensSubdomain,
    deployer.address
  );

  const eventLog = await findEventTopicLog(
    tx,
    PluginRepoRegistry__factory.createInterface(),
    'PluginRepoRegistered'
  );
  if (!eventLog) {
    throw new Error('Failed to get PluginRepoRegistered event log');
  }

  const pluginRepo = PluginRepo__factory.connect(
    eventLog.args.pluginRepo,
    deployer
  );

  const blockNumberOfDeployment = (await tx.wait()).blockNumber;

  console.log(
    `"${ensSubdomain}" PluginRepo deployed at: ${pluginRepo.address} at block ${blockNumberOfDeployment}.`
  );

  // Store the information
  addDeployedRepo(
    ensSubdomain,
    network.name,
    pluginRepo.address,
    blockNumberOfDeployment
  );
}

export default func;
func.tags = ['PluginRepo', 'Deployment'];
