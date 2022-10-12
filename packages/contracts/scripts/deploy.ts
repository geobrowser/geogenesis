/* eslint-disable node/no-missing-import */
import dotenv from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { config } from 'hardhat'
import set from 'lodash.set'
import { deployLog } from '../src/deploy'

dotenv.config()

async function main() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const networkId = process.env.HARDHAT_NETWORK as string

  const networkConfig = config.networks![networkId]!
  const chainId = networkConfig.chainId!.toString()

  console.log('Deploying on network', networkId, networkConfig)

  const logContract = await deployLog({ debug: true })

  saveAddress({
    chainId,
    contractName: 'Log',
    address: logContract.address,
  })

  if (networkId === 'localhost') {
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
