import { describe, expect, it } from 'vitest';

import { padBytes16ToBytes32 } from './governance';

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
