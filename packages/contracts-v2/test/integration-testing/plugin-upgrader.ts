import {
  GovernancePluginsSetup,
  GovernancePluginsSetup__factory,
  MainVotingPlugin__factory,
  MajorityVotingBase,
  MemberAccessPlugin__factory,
  PluginRepo,
  SpacePluginSetup,
  SpacePluginSetup__factory,
  SpacePlugin__factory,
  TestGovernancePluginsSetup,
  TestGovernancePluginsSetup__factory,
} from '../../typechain';
import {
  ExecutedEvent,
  UpgradedEvent,
} from '../../typechain/@aragon/osx/core/dao/DAO';
import {PluginSetupRefStruct} from '../../typechain/@aragon/osx/framework/dao/DAOFactory';
import {UpdatePreparedEvent} from '../../typechain/@aragon/osx/framework/plugin/setup/PluginSetupProcessor';
import {
  findEvent,
  findEventTopicLog,
  getPluginRepoFactoryAddress,
  hashHelpers,
  osxContracts,
} from '../../utils/helpers';
import {toHex} from '../../utils/ipfs';
import {installPlugin} from '../helpers/setup';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_ZERO,
  UPGRADE_PLUGIN_PERMISSION_ID,
  ZERO_BYTES32,
} from '../unit-testing/common';
// import { getNamedTypesFromMetadata } from "../helpers/types";
import {
  DAO,
  PluginRepo__factory,
  PluginSetupProcessor,
  PluginSetupProcessor__factory,
  PluginRepoFactory__factory,
  PluginRepoRegistry__factory,
  DAO__factory,
} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers, network} from 'hardhat';

const release = 1;
const hardhatForkNetwork = process.env.NETWORK_NAME ?? 'mainnet';
const pluginSettings: MajorityVotingBase.VotingSettingsStruct = {
  duration: 60 * 60 * 24,
  minParticipation: 1,
  supportThreshold: 1,
  votingMode: 0,
};
const minMemberAccessProposalDuration = 60 * 60 * 24;
const daoInterface = DAO__factory.createInterface();
const pspInterface = PluginSetupProcessor__factory.createInterface();

