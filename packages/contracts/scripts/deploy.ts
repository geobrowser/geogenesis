/* eslint-disable node/no-missing-import */
import { Root } from '@geogenesis/action-schema'
import { randomUUID } from 'crypto'
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
  await spaceRegistry.configureRoles()

  const healthSpace = await deploySpace({ debug: true })
  console.log('Added new space at address: ', healthSpace.address)

  const valuesSpace = await deploySpace({ debug: true })
  console.log('Added new space 2 at address: ', valuesSpace.address)

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
          value: 'Values',
          id: randomUUID(),
        },
      },
      {
        type: 'createTriple',
        entityId: space2Id,
        attributeId: 'space',
        value: {
          type: 'string',
          value: valuesSpace.address,
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

  await healthSpace.configureRoles()
  await valuesSpace.configureRoles()

  saveAddress({
    chainId,
    contractName: 'SpaceRegistry',
    address: spaceRegistry.address,
    blockNumber: spaceRegistry.deployTransaction.blockNumber!,
  })

  if (networkId === 'localhost') {
    saveAddress({
      chainId: 'localhost',
      contractName: 'SpaceRegistry',
      address: spaceRegistry.address,
      blockNumber: spaceRegistry.deployTransaction.blockNumber!,
    })
  }
}

function saveAddress({
  chainId,
  address,
  contractName,
  blockNumber,
}: {
  chainId: string
  contractName: string
  address: string
  blockNumber: number
}) {
  const file = `addresses/${chainId}.json`
  let json: any

  try {
    json = JSON.parse(readFileSync(file).toString())
  } catch {
    json = {}
  }

  set(json, [contractName, 'address'], address)
  set(json, [contractName, 'blockNumber'], blockNumber)

  mkdirSync('addresses', { recursive: true })

  const contents = JSON.stringify(json, null, 2)
  writeFileSync(file, contents)

  console.log(`Wrote '${file}'`, contents)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
