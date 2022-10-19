/* eslint-disable node/no-missing-import */
import { Root } from '@geogenesis/action-schema'
import dotenv from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { config } from 'hardhat'
import set from 'lodash.set'
import { deployLog, deploySpaceRegistry } from '../src/deploy'
import { addEntry } from '../src/entry'

dotenv.config()

async function main() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string

  const networkConfig = config.networks![networkId]!
  const chainId = networkConfig.chainId!.toString()

  console.log('Deploying on network', networkId, networkConfig)

  const uselessSpaceRegistry = await deploySpaceRegistry({ debug: true })
  const spaceRegistry = await deployLog({ debug: true })
  const logContract = await deployLog({ debug: true })
  console.log('Added new space at address: ', logContract.address)

  const spaceRoot: Root = {
    type: 'root',
    version: '0.0.1',
    actions: [
      {
        type: 'createTriple',
        entityId: 'space',
        attributeId: 'type',
        value: {
          type: 'entity',
          value: 'type',
        },
      },
      {
        type: 'createTriple',
        entityId: 'space',
        attributeId: 'name',
        value: {
          type: 'string',
          value: 'Space',
        },
      },
      {
        type: 'createTriple',
        entityId: 'space-1',
        attributeId: 'name',
        value: {
          type: 'string',
          value: 'Space 1',
        },
      },
      {
        type: 'createTriple',
        entityId: 'space-1',
        attributeId: 'space',
        value: {
          type: 'string',
          value: logContract.address,
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
  await addEntry(logContract, 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==')

  const root: Root = {
    type: 'root',
    version: '0.0.1',
    actions: [
      {
        type: 'createTriple',
        entityId: 'e',
        attributeId: 'a',
        value: {
          type: 'string',
          value: 'hi',
        },
      },
      {
        type: 'createTriple',
        entityId: 'e',
        attributeId: 'a',
        value: {
          type: 'number',
          value: '42',
        },
      },
    ],
  }

  await addEntry(
    logContract,
    `data:application/json;base64,${Buffer.from(JSON.stringify(root)).toString(
      'base64'
    )}`
  )

  await addEntry(
    logContract,
    `ipfs://bafkreif4cmtuykxzbmkr3fg57n746hecjnf4nmlrn76e73jrr7jrfn4yti`
  )

  saveAddress({
    chainId,
    contractName: 'SpaceRegistry',
    address: spaceRegistry.address,
  })

  saveAddress({
    chainId,
    contractName: 'UselessSpaceRegistry',
    address: uselessSpaceRegistry.address,
  })

  saveAddress({
    chainId,
    contractName: 'Log',
    address: logContract.address,
  })

  if (networkId === 'localhost') {
    saveAddress({
      chainId: 'localhost',
      contractName: 'UselessSpaceRegistry',
      address: uselessSpaceRegistry.address,
    })

    saveAddress({
      chainId: 'localhost',
      contractName: 'SpaceRegistry',
      address: spaceRegistry.address,
    })

    saveAddress({
      chainId: 'localhost',
      contractName: 'Log',
      address: logContract.address,
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
