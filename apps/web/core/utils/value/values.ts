import type { Value } from '~/core/types';

export function merge(values: Value[], remoteValues: Value[]) {
  const localTripleIds = new Set(values.map(v => v.id));
  const remoteTriplesWithoutLocalTriples = remoteValues.filter(v => !localTripleIds.has(v.id));

  return [...remoteTriplesWithoutLocalTriples, ...values];
}
