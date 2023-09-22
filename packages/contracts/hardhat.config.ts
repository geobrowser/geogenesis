import * as dotenv from 'dotenv'

import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-waffle'
import '@openzeppelin/hardhat-upgrades'
import '@typechain/hardhat'
import 'hardhat-abi-exporter'
import 'hardhat-gas-reporter'
import { HardhatUserConfig, task } from 'hardhat/config'
import 'solidity-coverage'

dotenv.config()

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners()

  for (const account of accounts) {
    console.log(account.address)
  }
})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const accounts =
  process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : []

const localChainId = Number(process.env.DEVNET_CHAIN_ID || '31337')

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.14',
      },
      {
        version: '0.8.17',
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    artifacts: './build/contracts',
    cache: './build/cache',
  },
  networks: {
    hardhat: {
      chainId: localChainId,
    },
    ropsten: {
      chainId: 3,
      url: process.env.ROPSTEN_URL || '',
      accounts,
    },
    localhost: {
      chainId: localChainId,
      url: process.env.DEVNET_URL || 'http://127.0.0.1:8545',
    },
    polygon_mainnet: {
      chainId: 137,
      url:
        process.env.POLYGON_MAINNET_RPC_URL ||
        'https://rpc-mainnet.maticvigil.com',
      // 'https://rpc-mainnet.matic.network' ||
      // 'https://matic-mainnet.chainstacklabs.com' ||
      // 'https://polygon-rpc.com',
      accounts,
    },
    polygon_mumbai: {
      chainId: 80001,
      url:
        process.env.POLYGON_MUMBAI_RPC_URL ||
        // 'https://rpc-mumbai.maticvigil.com',
        'https://matic-mumbai.chainstacklabs.com/',
      accounts,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY,
  },
  typechain: {
    outDir: 'build/types',
    target: 'ethers-v5',
    alwaysGenerateOverloads: false, // should overloads with full signatures like deposit(uint256) be generated always, even if there are no overloads?
  },
  abiExporter: {
    path: 'build/abis',
    clear: false,
    flat: true,
    runOnCompile: true,
  },
}

export default config
