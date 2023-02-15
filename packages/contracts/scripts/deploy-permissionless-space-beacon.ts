import dotenv from 'dotenv'
import { config } from 'hardhat'
import { deployPermissionlessSpaceBeacon } from '../src/deploy'

dotenv.config()

/**
 * This function deploys a beacon proxy that we can use to deploy implementations
 * of the PermissionlessSpace contract. The Space contract is a permissionless
 * contract, meaning there are no governance rules applied within the Space itself.
 *
 * Whenever we deploy new PermissionlessSpace contracts we need to make sure that
 * we point to this beacon address when deploying the implementation.
 */
async function deployPermissionlessBeacon() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string

  const networkConfig = config.networks![networkId]!

  console.log('Deploying on network', networkId, {
    ...networkConfig,
    gas: 50000000000,
    gasLimit: 50000000000,
    gasPrice: 50000000000, // 50 gwei
  })

  const beacon = await deployPermissionlessSpaceBeacon()
  console.log('Deployed permissionless beacon at address: ', beacon.address)
  return beacon.address
}

deployPermissionlessBeacon().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
