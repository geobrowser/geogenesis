/* eslint-disable node/no-missing-import */
import dotenv from 'dotenv';
import {readFileSync, writeFileSync} from 'fs';
import {config, ethers} from 'hardhat';
import {GeoDocument} from '../build/types';

dotenv.config();

async function main() {
  const network = config.networks![process.env.HARDHAT_NETWORK!]!;
  const chainId = network.chainId!.toString();

  const GeoDocument = await ethers.getContractFactory('GeoDocument');
  const geoDocument: GeoDocument = await GeoDocument.deploy(
    'https://geogenesis.vercel.app/'
  );
  await geoDocument.deployed();

  saveAddress({
    chainId,
    contractName: 'GeoDocument',
    address: geoDocument.address,
  });
}

function saveAddress({
  chainId,
  address,
  contractName,
}: {
  chainId: string;
  contractName: string;
  address: string;
}) {
  const addresses = JSON.parse(readFileSync('addresses.json').toString());

  addresses[chainId] = {[contractName]: {address}};

  writeFileSync('addresses.json', JSON.stringify(addresses, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
