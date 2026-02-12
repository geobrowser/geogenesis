import { Mutator } from '~/core/sync/use-mutate';
import { Property, Value } from '~/core/types';

/**
 * Actions that flow through onChangeEntry. All of these can be the first
 * interaction with a placeholder row, triggering entity creation.
 *
 * Property cells on existing entities write directly via storage.* since
 * they never involve placeholders. See writeValue() below.
 */
export type Action =
  | { type: 'SET_VALUE'; property: Pick<Property, 'id' | 'name' | 'dataType'>; value: string }
  | { type: 'SET_NAME'; name: string }
  | {
      type: 'FIND_ENTITY';
      entity: { id: string; name: string | null; space?: string; verified?: boolean };
    }
  | { type: 'CREATE_ENTITY'; name: string | null };

export type onChangeEntryFn = (entityId: string, spaceId: string, action: Action) => void;

export type onLinkEntryFn = (
  id: string,
  to: {
    id: string;
    name: string | null;
    space?: string;
    verified?: boolean;
  },
  currentlyVerified?: boolean
) => void;

/**
 * Shared value write logic used by onChangeEntry (for placeholder rows)
 * and by ValueGroup/EditableValueGroup (for existing entities).
 *
 * Determines create vs update based on whether existingValue is provided.
 */
export function writeValue(
  storage: Mutator,
  entityId: string,
  spaceId: string,
  property: Pick<Property, 'id' | 'name' | 'dataType'>,
  value: string,
  existingValue: Value | null
) {
  if (existingValue) {
    storage.values.update(existingValue, draft => {
      draft.value = value;
    });
  } else {
    storage.values.set({
      entity: { id: entityId, name: null },
      property: {
        id: property.id,
        name: property.name,
        dataType: property.dataType,
      },
      spaceId,
      value,
    });
  }
}
