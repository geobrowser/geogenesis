import {
  DAO,
  DAO__factory,
  IDAO,
  MainVotingPlugin__factory,
  MemberAccessExecuteCondition,
  MemberAccessExecuteCondition__factory,
  TestMemberAccessExecuteCondition__factory,
  TestMemberAccessExecuteCondition,
} from '../../typechain';
import {getPluginSetupProcessorAddress} from '../../utils/helpers';
import {deployTestDao} from '../helpers/test-dao';
import {ADDRESS_ONE, ADDRESS_TWO, EXECUTE_PERMISSION_ID} from './common';
import {hexlify} from '@ethersproject/bytes';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {toUtf8Bytes} from 'ethers/lib/utils';
import {ethers, network} from 'hardhat';

const SOME_CONTRACT_ADDRESS = '0x' + '1234567890'.repeat(4);
const ONE_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const PLUGIN_ADDR_1 = ADDRESS_ONE;
const PLUGIN_ADDR_2 = ADDRESS_TWO;
const daoInterface = DAO__factory.createInterface();
const mainVotingPluginInterface = MainVotingPlugin__factory.createInterface();

describe('Member Access Condition', function () {
  const pspAddress = getPluginSetupProcessorAddress(network.name, true);

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dao: DAO;
  let memberAccessExecuteCondition: MemberAccessExecuteCondition;

  before(async () => {
    [alice, bob, carol] = await ethers.getSigners();
    dao = await deployTestDao(alice);
  });

  beforeEach(async () => {
    const factory = new MemberAccessExecuteCondition__factory(alice);
    memberAccessExecuteCondition = await factory.deploy(SOME_CONTRACT_ADDRESS);
  });

  describe('Executing addMember and removeMember on a certain contract', () => {
    it('Should only allow executing addMember and removeMember', async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: SOME_CONTRACT_ADDRESS, value: 0, data: '0x'},
      ];

      // Valid add
      actions[0].data = mainVotingPluginInterface.encodeFunctionData(
        'addMember',
        [carol.address]
      );
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Valid remove
      actions[0].data = mainVotingPluginInterface.encodeFunctionData(
        'removeMember',
        [carol.address]
      );
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('setDaoURI', [
        hexlify(toUtf8Bytes('ipfs://')),
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('setMetadata', [
        hexlify(toUtf8Bytes('ipfs://')),
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData(
        'setSignatureValidator',
        [ADDRESS_ONE]
      );
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should only allow to target the intended plugin contract', async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: SOME_CONTRACT_ADDRESS, value: 0, data: '0x'},
      ];

      // Valid member add
      actions[0].data = mainVotingPluginInterface.encodeFunctionData(
        'addMember',
        [carol.address]
      );
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Valid membe remove
      actions[0].data = mainVotingPluginInterface.encodeFunctionData(
        'removeMember',
        [carol.address]
      );
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Invalid (editor)
      actions[0].data = mainVotingPluginInterface.encodeFunctionData(
        'addEditor',
        [carol.address]
      );
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid (editor)
      actions[0].data = mainVotingPluginInterface.encodeFunctionData(
        'removeEditor',
        [carol.address]
      );
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        ADDRESS_TWO,
        carol.address,
        ONE_BYTES32,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        ADDRESS_TWO,
        carol.address,
        ONE_BYTES32,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        dao.address,
        carol.address,
        ONE_BYTES32,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        dao.address,
        carol.address,
        ONE_BYTES32,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should allow adding/removing any address', async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: SOME_CONTRACT_ADDRESS, value: 0, data: '0x'},
      ];
      for (const grantedToAddress of [
        SOME_CONTRACT_ADDRESS,
        bob.address,
        dao.address,
        ADDRESS_ONE,
      ]) {
        // Valid add
        actions[0].data = mainVotingPluginInterface.encodeFunctionData(
          'addMember',
          [grantedToAddress]
        );
        expect(
          await memberAccessExecuteCondition.isGranted(
            ADDRESS_ONE, // where (used)
            ADDRESS_TWO, // who (used)
            EXECUTE_PERMISSION_ID, // permission (used)
            daoInterface.encodeFunctionData('execute', [
              ONE_BYTES32,
              actions,
              0,
            ])
          )
        ).to.eq(true);

        // Valid remove
        actions[0].data = mainVotingPluginInterface.encodeFunctionData(
          'removeMember',
          [grantedToAddress]
        );
        expect(
          await memberAccessExecuteCondition.isGranted(
            ADDRESS_ONE, // where (used)
            ADDRESS_TWO, // who (used)
            EXECUTE_PERMISSION_ID, // permission (used)
            daoInterface.encodeFunctionData('execute', [
              ONE_BYTES32,
              actions,
              0,
            ])
          )
        ).to.eq(true);
      }
    });
  });

  describe('Direct add and remove are not allowed', () => {
    it('Should reject adding and removing directly, rather than executing', async () => {
      // Valid
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          mainVotingPluginInterface.encodeFunctionData('addMember', [
            carol.address,
          ])
        )
      ).to.eq(false);

      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          mainVotingPluginInterface.encodeFunctionData('removeMember', [
            carol.address,
          ])
        )
      ).to.eq(false);
    });
  });

  describe('Decoders (internal)', () => {
    let testMemberAccessExecuteCondition: TestMemberAccessExecuteCondition;

    beforeEach(async () => {
      const factory = new TestMemberAccessExecuteCondition__factory(alice);
      testMemberAccessExecuteCondition = await factory.deploy(
        SOME_CONTRACT_ADDRESS
      );
    });

    it('Should decode getSelector properly', async () => {
      const actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: mainVotingPluginInterface.encodeFunctionData('addMember', [
            pspAddress,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: mainVotingPluginInterface.encodeFunctionData('removeMember', [
            pspAddress,
          ]),
        },
      ];

      expect(
        await testMemberAccessExecuteCondition.getSelector(actions[0].data)
      ).to.eq((actions[0].data as string).slice(0, 10));

      expect(
        await testMemberAccessExecuteCondition.getSelector(actions[1].data)
      ).to.eq((actions[1].data as string).slice(0, 10));
    });

    it('Should decode decodeGrantRevokeCalldata properly', async () => {
      const factory = new TestMemberAccessExecuteCondition__factory(alice);
      const testMemberAccessExecuteCondition = await factory.deploy(
        SOME_CONTRACT_ADDRESS
      );

      const calldataList = [
        mainVotingPluginInterface.encodeFunctionData('addMember', [pspAddress]),
        mainVotingPluginInterface.encodeFunctionData('removeMember', [
          bob.address,
        ]),
      ];

      // 1
      let [selector, who] =
        await testMemberAccessExecuteCondition.decodeAddRemoveMemberCalldata(
          calldataList[0]
        );
      expect(selector).to.eq(calldataList[0].slice(0, 10));
      expect(who).to.eq(pspAddress);

      // 2
      [selector, who] =
        await testMemberAccessExecuteCondition.decodeAddRemoveMemberCalldata(
          calldataList[1]
        );
      expect(selector).to.eq(calldataList[1].slice(0, 10));
      expect(who).to.eq(bob.address);
    });
  });
});
