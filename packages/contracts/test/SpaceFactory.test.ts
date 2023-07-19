import { expect } from 'chai'
import {
  deploySpaceFactoryBeacon,
  deploySpaceFactoryInstance,
} from '../src/deploy'
import { ethers } from 'hardhat'

describe('SpaceFactory', () => {
  it('Deploys a new contract and returns the address', async () => {
    const [deployer] = await ethers.getSigners()

    const factoryBeacon = await deploySpaceFactoryBeacon({ signer: deployer })
    const factory = await deploySpaceFactoryInstance(factoryBeacon, {
      signer: deployer,
    })

    // @TODO:
    // Q: Does it make sense to deploy via contracts or should we instead use a
    //    script?
    //
    // @TODO
    // 1. set ownership of new contracts to the geo polygon deployer address
    // 2. make new contracts being created by factory upgradeable and point
    //    to the same beacon as the other space implementations.
    // new space address: 0x6A358FD7B7700887b0cd974202CdF93208F793E2
    // space factory address: 0xa82fF9aFd8f496c3d6ac40E2a0F282E47488CFc9
    const newSpace = await factory.callStatic.createSpace()

    expect(newSpace).to.be.a.string(newSpace)
  })
})
