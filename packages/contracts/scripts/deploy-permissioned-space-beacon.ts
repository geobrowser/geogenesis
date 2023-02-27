import dotenv from 'dotenv'
import { config } from 'hardhat'
import { deploySpaceBeacon } from '../src/deploy'

dotenv.config()

/**
 * This function deploys a beacon proxy that we can use to deploy implementations
 * of the Space contract. The Space contract is a permissioned contract, meaning
 * there are governance rules applied within the Space itself.
 *
 * Whenever we deploy new permissioned Space contracts we need to make sure that
 * we point to this beacon address when deploying the implementation.
 */
async function deployPermissionedBeacon() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string
  const networkConfig = config.networks![networkId]!
  console.log('Deploying on network', networkId, networkConfig)

  const beacon = await deploySpaceBeacon()
  console.log('Deployed permissioned beacon at address: ', beacon.address)
  return beacon.address
}

deployPermissionedBeacon().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
