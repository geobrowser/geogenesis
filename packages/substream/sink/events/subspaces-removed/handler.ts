import { Effect } from 'effect';

import type { SubspaceRemoved } from './parser';
import type { BlockEvent } from '~/sink/types';
import { slog } from '~/sink/utils/slog';

export function handleSubspacesRemoved(_: SubspaceRemoved[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      level: 'error',
      requestId: block.requestId,
      message: `handleSubspacesRemoved is not implemented`,
    });

    return;
  });
}
