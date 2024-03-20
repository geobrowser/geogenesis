import {
  DAO,
  DAO__factory,
  PluginSetupProcessor,
  PluginSetupProcessor__factory,
  IDAO,
  OnlyPluginUpgraderCondition,
  OnlyPluginUpgraderCondition__factory,
  TestOnlyPluginUpgraderCondition__factory,
  TestOnlyPluginUpgraderCondition,
} from '../../typechain';
import {getPluginSetupProcessorAddress} from '../../utils/helpers';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_THREE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  EDITOR_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  ROOT_PERMISSION_ID,
  UPGRADE_PLUGIN_PERMISSION_ID,
} from './common';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers, network} from 'hardhat';

const ONE_BYTES32 = '0x' + '0'.repeat(63) + '1';
const ALLOWED_PLUGIN_ADDRESS_1 = ADDRESS_ONE;
const ALLOWED_PLUGIN_ADDRESS_2 = ADDRESS_TWO;

const daoInterface = DAO__factory.createInterface();
const pspInterface = PluginSetupProcessor__factory.createInterface();

describe('Only Plugin Upgrader Condition', function () {
  const pspAddress = getPluginSetupProcessorAddress(network.name, true);

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dao: DAO;
  let onlyPluginUpgraderCondition: OnlyPluginUpgraderCondition;
  let applyUpdateParams: PluginSetupProcessor.ApplyUpdateParamsStruct;

  before(async () => {
    [alice, bob, carol] = await ethers.getSigners();
    dao = await deployTestDao(alice);
  });

  beforeEach(async () => {
    const factory = new OnlyPluginUpgraderCondition__factory(alice);
    onlyPluginUpgraderCondition = await factory.deploy(
      dao.address,
      pspAddress,
      [ALLOWED_PLUGIN_ADDRESS_1, ALLOWED_PLUGIN_ADDRESS_2]
    );

    applyUpdateParams = {
      plugin: ALLOWED_PLUGIN_ADDRESS_1,
      helpersHash: ONE_BYTES32,
      initData: '0x',
      permissions: [],
      pluginSetupRef: {
        pluginSetupRepo: ADDRESS_TWO,
        versionTag: {
          release: 3,
          build: 4,
        },
      },
    };
  });

  describe('Executing applyUpdate on the PSP', () => {
    it('Should allow executing grant, applyUpdate and revoke on the PSP', async () => {
      const actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);
    });

    it('Should reject calling the methods directly', async () => {
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ])
        )
      ).to.eq(false);
    });

    it('Should reject calling anything other than execute', async () => {
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('setDaoURI', ['0x'])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('setMetadata', ['0x'])
        )
      ).to.eq(false);
    });

    it('Should reject a proposal with less than 3 actions', async () => {
      let actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      actions = [
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should reject a proposal with more than 3 actions', async () => {
      const actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {to: dao.address, value: 0, data: '0x'},
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      actions[3] = actions[2];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    // to

    it('Should reject if action 1/3 are not executed on the DAO', async () => {
      let actions: IDAO.ActionStruct[] = [
        {
          to: bob.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      actions = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: bob.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should reject if action 2 is not executed on the PSP', async () => {
      const actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: bob.address,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    // grant/revoke calldata

    it('Should reject if actions 1/3 are not grant/revoke respectively', async () => {
      let actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      actions = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it("Should reject if actions 1/3 > who don't target the PSP", async () => {
      let actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            carol.address,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      actions = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            carol.address,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should reject if actions 1/3 > permission is not UPGRADE_PLUGIN_PERMISSION_ID', async () => {
      let actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            EXECUTE_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      actions = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            EDITOR_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should reject if actions 1/3 > where is not a listed plugin', async () => {
      let actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            carol.address,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      actions = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            bob.address,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 3
      actions = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            alice.address,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            carol.address,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    // applyUpdate calldata

    it('Should reject if action 2 is not applyUpdate', async () => {
      let actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyInstallation', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      actions = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUninstallation', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it("Should reject if action 2 > dao doesn't match", async () => {
      let actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            alice.address, // bad
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      actions = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            bob.address, // bad
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should reject if action 2 targets a non allowed plugin', async () => {
      applyUpdateParams.plugin = alice.address;
      const actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 2
      applyUpdateParams.plugin = bob.address;
      actions[1] = {
        to: pspAddress,
        value: 0,
        data: pspInterface.encodeFunctionData('applyUpdate', [
          dao.address,
          applyUpdateParams,
        ]),
      };

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // 3
      applyUpdateParams.plugin = ADDRESS_THREE;
      actions[1] = {
        to: pspAddress,
        value: 0,
        data: pspInterface.encodeFunctionData('applyUpdate', [
          dao.address,
          applyUpdateParams,
        ]),
      };

      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ZERO, // where
          ADDRESS_ZERO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
      expect(
        await onlyPluginUpgraderCondition.isGranted(
          ADDRESS_ONE, // where
          ADDRESS_TWO, // who
          EXECUTE_PERMISSION_ID, // permission
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });
  });

  describe('Decoders (internal)', () => {
    let testMemberAccessExecuteCondition: TestOnlyPluginUpgraderCondition;

    beforeEach(async () => {
      const factory = new TestOnlyPluginUpgraderCondition__factory(alice);
      testMemberAccessExecuteCondition = await factory.deploy(
        dao.address,
        pspAddress,
        [ALLOWED_PLUGIN_ADDRESS_1, ALLOWED_PLUGIN_ADDRESS_2]
      );
    });

    it('Should decode getSelector properly', async () => {
      const actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        {
          to: pspAddress,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            ALLOWED_PLUGIN_ADDRESS_1,
            pspAddress,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await testMemberAccessExecuteCondition.getSelector(actions[0].data)
      ).to.eq((actions[0].data as string).slice(0, 10));

      expect(
        await testMemberAccessExecuteCondition.getSelector(actions[1].data)
      ).to.eq((actions[1].data as string).slice(0, 10));

      expect(
        await testMemberAccessExecuteCondition.getSelector(actions[2].data)
      ).to.eq((actions[2].data as string).slice(0, 10));
    });

    it('Should decode decodeGrantRevokeCalldata properly', async () => {
      const calldataList = [
        daoInterface.encodeFunctionData('grant', [
          ALLOWED_PLUGIN_ADDRESS_1,
          pspAddress,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ]),
        daoInterface.encodeFunctionData('revoke', [
          ALLOWED_PLUGIN_ADDRESS_2,
          ADDRESS_THREE,
          ROOT_PERMISSION_ID,
        ]),
      ];

      // 1
      let [selector, where, who, permissionId] =
        await testMemberAccessExecuteCondition.decodeGrantRevokeCalldata(
          calldataList[0]
        );
      expect(selector).to.eq(calldataList[0].slice(0, 10));
      expect(where).to.eq(ALLOWED_PLUGIN_ADDRESS_1);
      expect(who).to.eq(pspAddress);
      expect(permissionId).to.eq(UPGRADE_PLUGIN_PERMISSION_ID);

      // 2
      [selector, where, who, permissionId] =
        await testMemberAccessExecuteCondition.decodeGrantRevokeCalldata(
          calldataList[1]
        );
      expect(selector).to.eq(calldataList[1].slice(0, 10));
      expect(where).to.eq(ALLOWED_PLUGIN_ADDRESS_2);
      expect(who).to.eq(ADDRESS_THREE);
      expect(permissionId).to.eq(ROOT_PERMISSION_ID);
    });

    it('Should decode decodeApplyUpdateCalldata properly', async () => {
      applyUpdateParams.plugin = bob.address;
      const applyUpdateParams2 = JSON.parse(JSON.stringify(applyUpdateParams));
      applyUpdateParams2.plugin = alice.address;

      const calldataList = [
        pspInterface.encodeFunctionData('applyUpdate', [
          dao.address,
          applyUpdateParams,
        ]),
        pspInterface.encodeFunctionData('applyUpdate', [
          ADDRESS_THREE,
          applyUpdateParams2,
        ]),
      ];

      // 1
      let [selector, decodedDaoAddress, pluginAddress] =
        await testMemberAccessExecuteCondition.decodeApplyUpdateCalldata(
          calldataList[0]
        );
      expect(selector).to.eq(calldataList[0].slice(0, 10));
      expect(decodedDaoAddress).to.eq(dao.address);
      expect(pluginAddress).to.eq(bob.address);

      // 2
      [selector, decodedDaoAddress, pluginAddress] =
        await testMemberAccessExecuteCondition.decodeApplyUpdateCalldata(
          calldataList[1]
        );
      expect(selector).to.eq(calldataList[1].slice(0, 10));
      expect(decodedDaoAddress).to.eq(ADDRESS_THREE);
      expect(pluginAddress).to.eq(alice.address);
    });
  });
});
