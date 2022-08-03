/* eslint-disable node/no-missing-import */
import { expect } from 'chai'
import { BigNumber, ContractTransaction, Event } from 'ethers'
import { ethers } from 'hardhat'

import { GeoDocument } from '../build/types'

const BASE_URI = 'http://example.com/'

type SignerWithAddress = Awaited<ReturnType<typeof ethers.getSigner>>

async function deploy(signer?: SignerWithAddress): Promise<GeoDocument> {
  const GeoDocument = await ethers.getContractFactory('GeoDocument')
  const contract = await GeoDocument.deploy(BASE_URI)
  const deployed = await contract.deployed()
  return signer ? deployed.connect(signer) : deployed
}

async function findEvent(
  tx: ContractTransaction,
  name: string
): Promise<Event> {
  const receipt = await tx.wait()
  const event = receipt.events?.find((event) => event.event === name)
  if (!event) throw new Error(`Event '${name}' wasn't emitted`)
  return event
}

describe('GeoDocument', () => {
  it('deploys contract', async () => {
    const [, addr1] = await ethers.getSigners()
    const contract = await deploy(addr1)

    const parameters = {
      contentHash: 'abc',
      previousVersionId: BigNumber.from(0),
      nextVersionId: BigNumber.from(0),
    }

    const mintTx = await contract.mint(parameters)
    const transferEvent = await findEvent(mintTx, 'Transfer')
    expect(transferEvent.args).to.deep.eq([
      '0x0000000000000000000000000000000000000000',
      addr1.address,
      BigNumber.from(0),
    ])

    expect(await contract.tokenParameters(0)).to.deep.eq(
      Object.values(parameters)
    )

    expect(await contract.tokenURI(0)).to.eq(
      'http://example.com/0?contentHash=abc&previousVersionId=0&nextVersionId=0'
    )
  })
})
