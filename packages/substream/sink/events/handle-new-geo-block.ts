import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { Blocks } from '../db';
import type { GeoBlock } from '../types';

// @TODO: Where should this go?
export function handleNewGeoBlock(block: GeoBlock) {
  return Effect.gen(function* (_) {
    const newBlock: S.geo_blocks.Insertable = {
      hash: block.hash,
      network: block.network,
      number: String(block.blockNumber),
      timestamp: block.timestamp,
    };

    yield* _(Effect.promise(() => Blocks.upsert([newBlock])));
  });
}
