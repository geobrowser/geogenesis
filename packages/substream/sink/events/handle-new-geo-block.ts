import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { Blocks } from '../db';
import type { GeoBlock } from '../types';

// @TODO: Where should this go?
export function handleNewGeoBlock(block: GeoBlock) {
  return Effect.gen(function* (_) {
    const newBlock: S.geo_blocks.Insertable = {
      hash: `0x${block.hash}`,
      network: block.network,
      number: String(block.blockNumber),
      timestamp: new Date(block.timestamp * 1000).toISOString(),
    };

    yield* _(Effect.promise(() => Blocks.upsert([newBlock])));
  });
}
