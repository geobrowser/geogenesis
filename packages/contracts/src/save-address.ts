/* eslint-disable node/no-missing-import */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import set from 'lodash.set'

export function saveAddress({
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
