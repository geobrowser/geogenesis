/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers } from 'hardhat'

import { StatementHistory } from '../build/types'

type DeployOptions = {
  debug?: true
  signer?: SignerWithAddress
}

export async function deployStatementHistory(
  options: DeployOptions = {}
): Promise<StatementHistory> {
  const { signer, debug } = options
  const StatementHistory = await ethers.getContractFactory('StatementHistory')
  const contract = await StatementHistory.deploy()

  if (debug) {
    console.log(`Deploying 'StatementHistory' at ${contract.address}...`)
  }

  const deployed = await contract.deployed()

  if (debug) {
    console.log(`Deployed 'StatementHistory' at ${contract.address}`)
  }

  return signer ? deployed.connect(signer) : deployed
}
