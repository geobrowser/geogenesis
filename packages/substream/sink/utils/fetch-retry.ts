import fetchRetryFactory from 'fetch-retry';

export const fetchRetry: ReturnType<typeof fetchRetryFactory> = fetchRetryFactory(global.fetch);
