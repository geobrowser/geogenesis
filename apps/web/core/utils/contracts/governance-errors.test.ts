import { describe, expect, it } from 'vitest';

import { decodeGovernanceRevert, describeGovernanceError } from './governance-errors';

// A revert reaches us either decoded (name in the message) or as a bare 4-byte
// selector — both must resolve to the same named, actionable error so a copied
// bug report tells us the exact on-chain cause instead of raw hex.
describe('governance-errors', () => {
  const bySelector = new Error('Execute failed', { cause: new Error('reverted: 0xdf322356') });
  const byName = new Error('Execute failed', { cause: new Error('CanNotExecute()') });
  const unknown = new Error('Execute failed', { cause: new Error('insufficient funds for gas') });

  it('decodes a revert from its raw selector', () => {
    expect(decodeGovernanceRevert(bySelector)?.name).toBe('CanNotExecute');
  });

  it('decodes a revert from its decoded name', () => {
    expect(decodeGovernanceRevert(byName)?.name).toBe('CanNotExecute');
  });

  it('returns null for an unmapped error', () => {
    expect(decodeGovernanceRevert(unknown)).toBeNull();
  });

  it('formats a named, actionable message including the selector', () => {
    const message = describeGovernanceError(bySelector);
    expect(message).toContain('CanNotExecute');
    expect(message).toContain('0xdf322356');
  });

  it('falls back to the raw cause chain for unmapped errors', () => {
    expect(describeGovernanceError(unknown)).toContain('insufficient funds for gas');
  });
});
