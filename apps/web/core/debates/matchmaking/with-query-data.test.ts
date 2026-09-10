import { describe, expect, it } from 'vitest';

import { withQueryData } from './hooks';

/**
 * The wrapper must not read the properties React Query tracks on access: reading them subscribes
 * every consumer of the three hooks to every status change (see the note in `participant-positions`
 * about what that cost a page once already).
 *
 * So this stands in a result whose properties record their own reads, and asserts that taking
 * `data` off the wrapper leaves the rest untouched.
 */
type TrackedResult = {
  data: unknown;
  isFetching: boolean | undefined;
  isLoading: boolean | undefined;
  isRefetching: boolean | undefined;
  status: string | undefined;
  dataUpdatedAt: number | undefined;
};

function trackedResult(data: unknown) {
  const reads: string[] = [];
  const target = { data } as TrackedResult;

  for (const property of ['isFetching', 'isLoading', 'isRefetching', 'status', 'dataUpdatedAt'] as const) {
    Object.defineProperty(target, property, {
      enumerable: true,
      get() {
        reads.push(property);
        return undefined;
      },
    });
  }

  return { target, reads };
}

describe('withQueryData', () => {
  it('does not read tracked properties while replacing data', () => {
    const { target, reads } = trackedResult({ people: [] });

    const wrapped = withQueryData(target, { people: ['resolved'] });
    expect(wrapped.data).toEqual({ people: ['resolved'] });

    // The spread this replaced read every one of them just to build the object.
    expect(reads).toEqual([]);
  });

  it('still forwards a tracked property when a consumer actually reads one', () => {
    const { target, reads } = trackedResult({ people: [] });

    const wrapped = withQueryData(target, { people: [] });
    void wrapped.isFetching;

    expect(reads).toEqual(['isFetching']);
  });
});
