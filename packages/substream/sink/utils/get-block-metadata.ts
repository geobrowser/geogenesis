import type { BlockScopedData } from '@substreams/core/proto';

import type { BlockEvent } from '../types';

export function getBlockMetadata(block: BlockScopedData): BlockEvent {
  const cursor = block.cursor;
  const blockNumber = Number(block.clock?.number.toString());
  const timestamp = Number(block.clock?.timestamp?.seconds.toString());

  return {
    blockNumber,
    cursor,
    timestamp,
  };
}
