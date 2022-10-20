/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers } from 'hardhat'

import { Log } from '../build/types'

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
