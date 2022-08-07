/* eslint-disable node/no-missing-import */
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

import {
  deployControllerContract,
  deployGeodeContract,
  deployGeoDocumentContract,
  deployProposalContract,
} from '../src/deploy'
import { findEvent } from '../src/findEvent'

describe('Controller', () => {
  it('creates docs', async () => {
    const [, addr1] = await ethers.getSigners()
    const geodeContract = await deployGeodeContract(addr1)
    const proposalContract = await deployProposalContract(addr1)
    const documentContract = await deployGeoDocumentContract(addr1)
    const controllerContract = await deployControllerContract(
      geodeContract.address,
      proposalContract.address,
      documentContract.address,
      addr1
    )

    const mintTx = await controllerContract.createDocument('abc')
    const createDocumentEvent = await findEvent(mintTx, 'CreateDocument')

    const { geodeId, documentId } = createDocumentEvent.args!

    expect(geodeId).to.deep.eq(BigNumber.from(1))
    expect(documentId).to.deep.eq(BigNumber.from(1))

    expect(await documentContract.tokenParameters(documentId)).to.deep.eq([
      'abc',
      BigNumber.from(0),
    ])

    expect(await documentContract.tokenURI(documentId)).to.eq(
      'http://example.com/1?cid=abc&parentId=0'
    )
    expect(await documentContract.ownerOf(documentId)).to.eq(addr1.address)

    expect(await geodeContract.tokenURI(1)).to.eq(
      'http://example.com/1?cid=abc&parentId=0'
    )
    expect(await geodeContract.ownerOf(geodeId)).to.eq(addr1.address)

    const revision1Tx = await controllerContract.createRevision(
      { cid: 'def', parentId: BigNumber.from(1) },
      true
    )
    await revision1Tx.wait()

    expect(await documentContract.tokenParameters(2)).to.deep.eq([
      'def',
      BigNumber.from(1),
    ])

    expect(await geodeContract.tokenURI(1)).to.eq(
      'http://example.com/2?cid=def&parentId=1'
    )

    const revision2Tx = await controllerContract.createRevision(
      { cid: 'ghi', parentId: BigNumber.from(2) },
      true
    )
    await revision2Tx.wait()

    expect(await documentContract.tokenParameters(3)).to.deep.eq([
      'ghi',
      BigNumber.from(2),
    ])

    expect(await geodeContract.tokenURI(1)).to.eq(
      'http://example.com/3?cid=ghi&parentId=2'
    )

    expect(await geodeContract.versionCount(1)).to.eq(BigNumber.from(3))
    expect(await geodeContract.versionByIndex(1, 0)).to.deep.eq([
      documentContract.address,
      BigNumber.from(1),
    ])
    expect(await geodeContract.versionByIndex(1, 1)).to.deep.eq([
      documentContract.address,
      BigNumber.from(2),
    ])
    expect(await geodeContract.versionByIndex(1, 2)).to.deep.eq([
      documentContract.address,
      BigNumber.from(3),
    ])
  })
})
