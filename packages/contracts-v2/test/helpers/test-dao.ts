import {DAO, DAO__factory} from '../../typechain';
import {deployWithProxy} from '../../utils/helpers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {Wallet} from 'ethers';
import {ethers} from 'hardhat';

export async function deployTestDao(
  deployer: SignerWithAddress | Wallet
): Promise<DAO> {
  const DAO = new DAO__factory(deployer);
  const dao = await deployWithProxy<DAO>(DAO);

  const daoExampleURI = 'https://example.com';

  await dao.initialize(
    '0x',
    deployer.address,
    ethers.constants.AddressZero,
    daoExampleURI
  );

  return dao;
}
