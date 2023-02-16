import dotenv from 'dotenv'
import { config, ethers } from 'hardhat'
import {
  PermissionlessSpace,
  PermissionlessSpace__factory,
} from '../build/types'
import { deployPermissionlessSpaceInstance } from '../src/deploy'

dotenv.config()

/**
 * This function deploys and instance of a Permissionless Space registry. All
 * Permissionless Spaces should be added to this registry.
 *
 * A PermissionlessSpace Registry is an instance of the PermissionlessSpace contract,
 * but is not instantiated the same way as a regular Space. The order that certain
 * events are emitted and roles configured is important for the subgraph to correctly
 * pick up the data emitted from the contracts. So we have a separate script for deploying
 * the registry and configuring the roles in a way the subgraph can pick up.
 */
async function deployPermissionlessSpaceRegistry() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string
  const networkConfig = config.networks![networkId]!
  console.log('Deploying on network', networkId, networkConfig)

  const spaceBeacon = ethers.ContractFactory.getContract(
    '',
    PermissionlessSpace__factory.abi
  ) as PermissionlessSpace

  const newPermissionlessSpaceRegistry =
    await deployPermissionlessSpaceInstance(spaceBeacon, {
      debug: true,
    })

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
