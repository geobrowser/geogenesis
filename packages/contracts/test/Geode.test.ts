/* eslint-disable node/no-missing-import */
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

import { deployGeodeContract } from '../src/deploy'
import { mintGeode } from '../src/mint'

// async function mintGeoDocument(
//   documentContract: GeoDocument
// ): Promise<BigNumber> {
//   const parameters = {
//     cid: 'abc',
//     geodeId: BigNumber.from(100),
//     parentId: BigNumber.from(200),
//   }

//   const mintTx = await documentContract.mint(parameters)
//   const transferEvent = await findEvent(mintTx, 'Transfer')

//   return transferEvent.args?.[2]
// }

describe('Geode', () => {
  it('deploys and mints', async () => {
    const [, addr1] = await ethers.getSigners()
    const geodeContract = await deployGeodeContract(addr1)

    const parameters1 = {
      contractAddress: ethers.constants.AddressZero,
      tokenId: BigNumber.from(1),
    }

    const geode = await mintGeode(geodeContract, parameters1)

    expect(geode).to.deep.eq([
      '0x0000000000000000000000000000000000000000',
      addr1.address,
      BigNumber.from(1),
    ])

    expect(await geodeContract.boxParameters(1)).to.deep.eq(
      Object.values(parameters1)
    )
  })

  // it('mints and updates geode', async () => {
  //   const [, addr1] = await ethers.getSigners()
  //   const geodeContract = await deployGeodeContract(addr1)
  //   const documentContract = await deployGeoDocumentContract(
  //     geodeContract.address,
  //     addr1
  //   )
  //   const documentTokenId0 = await mintGeoDocument(documentContract)
  //   const documentTokenId1 = await mintGeoDocument(documentContract)

  //   const parameters0 = {
  //     contractAddress: documentContract.address,
  //     tokenId: documentTokenId0,
  //   }

  //   const mintTx = await geodeContract.mint(parameters0)
  //   const transferEvent = await findEvent(mintTx, 'Transfer')
  //   expect(transferEvent.args).to.deep.eq([
  //     '0x0000000000000000000000000000000000000000',
  //     addr1.address,
  //     BigNumber.from(0),
  //   ])

  //   expect(await geodeContract.boxParameters(0)).to.deep.eq(
  //     Object.values(parameters0)
  //   )

  //   expect(await geodeContract.tokenURI(0)).to.eq(
  //     await documentContract.tokenURI(documentTokenId0)
  //   )

  //   const parameters1 = {
  //     contractAddress: documentContract.address,
  //     tokenId: documentTokenId1,
  //   }

  //   const updateTx = await geodeContract.setBoxParameters(0, parameters1)
  //   await updateTx.wait()

  //   expect(await geodeContract.boxParameters(0)).to.deep.eq(
  //     Object.values(parameters1)
  //   )

  //   expect(await geodeContract.tokenURI(0)).to.eq(
  //     await documentContract.tokenURI(documentTokenId1)
  //   )
  // })
})
