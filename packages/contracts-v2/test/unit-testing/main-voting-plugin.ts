import {
  DAO,
  DAO__factory,
  IDAO,
  MainVotingPlugin,
  MainVotingPlugin__factory,
  MemberAccessPlugin,
  MemberAccessPlugin__factory,
  SpacePlugin,
  SpacePlugin__factory,
} from '../../typechain';
import {ExecutedEvent} from '../../typechain/@aragon/osx/core/dao/DAO';
import {
  // ProposalCreatedEvent,
  ProposalExecutedEvent,
} from '../../typechain/src/governance/MainVotingPlugin';
import {
  deployWithProxy,
  findEvent,
  findEventTopicLog,
  toBytes32,
} from '../../utils/helpers';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  advanceAfterVoteEnd,
  advanceIntoVoteTime,
  EMPTY_DATA,
  EXECUTE_PERMISSION_ID,
  getTime, // MAX_UINT64,
  mineBlock,
  pctToRatio,
  ROOT_PERMISSION_ID,
  UPDATE_ADDRESSES_PERMISSION_ID,
  UPDATE_VOTING_SETTINGS_PERMISSION_ID,
  UPGRADE_PLUGIN_PERMISSION_ID,
  VoteOption,
  VotingMode,
  VotingSettings,
  ZERO_BYTES32,
} from './common';
import {defaultMainVotingSettings} from './common';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {toUtf8Bytes} from 'ethers/lib/utils';
import {ethers} from 'hardhat';

type InitData = {contentUri: string};
const mainVotingPluginInterface = MainVotingPlugin__factory.createInterface();

