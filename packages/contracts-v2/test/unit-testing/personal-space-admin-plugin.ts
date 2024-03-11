import {
  DAO,
  IERC165Upgradeable__factory,
  PersonalSpaceAdminCloneFactory,
  PersonalSpaceAdminCloneFactory__factory,
  PersonalSpaceAdminPlugin,
  PersonalSpaceAdminPlugin__factory,
  SpacePlugin,
  SpacePlugin__factory,
} from '../../typechain';
import {ExecutedEvent} from '../../typechain/@aragon/osx/core/dao/IDAO';
import {ProposalCreatedEvent} from '../../typechain/src/personal/PersonalSpaceAdminPlugin';
import {
  deployWithProxy,
  findEvent,
  findEventTopicLog,
  toBytes32,
} from '../../utils/helpers';
import {getInterfaceID} from '../../utils/interfaces';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  CONTENT_PERMISSION_ID,
  EDITOR_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  SUBSPACE_PERMISSION_ID,
} from './common';
import {
  DAO__factory,
  IPlugin__factory,
  IProposal__factory,
} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

export type InitData = {contentUri: string};
export const defaultInitData: InitData = {
  contentUri: 'ipfs://',
};
export const psvpInterface = new ethers.utils.Interface([
  'function initialize(address)',
  'function executeProposal(bytes,tuple(address,uint256,bytes)[],uint256)',
]);

