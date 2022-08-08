/* eslint-disable node/no-missing-import */
import dotenv from 'dotenv'
import { readFileSync, writeFileSync } from 'fs'
import { config, ethers } from 'hardhat'
import { Controller, Geode, GeoDocument, Proposal } from '../build/types'

dotenv.config()

async function deployGeodeContract() {
  const Factory = await ethers.getContractFactory('Geode')
  const contract: Geode = await Factory.deploy()

  console.log(`Deploying Geode at ${contract.address}...`)

  await contract.deployed()

  console.log(`Deployed Geode at ${contract.address}`)

  return contract
}

async function deployDocumentContract() {
  const Factory = await ethers.getContractFactory('GeoDocument')
  const contract: GeoDocument = await Factory.deploy(
    'https://geogenesis.vercel.app/api/page/'
  )

  console.log(`Deploying GeoDocument at ${contract.address}...`)

  await contract.deployed()

  console.log(`Deployed GeoDocument at ${contract.address}`)

  return contract
}

async function deployProposalContract() {
  const Factory = await ethers.getContractFactory('Proposal')
  const contract: Proposal = await Factory.deploy(
    'https://geogenesis.vercel.app/api/proposal/'
  )

  console.log(`Deploying Proposal at ${contract.address}...`)

  await contract.deployed()

  console.log(`Deployed Proposal at ${contract.address}`)

  return contract
}

async function deployControllerContract(options: {
  geodeContractAddress: string
  proposalContractAddress: string
  documentContractAddress: string
}) {
  const Factory = await ethers.getContractFactory('Controller')
  const contract: Controller = await Factory.deploy(
    options.geodeContractAddress,
    options.proposalContractAddress,
    options.documentContractAddress
  )

  console.log(`Deploying Controller at ${contract.address}...`)

  await contract.deployed()

  console.log(`Deployed Controller at ${contract.address}`)

  return contract
}

async function main() {
  const network = config.networks![process.env.HARDHAT_NETWORK!]!
  const chainId = network.chainId!.toString()

  const geodeContract = await deployGeodeContract()
  const proposalContract = await deployProposalContract()
  const documentContract = await deployDocumentContract()
  const controllerContract = await deployControllerContract({
    geodeContractAddress: geodeContract.address,
    proposalContractAddress: proposalContract.address,
    documentContractAddress: documentContract.address,
  })

  if (process.env.HARDHAT_NETWORK !== 'localhost') {
    saveAddress({
      chainId,
      contractName: 'GeoDocument',
      address: documentContract.address,
    })
    saveAddress({
      chainId,
      contractName: 'Proposal',
      address: proposalContract.address,
    })
    saveAddress({
      chainId,
      contractName: 'Geode',
      address: geodeContract.address,
    })
    saveAddress({
      chainId,
      contractName: 'Controller',
      address: controllerContract.address,
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
  const addresses = JSON.parse(readFileSync('addresses.json').toString())

  if (!addresses[chainId]) {
    addresses[chainId] = {}
  }

  if (!addresses[chainId][contractName]) {
    addresses[chainId][contractName] = {}
  }

  addresses[chainId][contractName].address = address

  writeFileSync('addresses.json', JSON.stringify(addresses, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
