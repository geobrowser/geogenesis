import equal from 'fast-deep-equal';

import { Value } from '~/core/types';

import { TripleChangeValue } from './types';

export const AfterTripleDiff = {
  diffBefore(afterValue: Value, beforeValue: Value | null): TripleChangeValue | null {
    if (beforeValue === null) {
      return null;
    }

    if (afterValue.value !== beforeValue.value || !equal(afterValue.options, beforeValue.options)) {
      return {
        value: beforeValue.value,
        valueName: null,
        options: beforeValue.options ?? undefined,
        type: 'UPDATE',
      };
    }

    return {
      value: beforeValue.value,
      valueName: null,
      options: beforeValue.options ?? undefined,
      type: 'REMOVE',
    };
  },
  diffAfter(afterValue: Value, beforeValue: Value | null): TripleChangeValue {
    if (beforeValue === null) {
      return {
        value: afterValue.value,
        valueName: null,
        options: afterValue.options ?? undefined,
        type: 'ADD',
      };
    }

    if (afterValue.value !== beforeValue.value || !equal(afterValue.options, beforeValue.options)) {
      return {
        value: afterValue.value,
        valueName: null,
        options: afterValue.options ?? undefined,
        type: 'UPDATE',
      };
    }

    return {
      value: afterValue.value,
      valueName: null,
      options: afterValue.options ?? undefined,
      type: 'ADD',
    };
  },
};

export const BeforeTripleDiff = {
  diffBefore(beforeValue: Value, afterValue: Value | null): TripleChangeValue {
    // Value was deleted
    if (afterValue === null) {
      return {
        value: beforeValue.value,
        valueName: null,
        options: beforeValue.options ?? undefined,
        type: 'REMOVE',
      };
    }

    // Values exist and aren't equal
    if (beforeValue.value !== afterValue.value || !equal(beforeValue.options, afterValue.options)) {
      return {
        value: beforeValue.value,
        options: beforeValue.options ?? undefined,
        valueName: null,
        type: 'UPDATE',
      };
    }

    // Values are the same
    return {
      value: afterValue.value,
      valueName: null,
      options: afterValue.options ?? undefined,
      type: 'UPDATE',
    };
  },
  diffAfter(beforeValue: Value, afterValue: Value | null): TripleChangeValue | null {
    if (afterValue === null) {
      return null;
    }

    if (beforeValue.value !== afterValue.value || !equal(beforeValue.options, afterValue.options)) {
      return {
        value: afterValue.value,
        options: afterValue.options ?? undefined,
        valueName: null,
        type: 'UPDATE',
      };
    }

    return {
      value: afterValue.value,
      options: afterValue.options ?? undefined,
      valueName: null,
      type: 'UPDATE',
    };
  },
};
