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

  console.info(`Configured to start stream from cache using block ${blockNumberFromCache}.`);

  return {
    startBlockNumber: blockNumberFromCache ?? 881,

    // We should always use cursor unless we specify a block number or have used the cache.
    shouldUseCursor: true,
  };
};
