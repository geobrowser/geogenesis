import { EntityId } from '~/core/io/schema';
import { AppOp } from '~/core/types';

import { getAfterTripleChange, getBeforeTripleChange } from './get-triple-change';
import { EntityChange, TripleChange } from './types';

export function fromProposedVersion(ops: AppOp[], entity: { id: string; name: string | null }): EntityChange {
  const tripleChanges: TripleChange[] = [];

  for (const op of ops) {
    // @TODO: Get befores
    const before = getBeforeTripleChange(op.value, null);
    const after = getAfterTripleChange(op.value, null);

    tripleChanges.push({
      attribute: {
        id: op.attributeId,
        name: op.attributeName,
      },
      type: op.value.type,
      before,
      after,
    });
  }

  return {
    id: EntityId(entity.id),
    name: entity.name,
    blockChanges: [],
    changes: tripleChanges,
  };
}
