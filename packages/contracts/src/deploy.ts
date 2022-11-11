/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers, upgrades } from 'hardhat'

import { Space, FakeSpaceV2 } from '../build/types'

type DeployOptions = {
  debug?: true
  signer?: SignerWithAddress
}

export async function deploySpace(options: DeployOptions = {}): Promise<Space> {
  const { signer, debug } = options
  const Space = await ethers.getContractFactory('Space')

  const contract = (await upgrades.deployProxy(Space)) as Space

  if (debug) {
    console.log(`Deploying 'Space' at ${contract.address}...`)
  }

  const deployed = await contract.deployed()

  if (debug) {
    console.log(`Deployed 'Space' at ${contract.address}`)
  }

  return signer ? deployed.connect(signer) : deployed
}

export async function upgradeToSpaceV2(
  spaceInstance: Space,
  options: DeployOptions = {}
): Promise<FakeSpaceV2> {
  const SpaceV2 = await ethers.getContractFactory('FakeSpaceV2')
  const upgraded = (await upgrades.upgradeProxy(
    spaceInstance.address,
    SpaceV2
  )) as FakeSpaceV2

  const { signer, debug } = options

  if (debug) {
    console.log(`Deploying 'SpaceV2' at ${upgraded.address}...`)
  }

  const deployed = await upgraded.deployed()
  await upgraded.initializeV2()

  if (debug) {
    console.log(`Deployed 'Space' at ${upgraded.address}`)
  }

  return signer ? deployed.connect(signer) : deployed
}
