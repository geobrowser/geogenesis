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

  const spaceRegistryContract = await deploySpaceRegistry({ debug: true })
  const logContract = await deployLog({ debug: true })

  await spaceRegistryContract.addSpace(logContract.address)
  console.log('Added new space at address: ', logContract.address)

  await logContract.grantRole(
    await logContract.EDITOR_ROLE(),
    '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990'
  )

  await logContract.grantRole(
    await logContract.EDITOR_ROLE(),
    '0x690B9A9E9aa1C9dB991C7721a92d351Db4FaC990'
  )

  await logContract.grantRole(
    await logContract.EDITOR_ROLE(),
    '0xE887312c0595a10aC88e32ebb8e9F660Ad9aB7F7'
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
    address: spaceRegistryContract.address,
  })

  saveAddress({
    chainId,
    contractName: 'Log',
    address: logContract.address,
  })

  if (networkId === 'localhost') {
    saveAddress({
      chainId: 'localhost',
      contractName: 'SpaceRegistry',
      address: spaceRegistryContract.address,
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
