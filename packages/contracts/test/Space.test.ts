/* eslint-disable node/no-missing-import */
import { expect } from 'chai'
import { ethers } from 'hardhat'

import {
  deploySpaceBeacon,
  deploySpaceInstance,
  upgradeToSpaceV2,
} from '../src/deploy'
import { addEntry } from '../src/entry'

describe('Space', () => {
  it('add entry', async () => {
    const [deployer] = await ethers.getSigners()
    const beacon = await deploySpaceBeacon({ signer: deployer })
    const contract = await deploySpaceInstance(beacon, { signer: deployer })
    await contract.configureRoles()

    const uri1 = 'abc'
    const entry1 = await addEntry(contract, uri1)

    expect(entry1.author).to.be.eq(deployer.address.toString())
    expect(entry1.uri).to.be.eq(uri1)
    expect(entry1.index).to.be.eq(0)

    const uri2 = 'def'
    const entry2 = await addEntry(contract, uri2)

    expect(entry2.author).to.be.eq(deployer.address.toString())
    expect(entry2.uri).to.be.eq(uri2)
    expect(entry2.index).to.be.eq(1)
  })

  it('read entry', async () => {
    const [deployer] = await ethers.getSigners()
    const beacon = await deploySpaceBeacon({ signer: deployer })
    const contract = await deploySpaceInstance(beacon, { signer: deployer })
    await contract.configureRoles()

    const uri1 = 'abc'
    await addEntry(contract, uri1)

    const uri2 = 'def'
    await addEntry(contract, uri2)

    expect(await contract.entryCount()).to.be.eq(2)

    const entry1 = await contract.entryAtIndex(0)
    expect(entry1.author).to.be.eq(deployer.address.toString())
    expect(entry1.uri).to.be.eq(uri1)

    const entry2 = await contract.entryAtIndex(1)
    expect(entry2.author).to.be.eq(deployer.address.toString())
    expect(entry2.uri).to.be.eq(uri2)

    const entries = await contract.entries(0, 10)
    expect(entries).to.be.deep.eq([
      ['abc', deployer.address],
      ['def', deployer.address],
    ])
  })

  it('Grants and revokes role', async () => {
    const [deployer, address1] = await ethers.getSigners()
    const beacon = await deploySpaceBeacon({ signer: deployer })
    const contract = await deploySpaceInstance(beacon, { signer: deployer })
    await contract.configureRoles()

    expect(
      await contract.hasRole(await contract.EDITOR_ROLE(), address1.address)
    ).to.be.eq(false)

    await contract.grantRole(await contract.EDITOR_ROLE(), address1.address)

    expect(
      await contract.hasRole(await contract.EDITOR_ROLE(), address1.address)
    ).to.be.eq(true)

    await contract.revokeRole(await contract.EDITOR_ROLE(), address1.address)

    expect(
      await contract.hasRole(await contract.EDITOR_ROLE(), address1.address)
    ).to.be.eq(false)
  })

  it("Fails when adding entry without editor's role", async () => {
    const [deployer, account1] = await ethers.getSigners()
    const beacon = await deploySpaceBeacon({ signer: deployer })
    const contract = await deploySpaceInstance(beacon, { signer: deployer })
    await contract.configureRoles()

    expect(contract.connect(account1).addEntry('abc')).to.be.revertedWith(
      `AccessControl: account ${account1.address.toLowerCase()} is missing role ${await contract.EDITOR_ROLE()}`
    )
  })

  it('works after upgrading', async function () {
    const [deployer] = await ethers.getSigners()
    const beacon = await deploySpaceBeacon({ signer: deployer })
    const instance = await deploySpaceInstance(beacon, {
      signer: deployer,
    })

    const spaceV2 = await upgradeToSpaceV2(beacon, instance, {
      signer: deployer,
    })

    expect(await spaceV2._hasBananas()).to.be.eq(true)
  })
})
