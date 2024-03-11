import metadata from '../../src/personal/personal-space-admin-build-metadata.json';
import {
  PersonalSpaceAdminPlugin__factory,
  PersonalSpaceAdminPluginSetup,
  PersonalSpaceAdminPluginSetup__factory,
} from '../../typechain';
import {getInterfaceID} from '../../utils/interfaces';
import {deployTestDao} from '../helpers/test-dao';
import {getNamedTypesFromMetadata, Operation} from '../helpers/types';
import {psvpInterface} from './personal-space-admin-plugin';
import {expect} from 'chai';
import {ethers} from 'hardhat';

const abiCoder = ethers.utils.defaultAbiCoder;
const AddressZero = ethers.constants.AddressZero;
const EMPTY_DATA = '0x';

// Permissions
const EDITOR_PERMISSION_ID = ethers.utils.id('EDITOR_PERMISSION');
const EXECUTE_PERMISSION_ID = ethers.utils.id('EXECUTE_PERMISSION');

describe('Personal Space Admin Plugin Setup', function () {
  let ownerAddress: string;
  let signers: any;
  let adminSetup: PersonalSpaceAdminPluginSetup;
  let implementationAddress: string;
  let targetDao: any;
  let minimum_data: any;

  before(async () => {
    signers = await ethers.getSigners();
    ownerAddress = await signers[0].getAddress();
    targetDao = await deployTestDao(signers[0]);

    minimum_data = abiCoder.encode(
      getNamedTypesFromMetadata(
        metadata.pluginSetup.prepareInstallation.inputs
      ),
      [ownerAddress]
    );

    const PersonalSpaceAdminPluginSetup =
      new PersonalSpaceAdminPluginSetup__factory(signers[0]);
    adminSetup = await PersonalSpaceAdminPluginSetup.deploy();

    implementationAddress = await adminSetup.implementation();
  });

  it('does not support the empty interface', async () => {
    expect(await adminSetup.supportsInterface('0xffffffff')).to.be.false;
  });

  it('creates admin address base with the correct interface', async () => {
    const factory = new PersonalSpaceAdminPlugin__factory(signers[0]);
    const adminAddressContract = factory.attach(implementationAddress);

    expect(
      await adminAddressContract.supportsInterface(
        getInterfaceID(psvpInterface)
      )
    ).to.be.eq(true);
  });

  describe('prepareInstallation', async () => {
    it('fails if data is empty, or not of minimum length', async () => {
      await expect(
        adminSetup.prepareInstallation(targetDao.address, EMPTY_DATA)
      ).to.be.reverted;

      await expect(
        adminSetup.prepareInstallation(
          targetDao.address,
          minimum_data.substring(0, minimum_data.length - 2)
        )
      ).to.be.reverted;

      await expect(
        adminSetup.prepareInstallation(targetDao.address, minimum_data)
      ).not.to.be.reverted;
    });

    it('reverts if encoded address in `_data` is zero', async () => {
      const dataWithAddressZero = abiCoder.encode(
        getNamedTypesFromMetadata(
          metadata.pluginSetup.prepareInstallation.inputs
        ),
        [AddressZero]
      );

      await expect(
        adminSetup.prepareInstallation(targetDao.address, dataWithAddressZero)
      )
        .to.be.revertedWithCustomError(adminSetup, 'EditorAddressInvalid')
        .withArgs(AddressZero);
    });

    it('correctly returns plugin, helpers and permissions', async () => {
      const nonce = await ethers.provider.getTransactionCount(
        adminSetup.address
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: adminSetup.address,
        nonce,
      });

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await adminSetup.callStatic.prepareInstallation(
        targetDao.address,
        minimum_data
      );

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(0);
      expect(permissions.length).to.be.equal(2);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          ownerAddress,
          AddressZero,
          EDITOR_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          targetDao.address,
          plugin,
          AddressZero,
          EXECUTE_PERMISSION_ID,
        ],
      ]);
    });

    it('correctly sets up the plugin', async () => {
      const daoAddress = targetDao.address;

      const nonce = await ethers.provider.getTransactionCount(
        adminSetup.address
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: adminSetup.address,
        nonce,
      });

      await adminSetup.prepareInstallation(daoAddress, minimum_data);

      const factory = new PersonalSpaceAdminPlugin__factory(signers[0]);
      const adminAddressContract = factory.attach(anticipatedPluginAddress);

      expect(await adminAddressContract.dao()).to.be.equal(daoAddress);
    });
  });

  describe('prepareUninstallation', async () => {
    it('correctly returns permissions', async () => {
      const plugin = ethers.Wallet.createRandom().address;

      const permissions = await adminSetup.callStatic.prepareUninstallation(
        targetDao.address,
        {
          plugin,
          currentHelpers: [],
          data: EMPTY_DATA,
        }
      );

      expect(permissions.length).to.be.equal(1);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          targetDao.address,
          plugin,
          AddressZero,
          EXECUTE_PERMISSION_ID,
        ],
      ]);
    });
  });
});
