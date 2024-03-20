import {GovernancePluginsSetupParams} from '../../plugin-setup-params';
import {
  GovernancePluginsSetup,
  GovernancePluginsSetup__factory,
  MainVotingPlugin,
  MainVotingPlugin__factory,
  MajorityVotingBase,
  MemberAccessPlugin,
  MemberAccessPlugin__factory,
  PluginRepo,
} from '../../typechain';
import {PluginSetupRefStruct} from '../../typechain/@aragon/osx/framework/dao/DAOFactory';
import {osxContracts} from '../../utils/helpers';
import {getPluginRepoInfo} from '../../utils/plugin-repo-info';
import {installPlugin, uninstallPlugin} from '../helpers/setup';
import {deployTestDao} from '../helpers/test-dao';
import {ADDRESS_ZERO} from '../unit-testing/common';
import {
  DAO,
  PluginRepo__factory,
  PluginSetupProcessor,
  PluginSetupProcessor__factory,
} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

const release = 1;
const hardhatForkNetwork = process.env.NETWORK_NAME ?? 'mainnet';
const pluginSettings: MajorityVotingBase.VotingSettingsStruct = {
  duration: 60 * 60 * 24,
  minParticipation: 1,
  supportThreshold: 1,
  votingMode: 0,
};
const minMemberAccessProposalDuration = 60 * 60 * 24;

describe('GovernancePluginsSetup processing', function () {
  let deployer: SignerWithAddress;

  let psp: PluginSetupProcessor;
  let dao: DAO;
  let pluginRepo: PluginRepo;

  before(async () => {
    [deployer] = await ethers.getSigners();

    const pluginRepoInfo = getPluginRepoInfo(
      GovernancePluginsSetupParams.PLUGIN_REPO_ENS_NAME,
      'hardhat'
    );
    if (!pluginRepoInfo) {
      throw new Error('The plugin setup details are not available');
    }

    // PSP
    psp = PluginSetupProcessor__factory.connect(
      osxContracts[hardhatForkNetwork]['PluginSetupProcessor'],
      deployer
    );

    // Deploy DAO.
    dao = await deployTestDao(deployer);

    await dao.grant(
      dao.address,
      psp.address,
      ethers.utils.id('ROOT_PERMISSION')
    );
    await dao.grant(
      psp.address,
      deployer.address,
      ethers.utils.id('APPLY_INSTALLATION_PERMISSION')
    );
    await dao.grant(
      psp.address,
      deployer.address,
      ethers.utils.id('APPLY_UNINSTALLATION_PERMISSION')
    );
    await dao.grant(
      psp.address,
      deployer.address,
      ethers.utils.id('APPLY_UPDATE_PERMISSION')
    );

    pluginRepo = PluginRepo__factory.connect(pluginRepoInfo.address, deployer);
  });

  context('Build 1', async () => {
    let setup: GovernancePluginsSetup;
    let pluginSetupRef: PluginSetupRefStruct;
    let mainVotingPlugin: MainVotingPlugin;
    let memberAccessPlugin: MemberAccessPlugin;
    const pluginUpgrader = ADDRESS_ZERO;

    before(async () => {
      // Deploy setups.
      setup = GovernancePluginsSetup__factory.connect(
        (await pluginRepo['getLatestVersion(uint8)'](release)).pluginSetup,
        deployer
      );

      pluginSetupRef = {
        versionTag: {
          release,
          build: 1,
        },
        pluginSetupRepo: pluginRepo.address,
      };
    });

    beforeEach(async () => {
      // Install build 1.
      const data = await setup.encodeInstallationParams(
        pluginSettings,
        [deployer.address],
        minMemberAccessProposalDuration,
        pluginUpgrader
      );
      const installation = await installPlugin(psp, dao, pluginSetupRef, data);

      mainVotingPlugin = MainVotingPlugin__factory.connect(
        installation.preparedEvent.args.plugin,
        deployer
      );
      memberAccessPlugin = MemberAccessPlugin__factory.connect(
        installation.preparedEvent.args.preparedSetupData.helpers[0],
        deployer
      );
    });

    it('installs & uninstalls', async () => {
      expect(await mainVotingPlugin.implementation()).to.be.eq(
        await setup.implementation()
      );
      expect(await memberAccessPlugin.implementation()).to.be.eq(
        await setup.memberAccessPluginImplementation()
      );
      expect(await mainVotingPlugin.dao()).to.be.eq(dao.address);
      expect(await memberAccessPlugin.dao()).to.be.eq(dao.address);

      // Uninstall build 1.
      const data = await setup.encodeUninstallationParams(pluginUpgrader);
      await uninstallPlugin(psp, dao, mainVotingPlugin, pluginSetupRef, data, [
        memberAccessPlugin.address,
      ]);
    });
  });
});
