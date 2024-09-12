import { Triple } from '~/core/types';

import { RelationChangeValue, TripleChangeValue } from './types';

/**
 * Compare the local triple with the remote triple and return the TripleChange.
 * The TripleChange is used to represent what either the before or after renderable
 * should be to include the type of diff to show in the UI.
 *
 * @params triple - the local triple as it exists in the local database as a {@link Triple}
 * @params remoteTriple - the remote triple as it exists in the remote database as a {@link Triple}
 * @returns - {@link TripleChange} or null if the triple is not present in the remote database
 */
export function getBeforeTripleChange(
  value: Triple['value'],
  remoteValue: Triple['value'] | null
): (TripleChangeValue | RelationChangeValue) | null {
  if (remoteValue === null) {
    return null;
  }

  if (value.value !== remoteValue.value) {
    return {
      value: remoteValue.value,
      valueName: remoteValue.type === 'ENTITY' ? remoteValue.name : null,
      type: 'UPDATE',
    };
  }

  return {
    value: remoteValue.value,
    valueName: remoteValue.type === 'ENTITY' ? remoteValue.name : null,
    type: 'REMOVE',
  };
}

/**
 * Compare the local triple with the remote triple and return the TripleChange for the
 * "after" triple. The TripleChange is used to represent what either the before or after
 * renderable should be to include the type of diff to show in the UI.
 *
 * @params triple - the local triple as it exists in the local database as a {@link Triple}
 * @params remoteTriple - the remote triple as it exists in the remote database as a {@link Triple}
 * @returns - {@link TripleChange}. There is always an after triple change, so this version
 * of the function always returns a value.
 */
export function getAfterTripleChange(
  value: Triple['value'],
  remoteValue: Triple['value'] | null
): TripleChangeValue | RelationChangeValue {
  if (remoteValue === null) {
    return {
      value: value.value,
      valueName: value.type === 'ENTITY' ? value.name : null,
      type: 'ADD',
    };
  }

  if (value.value !== remoteValue.value) {
    return {
      value: value.value,
      valueName: value.type === 'ENTITY' ? value.name : null,
      type: 'UPDATE',
    };
  }

  return {
    value: value.value,
    valueName: value.type === 'ENTITY' ? value.name : null,
    type: 'ADD',
  };
}
