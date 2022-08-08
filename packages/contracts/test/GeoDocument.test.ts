/* eslint-disable node/no-missing-import */
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

import { deployGeoDocumentContract } from '../src/deploy'
import { mintDocument } from '../src/mint'

describe('GeoDocument', () => {
  it('deploys and mints', async () => {
    const [, addr1] = await ethers.getSigners()
    const documentContract = await deployGeoDocumentContract(addr1)

    const eventArgs = await mintDocument(documentContract, {
      cid: 'abc',
      parentId: 0,
    })

    // Mint document
    expect(eventArgs).to.deep.eq([
      ethers.constants.AddressZero,
      addr1.address,
      BigNumber.from(1),
    ])
    expect(await documentContract.tokenParameters(1)).to.deep.eq([
      'abc',
      BigNumber.from(0),
    ])

    expect(await documentContract.tokenURI(1)).to.eq(
      'http://example.com/1?cid=abc&parentId=0'
    )
    expect(await documentContract.ownerOf(1)).to.eq(addr1.address)
  })
})