describe('Personal Space Admin Plugin', function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dao: DAO;
  let personalSpaceVotingPlugin: PersonalSpaceAdminPlugin;
  let personalSpaceVotingCloneFactory: PersonalSpaceAdminCloneFactory;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;
  let dummyActions: any;
  let dummyMetadata: string;

  before(async () => {
    [alice, bob, carol] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    defaultInput = {contentUri: 'ipfs://'};
    dummyActions = [
      {
        to: alice.address,
        data: '0x0000',
        value: 0,
      },
    ];
    dummyMetadata = ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes('0x123456789')
    );

    const PersonalSpaceAdminCloneFactory =
      new PersonalSpaceAdminCloneFactory__factory(alice);
    personalSpaceVotingCloneFactory =
      await PersonalSpaceAdminCloneFactory.deploy();
  });

  beforeEach(async () => {
    // Space
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice)
    );
    await spacePlugin.initialize(
      dao.address,
      defaultInput.contentUri,
      ADDRESS_ZERO
    );

    // Personal Space Voting
    const PersonalSpaceVotingFactory = new PersonalSpaceAdminPlugin__factory(
      alice
    );
    const nonce = await ethers.provider.getTransactionCount(
      personalSpaceVotingCloneFactory.address
    );
    const anticipatedPluginAddress = ethers.utils.getContractAddress({
      from: personalSpaceVotingCloneFactory.address,
      nonce,
    });
    await personalSpaceVotingCloneFactory.deployClone();
    personalSpaceVotingPlugin = PersonalSpaceVotingFactory.attach(
      anticipatedPluginAddress
    );
    await initializePSVPlugin();

    // Alice is editor
    await dao.grant(
      personalSpaceVotingPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID
    );
    // The plugin can execute on the DAO
    await dao.grant(
      dao.address,
      personalSpaceVotingPlugin.address,
      EXECUTE_PERMISSION_ID
    );
    // The DAO can use the Space
    await dao.grant(spacePlugin.address, dao.address, CONTENT_PERMISSION_ID);
    await dao.grant(spacePlugin.address, dao.address, SUBSPACE_PERMISSION_ID);
  });

  function initializePSVPlugin() {
    return personalSpaceVotingPlugin.initialize(dao.address);
  }

  describe('initialize: ', async () => {
    it('reverts if trying to re-initialize', async () => {
      // recreate
      const PersonalSpaceVotingFactory = new PersonalSpaceAdminPlugin__factory(
        alice
      );
      const nonce = await ethers.provider.getTransactionCount(
        personalSpaceVotingCloneFactory.address
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: personalSpaceVotingCloneFactory.address,
        nonce,
      });
      await personalSpaceVotingCloneFactory.deployClone();
      personalSpaceVotingPlugin = PersonalSpaceVotingFactory.attach(
        anticipatedPluginAddress
      );
      // Should work
      await initializePSVPlugin();

      await expect(initializePSVPlugin()).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );
    });
  });

  it('isEditor() returns true when appropriate', async () => {
    expect(await personalSpaceVotingPlugin.isEditor(ADDRESS_ZERO)).to.eq(false);
    expect(await personalSpaceVotingPlugin.isEditor(ADDRESS_ONE)).to.eq(false);
    expect(await personalSpaceVotingPlugin.isEditor(ADDRESS_TWO)).to.eq(false);

    expect(await personalSpaceVotingPlugin.isEditor(alice.address)).to.eq(true);
    expect(await personalSpaceVotingPlugin.isEditor(bob.address)).to.eq(false);
    expect(await personalSpaceVotingPlugin.isEditor(carol.address)).to.eq(
      false
    );

    await dao.grant(
      personalSpaceVotingPlugin.address,
      carol.address,
      EDITOR_PERMISSION_ID
    );

    expect(await personalSpaceVotingPlugin.isEditor(carol.address)).to.eq(true);
  });

  describe('Geo Browser customizations', () => {
    it('Only editors can create and execute proposals', async () => {
      await expect(
        personalSpaceVotingPlugin
          .connect(bob)
          .executeProposal('0x', dummyActions, 0)
      )
        .to.be.revertedWithCustomError(
          personalSpaceVotingPlugin,
          'DaoUnauthorized'
        )
        .withArgs(
          dao.address,
          personalSpaceVotingPlugin.address,
          bob.address,
          EDITOR_PERMISSION_ID
        );
      await expect(
        personalSpaceVotingPlugin
          .connect(carol)
          .executeProposal('0x', dummyActions, 0)
      )
        .to.be.revertedWithCustomError(
          personalSpaceVotingPlugin,
          'DaoUnauthorized'
        )
        .withArgs(
          dao.address,
          personalSpaceVotingPlugin.address,
          carol.address,
          EDITOR_PERMISSION_ID
        );

      // Alice is an editor
      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', dummyActions, 0)
      ).to.emit(personalSpaceVotingPlugin, 'ProposalCreated');
    });

    it('Proposal execution is immediate', async () => {
      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', dummyActions, 0)
      )
        .to.emit(personalSpaceVotingPlugin, 'ProposalExecuted')
        .withArgs(0);
    });

    it('Executed content proposals emit an event', async () => {
      // Encode an action to change some content
      const data = SpacePlugin__factory.createInterface().encodeFunctionData(
        'processGeoProposal',
        [1, 2, '0x']
      );
      const actions = [
        {
          to: spacePlugin.address,
          value: 0,
          data,
        },
      ];

      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', actions, 0)
      ).to.emit(personalSpaceVotingPlugin, 'ProposalCreated');

      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', actions, 0)
      )
        .to.emit(personalSpaceVotingPlugin, 'ProposalExecuted')
        .withArgs(1);

      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', actions, 0)
      )
        .to.emit(spacePlugin, 'GeoProposalProcessed')
        .withArgs(1, 2, '0x');
    });

    it('Approved subspaces emit an event', async () => {
      // Encode an action to accept a subspace
      const data = SpacePlugin__factory.createInterface().encodeFunctionData(
        'acceptSubspace',
        [ADDRESS_TWO]
      );
      const actions = [
        {
          to: spacePlugin.address,
          value: 0,
          data,
        },
      ];

      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', actions, 0)
      ).to.emit(personalSpaceVotingPlugin, 'ProposalCreated');

      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', actions, 0)
      )
        .to.emit(personalSpaceVotingPlugin, 'ProposalExecuted')
        .withArgs(1);

      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', actions, 0)
      )
        .to.emit(spacePlugin, 'SubspaceAccepted')
        .withArgs(ADDRESS_TWO);
    });

    it('Removed subspaces emit an event', async () => {
      // Encode an action to accept a subspace
      const actionsAccept = [
        {
          to: spacePlugin.address,
          value: 0,
          data: SpacePlugin__factory.createInterface().encodeFunctionData(
            'acceptSubspace',
            [ADDRESS_TWO]
          ),
        },
      ];
      const actionsRemove = [
        {
          to: spacePlugin.address,
          value: 0,
          data: SpacePlugin__factory.createInterface().encodeFunctionData(
            'removeSubspace',
            [ADDRESS_TWO]
          ),
        },
      ];

      await personalSpaceVotingPlugin
        .connect(alice)
        .executeProposal('0x', actionsAccept, 0);

      // remove
      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', actionsRemove, 0)
      ).to.emit(personalSpaceVotingPlugin, 'ProposalCreated');

      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', actionsRemove, 0)
      )
        .to.emit(personalSpaceVotingPlugin, 'ProposalExecuted')
        .withArgs(2);

      await expect(
        personalSpaceVotingPlugin
          .connect(alice)
          .executeProposal('0x', actionsRemove, 0)
      )
        .to.emit(spacePlugin, 'SubspaceRemoved')
        .withArgs(ADDRESS_TWO);
    });
  });

  describe('Tests replicated from AdminPlugin', () => {
    describe('plugin interface: ', async () => {
      it('does not support the empty interface', async () => {
        expect(await personalSpaceVotingPlugin.supportsInterface('0xffffffff'))
          .to.be.false;
      });

      it('supports the `IERC165Upgradeable` interface', async () => {
        const iface = IERC165Upgradeable__factory.createInterface();
        expect(
          await personalSpaceVotingPlugin.supportsInterface(
            getInterfaceID(iface)
          )
        ).to.be.true;
      });

      it('supports the `IPlugin` interface', async () => {
        const iface = IPlugin__factory.createInterface();
        expect(
          await personalSpaceVotingPlugin.supportsInterface(
            getInterfaceID(iface)
          )
        ).to.be.true;
      });

      it('supports the `IProposal` interface', async () => {
        const iface = IProposal__factory.createInterface();
        expect(
          await personalSpaceVotingPlugin.supportsInterface(
            getInterfaceID(iface)
          )
        ).to.be.true;
      });

      it('supports the `Admin` interface', async () => {
        expect(
          await personalSpaceVotingPlugin.supportsInterface(
            getInterfaceID(psvpInterface)
          )
        ).to.be.true;
      });
    });

    describe('execute proposal: ', async () => {
      it("fails to call DAO's `execute()` if `EXECUTE_PERMISSION` is not granted to the plugin address", async () => {
        await dao.revoke(
          dao.address,
          personalSpaceVotingPlugin.address,
          EXECUTE_PERMISSION_ID
        );

        await expect(
          personalSpaceVotingPlugin.executeProposal(
            dummyMetadata,
            dummyActions,
            0
          )
        )
          .to.be.revertedWithCustomError(dao, 'Unauthorized')
          .withArgs(
            dao.address,
            personalSpaceVotingPlugin.address,
            EXECUTE_PERMISSION_ID
          );
      });

      it('fails to call `executeProposal()` if `EDITOR_PERMISSION_ID` is not granted for the admin address', async () => {
        await dao.revoke(
          personalSpaceVotingPlugin.address,
          alice.address,
          EDITOR_PERMISSION_ID
        );

        await expect(
          personalSpaceVotingPlugin.executeProposal(
            dummyMetadata,
            dummyActions,
            0
          )
        )
          .to.be.revertedWithCustomError(
            personalSpaceVotingPlugin,
            'DaoUnauthorized'
          )
          .withArgs(
            dao.address,
            personalSpaceVotingPlugin.address,
            alice.address,
            EDITOR_PERMISSION_ID
          );
      });

      it('correctly emits the ProposalCreated event', async () => {
        const currentExpectedProposalId = 0;

        const allowFailureMap = 1;

        const tx = await personalSpaceVotingPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          allowFailureMap
        );

        await expect(tx).to.emit(personalSpaceVotingPlugin, 'ProposalCreated');

        const event = await findEvent<ProposalCreatedEvent>(
          tx,
          'ProposalCreated'
        );

        expect(event).to.be.ok;
        expect(event!.args.proposalId).to.equal(currentExpectedProposalId);
        expect(event!.args.creator).to.equal(alice.address);
        expect(event!.args.metadata).to.equal(dummyMetadata);
        expect(event!.args.actions.length).to.equal(1);
        expect(event!.args.actions[0].to).to.equal(dummyActions[0].to);
        expect(event!.args.actions[0].value).to.equal(dummyActions[0].value);
        expect(event!.args.actions[0].data).to.equal(dummyActions[0].data);
        expect(event!.args.allowFailureMap).to.equal(allowFailureMap);
      });

      it('correctly emits the `ProposalExecuted` event', async () => {
        const currentExpectedProposalId = 0;

        await expect(
          personalSpaceVotingPlugin.executeProposal(
            dummyMetadata,
            dummyActions,
            0
          )
        )
          .to.emit(personalSpaceVotingPlugin, 'ProposalExecuted')
          .withArgs(currentExpectedProposalId);
      });

      it('correctly increments the proposal ID', async () => {
        const currentExpectedProposalId = 0;

        await personalSpaceVotingPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          0
        );

        const nextExpectedProposalId = currentExpectedProposalId + 1;

        const tx = await personalSpaceVotingPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          0
        );

        await expect(tx).to.emit(personalSpaceVotingPlugin, 'ProposalCreated');

        const event = await findEvent<ProposalCreatedEvent>(
          tx,
          'ProposalCreated'
        );

        expect(event).to.be.ok;
        expect(event!.args.proposalId).to.equal(nextExpectedProposalId);
      });

      it("calls the DAO's execute function correctly with proposalId", async () => {
        {
          const proposalId = 0;
          const allowFailureMap = 1;

          const tx = await personalSpaceVotingPlugin.executeProposal(
            dummyMetadata,
            dummyActions,
            allowFailureMap
          );

          const event = await findEventTopicLog<ExecutedEvent>(
            tx,
            DAO__factory.createInterface(),
            'Executed'
          );

          expect(event.args.actor).to.equal(personalSpaceVotingPlugin.address);
          expect(event.args.callId).to.equal(toBytes32(proposalId));
          expect(event.args.actions.length).to.equal(1);
          expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
          expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
          expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
          // note that failureMap is different than allowFailureMap. See DAO.sol for details
          expect(event.args.failureMap).to.equal(0);
        }

        {
          const proposalId = 1;

          const tx = await personalSpaceVotingPlugin.executeProposal(
            dummyMetadata,
            dummyActions,
            0
          );

          const event = await findEventTopicLog<ExecutedEvent>(
            tx,
            DAO__factory.createInterface(),
            'Executed'
          );
          expect(event.args.callId).to.equal(toBytes32(proposalId));
        }
      });
    });
  });
});
