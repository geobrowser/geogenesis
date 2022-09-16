/* eslint-disable node/no-missing-import */
import { Root } from '@geogenesis/fact-schema'
import dotenv from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { config } from 'hardhat'
import set from 'lodash.set'
import { deployStatementHistory } from '../src/deploy'
import { addStatement } from '../src/statement'

dotenv.config()

async function main() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string

  const networkConfig = config.networks![networkId]!
  const chainId = networkConfig.chainId!.toString()

  const statementHistoryContract = await deployStatementHistory({ debug: true })

  await addStatement(
    statementHistoryContract,
    'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ=='
  )

  const root: Root = {
    type: 'root',
    commands: [
      {
        type: 'create',
        value: {
          type: 'fact',
          id: 'i1',
          entityId: 'e',
          attributeId: 'a',
          value: {
            type: 'string',
            value: 'hi',
          },
        },
      },
      {
        type: 'create',
        value: {
          type: 'fact',
          id: 'i2',
          entityId: 'e',
          attributeId: 'a',
          value: {
            type: 'number',
            value: '42',
          },
        },
      },
    ],
  }

  await addStatement(
    statementHistoryContract,
    `data:application/json;base64,${Buffer.from(JSON.stringify(root)).toString(
      'base64'
    )}`
  )

  saveAddress({
    chainId,
    contractName: 'StatementHistory',
    address: statementHistoryContract.address,
  })
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
  writeFileSync(file, JSON.stringify(json, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
