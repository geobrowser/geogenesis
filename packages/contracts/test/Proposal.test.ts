/* eslint-disable node/no-missing-import */
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

import { deployGeodeContract, deployProposalContract } from '../src/deploy'
import { mintGeode, mintProposal } from '../src/mint'

const ARBITRARY_ADDRESS = '0x61E1a6Ed9109F554Bb785815D9f2C65f4a4C41A5'

describe('Proposal', () => {
  it('merges proposal', async () => {
    const [, addr1] = await ethers.getSigners()
    const geodeContract = await deployGeodeContract(addr1)
    const proposalContract = await deployProposalContract(addr1)

    const { tokenId: geodeId } = await mintGeode(geodeContract)

    const parameters = {
      proposed: {
        contractAddress: ARBITRARY_ADDRESS,
        tokenId: BigNumber.from(100),
      },
      target: {
        contractAddress: geodeContract.address,
        tokenId: geodeId,
      },
    }

    const { tokenId: proposalId } = await mintProposal(
      proposalContract,
      parameters
    )

    expect(await proposalContract.tokenURI(proposalId)).to.be.eq(
      `http://example.com/api/proposal/1?targetContract=${parameters.target.contractAddress.toLowerCase()}&targetTokenId=1&targetVersion=0&proposedContract=${parameters.proposed.contractAddress.toLowerCase()}&proposedTokenId=100`
    )

    await proposalContract.merge(proposalId)

    expect(await geodeContract.boxParameters(geodeId)).to.deep.eq(
      Object.values(parameters.proposed)
    )
  })

  it('updates and merges proposal', async () => {
    const [, addr1] = await ethers.getSigners()
    const geodeContract = await deployGeodeContract(addr1)
    const proposalContract = await deployProposalContract(addr1)

    const { tokenId: geodeId } = await mintGeode(geodeContract)

    const parameters = {
      proposed: {
        contractAddress: ARBITRARY_ADDRESS,
        tokenId: BigNumber.from(100),
      },
      target: {
        contractAddress: geodeContract.address,
        tokenId: geodeId,
      },
    }

    const { tokenId: proposalId } = await mintProposal(
      proposalContract,
      parameters
    )

    const updatedProposed = {
      contractAddress: proposalContract.address,
      tokenId: BigNumber.from(200),
    }

    await proposalContract.update(proposalId, updatedProposed)

    await proposalContract.merge(proposalId)

    expect(await geodeContract.boxParameters(geodeId)).to.deep.eq(
      Object.values(updatedProposed)
    )
  })
})
