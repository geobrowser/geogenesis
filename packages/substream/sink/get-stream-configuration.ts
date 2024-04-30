import { START_BLOCK } from './constants/constants';

type GetStreamConfigurationFn = (
  options: Record<string, any>,
  blockNumberFromCache: number | undefined
) => { shouldUseCursor: boolean; startBlockNumber: number | undefined };

export const getStreamConfiguration: GetStreamConfigurationFn = (options, blockNumberFromCache) => {
  if (options.startBlock) {
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
    shouldUseCursor: true,
  };
};
