/* eslint-disable node/no-missing-import */
import { Root } from '@geogenesis/action-schema'
import dotenv from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { config } from 'hardhat'
import set from 'lodash.set'
import { deploySpace } from '../src/deploy'
import { addEntry } from '../src/entry'

dotenv.config()

async function main() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string

  const networkConfig = config.networks![networkId]!
  const chainId = networkConfig.chainId!.toString()

  console.log('Deploying on network', networkId, networkConfig)

  const spaceRegistry = await deploySpace({ debug: true })
  await spaceRegistry.initialize()

  const healthSpace = await deploySpace({ debug: true })
  console.log('Added new space at address: ', healthSpace.address)

  const valuesSpace = await deploySpace({ debug: true })
  console.log('Added new space 2 at address: ', valuesSpace.address)

  const spaceRoot: Root = {
    type: 'root',
    version: '0.0.1',
    actions: [
      {
        type: 'createTriple',
        entityId: 'space-1',
        attributeId: 'name',
        value: {
          type: 'string',
          value: 'Health',
        },
      },
      {
        type: 'createTriple',
        entityId: 'space-1',
        attributeId: 'space',
        value: {
          type: 'string',
          value: healthSpace.address,
        },
      },
      {
        type: 'createTriple',
        entityId: 'space-2',
        attributeId: 'name',
        value: {
          type: 'string',
          value: 'Values',
        },
      },
      {
        type: 'createTriple',
        entityId: 'space-2',
        attributeId: 'space',
        value: {
          type: 'string',
          value: valuesSpace.address,
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

  await healthSpace.initialize()
  await valuesSpace.initialize()

  saveAddress({
    chainId,
    contractName: 'SpaceRegistry',
    address: spaceRegistry.address,
  })

  saveAddress({
    chainId,
    contractName: 'Space',
    address: healthSpace.address,
  })

  if (networkId === 'localhost') {
    saveAddress({
      chainId: 'localhost',
      contractName: 'SpaceRegistry',
      address: spaceRegistry.address,
    })

    saveAddress({
      chainId: 'localhost',
      contractName: 'Space',
      address: healthSpace.address,
    })
  }
}

function saveAddress({
  chainId,
  address,
  contractName,
}: {
  chainId: string
  contractName: string
  address: string
}) {
  const file = `addresses/${chainId}.json`
  let json: any

  try {
    json = JSON.parse(readFileSync(file).toString())
  } catch {
    json = {}
  }

  set(json, [contractName, 'address'], address)

  mkdirSync('addresses', { recursive: true })

  const contents = JSON.stringify(json, null, 2)
  writeFileSync(file, contents)

  console.log(`Wrote '${file}'`, contents)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
