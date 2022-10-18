/* eslint-disable node/no-missing-import */
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { deploySpaceRegistry } from '../src/deploy'
import { addSpace, removeSpace } from '../src/space'

describe('SpaceRegistry', () => {
  it('add space', async () => {
    const [deployer] = await ethers.getSigners()
    const contract = await deploySpaceRegistry({ signer: deployer })

    const address1 = '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990'
    const entry1 = await addSpace(contract, address1)

    expect(entry1.space).to.be.eq(address1)

    const address2 = '0xE887312c0595a10aC88e32ebb8e9F660Ad9aB7F7'
    const entry2 = await addSpace(contract, address2)

    expect(entry2.space).to.be.eq(address2)
  })

  it('remove space', async () => {
    const [deployer] = await ethers.getSigners()
    const contract = await deploySpaceRegistry({ signer: deployer })

    const address1 = '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990'
    const entry1 = await addSpace(contract, address1)

    expect(entry1.space).to.be.eq(address1)
    expect(await contract.hasSpace(address1)).to.be.eq(true)
    const entry2 = await removeSpace(contract, address1)
    expect(entry2.space).to.be.eq(address1)

    expect(await contract.hasSpace(address1)).to.be.eq(false)
  })

  it('read spaces', async () => {
    const [deployer] = await ethers.getSigners()
    const contract = await deploySpaceRegistry({ signer: deployer })

    const address1 = '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990'
    await addSpace(contract, address1)

    const address2 = '0xE887312c0595a10aC88e32ebb8e9F660Ad9aB7F7'
    await addSpace(contract, address2)

    expect(await contract.spaceCount()).to.be.eq(2)

    const entry1 = await contract.spaceAtIndex(0)
    expect(entry1).to.be.eq(address1)

    const entry2 = await contract.spaceAtIndex(1)
    expect(entry2).to.be.eq(address2)

    const entries = await contract.spaces(0, 10)
    expect(entries).to.be.deep.eq([address1, address2])
  })
})
