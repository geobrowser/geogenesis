import fetchRetryFactory from 'fetch-retry'
export const fetchRetry = fetchRetryFactory(global.fetch)
