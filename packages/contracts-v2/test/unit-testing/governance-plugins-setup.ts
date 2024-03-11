import buildMetadata from '../../src/governance/governance-build-metadata.json';
import {
  DAO,
  GovernancePluginsSetup,
  GovernancePluginsSetup__factory,
  MainVotingPlugin__factory,
} from '../../typechain';
import {deployTestDao} from '../helpers/test-dao';
import {getNamedTypesFromMetadata, Operation} from '../helpers/types';
import {
  abiCoder,
  ADDRESS_ZERO,
  EXECUTE_PERMISSION_ID,
  NO_CONDITION,
  pctToRatio,
  UPDATE_ADDRESSES_PERMISSION_ID,
  UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
  UPDATE_VOTING_SETTINGS_PERMISSION_ID,
  VotingMode,
} from './common';
import {activeContractsList} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

describe('Governance Plugins Setup', function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let governancePluginsSetup: GovernancePluginsSetup;
  let dao: DAO;

  before(async () => {
    [alice, bob] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    const hardhatForkNetwork = (process.env.NETWORK_NAME ??
      'mainnet') as keyof typeof activeContractsList;
    const pspAddress =
      activeContractsList[hardhatForkNetwork].PluginSetupProcessor;

    governancePluginsSetup = await new GovernancePluginsSetup__factory(
      alice
    ).deploy(pspAddress);
  });

  describe('prepareInstallation', async () => {
    it('returns the plugin, helpers, and permissions (no pluginUpgrader)', async () => {
      const pluginUpgrader = ADDRESS_ZERO;

      // Params: (MajorityVotingBase.VotingSettings, address[], uint64, address)
      const initData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareInstallation.inputs
        ),
        [
          {
            votingMode: VotingMode.EarlyExecution,
            supportThreshold: pctToRatio(25),
            minParticipation: pctToRatio(50),
            duration: 60 * 60 * 24 * 5,
          },
          [alice.address],
          60 * 60 * 24,
          pluginUpgrader,
        ]
      );
      const nonce = await ethers.provider.getTransactionCount(
        governancePluginsSetup.address
      );
      const anticipatedMainVotingPluginAddress =
        ethers.utils.getContractAddress({
          from: governancePluginsSetup.address,
          nonce,
        });
      const anticipatedMemberAccessPluginAddress =
        ethers.utils.getContractAddress({
          from: governancePluginsSetup.address,
          nonce: nonce + 1,
        });
      const anticipatedMemberAccessConditionAddress =
        ethers.utils.getContractAddress({
          from: governancePluginsSetup.address,
          nonce: nonce + 2,
        });

      const {
        mainVotingPlugin,
        preparedSetupData: {helpers, permissions},
      } = await governancePluginsSetup.callStatic.prepareInstallation(
        dao.address,
        initData
      );
      expect(mainVotingPlugin).to.be.equal(anticipatedMainVotingPluginAddress);
      expect(helpers.length).to.be.equal(1);
      const [memberAccessPlugin] = helpers;
      expect(memberAccessPlugin).to.eq(anticipatedMemberAccessPluginAddress);

      expect(permissions.length).to.be.equal(5);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          dao.address,
          mainVotingPlugin,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          mainVotingPlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          mainVotingPlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          dao.address,
          memberAccessPlugin,
          anticipatedMemberAccessConditionAddress,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          memberAccessPlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
      ]);

      await governancePluginsSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new MainVotingPlugin__factory(alice).attach(
        mainVotingPlugin
      );

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
      expect(await myPlugin.isEditor(alice.address)).to.be.true;
    });

    it('returns the plugin, helpers, and permissions (with a pluginUpgrader)', async () => {
      const pluginUpgrader = bob.address;

      // Params: (MajorityVotingBase.VotingSettings, address, address)
      const initData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareInstallation.inputs
        ),
        [
          {
            votingMode: VotingMode.EarlyExecution,
            supportThreshold: pctToRatio(25),
            minParticipation: pctToRatio(50),
            duration: 60 * 60 * 24 * 5,
          },
          [alice.address],
          60 * 60 * 24,
          pluginUpgrader,
        ]
      );
      const nonce = await ethers.provider.getTransactionCount(
        governancePluginsSetup.address
      );
      const anticipatedMainVotingPluginAddress =
        ethers.utils.getContractAddress({
          from: governancePluginsSetup.address,
          nonce,
        });
      const anticipatedMemberAccessPluginAddress =
        ethers.utils.getContractAddress({
          from: governancePluginsSetup.address,
          nonce: nonce + 1,
        });
      const anticipatedMemberAccessConditionAddress =
        ethers.utils.getContractAddress({
          from: governancePluginsSetup.address,
          nonce: nonce + 2,
        });
      const anticipatedOnlyPluginUpgraderConditionAddress =
        ethers.utils.getContractAddress({
          from: governancePluginsSetup.address,
          nonce: nonce + 3,
        });

      const {
        mainVotingPlugin,
        preparedSetupData: {helpers, permissions},
      } = await governancePluginsSetup.callStatic.prepareInstallation(
        dao.address,
        initData
      );
      expect(mainVotingPlugin).to.be.equal(anticipatedMainVotingPluginAddress);
      expect(helpers.length).to.be.equal(1);
      const [memberAccessPlugin] = helpers;
      expect(memberAccessPlugin).to.eq(anticipatedMemberAccessPluginAddress);

      expect(permissions.length).to.be.equal(6);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          dao.address,
          mainVotingPlugin,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          mainVotingPlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          mainVotingPlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          dao.address,
          memberAccessPlugin,
          anticipatedMemberAccessConditionAddress,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          memberAccessPlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          dao.address,
          pluginUpgrader,
          anticipatedOnlyPluginUpgraderConditionAddress,
          EXECUTE_PERMISSION_ID,
        ],
      ]);

      await governancePluginsSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new MainVotingPlugin__factory(alice).attach(
        mainVotingPlugin
      );

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
      expect(await myPlugin.isEditor(alice.address)).to.be.true;
    });
  });

  describe('prepareUninstallation', async () => {
    it('returns the permissions (no pluginUpgrader)', async () => {
      const mainVotingPlugin = await new MainVotingPlugin__factory(
        alice
      ).deploy();
      const memberAccessPlugin = await new MainVotingPlugin__factory(
        alice
      ).deploy();

      const pluginUpgrader = ADDRESS_ZERO;
      const uninstallData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareUninstallation.inputs
        ),
        [pluginUpgrader]
      );
      const permissions =
        await governancePluginsSetup.callStatic.prepareUninstallation(
          dao.address,
          {
            plugin: mainVotingPlugin.address,
            currentHelpers: [memberAccessPlugin.address],
            data: uninstallData,
          }
        );

      expect(permissions.length).to.be.equal(5);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          dao.address,
          mainVotingPlugin.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          mainVotingPlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          mainVotingPlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dao.address,
          memberAccessPlugin.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          memberAccessPlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
      ]);
    });

    it('returns the permissions (with a pluginUpgrader)', async () => {
      const mainVotingPlugin = await new MainVotingPlugin__factory(
        alice
      ).deploy();
      const memberAccessPlugin = await new MainVotingPlugin__factory(
        alice
      ).deploy();

      const pluginUpgrader = bob.address;
      const uninstallData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareUninstallation.inputs
        ),
        [pluginUpgrader]
      );
      const permissions =
        await governancePluginsSetup.callStatic.prepareUninstallation(
          dao.address,
          {
            plugin: mainVotingPlugin.address,
            currentHelpers: [memberAccessPlugin.address],
            data: uninstallData,
          }
        );

      expect(permissions.length).to.be.equal(6);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          dao.address,
          mainVotingPlugin.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          mainVotingPlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          mainVotingPlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dao.address,
          memberAccessPlugin.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          memberAccessPlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dao.address,
          pluginUpgrader,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
      ]);
    });
  });
});
