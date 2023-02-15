import { Root } from '@geogenesis/action-schema'
import { SYSTEM_IDS } from '@geogenesis/ids'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'
import { config, ethers } from 'hardhat'
import {
  PermissionlessSpace,
  PermissionlessSpace__factory,
} from '../build/types'
import { deployPermissionlessSpaceInstance } from '../src/deploy'
import { addEntry } from '../src/entry'
import { saveAddress } from '../src/save-address'

dotenv.config()

/**
 * This function deploys an instance of the PermissionlessSpace contract and adds
 * it as a Space Entity to the permissionless space registry. It uses the address
 * for the deployed permissionless beacon when deploying the new space to ensure
 * that the new space is upgradable from the beacon.
 */
async function deployPermissionlessSpaceImplementation() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string
  const networkConfig = config.networks![networkId]!
  const chainId = networkConfig.chainId!.toString()
  console.log('Deploying on network', networkId, networkConfig)

  const permissionlessSpaceBeacon = ethers.ContractFactory.getContract(
    SYSTEM_IDS.PERMISSIONLESS_SPACE_BEACON_ADDRESS,
    PermissionlessSpace__factory.abi
  ) as PermissionlessSpace

  const permissionlessSpaceRegistry = ethers.ContractFactory.getContract(
    SYSTEM_IDS.PERMISSIONLESS_SPACE_REGISTRY_ADDRESS,
    PermissionlessSpace__factory.abi
  ) as PermissionlessSpace

  const newPermissionlessSpace = await deployPermissionlessSpaceInstance(
    permissionlessSpaceBeacon,
    {
      debug: true,
    }
  )

  console.log(
    'Deployed permissionless space at address: ' +
      newPermissionlessSpace.address
  )

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
          value: newPermissionlessSpace.address,
          id: randomUUID(),
        },
      },
    ],
  }

  await addEntry(
    permissionlessSpaceRegistry,
    `data:application/json;base64,${Buffer.from(
      JSON.stringify(spaceRoot)
    ).toString('base64')}`
  )

  // We need to configure roles after it has been added to the registry so the
  // subgraph can correctly pick up the role configuration event.

  saveAddress({
    chainId,
    contractName: 'PermissionlessSpaceRegistry',
    address: permissionlessSpaceRegistry.address,
    startBlock: permissionlessSpaceRegistry.deployTransaction.blockNumber!,
  })

  if (networkId === 'localhost') {
    saveAddress({
      chainId: 'localhost',
      contractName: 'PermissionlessSpaceRegistry',
      address: permissionlessSpaceRegistry.address,
      startBlock: permissionlessSpaceRegistry.deployTransaction.blockNumber!,
    })
  }

  return newPermissionlessSpace.address
}

deployPermissionlessSpaceImplementation().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
