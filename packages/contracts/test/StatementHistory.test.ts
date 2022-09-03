/* eslint-disable node/no-missing-import */
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { deployStatementHistory } from '../src/deploy'
import { addStatement } from '../src/statement'

describe('StatementHistory', () => {
  it('add statement', async () => {
    const [deployer] = await ethers.getSigners()
    const contract = await deployStatementHistory({ signer: deployer })

    const uri1 = 'abc'
    const statement1 = await addStatement(contract, uri1)

    expect(statement1.author).to.be.eq(deployer.address.toString())
    expect(statement1.uri).to.be.eq(uri1)
    expect(statement1.index).to.be.eq(0)

    const uri2 = 'def'
    const statement2 = await addStatement(contract, uri2)

    expect(statement2.author).to.be.eq(deployer.address.toString())
    expect(statement2.uri).to.be.eq(uri2)
    expect(statement2.index).to.be.eq(1)
  })

  it('read statement', async () => {
    const [deployer] = await ethers.getSigners()
    const contract = await deployStatementHistory({ signer: deployer })

    const uri1 = 'abc'
    await addStatement(contract, uri1)

    const uri2 = 'def'
    await addStatement(contract, uri2)

    expect(await contract.totalStatements()).to.be.eq(2)

    const statement1 = await contract.statementAtIndex(0)
    expect(statement1.author).to.be.eq(deployer.address.toString())
    expect(statement1.uri).to.be.eq(uri1)

    const statement2 = await contract.statementAtIndex(1)
    expect(statement2.author).to.be.eq(deployer.address.toString())
    expect(statement2.uri).to.be.eq(uri2)
  })
})
