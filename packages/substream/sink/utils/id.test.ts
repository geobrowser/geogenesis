import { describe, expect, it } from 'vitest';

import { createVersionId } from './id';

describe('createVersionId', () => {
  it('should return a string', () => {
    const result = createVersionId({ proposalId: 'proposal-1', entityId: 'entity-1' });
    expect(result).toBe('JetExwSXsDajGBdkUv3bmN');
  });

  it('should return the same id for the same inputs', () => {
    const result1 = createVersionId({ proposalId: 'proposal-2', entityId: 'entity-2' });
    const result2 = createVersionId({ proposalId: 'proposal-2', entityId: 'entity-2' });
    expect(result1).toBe(result2);
  });

  it('should return different ids for different inputs', () => {
    const result1 = createVersionId({ proposalId: 'proposal-3', entityId: 'entity-3' });
    const result2 = createVersionId({ proposalId: 'proposal-3', entityId: 'entity-4' });
    const result3 = createVersionId({ proposalId: 'proposal-4', entityId: 'entity-3' });

    expect(result1).not.toBe(result2);
    expect(result1).not.toBe(result3);
    expect(result2).not.toBe(result3);
  });

  it('should handle empty strings', () => {
    const result1 = createVersionId({ proposalId: '', entityId: 'entity-5' });
    const result2 = createVersionId({ proposalId: 'proposal-5', entityId: '' });
    const result3 = createVersionId({ proposalId: '', entityId: '' });

    expect(typeof result1).toBe('string');
    expect(typeof result2).toBe('string');
    expect(typeof result3).toBe('string');

    expect(result1).not.toBe(result2);
    expect(result1).not.toBe(result3);
    expect(result2).not.toBe(result3);
  });

  it('should handle special characters in inputs', () => {
    const result = createVersionId({
      proposalId: 'proposal-!@#$%^&*()',
      entityId: 'entity-{}[]|;:,.<>?/',
    });

    expect(typeof result).toBe('string');
  });
});
