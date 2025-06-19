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
