/* eslint-disable node/no-missing-import */
import { ethers } from 'hardhat'
import { Geode, GeoDocument, Proposal } from '../build/types'
import {
  BoxParametersStruct,
  TransferEventObject,
} from '../build/types/contracts/Geode'

import { findEvent } from '../src/findEvent'

export async function mintGeode(
  geodeContract: Geode,
  parameters: BoxParametersStruct = {
    contractAddress: ethers.constants.AddressZero,
    tokenId: 0,
  }
) {
  const mintTx = await geodeContract.mint(parameters)
  const transferEvent = await findEvent(mintTx, 'Transfer')
  const eventObject = transferEvent.args as unknown as TransferEventObject
  return eventObject
}

export async function mintDocument(
  documentContract: GeoDocument,
  parameters: GeoDocument.TokenParametersStruct
) {
  const mintTx = await documentContract.mint(parameters)
  const transferEvent = await findEvent(mintTx, 'Transfer')
  const eventObject = transferEvent.args as unknown as TransferEventObject
  return eventObject
}

export async function mintProposal(
  proposalContract: Proposal,
  parameters: Proposal.MintParametersStruct
) {
  const mintTx = await proposalContract.mint(parameters)
  const transferEvent = await findEvent(mintTx, 'Transfer')
  const eventObject = transferEvent.args as unknown as TransferEventObject
  return eventObject
}
