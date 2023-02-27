/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Contract } from 'ethers'
import { ethers, upgrades } from 'hardhat'

import { Space, FakeSpaceV2, PermissionlessSpace } from '../build/types'

type DeployOptions = {
  debug?: true
  signer?: SignerWithAddress
}

export async function deploySpaceBeacon(
  options: DeployOptions = {}
): Promise<Contract> {
  const { signer, debug } = options
  const Space = await ethers.getContractFactory('Space')

  const spaceBeacon = await upgrades.deployBeacon(Space)

  if (debug) {
    console.log(`Deploying Beacon at ${spaceBeacon.address}...`)
  }

  const deployed = await spaceBeacon.deployed()

  if (debug) {
    console.log(`Deployed Beacon at ${spaceBeacon.address}`)
  }

  return signer ? deployed.connect(signer) : deployed
}

export async function deploySpaceInstance(
  spaceBeaconInstance: Contract,
  options: DeployOptions = {}
) {
  const { signer, debug } = options
  const Space = await ethers.getContractFactory('Space')
  const space = (await upgrades.deployBeaconProxy(
    spaceBeaconInstance,
    Space
  )) as Space

  if (debug) {
    console.log(`Deploying Space Instance at ${space.address}...`)
  }

  const deployed = await space.deployed()

  if (debug) {
    console.log(`Deployed Space Instance at ${space.address}`)
  }

  return signer ? deployed.connect(signer) : deployed
}

export async function upgradeToSpaceV2(beacon: Contract) {
  const SpaceV2 = await ethers.getContractFactory('FakeSpaceV2')
  await upgrades.upgradeBeacon(beacon.address, SpaceV2)
}

export async function deployPermissionlessSpaceBeacon(
  options: DeployOptions = {}
): Promise<Contract> {
  const { signer, debug } = options
  const PermissionlessSpace = await ethers.getContractFactory(
    'PermissionlessSpace'
  )

  const spaceBeacon = await upgrades.deployBeacon(PermissionlessSpace)

  if (debug) {
    console.log(
      `Deploying Permissionless Space Beacon at ${spaceBeacon.address}...`
    )
  }

  const deployed = await spaceBeacon.deployed()

  if (debug) {
    console.log(
      `Deployed Permissionless Space Beacon at ${spaceBeacon.address}`
    )
  }

  return signer ? deployed.connect(signer) : deployed
}

export async function deployPermissionlessSpaceInstance(
  spaceBeaconInstance: Contract,
  options: DeployOptions = {}
) {
  const { signer, debug } = options
  const PermissionlessSpace = await ethers.getContractFactory(
    'PermissionlessSpace'
  )
  const space = (await upgrades.deployBeaconProxy(
    spaceBeaconInstance,
    PermissionlessSpace
  )) as PermissionlessSpace

  if (debug) {
    console.log(
      `Deploying Permissionless Space Instance at ${space.address}...`
    )
  }

  const deployed = await space.deployed()

  if (debug) {
    console.log(`Deployed Permissionless Space Instance at ${space.address}`)
  }

  return signer ? deployed.connect(signer) : deployed
}

export async function upgradeToPermissionlessSpaceV2(beacon: Contract) {
  const SpaceV2 = await ethers.getContractFactory('FakeSpaceV2')
  await upgrades.upgradeBeacon(beacon.address, SpaceV2)
}