describe('Plugin upgrader', () => {
  let deployer: SignerWithAddress;
  let pluginUpgrader: SignerWithAddress;

  let psp: PluginSetupProcessor;
  let dao: DAO;
  let pluginRepo: PluginRepo;

  describe('GovernancePluginsSetup', () => {
    let pSetupBuild1: GovernancePluginsSetup;
    let pSetupBuild2: TestGovernancePluginsSetup;
    let gpsFactory: GovernancePluginsSetup__factory;
    let tgpsFactory: TestGovernancePluginsSetup__factory;
    let installation1: Awaited<ReturnType<typeof installPlugin>>;

    before(async () => {
      [deployer, pluginUpgrader] = await ethers.getSigners();

      // PSP
      psp = PluginSetupProcessor__factory.connect(
        osxContracts[hardhatForkNetwork]['PluginSetupProcessor'],
        deployer
      );

      // Get the PluginRepoFactory address
      const pluginRepoFactoryAddr: string = getPluginRepoFactoryAddress(
        network.name
      );

      const pluginRepoFactory = PluginRepoFactory__factory.connect(
        pluginRepoFactoryAddr,
        deployer
      );

      // Create a new PluginRepo
      let tx = await pluginRepoFactory.createPluginRepo(
        'testing-governance-plugin',
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

      pluginRepo = PluginRepo__factory.connect(
        eventLog.args.pluginRepo,
        deployer
      );

      // Deploy PluginSetup build 1
      gpsFactory = new GovernancePluginsSetup__factory().connect(deployer);
      pSetupBuild1 = await gpsFactory.deploy(psp.address);

      // Deploy PluginSetup build 2
      tgpsFactory = new TestGovernancePluginsSetup__factory().connect(deployer);
      pSetupBuild2 = await tgpsFactory.deploy(psp.address);

      // Publish build 1
      tx = await pluginRepo.createVersion(
        1,
        pSetupBuild1.address,
        toHex('build'),
        toHex('release')
      );
      // Publish build 2
      tx = await pluginRepo.createVersion(
        1,
        pSetupBuild2.address,
        toHex('build'),
        toHex('release')
      );
      await tx.wait();
    });

    beforeEach(async () => {
      // Deploy DAO.
      dao = await deployTestDao(deployer);

      // The DAO is root on itself
      await dao.grant(
        dao.address,
        dao.address,
        ethers.utils.id('ROOT_PERMISSION')
      );

      const pluginSetupRef1: PluginSetupRefStruct = {
        versionTag: {
          release,
          build: 1,
        },
        pluginSetupRepo: pluginRepo.address,
      };

      // Temporary permissions for installing
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

      // Install build 1
      const data1 = await pSetupBuild1.encodeInstallationParams(
        pluginSettings,
        [deployer.address],
        minMemberAccessProposalDuration,
        pluginUpgrader.address
      );
      installation1 = await installPlugin(psp, dao, pluginSetupRef1, data1);

      // Drop temp permissions
      await dao.revoke(
        dao.address,
        psp.address,
        ethers.utils.id('ROOT_PERMISSION')
      );
      await dao.revoke(
        psp.address,
        deployer.address,
        ethers.utils.id('APPLY_INSTALLATION_PERMISSION')
      );
    });

    it('Allows pluginUpgrader to execute psp.applyUpdate()', async () => {
      // Deployed plugin and helper
      const mainVotingPlugin = MainVotingPlugin__factory.connect(
        installation1.preparedEvent.args.plugin,
        deployer
      );
      const memberAccessPlugin = MemberAccessPlugin__factory.connect(
        installation1.preparedEvent.args.preparedSetupData.helpers[0],
        deployer
      );

      // Check implementations build 1
      expect(await mainVotingPlugin.implementation()).to.be.eq(
        await pSetupBuild1.implementation()
      );
      expect(await memberAccessPlugin.implementation()).to.be.eq(
        await pSetupBuild1.memberAccessPluginImplementation()
      );

      // Check
      expect(await pSetupBuild1.implementation()).to.not.be.eq(
        await pSetupBuild2.implementation(),
        'Builds 1-2 implementation should differ'
      );

      // Upgrade to build 2
      const dat = await pSetupBuild2.encodeUpdateParams(false); // No new perms
      let tx = await psp.prepareUpdate(dao.address, {
        currentVersionTag: {
          release: release,
          build: 1,
        },
        newVersionTag: {
          release: release,
          build: 2,
        },
        pluginSetupRepo: pluginRepo.address,
        setupPayload: {
          currentHelpers: [memberAccessPlugin.address],
          data: dat,
          plugin: mainVotingPlugin.address,
        },
      });
      const preparedEvent = await findEvent<UpdatePreparedEvent>(
        tx,
        'UpdatePrepared'
      );
      if (!preparedEvent) {
        throw new Error('Failed to get UpdatePrepared event');
      }

      // Should not allow to execute other than the expected 3 actions
      {
        await expect(
          dao.execute(toHex('01234123412341234123412341234123'), [], 0)
        ).to.be.reverted;
        await expect(
          dao
            .connect(pluginUpgrader)
            .execute(toHex('01234123412341234123412341234123'), [], 0)
        ).to.be.reverted;
        await expect(
          dao
            .connect(pluginUpgrader)
            .execute(
              toHex('01234123412341234123412341234123'),
              [{to: dao.address, value: 0, data: '0x'}],
              0
            )
        ).to.be.reverted;
        await expect(
          dao.connect(pluginUpgrader).execute(
            toHex('01234123412341234123412341234123'),
            [
              {
                to: mainVotingPlugin.address,
                value: 0,
                data: MainVotingPlugin__factory.createInterface().encodeFunctionData(
                  'addEditor',
                  [pluginUpgrader.address]
                ),
              },
            ],
            0
          )
        ).to.be.reverted;
      }

      // Params
      const applyUpdateParams: PluginSetupProcessor.ApplyUpdateParamsStruct = {
        plugin: mainVotingPlugin.address,
        pluginSetupRef: {
          pluginSetupRepo: pluginRepo.address,
          versionTag: {
            release,
            build: 2,
          },
        },
        initData: preparedEvent.args.initData,
        permissions: preparedEvent.args.preparedSetupData.permissions,
        helpersHash: hashHelpers(preparedEvent.args.preparedSetupData.helpers),
      };

      // Execute grant + applyUpdate + revoke
      tx = await dao.connect(pluginUpgrader).execute(
        ZERO_BYTES32,
        [
          // Grant permission to the PSP
          {
            to: dao.address,
            value: 0,
            data: daoInterface.encodeFunctionData('grant', [
              mainVotingPlugin.address,
              psp.address,
              UPGRADE_PLUGIN_PERMISSION_ID,
            ]),
          },
          // Execute psp.applyUpdate() from the DAO to the plugin
          {
            to: psp.address,
            value: 0,
            data: pspInterface.encodeFunctionData('applyUpdate', [
              dao.address,
              applyUpdateParams,
            ]),
          },
          // Revoke permission to the PSP
          {
            to: dao.address,
            value: 0,
            data: daoInterface.encodeFunctionData('revoke', [
              mainVotingPlugin.address,
              psp.address,
              UPGRADE_PLUGIN_PERMISSION_ID,
            ]),
          },
        ],
        0
      );

      const receipt = await tx.wait();
      const executedEvent: ExecutedEvent | undefined = (
        receipt.events || []
      ).find(event => event.event === 'Executed') as any;
      if (!executedEvent) {
        throw new Error('Failed to get Executed event');
      }

      const upgradedEvent = await findEvent<UpgradedEvent>(tx, 'Upgraded');
      if (!upgradedEvent) {
        throw new Error('Failed to get Upgraded event');
      }

      // Check implementations build 2
      expect(await mainVotingPlugin.implementation()).to.not.be.eq(
        await pSetupBuild1.implementation(),
        "Implementation shouldn't be build 1"
      );

      expect(await mainVotingPlugin.implementation()).to.be.eq(
        await pSetupBuild2.implementation(),
        'Implementation should be build 2'
      );

      expect(await memberAccessPlugin.implementation()).to.be.eq(
        await pSetupBuild1.memberAccessPluginImplementation(),
        'Implementation should remain as build 1'
      );
    });

    it('Reverts if pluginUpgrader calling psp.applyUpdate() requests new permissions', async () => {
      // Deployed plugin and helper
      const mainVotingPlugin = MainVotingPlugin__factory.connect(
        installation1.preparedEvent.args.plugin,
        deployer
      );
      const memberAccessPlugin = MemberAccessPlugin__factory.connect(
        installation1.preparedEvent.args.preparedSetupData.helpers[0],
        deployer
      );

      // Prepare an update to build 2
      const dat = await pSetupBuild2.encodeUpdateParams(true); // Request new perms
      const tx = await psp.prepareUpdate(dao.address, {
        currentVersionTag: {
          release: release,
          build: 1,
        },
        newVersionTag: {
          release: release,
          build: 2,
        },
        pluginSetupRepo: pluginRepo.address,
        setupPayload: {
          currentHelpers: [memberAccessPlugin.address],
          data: dat,
          plugin: mainVotingPlugin.address,
        },
      });
      const preparedEvent = await findEvent<UpdatePreparedEvent>(
        tx,
        'UpdatePrepared'
      );
      if (!preparedEvent) {
        throw new Error('Failed to get UpdatePrepared event');
      }

      // Params
      const applyUpdateParams: PluginSetupProcessor.ApplyUpdateParamsStruct = {
        plugin: mainVotingPlugin.address,
        pluginSetupRef: {
          pluginSetupRepo: pluginRepo.address,
          versionTag: {
            release,
            build: 2,
          },
        },
        initData: preparedEvent.args.initData,
        permissions: preparedEvent.args.preparedSetupData.permissions,
        helpersHash: hashHelpers(preparedEvent.args.preparedSetupData.helpers),
      };

      // Execute grant + applyUpdate + revoke
      await expect(
        dao.connect(pluginUpgrader).execute(
          ZERO_BYTES32,
          [
            // Grant permission to the PSP
            {
              to: dao.address,
              value: 0,
              data: daoInterface.encodeFunctionData('grant', [
                mainVotingPlugin.address,
                psp.address,
                UPGRADE_PLUGIN_PERMISSION_ID,
              ]),
            },
            // Execute psp.applyUpdate() from the DAO to the plugin
            {
              to: psp.address,
              value: 0,
              data: pspInterface.encodeFunctionData('applyUpdate', [
                dao.address,
                applyUpdateParams,
              ]),
            },
            // Revoke permission to the PSP
            {
              to: dao.address,
              value: 0,
              data: daoInterface.encodeFunctionData('revoke', [
                mainVotingPlugin.address,
                psp.address,
                UPGRADE_PLUGIN_PERMISSION_ID,
              ]),
            },
          ],
          0
        )
        // The PSP lacking ROOT permission on the DAO should make this fail
      ).to.revertedWithCustomError(dao, 'ActionFailed');

      // Check implementations build 1
      expect(await mainVotingPlugin.implementation()).to.be.eq(
        await pSetupBuild1.implementation(),
        'Implementation should be build 1'
      );

      expect(await memberAccessPlugin.implementation()).to.be.eq(
        await pSetupBuild1.memberAccessPluginImplementation(),
        'Implementation should remain as build 1'
      );
    });
  });

  describe('SpacePluginSetup', () => {
    let deployer: SignerWithAddress;
    let pluginUpgrader: SignerWithAddress;
    let pSetupBuild1: SpacePluginSetup;

    let psp: PluginSetupProcessor;
    let dao: DAO;
    let pluginRepo: PluginRepo;
    let spFactory: SpacePluginSetup__factory;

    before(async () => {
      [deployer, pluginUpgrader] = await ethers.getSigners();

      // PSP
      psp = PluginSetupProcessor__factory.connect(
        osxContracts[hardhatForkNetwork]['PluginSetupProcessor'],
        deployer
      );

      // Deploy DAO.
      dao = await deployTestDao(deployer);

      // The DAO is root on itself
      await dao.grant(
        dao.address,
        dao.address,
        ethers.utils.id('ROOT_PERMISSION')
      );

      // Get the PluginRepoFactory address
      const pluginRepoFactoryAddr: string = getPluginRepoFactoryAddress(
        network.name
      );

      const pluginRepoFactory = PluginRepoFactory__factory.connect(
        pluginRepoFactoryAddr,
        deployer
      );

      // Create a new PluginRepo
      let tx = await pluginRepoFactory.createPluginRepo(
        'testing-space-plugin',
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

      pluginRepo = PluginRepo__factory.connect(
        eventLog.args.pluginRepo,
        deployer
      );

      // Deploy PluginSetup build 1
      spFactory = new SpacePluginSetup__factory().connect(deployer);
      pSetupBuild1 = await spFactory.deploy(psp.address);

      // Publish build 1
      tx = await pluginRepo.createVersion(
        1,
        pSetupBuild1.address,
        toHex('build'),
        toHex('release')
      );
    });

    it('Allows pluginUpgrader to execute psp.applyUpdate()', async () => {
      const pluginSetupRef1: PluginSetupRefStruct = {
        versionTag: {
          release,
          build: 1,
        },
        pluginSetupRepo: pluginRepo.address,
      };

      // Temporary permissions for installing
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

      // Install build 1
      const data1 = await pSetupBuild1.encodeInstallationParams(
        toHex('ipfs://1234'),
        ADDRESS_ZERO,
        pluginUpgrader.address
      );
      const installation1 = await installPlugin(
        psp,
        dao,
        pluginSetupRef1,
        data1
      );

      // Drop temp permissions
      await dao.revoke(
        dao.address,
        psp.address,
        ethers.utils.id('ROOT_PERMISSION')
      );
      await dao.revoke(
        psp.address,
        deployer.address,
        ethers.utils.id('APPLY_INSTALLATION_PERMISSION')
      );

      // Deployed plugin
      const spacePlugin = SpacePlugin__factory.connect(
        installation1.preparedEvent.args.plugin,
        deployer
      );

      // Check implementations build 1
      expect(await spacePlugin.implementation()).to.be.eq(
        await pSetupBuild1.implementation()
      );

      // Deploy PluginSetup build 2 (new instance, disregarding the lack of changes)
      const pSetupBuild2 = await spFactory.deploy(psp.address);

      // Check
      expect(await pSetupBuild1.implementation()).to.not.be.eq(
        await pSetupBuild2.implementation(),
        'Builds 1-2 implementation should differ'
      );

      // Publish build 2
      let tx = await pluginRepo.createVersion(
        1,
        pSetupBuild2.address,
        toHex('build'),
        toHex('release')
      );
      await tx.wait();

      // Upgrade to build 2
      tx = await psp.prepareUpdate(dao.address, {
        currentVersionTag: {
          release: release,
          build: 1,
        },
        newVersionTag: {
          release: release,
          build: 2,
        },
        pluginSetupRepo: pluginRepo.address,
        setupPayload: {
          currentHelpers: [],
          data: '0x',
          plugin: spacePlugin.address,
        },
      });
      const preparedEvent = await findEvent<UpdatePreparedEvent>(
        tx,
        'UpdatePrepared'
      );
      if (!preparedEvent) {
        throw new Error('Failed to get UpdatePrepared event');
      }

      // Should not allow to execute other than the expected 3 actions
      {
        await expect(
          dao.execute(toHex('23412341234123412341234123412341'), [], 0)
        ).to.be.reverted;
        await expect(
          dao
            .connect(pluginUpgrader)
            .execute(toHex('23412341234123412341234123412341'), [], 0)
        ).to.be.reverted;
        await expect(
          dao
            .connect(pluginUpgrader)
            .execute(
              toHex('23412341234123412341234123412341'),
              [{to: dao.address, value: 0, data: '0x'}],
              0
            )
        ).to.be.reverted;
        await expect(
          dao.connect(pluginUpgrader).execute(
            toHex('23412341234123412341234123412341'),
            [
              {
                to: spacePlugin.address,
                value: 0,
                data: SpacePlugin__factory.createInterface().encodeFunctionData(
                  'removeSubspace',
                  [ADDRESS_ONE]
                ),
              },
            ],
            0
          )
        ).to.be.reverted;
      }

      // Params
      const applyUpdateParams: PluginSetupProcessor.ApplyUpdateParamsStruct = {
        plugin: spacePlugin.address,
        pluginSetupRef: {
          pluginSetupRepo: pluginRepo.address,
          versionTag: {
            release,
            build: 2,
          },
        },
        initData: preparedEvent.args.initData,
        permissions: preparedEvent.args.preparedSetupData.permissions,
        helpersHash: hashHelpers(preparedEvent.args.preparedSetupData.helpers),
      };

      // Execute grant + applyUpdate + revoke
      tx = await dao.connect(pluginUpgrader).execute(
        ZERO_BYTES32,
        [
          // Grant permission to the PSP
          {
            to: dao.address,
            value: 0,
            data: daoInterface.encodeFunctionData('grant', [
              spacePlugin.address,
              psp.address,
              UPGRADE_PLUGIN_PERMISSION_ID,
            ]),
          },
          // Execute psp.applyUpdate() from the DAO to the plugin
          {
            to: psp.address,
            value: 0,
            data: pspInterface.encodeFunctionData('applyUpdate', [
              dao.address,
              applyUpdateParams,
            ]),
          },
          // Revoke permission to the PSP
          {
            to: dao.address,
            value: 0,
            data: daoInterface.encodeFunctionData('revoke', [
              spacePlugin.address,
              psp.address,
              UPGRADE_PLUGIN_PERMISSION_ID,
            ]),
          },
        ],
        0
      );

      const receipt = await tx.wait();
      const executedEvent: ExecutedEvent | undefined = (
        receipt.events || []
      ).find(event => event.event === 'Executed') as any;
      if (!executedEvent) {
        throw new Error('Failed to get Executed event');
      }

      const upgradedEvent = await findEvent<UpgradedEvent>(tx, 'Upgraded');
      if (!upgradedEvent) {
        throw new Error('Failed to get Upgraded event');
      }

      // Check implementations build 2
      expect(await spacePlugin.implementation()).to.not.be.eq(
        await pSetupBuild1.implementation(),
        "Implementation shouldn't be build 1"
      );

      expect(await spacePlugin.implementation()).to.be.eq(
        await pSetupBuild2.implementation(),
        'Implementation should be build 2'
      );
    });
  });
});
