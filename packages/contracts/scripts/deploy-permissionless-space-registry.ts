import { Root } from '@geogenesis/action-schema'
import { SYSTEM_IDS } from '@geogenesis/ids'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'
import { config, ethers } from 'hardhat'
import {
  PermissionlessSpace,
  PermissionlessSpace__factory,
  Space,
  Space__factory,
} from '../build/types'
import {
  deployPermissionlessSpaceInstance,
  deploySpaceInstance,
} from '../src/deploy'
import { addEntry } from '../src/entry'
import { saveAddress } from '../src/save-address'

dotenv.config()

/**
 * A PermissionlessSpace Registry is an instance of the PermissionlessSpace contract,
 * but is not instantiated the same way as a regular Space. The order that certain
 * events are emitted and roles configured is important for the subgraph to correctly
 * pick up the data emitted from the contracts.
 */
async function deployPermissionlessSpaceRegistry() {
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
    '',
    PermissionlessSpace__factory.abi
  ) as PermissionlessSpace

  const newPermissionlessSpaceRegistry =
    await deployPermissionlessSpaceInstance(spaceBeacon, {
      debug: true,
    })

  await newPermissionlessSpaceRegistry.configureRoles()

  console.log(
    'Deployed permissionless space registry at address: ',
    newPermissionlessSpaceRegistry.address
  )

  return newPermissionlessSpaceRegistry.address
}

deployPermissionlessSpaceRegistry().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
