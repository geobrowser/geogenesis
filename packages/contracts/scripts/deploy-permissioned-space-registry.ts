import dotenv from 'dotenv'
import { config, ethers } from 'hardhat'
import { Space, Space__factory } from '../build/types'
import { deploySpaceInstance } from '../src/deploy'

dotenv.config()

/**
 * This function deploys and instance of a permissioned Space registry. All
 * permissioned Spaces should be added to this registry.
 *
 * A Space Registry is an instance of the Space contract, but is not instantiated
 * the same way as a regular Space. The order that certain events are emitted and
 * roles configured is important for the subgraph to correctly pick up the data
 * emitted from the contracts. So we have a separate script for deploying the registry
 * and configuring the roles in a way the subgraph can pick up.
 */
async function deployPermissionedSpaceRegistry() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string
  const networkConfig = config.networks![networkId]!
  console.log('Deploying on network', networkId, networkConfig)

  const spaceBeacon = ethers.ContractFactory.getContract(
    '0xe44be15e413169ad49fb24cbf8db192be5a9a8bf',
    Space__factory.abi
  ) as Space

  const newSpaceRegistry = await deploySpaceInstance(spaceBeacon, {
    debug: true,
  })

  await newSpaceRegistry.configureRoles()

  console.log(
    'Deployed permissioned space registry at address: ',
    newSpaceRegistry.address
  )

  return newSpaceRegistry.address
}

deployPermissionedSpaceRegistry().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
