/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers } from 'hardhat'

import { Space } from '../build/types'

type DeployOptions = {
  debug?: true
  signer?: SignerWithAddress
}

export async function deploySpace(options: DeployOptions = {}): Promise<Space> {
  const { signer, debug } = options
  const Space = await ethers.getContractFactory('Space')
  const contract = await Space.deploy()

  if (debug) {
    console.log(`Deploying 'Space' at ${contract.address}...`)
  }

  const deployed = await contract.deployed()

  if (debug) {
    console.log(`Deployed 'Space' at ${contract.address}`)
  }

  return signer ? deployed.connect(signer) : deployed
}
