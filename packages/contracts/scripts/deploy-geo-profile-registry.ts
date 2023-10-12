import { ethers } from 'hardhat'
import { GeoProfileRegistry } from '../build/types'

async function main() {
  const RegistryContract = (await ethers.getContractFactory(
    'GeoProfileRegistry'
  )) as GeoProfileRegistry

  const contract = await RegistryContract.deploy()
  const deployed = await contract.deployed()

  console.log('Contract deployed at:', contract.address)
}

main().catch((error) => {
  console.error('error deploying profile registry contract', error)
  throw error
})
