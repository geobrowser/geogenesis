/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers } from 'hardhat'

import { Log, SpaceRegistry } from '../build/types'

type DeployOptions = {
  debug?: true
  signer?: SignerWithAddress
}

export async function deployLog(options: DeployOptions = {}): Promise<Log> {
  const { signer, debug } = options
  const Log = await ethers.getContractFactory('Log')
  const contract = await Log.deploy()

  if (debug) {
    console.log(`Deploying 'Log' at ${contract.address}...`)
  }

  const deployed = await contract.deployed()

  if (debug) {
    console.log(`Deployed 'Log' at ${contract.address}`)
  }

  return signer ? deployed.connect(signer) : deployed
}

export async function deploySpaceRegistry(
  options: DeployOptions = {}
): Promise<SpaceRegistry> {
  const { signer, debug } = options
  const SpaceRegistry = await ethers.getContractFactory('SpaceRegistry')
  const contract = await SpaceRegistry.deploy()

  if (debug) {
    console.log(`Deploying 'SpaceRegistry' at ${contract.address}...`)
  }

  const deployed = await contract.deployed()

  if (debug) {
    console.log(`Deployed 'SpaceRegistry' at ${contract.address}`)
  }

  return signer ? deployed.connect(signer) : deployed
}
