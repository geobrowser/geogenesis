import { Command } from 'commander'
import { Effect } from 'effect'
import { populateFromCache } from './src/populate-cache.js'
import { getStreamEffect } from './src/run-stream.js'
import { resetPublicTablesToGenesis } from './src/utils/reset-public-tables-to-genesis.js'
import { genesisStartBlockNum } from './src/constants/constants.js'
import { bootstrapRoot } from './src/bootstrap-root.js'

async function main() {
  try {
    const program = new Command()

    program
      .option('--from-genesis', 'Start from genesis block')
      .option('--from-cache', 'Start from cached block')

    program.parse(process.argv)

    const options = program.opts()

    if (options.fromGenesis) {
      await resetPublicTablesToGenesis()
      console.log('bootstrapping system entities')
      await bootstrapRoot()
    }

    let startBlockNumber = genesisStartBlockNum

    if (options.fromCache) {
      console.log('populating geo data from cache')
      await resetPublicTablesToGenesis()
      console.log('bootstrapping system entities')
      await bootstrapRoot()
      startBlockNumber = await populateFromCache()
    }

    await Effect.runPromise(getStreamEffect(startBlockNumber))
  } catch (error) {
    console.error('An error occurred:', error)
  }
}

main()
