import { Root } from '@geogenesis/action-schema'
import { SYSTEM_IDS } from '@geogenesis/ids'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'
import { config, ethers } from 'hardhat'
import { Space, Space__factory } from '../build/types'
import { deploySpaceInstance } from '../src/deploy'
import { addEntry } from '../src/entry'
import { saveAddress } from '../src/save-address'

dotenv.config()

async function deployPermissionedSpaceImplementation() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string

  const networkConfig = config.networks![networkId]!
  const chainId = networkConfig.chainId!.toString()

  console.log('Deploying on network', networkId, {
    ...networkConfig,
    gas: 50000000000,
    gasLimit: 50000000000,
    gasPrice: 50000000000, // 50 gwei
  })

  const spaceBeacon = ethers.ContractFactory.getContract(
    '0x8991A5056A0ebC8740A9F74Fd9122dAdE2F29ED0',
    Space__factory.abi
  )

  const spaceRegistry = ethers.ContractFactory.getContract(
    '0x170b749413328ac9a94762031a7A05b00c1D2e34',
    Space__factory.abi
  ) as Space

  const newSpace = await deploySpaceInstance(spaceBeacon, {
    debug: true,
  })

  console.log('Deployed permissioned space at address: ' + newSpace.address)

  const newSpaceId = randomUUID()

  const spaceRoot: Root = {
    type: 'root',
    version: '0.0.1',
    actions: [
      {
        type: 'createTriple',
        entityId: newSpaceId,
        attributeId: SYSTEM_IDS.NAME,
        value: {
          type: 'string',
          value: '',
          id: randomUUID(),
        },
      },
      {
        type: 'createTriple',
        entityId: newSpaceId,
        attributeId: SYSTEM_IDS.SPACE,
        value: {
          type: 'string',
          value: newSpace.address,
          id: randomUUID(),
        },
      },
    ],
  }

  await addEntry(
    spaceRegistry,
    `data:application/json;base64,${Buffer.from(
      JSON.stringify(spaceRoot)
    ).toString('base64')}`
  )

  // We need to configure roles after it has been added to the registry so the
  // subgraph can correctly pick up the role configuration event.
  await newSpace.configureRoles()

  saveAddress({
    chainId,
    contractName: 'SpaceRegistry',
    address: spaceRegistry.address,
    startBlock: spaceRegistry.deployTransaction.blockNumber!,
  })

  if (networkId === 'localhost') {
    saveAddress({
      chainId: 'localhost',
      contractName: 'SpaceRegistry',
      address: spaceRegistry.address,
      startBlock: spaceRegistry.deployTransaction.blockNumber!,
    })
  }

  return newSpace.address
}

deployPermissionedSpaceImplementation().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
