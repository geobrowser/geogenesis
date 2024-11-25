import type { SetTripleOp } from '../types';

export function isEntityValueOp(value: SetTripleOp['triple']['value']): boolean {
  return value.type === 'URI' && value.value.startsWith('graph://');
}
