import { describe, expect, it } from 'vitest';

import { VoteOption, encodeProposalExecutedData, encodeProposalVotedData, padBytes16ToBytes32 } from './governance';

describe('VoteOption', () => {
  it('should have correct enum values matching Solidity contract', () => {
    expect(VoteOption.None).toBe(0);
    expect(VoteOption.Yes).toBe(1);
    expect(VoteOption.No).toBe(2);
    expect(VoteOption.Abstain).toBe(3);
  });
});

describe('padBytes16ToBytes32', () => {
  it('should pad a valid bytes16 hex string to bytes32', () => {
    const input = '1234567890abcdef1234567890abcdef';
    const result = padBytes16ToBytes32(input);

    expect(result).toBe('0x1234567890abcdef1234567890abcdef00000000000000000000000000000000');
    expect(result.length).toBe(66); // 0x + 64 hex chars
  });

  it('should handle input with 0x prefix', () => {
    const input = '0x1234567890abcdef1234567890abcdef';
    const result = padBytes16ToBytes32(input);

    expect(result).toBe('0x1234567890abcdef1234567890abcdef00000000000000000000000000000000');
  });

  it('should handle uppercase hex characters', () => {
    const input = '1234567890ABCDEF1234567890ABCDEF';
    const result = padBytes16ToBytes32(input);

    expect(result).toBe('0x1234567890ABCDEF1234567890ABCDEF00000000000000000000000000000000');
  });

  it('should throw error for too short input', () => {
    const input = '1234567890abcdef'; // Only 16 chars, should be 32

    expect(() => padBytes16ToBytes32(input)).toThrow('Invalid bytes16 hex string: expected 32 hex characters, got 16');
  });

  it('should throw error for too long input', () => {
    const input = '1234567890abcdef1234567890abcdef1234'; // 36 chars, should be 32

    expect(() => padBytes16ToBytes32(input)).toThrow('Invalid bytes16 hex string: expected 32 hex characters, got 36');
  });

  it('should throw error for non-hex characters', () => {
    const input = '1234567890abcdefghijklmnopqrstuv'; // Contains non-hex chars

    expect(() => padBytes16ToBytes32(input)).toThrow('Invalid bytes16 hex string: contains non-hex characters');
  });

  it('should throw error for empty input', () => {
    expect(() => padBytes16ToBytes32('')).toThrow('Invalid bytes16 hex string: expected 32 hex characters, got 0');
  });
});

describe('encodeProposalVotedData', () => {
  it('should encode vote data for Yes vote', () => {
    const proposalId = '0x1234567890abcdef1234567890abcdef' as const;
    const result = encodeProposalVotedData(proposalId, VoteOption.Yes);

    // Result should be a valid hex string
    expect(result.startsWith('0x')).toBe(true);
    // ABI encoded bytes16 + uint8 should produce consistent output
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(2); // More than just '0x'
  });

  it('should encode vote data for No vote', () => {
    const proposalId = '0x1234567890abcdef1234567890abcdef' as const;
    const result = encodeProposalVotedData(proposalId, VoteOption.No);

    expect(result.startsWith('0x')).toBe(true);
    expect(typeof result).toBe('string');
  });

  it('should encode vote data for Abstain vote', () => {
    const proposalId = '0x1234567890abcdef1234567890abcdef' as const;
    const result = encodeProposalVotedData(proposalId, VoteOption.Abstain);

    expect(result.startsWith('0x')).toBe(true);
    expect(typeof result).toBe('string');
  });

  it('should produce different encodings for different vote options', () => {
    const proposalId = '0x1234567890abcdef1234567890abcdef' as const;

    const yesResult = encodeProposalVotedData(proposalId, VoteOption.Yes);
    const noResult = encodeProposalVotedData(proposalId, VoteOption.No);
    const abstainResult = encodeProposalVotedData(proposalId, VoteOption.Abstain);

    // All should be different
    expect(yesResult).not.toBe(noResult);
    expect(yesResult).not.toBe(abstainResult);
    expect(noResult).not.toBe(abstainResult);
  });

  it('should produce different encodings for different proposal IDs', () => {
    const proposalId1 = '0x1234567890abcdef1234567890abcdef' as const;
    const proposalId2 = '0xfedcba0987654321fedcba0987654321' as const;

    const result1 = encodeProposalVotedData(proposalId1, VoteOption.Yes);
    const result2 = encodeProposalVotedData(proposalId2, VoteOption.Yes);

    expect(result1).not.toBe(result2);
  });
});

describe('encodeProposalExecutedData', () => {
  it('should encode execute data', () => {
    const proposalId = '0x1234567890abcdef1234567890abcdef' as const;
    const result = encodeProposalExecutedData(proposalId);

    // Result should be a valid hex string
    expect(result.startsWith('0x')).toBe(true);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(2);
  });

  it('should produce different encodings for different proposal IDs', () => {
    const proposalId1 = '0x1234567890abcdef1234567890abcdef' as const;
    const proposalId2 = '0xfedcba0987654321fedcba0987654321' as const;

    const result1 = encodeProposalExecutedData(proposalId1);
    const result2 = encodeProposalExecutedData(proposalId2);

    expect(result1).not.toBe(result2);
  });

  it('should produce consistent encodings for the same proposal ID', () => {
    const proposalId = '0x1234567890abcdef1234567890abcdef' as const;

    const result1 = encodeProposalExecutedData(proposalId);
    const result2 = encodeProposalExecutedData(proposalId);

    expect(result1).toBe(result2);
  });
});
