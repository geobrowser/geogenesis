import { ethers } from 'hardhat'
import { Membership } from '../build/types'

async function main() {
  const MembershipContract = (await ethers.getContractFactory(
    'Membership'
  )) as Membership

  const contract = await MembershipContract.deploy()
  const deployed = await contract.deployed()

  console.log('Contract deployed at:', contract.address)
}

main().catch((error) => {
  console.error('error deploying membership contract', error)
  throw error
})
