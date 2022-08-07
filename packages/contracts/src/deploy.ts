/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers } from 'hardhat'

import { Controller, Geode, GeoDocument, Proposal } from '../build/types'

export const GEO_DOCUMENT_BASE_URI = 'http://example.com/'
export const PROPOSAL_BASE_URI = 'http://example.com/api/proposal/'

export async function deployGeoDocumentContract(
  signer?: SignerWithAddress
): Promise<GeoDocument> {
  const GeoDocument = await ethers.getContractFactory('GeoDocument')
  const contract = await GeoDocument.deploy(GEO_DOCUMENT_BASE_URI)
  const deployed = await contract.deployed()
  return signer ? deployed.connect(signer) : deployed
}

export async function deployGeodeContract(
  signer?: SignerWithAddress
): Promise<Geode> {
  const Geode = await ethers.getContractFactory('Geode')
  const contract = await Geode.deploy()
  const deployed = await contract.deployed()
  return signer ? deployed.connect(signer) : deployed
}

export async function deployProposalContract(
  signer?: SignerWithAddress
): Promise<Proposal> {
  const Proposal = await ethers.getContractFactory('Proposal')
  const contract = await Proposal.deploy(PROPOSAL_BASE_URI)
  const deployed = await contract.deployed()
  return signer ? deployed.connect(signer) : deployed
}

export async function deployControllerContract(
  geodeContractAddress: string,
  proposalContractAddress: string,
  documentContractAddress: string,
  signer?: SignerWithAddress
): Promise<Controller> {
  const Controller = await ethers.getContractFactory('Controller')
  const contract = await Controller.deploy(
    geodeContractAddress,
    proposalContractAddress,
    documentContractAddress
  )
  const deployed = await contract.deployed()
  return signer ? deployed.connect(signer) : deployed
}
