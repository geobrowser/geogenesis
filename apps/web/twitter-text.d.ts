// Import only the parser/config ESM modules; the package entrypoint includes linkification code.
declare module 'twitter-text/dist/esm/parseTweet' {
  export { parseTweet as default } from 'twitter-text';
}

declare module 'twitter-text/dist/esm/configs' {
  const configs: { defaults: Required<import('twitter-text').ParseTweetOptions> };
  export default configs;
}
