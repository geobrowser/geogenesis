import { START_BLOCK } from './constants/constants';

type GetStreamConfigurationFn = (
  options: Record<string, any>,
  blockNumberFromCache: number | undefined
) => { shouldUseCursor: boolean; startBlockNumber: number | undefined };

export const getStreamConfiguration: GetStreamConfigurationFn = (options, blockNumberFromCache) => {
  let shouldUseCursor = true;
  let startBlockNumber: number | undefined;

  if (options.fromCache && options.startBlock) {
    console.info("Can't use --from-cache and --start-block together. Defaulting to --from-cache.");
  }

  // Reading from cache assumes that you want to start at the first entry in the cache. This entry
  // may or may not be the genesis block. Either way we want to start indexing at the most recent
  // block in the cache once reading from cache has finished.
  if (options.fromCache) {
    console.info(`Configured to start stream from block ${startBlockNumber} after populating data from cache.`);

    return {
      startBlockNumber: blockNumberFromCache,
      shouldUseCursor: false,
    };
  }

  if (options.startBlock && !options.fromCache) {
    console.info(`Configured to start stream from block ${Number(options.startBlock)}.`);

    return {
      startBlockNumber: Number(options.startBlock),
      shouldUseCursor: false,
    };
  }

  return {
    // Default to using the value in .env. If there's no value in .env default to the Geo genesis block.
    startBlockNumber: START_BLOCK,

    // We should always use cursor unless we specify a block number or have used the cache.
    shouldUseCursor,
  };
};
