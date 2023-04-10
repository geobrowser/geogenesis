/* eslint-disable node/no-missing-import */
import { Root } from '@geogenesis/action-schema'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { config } from 'hardhat'
import set from 'lodash.set'
import { deploySpaceBeacon, deploySpaceInstance } from '../src/deploy'
import { addEntry } from '../src/entry'

dotenv.config()

/**
 * This function was initially used to deploy the Health and San Francisco spaces
 * on the mainnet. It is not used anymore except for deploying and bootstrapping
 * new spaces during local development in the local docker instance.
 *
 * Opt for using the permissioned/permissionless space scripts in /scripts instead
 * if you are ad-hoc deploying scripts to mumbai or polygon.
 */
async function main() {
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

  const beacon = await deploySpaceBeacon({ debug: true })

  const spaceRegistry = await deploySpaceInstance(beacon, { debug: true })
  await spaceRegistry.configureRoles()

  const healthSpace = await deploySpaceInstance(beacon, { debug: true })
  console.log('Added Health space at address: ', healthSpace.address)

  const sanFranciscoSpace = await deploySpaceInstance(beacon, { debug: true })
  console.log('Added SF Space at address: ', sanFranciscoSpace.address)

  const space1Id = randomUUID()
  const space2Id = randomUUID()

  const spaceRoot: Root = {
    type: 'root',
    version: '0.0.1',
    actions: [
      {
        type: 'createTriple',
        entityId: space1Id,
        attributeId: 'name',
        value: {
          type: 'string',
          value: 'Health',
          id: randomUUID(),
        },
      },
      {
        type: 'createTriple',
        entityId: space1Id,
        attributeId: 'space',
        value: {
          type: 'string',
          value: healthSpace.address,
          id: randomUUID(),
        },
      },
      {
        type: 'createTriple',
        entityId: space2Id,
        attributeId: 'name',
        value: {
          type: 'string',
          value: 'San Francisco',
          id: randomUUID(),
        },
      },
      {
        type: 'createTriple',
        entityId: space2Id,
        attributeId: 'space',
        value: {
          type: 'string',
          value: sanFranciscoSpace.address,
          id: randomUUID(),
        },
      },
    ],
    name: 'Legacy space deployment',
  }

  await addEntry(
    spaceRegistry,
    `data:application/json;base64,${Buffer.from(
      JSON.stringify(spaceRoot)
    ).toString('base64')}`
  )

  await healthSpace.configureRoles()
  await sanFranciscoSpace.configureRoles()

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
}

function saveAddress({
  chainId,
  address,
  contractName,
  startBlock,
}: {
  chainId: string
  contractName: string
  address: string
  startBlock: number
}) {
  const file = `addresses/${chainId}.json`
  let json: any

  try {
    json = JSON.parse(readFileSync(file).toString())
  } catch {
    json = {}
  }

  set(json, [contractName, 'address'], address)
  set(json, [contractName, 'startBlock'], startBlock)

  mkdirSync('addresses', { recursive: true })

  const contents = JSON.stringify(json, null, 2)
  writeFileSync(file, contents)

  console.log(`Wrote '${file}'`, contents)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
