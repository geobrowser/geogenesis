import configs from 'twitter-text/dist/esm/configs';
import parseTweet from 'twitter-text/dist/esm/parseTweet';

/** Reserve the destination link and preserve whole graphemes when shortening X text. */
export function xShareMessage(rawClaim: string, tagline: string): string {
  const claim = rawClaim.trim().normalize('NFC');
  const suffix = `. ${tagline}`;
  const maxWeight = configs.defaults.maxWeightedTweetLength - configs.defaults.transformedURLLength - 1;
  const fullMessage = `${claim}${suffix}`;
  if (parseTweet(fullMessage).weightedLength <= maxWeight) return fullMessage;

  const claimBudget = maxWeight - parseTweet(`…${suffix}`).weightedLength;
  const { validRangeEnd } = parseTweet(claim, { ...configs.defaults, maxWeightedTweetLength: claimBudget });
  let end = 0;
  for (const { index, segment } of new Intl.Segmenter().segment(claim)) {
    if (index + segment.length > validRangeEnd + 1) break;
    end = index + segment.length;
  }
  return `${claim.slice(0, end).trimEnd()}…${suffix}`;
}