describe('Main Voting Plugin', function () {
  let signers: SignerWithAddress[];
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let dao: DAO;
  let memberAccessPlugin: MemberAccessPlugin;
  let mainVotingPlugin: MainVotingPlugin;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;

  before(async () => {
    signers = await ethers.getSigners();
    [alice, bob, carol, dave] = signers;
    dao = await deployTestDao(alice);

    defaultInput = {contentUri: 'ipfs://'};
  });

  beforeEach(async () => {
    memberAccessPlugin = await deployWithProxy<MemberAccessPlugin>(
      new MemberAccessPlugin__factory(alice)
    );
    mainVotingPlugin = await deployWithProxy<MainVotingPlugin>(
      new MainVotingPlugin__factory(alice)
    );
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice)
    );

    // inits
    await memberAccessPlugin.initialize(dao.address, {
      proposalDuration: 60 * 60 * 24 * 5,
      mainVotingPlugin: mainVotingPlugin.address,
    });
    await mainVotingPlugin.initialize(dao.address, defaultMainVotingSettings, [
      alice.address,
    ]);
    await spacePlugin.initialize(
      dao.address,
      defaultInput.contentUri,
      ADDRESS_ZERO
    );

    // The plugin can execute on the DAO
    await dao.grant(
      dao.address,
      mainVotingPlugin.address,
      EXECUTE_PERMISSION_ID
    );
    // MemberAccessPlugin can execute on the DAO
    await dao.grant(
      dao.address,
      memberAccessPlugin.address,
      EXECUTE_PERMISSION_ID
    );
    // The DAO can add/remove editors
    await dao.grant(
      mainVotingPlugin.address,
      dao.address,
      UPDATE_ADDRESSES_PERMISSION_ID
    );
    // The DAO can update the plugin settings
    await dao.grant(
      mainVotingPlugin.address,
      dao.address,
      UPDATE_VOTING_SETTINGS_PERMISSION_ID
    );
    // The DAO can upgrade the plugin
    await dao.grant(
      mainVotingPlugin.address,
      dao.address,
      UPGRADE_PLUGIN_PERMISSION_ID
    );
    // The DAO is ROOT on itself
    await dao.grant(dao.address, dao.address, ROOT_PERMISSION_ID);
    // Alice can make the DAO execute arbitrary stuff (test)
    await dao.grant(dao.address, alice.address, EXECUTE_PERMISSION_ID);

    // Alice is already an editor (see initialize)

    // Bob is a member
    await memberAccessPlugin.proposeNewMember('0x', bob.address);
  });

  describe('initialize', async () => {
    it('reverts if trying to re-initialize', async () => {
      await expect(
        memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        })
      ).to.be.revertedWith('Initializable: contract is already initialized');
      await expect(
        mainVotingPlugin.initialize(dao.address, defaultMainVotingSettings, [
          alice.address,
        ])
      ).to.be.revertedWith('Initializable: contract is already initialized');
      await expect(
        spacePlugin.initialize(
          dao.address,
          defaultInput.contentUri,
          ADDRESS_ZERO
        )
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('The plugin has one editor after created', async () => {
      // Alice
      mainVotingPlugin = await deployWithProxy<MainVotingPlugin>(
        new MainVotingPlugin__factory(alice)
      );
      await mainVotingPlugin.initialize(
        dao.address,
        defaultMainVotingSettings,
        [alice.address]
      );
      await mineBlock();

      expect(await mainVotingPlugin.addresslistLength()).to.eq(1);
      expect(await mainVotingPlugin.totalVotingPower(0)).to.eq(0);
      expect(
        await mainVotingPlugin.totalVotingPower(
          (await ethers.provider.getBlockNumber()) - 1
        )
      ).to.eq(1);

      expect(await mainVotingPlugin.isEditor(alice.address)).to.be.true;
      expect(await mainVotingPlugin.isEditor(bob.address)).to.be.false;

      // Bob
      mainVotingPlugin = await deployWithProxy<MainVotingPlugin>(
        new MainVotingPlugin__factory(alice)
      );
      await mainVotingPlugin.initialize(
        dao.address,
        defaultMainVotingSettings,
        [bob.address]
      );
      await mineBlock();

      expect(await mainVotingPlugin.addresslistLength()).to.eq(1);
      expect(await mainVotingPlugin.totalVotingPower(0)).to.eq(0);
      expect(
        await mainVotingPlugin.totalVotingPower(
          (await ethers.provider.getBlockNumber()) - 1
        )
      ).to.eq(1);

      expect(await mainVotingPlugin.isEditor(alice.address)).to.be.false;
      expect(await mainVotingPlugin.isEditor(bob.address)).to.be.true;
    });
  });

  context('Before proposals', () => {
    it('Only members can create proposals', async () => {
      await expect(
        mainVotingPlugin.connect(alice).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.Yes,
          true // auto execute
        )
      ).to.not.be.reverted;

      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      await expect(
        mainVotingPlugin.connect(carol).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      )
        .to.be.revertedWithCustomError(mainVotingPlugin, 'NotAMember')
        .withArgs(carol.address);

      await expect(
        mainVotingPlugin.connect(dave).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      )
        .to.be.revertedWithCustomError(mainVotingPlugin, 'NotAMember')
        .withArgs(dave.address);
    });

    it('Only editors can vote on proposals', async () => {
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      let proposal = await mainVotingPlugin.getProposal(0);
      expect(proposal.executed).to.eq(false);

      // Bob can't vote
      await expect(mainVotingPlugin.connect(bob).vote(0, VoteOption.Yes, false))
        .to.be.reverted;

      // Carol can't vote
      await expect(
        mainVotingPlugin.connect(carol).vote(0, VoteOption.Yes, false)
      ).to.be.reverted;

      // Dave can't vote
      await expect(
        mainVotingPlugin.connect(dave).vote(0, VoteOption.Yes, false)
      ).to.be.reverted;

      proposal = await mainVotingPlugin.getProposal(0);
      expect(proposal.executed).to.eq(false);

      // Alice can vote
      await expect(mainVotingPlugin.vote(0, VoteOption.Yes, true)).to.not.be
        .reverted;

      proposal = await mainVotingPlugin.getProposal(0);
      expect(proposal.executed).to.eq(true);
    });

    it('Only editors can vote when creating proposals', async () => {
      expect(await mainVotingPlugin.isEditor(bob.address)).to.eq(false);

      // Bob can't create and vote
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.Yes,
          true // auto execute
        )
      ).to.be.reverted;

      // Bob can create without mainVotingPlugin
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      // Alice can create and vote
      await expect(
        mainVotingPlugin.connect(alice).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.Yes,
          true // auto execute
        )
      ).to.not.be.reverted;

      // Alice can create without a vote
      await expect(
        mainVotingPlugin.connect(alice).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;
    });

    it('isMember() returns true when appropriate', async () => {
      expect(await memberAccessPlugin.isMember(ADDRESS_ZERO)).to.eq(false);
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(false);
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(false);

      expect(await memberAccessPlugin.isMember(alice.address)).to.eq(true);
      expect(await memberAccessPlugin.isMember(bob.address)).to.eq(true);

      expect(await memberAccessPlugin.isMember(carol.address)).to.eq(false);

      await memberAccessPlugin.proposeNewMember('0x', carol.address);
      expect(await memberAccessPlugin.isMember(carol.address)).to.eq(true);

      await memberAccessPlugin.proposeRemoveMember('0x', carol.address);
      expect(await memberAccessPlugin.isMember(carol.address)).to.eq(false);

      await makeEditor(carol.address);

      expect(await memberAccessPlugin.isMember(carol.address)).to.eq(true);
    });

    it('isEditor() returns true when appropriate', async () => {
      expect(await memberAccessPlugin.isEditor(ADDRESS_ZERO)).to.eq(false);
      expect(await memberAccessPlugin.isEditor(ADDRESS_ONE)).to.eq(false);
      expect(await memberAccessPlugin.isEditor(ADDRESS_TWO)).to.eq(false);

      expect(await memberAccessPlugin.isEditor(alice.address)).to.eq(true);
      expect(await memberAccessPlugin.isEditor(bob.address)).to.eq(false);
      expect(await memberAccessPlugin.isEditor(carol.address)).to.eq(false);

      await makeEditor(carol.address);

      expect(await memberAccessPlugin.isEditor(carol.address)).to.eq(true);
    });
  });

  context('One editor', () => {
    it('Proposals take immediate effect when created by the only editor', async () => {
      expect(await mainVotingPlugin.addresslistLength()).to.eq(1);

      await expect(
        mainVotingPlugin.createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.Yes,
          true // auto execute
        )
      ).to.not.be.reverted;

      const proposal = await mainVotingPlugin.getProposal(0);
      expect(proposal.executed).to.eq(true);
    });

    it("Proposals created by a member require the editor's vote", async () => {
      expect(await mainVotingPlugin.addresslistLength()).to.eq(1);

      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      const proposal = await mainVotingPlugin.getProposal(0);
      expect(proposal.executed).to.eq(false);
    });
  });

  context('Multiple editors', () => {
    it('Proposals created by a member require editor votes', async () => {
      let pid = 0;
      // Carol member
      await memberAccessPlugin.proposeNewMember('0x', carol.address);
      // Bob editor
      await proposeNewEditor(bob.address);

      await expect(createDummyProposal(carol, false)).to.not.be.reverted;
      pid++;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Carol tries to vote
      await expect(
        mainVotingPlugin.connect(carol).vote(pid, VoteOption.Yes, true)
      ).to.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Alice votes
      await expect(mainVotingPlugin.vote(pid, VoteOption.Yes, false)).to.not.be
        .reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Bob votes
      await expect(
        mainVotingPlugin.connect(bob).vote(pid, VoteOption.Yes, false)
      ).to.not.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(true);
    });

    it('Proposals created by an editor require additional votes', async () => {
      let pid = 0;
      // Bob and Carol editors
      await proposeNewEditor(bob.address);
      await proposeNewEditor(carol.address);
      pid++;
      await expect(
        mainVotingPlugin.connect(bob).vote(pid, VoteOption.Yes, true)
      ).to.not.be.reverted;

      // Proposal 1
      await expect(createDummyProposal(alice, false)).to.not.be.reverted;
      pid++;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Alice votes
      await expect(mainVotingPlugin.vote(pid, VoteOption.Yes, false)).to.not.be
        .reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Bob votes (66% yes)
      await expect(
        mainVotingPlugin.connect(bob).vote(pid, VoteOption.Yes, false)
      ).to.not.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(true);

      // Proposal 2
      await expect(createDummyProposal(alice, true)).to.not.be.reverted;
      pid++;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Bob votes (66% yes)
      await expect(
        mainVotingPlugin.connect(bob).vote(pid, VoteOption.Yes, false)
      ).to.not.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(true);
    });
  });

  context('Canceling', () => {
    it('Proposals created by a member can be canceled before they end', async () => {
      const proposalId = 0;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.true;

      // Bob cancels
      await expect(mainVotingPlugin.connect(bob).cancelProposal(proposalId)).to
        .not.be.reverted;

      // No more votes
      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.false;
      await expect(
        mainVotingPlugin.connect(alice).vote(proposalId, VoteOption.Yes, false)
      ).to.be.reverted;
    });

    it('Proposals created by an editor can be canceled before they end', async () => {
      await makeEditor(bob.address);
      expect(await mainVotingPlugin.addresslistLength()).to.eq(2);

      const proposalId = 0;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.Yes,
          true // auto execute
        )
      ).to.not.be.reverted;

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.true;

      // Bob cancels
      await expect(mainVotingPlugin.connect(bob).cancelProposal(proposalId)).to
        .not.be.reverted;

      // No more votes
      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.false;
      await expect(
        mainVotingPlugin.connect(alice).vote(proposalId, VoteOption.Yes, false)
      ).to.be.reverted;
    });

    it('Canceling a proposal emits an event', async () => {
      let proposalId = 0;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      // Bob cancels
      await expect(mainVotingPlugin.connect(bob).cancelProposal(proposalId))
        .to.to.emit(mainVotingPlugin, 'ProposalCanceled')
        .withArgs(proposalId);

      // New proposal
      proposalId = 1;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      // Bob cancels
      await expect(mainVotingPlugin.connect(bob).cancelProposal(proposalId))
        .to.to.emit(mainVotingPlugin, 'ProposalCanceled')
        .withArgs(proposalId);
    });

    it('Proposals cannot be canceled after they end (member created)', async () => {
      let proposalId = 0;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.true;

      let proposal = await mainVotingPlugin.getProposal(proposalId);
      await advanceAfterVoteEnd(proposal.parameters.endDate.toNumber());

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.false;

      // Bob cannot cancel
      await expect(
        mainVotingPlugin.connect(bob).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'ProposalIsNotOpen');

      proposal = await mainVotingPlugin.getProposal(proposalId);
      expect(proposal.executed).to.be.false;

      // New proposal (to be approved)

      proposalId = 1;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      // Alice approves and executes
      await expect(
        mainVotingPlugin.connect(alice).vote(proposalId, VoteOption.Yes, true)
      ).to.not.be.reverted;

      proposal = await mainVotingPlugin.getProposal(proposalId);
      expect(proposal.executed).to.be.true;

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.false;

      // Bob cannot cancel
      await expect(
        mainVotingPlugin.connect(bob).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'ProposalIsNotOpen');
    });

    it('Proposals cannot be canceled after they end (editor created)', async () => {
      await makeEditor(bob.address);
      expect(await mainVotingPlugin.addresslistLength()).to.eq(2);

      let proposalId = 0;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.Yes,
          true // auto execute
        )
      ).to.not.be.reverted;

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.true;

      let proposal = await mainVotingPlugin.getProposal(proposalId);
      await advanceAfterVoteEnd(proposal.parameters.endDate.toNumber());

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.false;

      // Bob cannot cancel
      await expect(
        mainVotingPlugin.connect(bob).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'ProposalIsNotOpen');

      proposal = await mainVotingPlugin.getProposal(proposalId);
      expect(proposal.executed).to.be.false;

      // New proposal (to be approved)

      proposalId = 1;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.Yes,
          true // auto execute
        )
      ).to.not.be.reverted;

      // Alice approves and executes
      await expect(
        mainVotingPlugin.connect(alice).vote(proposalId, VoteOption.Yes, true)
      ).to.not.be.reverted;

      proposal = await mainVotingPlugin.getProposal(proposalId);
      expect(proposal.executed).to.be.true;

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.false;

      // Bob cannot cancel
      await expect(
        mainVotingPlugin.connect(bob).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'ProposalIsNotOpen');
    });

    it('Proposals can only be canceled by the creator (member)', async () => {
      const proposalId = 0;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.None,
          true // auto execute
        )
      ).to.not.be.reverted;

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.true;

      // They cannot cancel
      await expect(
        mainVotingPlugin.connect(alice).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'OnlyCreatorCanCancel');
      await expect(
        mainVotingPlugin.connect(carol).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'OnlyCreatorCanCancel');
      await expect(
        mainVotingPlugin.connect(dave).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'OnlyCreatorCanCancel');

      // Still open
      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.true;

      // Bob can cancel
      await expect(mainVotingPlugin.connect(bob).cancelProposal(proposalId)).to
        .not.be.reverted;

      // No more votes
      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.false;
      await expect(
        mainVotingPlugin.connect(alice).vote(proposalId, VoteOption.Yes, false)
      ).to.be.reverted;
    });

    it('Proposals can only be canceled by the creator (editor)', async () => {
      await makeEditor(bob.address);
      expect(await mainVotingPlugin.addresslistLength()).to.eq(2);

      const proposalId = 0;
      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes('ipfs://'),
          [],
          0, // fail safe
          VoteOption.Yes,
          true // auto execute
        )
      ).to.not.be.reverted;

      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.true;

      // They cannot cancel
      await expect(
        mainVotingPlugin.connect(alice).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'OnlyCreatorCanCancel');
      await expect(
        mainVotingPlugin.connect(carol).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'OnlyCreatorCanCancel');
      await expect(
        mainVotingPlugin.connect(dave).cancelProposal(proposalId)
      ).to.be.revertedWithCustomError(mainVotingPlugin, 'OnlyCreatorCanCancel');

      // Still open
      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.true;

      // Bob can cancel
      await expect(mainVotingPlugin.connect(bob).cancelProposal(proposalId)).to
        .not.be.reverted;

      // No more votes
      expect(
        await mainVotingPlugin.canVote(
          proposalId,
          alice.address,
          VoteOption.Yes
        )
      ).to.be.false;
      await expect(
        mainVotingPlugin.connect(alice).vote(proposalId, VoteOption.Yes, false)
      ).to.be.reverted;
    });
  });

  context('After proposals', () => {
    it('Adding an editor increases the editorCount', async () => {
      expect(await mainVotingPlugin.addresslistLength()).to.eq(1);

      // Add Bob
      await proposeNewEditor(bob.address);
      expect(await mainVotingPlugin.addresslistLength()).to.eq(2);
      expect(await mainVotingPlugin.isEditor(bob.address)).to.eq(true);

      // Propose Carol
      await proposeNewEditor(carol.address);
      expect(await mainVotingPlugin.addresslistLength()).to.eq(2);
      expect(await mainVotingPlugin.isEditor(carol.address)).to.eq(false);

      // Confirm Carol
      await expect(mainVotingPlugin.connect(bob).vote(1, VoteOption.Yes, true))
        .to.not.be.reverted;
      expect(await mainVotingPlugin.addresslistLength()).to.eq(3);
      expect(await mainVotingPlugin.isEditor(carol.address)).to.eq(true);
    });

    it('Removing an editor decreases the editorCount', async () => {
      // Add Bob and Carol
      await proposeNewEditor(bob.address); // Alice votes yes as the creator
      await proposeNewEditor(carol.address); // Alice votes yes as the creator
      await expect(mainVotingPlugin.connect(bob).vote(1, VoteOption.Yes, true))
        .to.not.be.reverted;
      expect(await mainVotingPlugin.addresslistLength()).to.eq(3);

      // Propose removing Carol
      await proposeRemoveEditor(carol.address); // Alice votes yes as the creator
      expect(await mainVotingPlugin.addresslistLength()).to.eq(3);
      await expect(mainVotingPlugin.connect(bob).vote(2, VoteOption.Yes, true))
        .to.not.be.reverted;
      expect(await mainVotingPlugin.addresslistLength()).to.eq(2);

      // Propose removing Bob
      await proposeRemoveEditor(bob.address);
      await expect(mainVotingPlugin.connect(bob).vote(3, VoteOption.Yes, true))
        .to.not.be.reverted;
      expect(await mainVotingPlugin.addresslistLength()).to.eq(1);
    });

    it('Attempting to remove the last editor reverts', async () => {
      // Try to remove Alice
      await expect(pullEditor(alice.address)).to.be.revertedWithCustomError(
        mainVotingPlugin,
        'NoEditorsLeft'
      );
      expect(await mainVotingPlugin.addresslistLength()).to.eq(1);

      // Add Bob
      await proposeNewEditor(bob.address);
      expect(await mainVotingPlugin.addresslistLength()).to.eq(2);
      expect(await mainVotingPlugin.isEditor(bob.address)).to.be.true;
      await mineBlock();

      // Remove Bob
      await expect(proposeRemoveEditor(bob.address)).to.not.be.reverted;
      await expect(mainVotingPlugin.connect(bob).vote(1, VoteOption.Yes, true))
        .to.not.be.reverted;
      expect(await mainVotingPlugin.addresslistLength()).to.eq(1);

      // Try to remove Alice
      await expect(pullEditor(alice.address)).to.be.revertedWithCustomError(
        mainVotingPlugin,
        'NoEditorsLeft'
      );
    });

    it('Attempting to vote twice fails (replacement disabled)', async () => {
      // Add Bob
      await proposeNewEditor(bob.address); // Alice votes yes as the creator

      // Propose Carol
      await proposeNewEditor(carol.address); // Alice votes yes as the creator

      // Vote again
      await expect(
        mainVotingPlugin.connect(alice).vote(1, VoteOption.Yes, true)
      ).to.be.reverted;
    });

    it('Approved proposals can be executed by anyone after passed', async () => {
      const pid = 0;
      await expect(createDummyProposal(bob, false)).to.not.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Carol cannot execute
      await expect(mainVotingPlugin.connect(carol).execute(pid)).to.be.reverted;

      // Alice approves
      await expect(mainVotingPlugin.vote(pid, VoteOption.Yes, false)).to.not.be
        .reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(true);

      // Carol executes
      await expect(mainVotingPlugin.connect(carol).execute(pid)).to.not.be
        .reverted;
    });

    it('Rejected proposals cannot be executed', async () => {
      let pid = 0;
      await expect(createDummyProposal(bob, false)).to.not.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Carol cannot execute
      await expect(mainVotingPlugin.connect(carol).execute(pid)).to.be.reverted;

      // Alice rejects
      await expect(mainVotingPlugin.vote(pid, VoteOption.No, false)).to.not.be
        .reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Carol cannot execute
      await expect(mainVotingPlugin.connect(carol).execute(pid)).to.be.reverted;

      //

      // Now with Bob as editor
      await proposeNewEditor(bob.address); // Alice auto approves
      pid++;
      await expect(createDummyProposal(bob, false)).to.not.be.reverted;
      pid++;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Carol cannot execute
      await expect(mainVotingPlugin.connect(carol).execute(pid)).to.be.reverted;

      // Alice rejects
      await expect(mainVotingPlugin.vote(pid, VoteOption.No, false)).to.not.be
        .reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Bob rejects
      await expect(
        mainVotingPlugin.connect(bob).vote(pid, VoteOption.No, false)
      ).to.not.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Carol cannot execute
      await expect(mainVotingPlugin.connect(carol).execute(pid)).to.be.reverted;
    });

    it('The DAO can update the settings', async () => {
      await expect(
        mainVotingPlugin.createProposal(
          toUtf8Bytes('ipfs://'),
          [
            {
              to: mainVotingPlugin.address,
              value: 0,
              data: mainVotingPluginInterface.encodeFunctionData(
                'updateVotingSettings',
                [
                  {
                    votingMode: 0,
                    supportThreshold: 12345,
                    minParticipation: 23456,
                    duration: 60 * 60 * 3,
                  },
                ]
              ),
            },
          ],
          0, // fail safe
          VoteOption.Yes,
          true // auto execute
        )
      )
        .to.emit(mainVotingPlugin, 'VotingSettingsUpdated')
        .withArgs(0, 12345, 23456, 60 * 60 * 3);
    });

    it('The DAO can add editors', async () => {
      // Nobody else can
      await expect(mainVotingPlugin.connect(alice).addEditor(bob.address)).to.be
        .reverted;
      await expect(mainVotingPlugin.connect(bob).addEditor(bob.address)).to.be
        .reverted;
      await expect(mainVotingPlugin.connect(carol).addEditor(dave.address)).to
        .be.reverted;
      await expect(mainVotingPlugin.connect(dave).addEditor(dave.address)).to.be
        .reverted;

      // The DAO can
      const actions: IDAO.ActionStruct[] = [
        {
          to: mainVotingPlugin.address,
          value: 0,
          data: mainVotingPluginInterface.encodeFunctionData('addEditor', [
            dave.address,
          ]),
        },
      ];

      await expect(dao.execute(ZERO_BYTES32, actions, 0)).to.not.be.reverted;
    });

    it('The DAO can remove editors', async () => {
      await makeEditor(bob.address);

      // Nobody else can
      await expect(mainVotingPlugin.connect(alice).removeEditor(bob.address)).to
        .be.reverted;
      await expect(mainVotingPlugin.connect(bob).removeEditor(bob.address)).to
        .be.reverted;
      await expect(mainVotingPlugin.connect(carol).removeEditor(bob.address)).to
        .be.reverted;
      await expect(mainVotingPlugin.connect(dave).removeEditor(bob.address)).to
        .be.reverted;

      // The DAO can
      const actions: IDAO.ActionStruct[] = [
        {
          to: mainVotingPlugin.address,
          value: 0,
          data: mainVotingPluginInterface.encodeFunctionData('removeEditor', [
            bob.address,
          ]),
        },
      ];

      await expect(dao.execute(ZERO_BYTES32, actions, 0)).to.not.be.reverted;
    });

    it('The DAO can upgrade the plugin', async () => {
      // Nobody else can
      await expect(mainVotingPlugin.connect(alice).upgradeTo(ADDRESS_ONE)).to.be
        .reverted;
      await expect(mainVotingPlugin.connect(bob).upgradeTo(ADDRESS_ONE)).to.be
        .reverted;
      await expect(
        mainVotingPlugin.connect(carol).upgradeToAndCall(
          mainVotingPlugin.implementation(), // upgrade to itself
          EMPTY_DATA
        )
      ).to.be.reverted;
      await expect(
        mainVotingPlugin.connect(dave).upgradeToAndCall(
          mainVotingPlugin.implementation(), // upgrade to itself
          EMPTY_DATA
        )
      ).to.be.reverted;

      // The DAO can
      const actions: IDAO.ActionStruct[] = [
        {
          to: mainVotingPlugin.address,
          value: 0,
          data: mainVotingPluginInterface.encodeFunctionData('upgradeTo', [
            await mainVotingPlugin.implementation(),
          ]),
        },
        {
          to: mainVotingPlugin.address,
          value: 0,
          data: mainVotingPluginInterface.encodeFunctionData(
            'supportsInterface',
            ['0x12345678']
          ),
        },
      ];

      await expect(dao.execute(ZERO_BYTES32, actions, 0)).to.not.be.reverted;
    });
  });

  // Helpers
  const createDummyProposal = (proposer = alice, approving = false) => {
    const actions: IDAO.ActionStruct[] = [
      {
        to: dao.address,
        value: 0,
        data: '0x',
      },
    ];

    return mainVotingPlugin
      .connect(proposer)
      .createProposal(
        toUtf8Bytes('ipfs://'),
        actions,
        0, // fail safe
        approving ? VoteOption.Yes : VoteOption.None,
        true // auto execute
      )
      .then(tx => tx.wait());
  };

  const proposeNewEditor = (_editor: string, proposer = alice) => {
    const actions: IDAO.ActionStruct[] = [
      {
        to: mainVotingPlugin.address,
        value: 0,
        data: mainVotingPluginInterface.encodeFunctionData('addEditor', [
          _editor,
        ]),
      },
    ];

    return mainVotingPlugin
      .connect(proposer)
      .createProposal(
        toUtf8Bytes('ipfs://'),
        actions,
        0, // fail safe
        VoteOption.Yes,
        true // auto execute
      )
      .then(tx => tx.wait());
  };

  const proposeRemoveEditor = (_editor: string, proposer = alice) => {
    const actions: IDAO.ActionStruct[] = [
      {
        to: mainVotingPlugin.address,
        value: 0,
        data: mainVotingPluginInterface.encodeFunctionData('removeEditor', [
          _editor,
        ]),
      },
    ];

    return mainVotingPlugin
      .connect(proposer)
      .createProposal(
        toUtf8Bytes('ipfs://'),
        actions,
        0, // fail safe
        VoteOption.Yes,
        true // auto execute
      )
      .then(tx => tx.wait());
  };

  function makeEditor(targetAddress: string) {
    return dao
      .grant(
        mainVotingPlugin.address,
        alice.address,
        UPDATE_ADDRESSES_PERMISSION_ID
      )
      .then(tx => tx.wait())
      .then(() => mainVotingPlugin.addEditor(targetAddress))
      .then(tx => tx.wait())
      .then(() =>
        dao.revoke(
          mainVotingPlugin.address,
          alice.address,
          UPDATE_ADDRESSES_PERMISSION_ID
        )
      );
  }

  function pullEditor(targetAddress: string) {
    return dao
      .grant(
        mainVotingPlugin.address,
        alice.address,
        UPDATE_ADDRESSES_PERMISSION_ID
      )
      .then(tx => tx.wait())
      .then(() => mainVotingPlugin.removeEditor(targetAddress))
      .then(tx => tx.wait())
      .then(() =>
        dao.revoke(
          mainVotingPlugin.address,
          alice.address,
          UPDATE_ADDRESSES_PERMISSION_ID
        )
      );
  }
});

