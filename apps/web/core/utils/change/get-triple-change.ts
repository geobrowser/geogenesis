import equal from 'fast-deep-equal';

import { Triple } from '~/core/types';

import { TripleChangeValue } from './types';

export const AfterTripleDiff = {
  diffBefore(afterValue: Triple['value'], beforeValue: Triple['value'] | null): TripleChangeValue | null {
    if (beforeValue === null) {
      return null;
    }

    if (afterValue.value !== beforeValue.value || !equal(afterValue.options, beforeValue.options)) {
      return {
        value: beforeValue.value,
        valueName: null,
        options: beforeValue.options,
        type: 'UPDATE',
      };
    }

    return {
      value: beforeValue.value,
      valueName: null,
      options: beforeValue.options,
      type: 'REMOVE',
    };
  },
  diffAfter(afterValue: Triple['value'], beforeValue: Triple['value'] | null): TripleChangeValue {
    if (beforeValue === null) {
      return {
        value: afterValue.value,
        valueName: null,
        options: afterValue.options,
        type: 'ADD',
      };
    }

    if (afterValue.value !== beforeValue.value || !equal(afterValue.options, beforeValue.options)) {
      return {
        value: afterValue.value,
        valueName: null,
        options: afterValue.options,
        type: 'UPDATE',
      };
    }

    return {
      value: afterValue.value,
      valueName: null,
      options: afterValue.options,
      type: 'ADD',
    };
  },
};

export const BeforeTripleDiff = {
  diffBefore(beforeValue: Triple['value'], afterValue: Triple['value'] | null): TripleChangeValue {
    // Value was deleted
    if (afterValue === null) {
      return {
        value: beforeValue.value,
        valueName: null,
        options: beforeValue.options,
        type: 'REMOVE',
      };
    }

    // Values exist and aren't equal
    if (beforeValue.value !== afterValue.value || !equal(beforeValue.options, afterValue.options)) {
      return {
        value: beforeValue.value,
        options: beforeValue.options,
        valueName: null,
        type: 'UPDATE',
      };
    }

    // Values are the same
    return {
      value: afterValue.value,
      valueName: null,
      options: afterValue.options,
      type: 'UPDATE',
    };
  },
  diffAfter(beforeValue: Triple['value'], afterValue: Triple['value'] | null): TripleChangeValue | null {
    if (afterValue === null) {
      return null;
    }

    if (beforeValue.value !== afterValue.value || !equal(beforeValue.options, afterValue.options)) {
      return {
        value: afterValue.value,
        options: afterValue.options,
        valueName: null,
        type: 'UPDATE',
      };
    }

    return {
      value: afterValue.value,
      options: afterValue.options,
      valueName: null,
      type: 'UPDATE',
    };
  },
};

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
): TripleChangeValue | null {
  if (remoteValue === null) {
    return null;
  }

  if (value.value !== remoteValue.value || !equal(value.options, remoteValue.options)) {
    return {
      value: remoteValue.value,
      options: remoteValue.options,
      valueName: null,
      type: 'UPDATE',
    };
  }

  return {
    value: remoteValue.value,
    options: remoteValue.options,
    valueName: null,
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
export function getAfterTripleChange(value: Triple['value'], remoteValue: Triple['value'] | null): TripleChangeValue {
  if (remoteValue === null) {
    return {
      value: value.value,
      options: value.options,
      valueName: null,
      type: 'ADD',
    };
  }

  if (value.value !== remoteValue.value || !equal(value.options, remoteValue.options)) {
    return {
      value: value.value,
      options: value.options,
      valueName: null,
      type: 'UPDATE',
    };
  }

  return {
    value: value.value,
    options: value.options,
    valueName: null,
    type: 'ADD',
  };
}
