import { describe, expect, it } from 'vitest';

import { computeBountiesEnabledForNetwork, parseCuratorApiBaseUrl } from './config';

describe('parseCuratorApiBaseUrl', () => {
  it('returns null for unset or blank values', () => {
    expect(parseCuratorApiBaseUrl(undefined)).toBeNull();
    expect(parseCuratorApiBaseUrl(null)).toBeNull();
    expect(parseCuratorApiBaseUrl('')).toBeNull();
    // A whitespace-only Vercel env value slips past `?? fallback` checks — it
    // must read as "unset" here, not as a usable base URL.
    expect(parseCuratorApiBaseUrl('   ')).toBeNull();
  });

  it('trims whitespace and trailing slashes', () => {
    expect(parseCuratorApiBaseUrl(' https://curator.example.com/ ')).toBe('https://curator.example.com');
    expect(parseCuratorApiBaseUrl('https://curator.example.com///')).toBe('https://curator.example.com');
    expect(parseCuratorApiBaseUrl('https://curator.example.com')).toBe('https://curator.example.com');
  });
});

describe('computeBountiesEnabledForNetwork', () => {
  it('requires both testnet and a configured curator-backend URL', () => {
    expect(computeBountiesEnabledForNetwork(true, 'https://curator.example.com')).toBe(true);
    expect(computeBountiesEnabledForNetwork(true, null)).toBe(false);
    expect(computeBountiesEnabledForNetwork(false, 'https://curator.example.com')).toBe(false);
    expect(computeBountiesEnabledForNetwork(false, null)).toBe(false);
  });
});