// TESTS REPLIACTED FROM THE ORIGINAL ADDRESS LIST PLUGIN

describe('Tests replicated from the original AddressList plugin', async () => {
  let signers: SignerWithAddress[];
  let dao: DAO;
  let mainVotingPlugin: MainVotingPlugin;
  let memberAccessPlugin: MemberAccessPlugin;

  let votingSettings: VotingSettings;
  let id = 0;
  let startDate: number;
  let endDate: number;
  let dummyMetadata: string;
  let dummyActions: IDAO.ActionStruct[];
  const startOffset = 10;

  before(async () => {
    signers = (await ethers.getSigners()).slice(0, 10);
    dao = await deployTestDao(signers[0]);
  });

  beforeEach(async () => {
    mainVotingPlugin = await deployWithProxy<MainVotingPlugin>(
      new MainVotingPlugin__factory(signers[0])
    );
    memberAccessPlugin = await deployWithProxy<MemberAccessPlugin>(
      new MemberAccessPlugin__factory(signers[0])
    );

    // The plugin can execute on the DAO
    await dao.grant(
      dao.address,
      mainVotingPlugin.address,
      EXECUTE_PERMISSION_ID
    );
    // MemberAccessPlugin can execute on the DAO
    await dao.grant(
      dao.address,
      memberAccessPlugin.address,
      EXECUTE_PERMISSION_ID
    );
    // The DAO can update the plugin addresses
    await dao.grant(
      mainVotingPlugin.address,
      dao.address,
      UPDATE_ADDRESSES_PERMISSION_ID
    );
    // The DAO can update the plugin settings
    await dao.grant(
      mainVotingPlugin.address,
      dao.address,
      UPDATE_VOTING_SETTINGS_PERMISSION_ID
    );
    // The DAO can upgrade the plugin
    await dao.grant(
      mainVotingPlugin.address,
      dao.address,
      UPGRADE_PLUGIN_PERMISSION_ID
    );
    // The DAO is ROOT on itself
    await dao.grant(dao.address, dao.address, ROOT_PERMISSION_ID);
    // Signers[0] can make the DAO execute testing actions
    await dao.grant(dao.address, signers[0].address, EXECUTE_PERMISSION_ID);

    // Values
    id = 0;
    votingSettings = JSON.parse(JSON.stringify(defaultMainVotingSettings));
    dummyMetadata = ethers.utils.hexlify(ethers.utils.toUtf8Bytes('ipfs://'));
    dummyActions = [
      {
        to: signers[0].address,
        data: '0x00000000',
        value: 0,
      },
    ];
  });

  describe('Proposal + Execute:', async () => {
    context('Standard Mode', async () => {
      beforeEach(async () => {
        votingSettings.votingMode = VotingMode.Standard;

        await mainVotingPlugin.initialize(dao.address, votingSettings, [
          signers[0].address,
        ]);
        await memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        });
        await makeMembers(signers);
        await makeEditors(signers.slice(1)); // editors 2-10
        await mineBlock();

        startDate = (await getTime()) + startOffset;
        endDate = startDate + votingSettings.duration + startOffset;

        await mainVotingPlugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          VoteOption.None,
          false
        );
      });

      it('reverts on voting None', async () => {
        await advanceIntoVoteTime(startDate, endDate);
        const block = await ethers.provider.getBlockNumber();
        expect(await mainVotingPlugin.isEditor(signers[0].address)).to.eq(true);
        expect(await mainVotingPlugin.isListed(signers[0].address)).to.eq(true);
        expect(
          await mainVotingPlugin.isListedAtBlock(signers[0].address, block - 1)
        ).to.eq(true);

        // Check that voting is possible but don't vote using `callStatic`
        await expect(
          mainVotingPlugin.callStatic.vote(id, VoteOption.Yes, false)
        ).not.to.be.reverted;

        await expect(mainVotingPlugin.vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.None);
      });

      it('reverts on vote replacement', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await mainVotingPlugin.vote(id, VoteOption.Yes, false);

        // Try to replace the vote
        await expect(mainVotingPlugin.vote(id, VoteOption.Yes, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.Yes);
        await expect(mainVotingPlugin.vote(id, VoteOption.No, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.No);
        await expect(mainVotingPlugin.vote(id, VoteOption.Abstain, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.Abstain);
        await expect(mainVotingPlugin.vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.None);
      });

      it('cannot early execute', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3, 4, 5], // 6 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('can execute normally if participation and support are met', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2], // 3 votes
          no: [3, 4], // 2 votes
          abstain: [5, 6], // 2 votes
        });

        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        const proposal = await mainVotingPlugin.getProposal(id);
        expect(proposal.open).to.be.false;
        expect(proposal.tally.yes.toNumber()).to.eq(3);
        expect(proposal.tally.no.toNumber()).to.eq(2);
        expect(proposal.tally.abstain.toNumber()).to.eq(2);
        expect(proposal.executed).to.be.false;

        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;

        expect(await mainVotingPlugin.canExecute(id)).to.be.true;
      });

      it('does not execute early when voting with the `tryEarlyExecution` option', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3, 4], // 5 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        expect((await mainVotingPlugin.getProposal(id)).executed).to.be.false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        // `tryEarlyExecution` is turned on but the vote is not decided yet
        await mainVotingPlugin
          .connect(signers[5])
          .vote(id, VoteOption.Yes, true);
        expect((await mainVotingPlugin.getProposal(id)).executed).to.be.false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        // `tryEarlyExecution` is turned off and the vote is decided
        await mainVotingPlugin
          .connect(signers[6])
          .vote(id, VoteOption.Yes, false);
        expect((await mainVotingPlugin.getProposal(id)).executed).to.be.false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        // `tryEarlyExecution` is turned on and the vote is decided
        await mainVotingPlugin
          .connect(signers[7])
          .vote(id, VoteOption.Yes, true);
        expect((await mainVotingPlugin.getProposal(id)).executed).to.be.false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('reverts if vote is not decided yet', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await expect(mainVotingPlugin.execute(id))
          .to.be.revertedWithCustomError(
            mainVotingPlugin,
            'ProposalExecutionForbidden'
          )
          .withArgs(id);
      });
    });

    context('Early Execution Mode', async () => {
      beforeEach(async () => {
        votingSettings.votingMode = VotingMode.EarlyExecution;

        await mainVotingPlugin.initialize(dao.address, votingSettings, [
          signers[0].address,
        ]);
        await memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        });
        await makeMembers(signers);
        await makeEditors(signers.slice(1)); // editors 2-10

        startDate = (await getTime()) + startOffset;
        endDate = startDate + votingSettings.duration;

        await mainVotingPlugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          VoteOption.None,
          false
        );
      });

      it('increases the yes, no, and abstain count and emits correct events', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await expect(
          mainVotingPlugin.connect(signers[0]).vote(id, VoteOption.Yes, false)
        )
          .to.emit(mainVotingPlugin, 'VoteCast')
          .withArgs(id, signers[0].address, VoteOption.Yes, 1);

        let proposal = await mainVotingPlugin.getProposal(id);
        expect(proposal.tally.yes).to.equal(1);
        expect(proposal.tally.no).to.equal(0);
        expect(proposal.tally.abstain).to.equal(0);

        await expect(
          mainVotingPlugin.connect(signers[1]).vote(id, VoteOption.No, false)
        )
          .to.emit(mainVotingPlugin, 'VoteCast')
          .withArgs(id, signers[1].address, VoteOption.No, 1);

        proposal = await mainVotingPlugin.getProposal(id);
        expect(proposal.tally.yes).to.equal(1);
        expect(proposal.tally.no).to.equal(1);
        expect(proposal.tally.abstain).to.equal(0);

        await expect(
          mainVotingPlugin
            .connect(signers[2])
            .vote(id, VoteOption.Abstain, false)
        )
          .to.emit(mainVotingPlugin, 'VoteCast')
          .withArgs(id, signers[2].address, VoteOption.Abstain, 1);

        proposal = await mainVotingPlugin.getProposal(id);
        expect(proposal.tally.yes).to.equal(1);
        expect(proposal.tally.no).to.equal(1);
        expect(proposal.tally.abstain).to.equal(1);
      });

      it('reverts on voting None', async () => {
        await advanceIntoVoteTime(startDate, endDate);
        const block = await ethers.provider.getBlockNumber();
        expect(await mainVotingPlugin.isEditor(signers[0].address)).to.eq(true);
        expect(await mainVotingPlugin.isListed(signers[0].address)).to.eq(true);
        expect(
          await mainVotingPlugin.isListedAtBlock(signers[0].address, block - 1)
        ).to.eq(true);

        // Check that voting is possible but don't vote using `callStatic`
        await expect(
          mainVotingPlugin.callStatic.vote(id, VoteOption.Yes, false)
        ).not.to.be.reverted;

        await expect(mainVotingPlugin.vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.None);
      });

      it('reverts on vote replacement', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await mainVotingPlugin.vote(id, VoteOption.Yes, false);

        // Try to replace the vote
        await expect(mainVotingPlugin.vote(id, VoteOption.Yes, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.Yes);
        await expect(mainVotingPlugin.vote(id, VoteOption.No, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.No);
        await expect(mainVotingPlugin.vote(id, VoteOption.Abstain, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.Abstain);
        await expect(mainVotingPlugin.vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.None);
      });

      it('can execute early if participation is large enough', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3, 4, 5], // 6 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;
      });

      it('can execute normally if participation and support are met', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2], // 3 votes
          no: [3, 4], // 2 votes
          abstain: [5, 6], // 2 votes
        });

        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;

        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        const proposal = await mainVotingPlugin.getProposal(id);
        expect(proposal.open).to.be.false;
        expect(proposal.tally.yes.toNumber()).to.eq(3);
        expect(proposal.tally.no.toNumber()).to.eq(2);
        expect(proposal.tally.abstain.toNumber()).to.eq(2);
        expect(proposal.executed).to.be.false;

        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;

        expect(await mainVotingPlugin.canExecute(id)).to.be.true;
      });

      it('executes the vote immediately when the vote is decided early and the `tryEarlyExecution` option is selected', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3], // 4 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        // `tryEarlyExecution` is turned on but the vote is not decided yet
        await mainVotingPlugin
          .connect(signers[4])
          .vote(id, VoteOption.Yes, true);
        expect((await mainVotingPlugin.getProposal(id)).executed).to.be.false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        // `tryEarlyExecution` is turned off and the vote is decided
        await mainVotingPlugin
          .connect(signers[5])
          .vote(id, VoteOption.Yes, false);
        expect((await mainVotingPlugin.getProposal(id)).executed).to.be.false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;

        // `tryEarlyExecution` is turned on and the vote is decided
        const tx = await mainVotingPlugin
          .connect(signers[6])
          .vote(id, VoteOption.Abstain, true);
        {
          const event = await findEventTopicLog<ExecutedEvent>(
            tx,
            DAO__factory.createInterface(),
            'Executed'
          );

          expect(event.args.actor).to.equal(mainVotingPlugin.address);
          expect(event.args.callId).to.equal(toBytes32(id));
          expect(event.args.actions.length).to.equal(1);
          expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
          expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
          expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
          expect(event.args.execResults).to.deep.equal(['0x']);

          expect((await mainVotingPlugin.getProposal(id)).executed).to.be.true;
        }

        // check for the `ProposalExecuted` event in the voting contract
        {
          const event = await findEvent<ProposalExecutedEvent>(
            tx,
            'ProposalExecuted'
          );
          expect(event!.args.proposalId).to.equal(id);
        }

        // calling execute again should fail
        await expect(mainVotingPlugin.execute(id))
          .to.be.revertedWithCustomError(
            mainVotingPlugin,
            'ProposalExecutionForbidden'
          )
          .withArgs(id);
      });

      it('reverts if vote is not decided yet', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await expect(mainVotingPlugin.execute(id))
          .to.be.revertedWithCustomError(
            mainVotingPlugin,
            'ProposalExecutionForbidden'
          )
          .withArgs(id);
      });
    });

    context('Vote Replacement Mode', async () => {
      beforeEach(async () => {
        votingSettings.votingMode = VotingMode.VoteReplacement;

        await mainVotingPlugin.initialize(dao.address, votingSettings, [
          signers[0].address,
        ]);
        await memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        });
        await makeMembers(signers);
        await makeEditors(signers.slice(1)); // editors 2-10

        startDate = (await getTime()) + startOffset;
        endDate = startDate + votingSettings.duration;

        await mainVotingPlugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          VoteOption.None,
          false
        );
      });

      it('reverts on voting None', async () => {
        await advanceIntoVoteTime(startDate, endDate);
        const block = await ethers.provider.getBlockNumber();
        expect(await mainVotingPlugin.isEditor(signers[0].address)).to.eq(true);
        expect(await mainVotingPlugin.isListed(signers[0].address)).to.eq(true);
        expect(
          await mainVotingPlugin.isListedAtBlock(signers[0].address, block - 1)
        ).to.eq(true);

        // Check that voting is possible but don't vote using `callStatic`
        await expect(
          mainVotingPlugin.callStatic.vote(id, VoteOption.Yes, false)
        ).not.to.be.reverted;

        await expect(mainVotingPlugin.vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.None);
      });

      it('should allow vote replacement but not double-count votes by the same address', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await mainVotingPlugin.vote(id, VoteOption.Yes, false);
        await mainVotingPlugin.vote(id, VoteOption.Yes, false);
        expect((await mainVotingPlugin.getProposal(id)).tally.yes).to.equal(1);
        expect((await mainVotingPlugin.getProposal(id)).tally.no).to.equal(0);
        expect((await mainVotingPlugin.getProposal(id)).tally.abstain).to.equal(
          0
        );

        await mainVotingPlugin.vote(id, VoteOption.No, false);
        await mainVotingPlugin.vote(id, VoteOption.No, false);
        expect((await mainVotingPlugin.getProposal(id)).tally.yes).to.equal(0);
        expect((await mainVotingPlugin.getProposal(id)).tally.no).to.equal(1);
        expect((await mainVotingPlugin.getProposal(id)).tally.abstain).to.equal(
          0
        );

        await mainVotingPlugin.vote(id, VoteOption.Abstain, false);
        await mainVotingPlugin.vote(id, VoteOption.Abstain, false);
        expect((await mainVotingPlugin.getProposal(id)).tally.yes).to.equal(0);
        expect((await mainVotingPlugin.getProposal(id)).tally.no).to.equal(0);
        expect((await mainVotingPlugin.getProposal(id)).tally.abstain).to.equal(
          1
        );

        await expect(mainVotingPlugin.vote(id, VoteOption.None, false))
          .to.be.revertedWithCustomError(mainVotingPlugin, 'VoteCastForbidden')
          .withArgs(id, signers[0].address, VoteOption.None);
      });

      it('cannot early execute', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3, 4, 5], // 6 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('can execute normally if participation and support are met', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2], // 3 votes
          no: [3, 4], // 2 votes
          abstain: [5, 6], // 2 votes
        });

        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        const proposal = await mainVotingPlugin.getProposal(id);
        expect(proposal.open).to.be.false;
        expect(proposal.tally.yes.toNumber()).to.eq(3);
        expect(proposal.tally.no.toNumber()).to.eq(2);
        expect(proposal.tally.abstain.toNumber()).to.eq(2);
        expect(proposal.executed).to.be.false;

        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;

        expect(await mainVotingPlugin.canExecute(id)).to.be.true;
      });

      it('does not execute early when voting with the `tryEarlyExecution` option', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3, 4], // 5 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        // `tryEarlyExecution` is turned on but the vote is not decided yet
        await mainVotingPlugin
          .connect(signers[4])
          .vote(id, VoteOption.Yes, true);
        expect((await mainVotingPlugin.getProposal(id)).executed).to.be.false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        // `tryEarlyExecution` is turned off and the vote is decided
        await mainVotingPlugin
          .connect(signers[5])
          .vote(id, VoteOption.Yes, false);
        expect((await mainVotingPlugin.getProposal(id)).executed).to.be.false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        // `tryEarlyExecution` is turned on and the vote is decided
        await mainVotingPlugin
          .connect(signers[5])
          .vote(id, VoteOption.Yes, true);
        expect((await mainVotingPlugin.getProposal(id)).executed).to.be.false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('reverts if vote is not decided yet', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await expect(mainVotingPlugin.execute(id))
          .to.be.revertedWithCustomError(
            mainVotingPlugin,
            'ProposalExecutionForbidden'
          )
          .withArgs(id);
      });
    });
  });

  describe('Different configurations:', async () => {
    describe('A simple majority vote with >50% support and >=25% participation required', async () => {
      beforeEach(async () => {
        votingSettings.minParticipation = pctToRatio(25);

        await mainVotingPlugin.initialize(dao.address, votingSettings, [
          signers[0].address,
        ]);
        await memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        });
        await makeMembers(signers);
        await makeEditors(signers.slice(1)); // editors 2-10

        startDate = (await getTime()) + startOffset;
        endDate = startDate + votingSettings.duration;

        await mainVotingPlugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          VoteOption.None,
          false
        );
      });

      it('does not execute if support is high enough but participation is too low', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await mainVotingPlugin
          .connect(signers[0])
          .vote(id, VoteOption.Yes, false);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('does not execute if participation is high enough but support is too low', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0], // 1 votes
          no: [1, 2], // 2 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('executes after the duration if participation and support are met', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2], // 3 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true; // all criteria are met
      });

      it('executes early if participation and support are met and the vote outcome cannot change anymore', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3, 4], // 4 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await mainVotingPlugin
          .connect(signers[5])
          .vote(id, VoteOption.Yes, false);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [],
          no: [6, 7, 8, 9], // 4 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;
      });
    });

    describe('A special majority vote with >50% support and >=75% participation required and early execution enabled', async () => {
      beforeEach(async () => {
        votingSettings.minParticipation = pctToRatio(75);

        await mainVotingPlugin.initialize(dao.address, votingSettings, [
          signers[0].address,
        ]);
        await memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        });
        await makeMembers(signers);
        await makeEditors(signers.slice(1)); // editors 2-10

        startDate = (await getTime()) + startOffset;
        endDate = startDate + votingSettings.duration;

        await mainVotingPlugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          VoteOption.None,
          false
        );
      });

      it('does not execute if support is high enough but participation is too low', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await mainVotingPlugin
          .connect(signers[0])
          .vote(id, VoteOption.Yes, false);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('does not execute if participation is high enough but support is too low', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0], // 1 votes
          no: [1, 2, 3, 4, 5, 6, 7], // 7 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('executes after the duration if participation and support thresholds are met', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2], // 3 votes
          no: [3, 4], // 2 votes
          abstain: [5, 6, 7], // 3 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;
      });

      it('should not allow the vote to pass if the minimum participation is not reached', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3, 4, 5], // 6 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('executes early if the participation exceeds the support threshold (assuming the latter is > 50%)', async () => {
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3], // 4 votes
          no: [4, 5, 6], // 3 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        await mainVotingPlugin
          .connect(signers[7])
          .vote(id, VoteOption.Yes, false);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false; // participation is met but not support

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false; // Still not sufficient for early execution because the support could still be <= 50 if the two remaining voters vote no

        await mainVotingPlugin
          .connect(signers[8])
          .vote(id, VoteOption.Abstain, false);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true; // The vote` outcome cannot change anymore (5 yes, 3 no, 1 abstain)

        await advanceAfterVoteEnd(endDate);

        // this doesn't change after the vote is over
        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;
      });
    });

    describe('An edge case with `supportThreshold = 0` and `minParticipation = 0` in early execution mode activated', async () => {
      beforeEach(async () => {
        votingSettings.supportThreshold = pctToRatio(0);
        votingSettings.minParticipation = pctToRatio(0);

        await mainVotingPlugin.initialize(dao.address, votingSettings, [
          signers[0].address,
        ]);
        await memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        });
        await makeMembers(signers);
        await makeEditors(signers.slice(1)); // editors 2-10

        startDate = (await getTime()) + startOffset;
        endDate = startDate + votingSettings.duration;

        await mainVotingPlugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          VoteOption.None,
          false
        );
      });

      it('does not execute with 0 votes', async () => {
        // does not execute early
        await advanceIntoVoteTime(startDate, endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        // does not execute normally
        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('executes if participation and support are met', async () => {
        // Check if the proposal can execute early
        await advanceIntoVoteTime(startDate, endDate);

        await mainVotingPlugin
          .connect(signers[0])
          .vote(id, VoteOption.Yes, false);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;

        // Check if the proposal can execute normally
        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;
      });
    });

    describe('An edge case with `supportThreshold = 99.9999%` and `minParticipation = 100%` in early execution mode', async () => {
      beforeEach(async () => {
        votingSettings.supportThreshold = pctToRatio(100).sub(1);
        votingSettings.minParticipation = pctToRatio(100);

        await mainVotingPlugin.initialize(dao.address, votingSettings, [
          signers[0].address,
        ]);
        await memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        });
        await makeMembers(signers);
        await makeEditors(signers.slice(1)); // editors 2-10

        startDate = (await getTime()) + startOffset;
        endDate = startDate + votingSettings.duration;

        await mainVotingPlugin.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          VoteOption.None,
          false
        );
      });

      it('does not execute with 9 votes', async () => {
        // does not execute early
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3, 4, 5, 6, 7, 8], // 9 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .false;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;

        // does not execute normally
        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be
          .false;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.false;
      });

      it('executes if participation and support are met', async () => {
        // Check if the proposal can execute early
        await advanceIntoVoteTime(startDate, endDate);

        await voteWithSigners(mainVotingPlugin, id, signers, {
          yes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], // 10 votes
          no: [], // 0 votes
          abstain: [], // 0 votes
        });

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReachedEarly(id)).to.be
          .true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;

        // Check if the proposal can execute normally
        await advanceAfterVoteEnd(endDate);

        expect(await mainVotingPlugin.isMinParticipationReached(id)).to.be.true;
        expect(await mainVotingPlugin.isSupportThresholdReached(id)).to.be.true;
        expect(await mainVotingPlugin.canExecute(id)).to.be.true;
      });
    });
  });

  // Helpers

  function voteWithSigners(
    votingContract: MainVotingPlugin,
    proposalId: number,
    signers: SignerWithAddress[],
    signerIds: {
      yes: number[];
      no: number[];
      abstain: number[];
    }
  ) {
    let promises = signerIds.yes.map(i =>
      votingContract.connect(signers[i]).vote(proposalId, VoteOption.Yes, false)
    );

    promises = promises.concat(
      signerIds.no.map(i =>
        votingContract
          .connect(signers[i])
          .vote(proposalId, VoteOption.No, false)
      )
    );
    promises = promises.concat(
      signerIds.abstain.map(i =>
        votingContract
          .connect(signers[i])
          .vote(proposalId, VoteOption.Abstain, false)
      )
    );

    return Promise.all(promises);
  }

  function makeMembers(targetAddresses: SignerWithAddress[]) {
    return dao
      .grant(
        mainVotingPlugin.address,
        signers[0].address,
        UPDATE_ADDRESSES_PERMISSION_ID
      )
      .then(tx => tx.wait())
      .then(() =>
        Promise.all(
          targetAddresses.map(targetAddress =>
            mainVotingPlugin
              .addMember(targetAddress.address)
              .then(tx => tx.wait())
              .then(() => mainVotingPlugin.isMember(targetAddress.address))
              .then(isMember => expect(isMember).to.eq(true))
          )
        )
      )
      .then(() =>
        dao.revoke(
          mainVotingPlugin.address,
          signers[0].address,
          UPDATE_ADDRESSES_PERMISSION_ID
        )
      )
      .then(tx => tx.wait());
  }

  function makeEditors(targetAddresses: SignerWithAddress[]) {
    return dao
      .grant(
        mainVotingPlugin.address,
        signers[0].address,
        UPDATE_ADDRESSES_PERMISSION_ID
      )
      .then(tx => tx.wait())
      .then(() =>
        Promise.all(
          targetAddresses.map(targetAddress =>
            mainVotingPlugin
              .addEditor(targetAddress.address)
              .then(tx => tx.wait())
              .then(() => mainVotingPlugin.isMember(targetAddress.address))
              .then(isMember => expect(isMember).to.eq(true))
              .then(() => mainVotingPlugin.isEditor(targetAddress.address))
              .then(isEditor => expect(isEditor).to.eq(true))
          )
        )
      )
      .then(() =>
        dao.revoke(
          mainVotingPlugin.address,
          signers[0].address,
          UPDATE_ADDRESSES_PERMISSION_ID
        )
      );
  }
});
