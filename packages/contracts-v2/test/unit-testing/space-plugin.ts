import {DAO, IDAO, SpacePlugin, SpacePlugin__factory} from '../../typechain';
import {deployWithProxy} from '../../utils/helpers';
import {toHex} from '../../utils/ipfs';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  CONTENT_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  SUBSPACE_PERMISSION_ID,
  ZERO_BYTES32,
} from './common';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

export type InitData = {contentUri: string};
export const defaultInitData: InitData = {
  contentUri: 'ipfs://',
};

describe('Space Plugin', function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dao: DAO;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;

  before(async () => {
    [alice, bob, carol] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    defaultInput = {contentUri: 'ipfs://'};
  });

  beforeEach(async () => {
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice)
    );

    await spacePlugin.initialize(
      dao.address,
      defaultInput.contentUri,
      ADDRESS_ZERO
    );
  });

  describe('initialize', async () => {
    it('The Space plugin reverts if trying to re-initialize', async () => {
      await expect(
        spacePlugin.initialize(
          dao.address,
          defaultInput.contentUri,
          ADDRESS_ZERO
        )
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('Should emit a new content event', async () => {
      spacePlugin = await deployWithProxy<SpacePlugin>(
        new SpacePlugin__factory(alice)
      );

      await expect(
        spacePlugin.initialize(
          dao.address,
          defaultInput.contentUri,
          ADDRESS_ZERO
        )
      )
        .to.emit(spacePlugin, 'GeoProposalProcessed')
        .withArgs(0, 0, defaultInput.contentUri);
    });

    it('Should emit a successor space event', async () => {
      // 1
      spacePlugin = await deployWithProxy<SpacePlugin>(
        new SpacePlugin__factory(alice)
      );

      await expect(
        spacePlugin.initialize(
          dao.address,
          defaultInput.contentUri,
          ADDRESS_ONE
        )
      )
        .to.emit(spacePlugin, 'SuccessorSpaceCreated')
        .withArgs(ADDRESS_ONE);

      // 2
      spacePlugin = await deployWithProxy<SpacePlugin>(
        new SpacePlugin__factory(alice)
      );

      await expect(
        spacePlugin.initialize(
          dao.address,
          defaultInput.contentUri,
          ADDRESS_TWO
        )
      )
        .to.emit(spacePlugin, 'SuccessorSpaceCreated')
        .withArgs(ADDRESS_TWO);
    });
  });

  it('The Space plugin emits an event when new content is published', async () => {
    // Fails by default
    await expect(spacePlugin.connect(alice).processGeoProposal(1, 2, 'hello'))
      .to.be.revertedWithCustomError(spacePlugin, 'DaoUnauthorized')
      .withArgs(
        dao.address,
        spacePlugin.address,
        alice.address,
        CONTENT_PERMISSION_ID
      );

    // Grant
    await dao.grant(spacePlugin.address, alice.address, CONTENT_PERMISSION_ID);

    // Set content
    await expect(spacePlugin.connect(alice).processGeoProposal(1, 2, 'hello'))
      .to.emit(spacePlugin, 'GeoProposalProcessed')
      .withArgs(1, 2, 'hello');
  });

  it('The Space plugin emits an event when a subspace is accepted', async () => {
    // Fails by default
    await expect(spacePlugin.connect(alice).acceptSubspace(ADDRESS_TWO))
      .to.be.revertedWithCustomError(spacePlugin, 'DaoUnauthorized')
      .withArgs(
        dao.address,
        spacePlugin.address,
        alice.address,
        SUBSPACE_PERMISSION_ID
      );

    // Grant
    await dao.grant(spacePlugin.address, alice.address, SUBSPACE_PERMISSION_ID);

    // Set content
    await expect(spacePlugin.connect(alice).acceptSubspace(ADDRESS_TWO))
      .to.emit(spacePlugin, 'SubspaceAccepted')
      .withArgs(ADDRESS_TWO);
  });

  it('The Space plugin emits an event when a subspace is removed', async () => {
    // Fails by default
    await expect(spacePlugin.connect(alice).removeSubspace(ADDRESS_TWO))
      .to.be.revertedWithCustomError(spacePlugin, 'DaoUnauthorized')
      .withArgs(
        dao.address,
        spacePlugin.address,
        alice.address,
        SUBSPACE_PERMISSION_ID
      );

    // Grant
    await dao.grant(spacePlugin.address, alice.address, SUBSPACE_PERMISSION_ID);

    // Set content
    await expect(spacePlugin.connect(alice).removeSubspace(ADDRESS_TWO))
      .to.emit(spacePlugin, 'SubspaceRemoved')
      .withArgs(ADDRESS_TWO);
  });

  describe('Permissions', () => {
    beforeEach(async () => {
      await dao
        .grant(dao.address, alice.address, EXECUTE_PERMISSION_ID)
        .then(tx => tx.wait());

      await dao
        .grant(spacePlugin.address, dao.address, CONTENT_PERMISSION_ID)
        .then(tx => tx.wait());

      await dao
        .grant(spacePlugin.address, dao.address, SUBSPACE_PERMISSION_ID)
        .then(tx => tx.wait());
    });

    it('Only the DAO can emit content on the space plugin', async () => {
      // They cannot
      await expect(
        spacePlugin
          .connect(alice)
          .processGeoProposal(1, 2, toHex('ipfs://1234'))
      ).to.be.reverted;
      await expect(
        spacePlugin.connect(bob).processGeoProposal(1, 2, toHex('ipfs://1234'))
      ).to.be.reverted;
      await expect(
        spacePlugin
          .connect(carol)
          .processGeoProposal(1, 2, toHex('ipfs://1234'))
      ).to.be.reverted;

      // The DAO can
      const actions: IDAO.ActionStruct[] = [
        {
          to: spacePlugin.address,
          value: 0,
          data: SpacePlugin__factory.createInterface().encodeFunctionData(
            'processGeoProposal',
            [1, 2, toHex('ipfs://1234')]
          ),
        },
      ];

      await expect(dao.execute(ZERO_BYTES32, actions, 0))
        .to.emit(spacePlugin, 'GeoProposalProcessed')
        .withArgs(1, 2, toHex('ipfs://1234'));
    });

    it('Only the DAO can accept subspaces', async () => {
      // They cannot
      await expect(spacePlugin.connect(alice).acceptSubspace(ADDRESS_ONE)).to.be
        .reverted;
      await expect(spacePlugin.connect(bob).acceptSubspace(ADDRESS_ONE)).to.be
        .reverted;
      await expect(spacePlugin.connect(carol).acceptSubspace(ADDRESS_ONE)).to.be
        .reverted;

      // The DAO can
      const actions: IDAO.ActionStruct[] = [
        {
          to: spacePlugin.address,
          value: 0,
          data: SpacePlugin__factory.createInterface().encodeFunctionData(
            'acceptSubspace',
            [ADDRESS_ONE]
          ),
        },
      ];

      await expect(dao.execute(ZERO_BYTES32, actions, 0))
        .to.emit(spacePlugin, 'SubspaceAccepted')
        .withArgs(ADDRESS_ONE);
    });

    it('Only the DAO can remove subspaces', async () => {
      // They cannot
      await expect(spacePlugin.connect(alice).removeSubspace(ADDRESS_ONE)).to.be
        .reverted;
      await expect(spacePlugin.connect(bob).removeSubspace(ADDRESS_ONE)).to.be
        .reverted;
      await expect(spacePlugin.connect(carol).removeSubspace(ADDRESS_ONE)).to.be
        .reverted;

      // The DAO can
      const actions: IDAO.ActionStruct[] = [
        {
          to: spacePlugin.address,
          value: 0,
          data: SpacePlugin__factory.createInterface().encodeFunctionData(
            'removeSubspace',
            [ADDRESS_ONE]
          ),
        },
      ];

      await expect(dao.execute(ZERO_BYTES32, actions, 0))
        .to.emit(spacePlugin, 'SubspaceRemoved')
        .withArgs(ADDRESS_ONE);
    });
  });
});
