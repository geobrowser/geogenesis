import { describe, expect, it } from 'vitest';

import { GEO_QUERY_SKILL_VERSION, GEO_QUERY_SYSTEM_PROMPT } from './system-prompt';

describe('GEO_QUERY_SYSTEM_PROMPT', () => {
  it('carries the ported skill, not a summary of it', () => {
    // The gotchas are the valuable part — each is a real recurring mistake.
    expect(GEO_QUERY_SYSTEM_PROMPT).toContain('Critical gotchas');
    expect(GEO_QUERY_SYSTEM_PROMPT).toContain('equalTo');
    expect(GEO_QUERY_SYSTEM_PROMPT).toContain('cannot exceed 1000');
    // #14 — the one that answered 0 when the true count was 13.
    expect(GEO_QUERY_SYSTEM_PROMPT).toContain('Publish datetime');
  });

  it('resolves every injected id to a real uuid', () => {
    // A missing SDK export would interpolate the string "undefined" straight
    // into the prompt, and the sub-agent would query for a type that does not
    // exist — then report "no results" as though that were the answer.
    const table = GEO_QUERY_SYSTEM_PROMPT.split('## Well-known IDs (resolved from the SDK this build')[1];
    expect(table).toBeDefined();
    expect(table).not.toContain('undefined');

    const ids = [...table.matchAll(/\| `([^`]+)` \|/g)].map(m => m[1]);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      expect(id).toMatch(/^[a-f0-9]{32}$/i);
    }
  });

  it('does not point the sub-agent at a hardcoded endpoint', () => {
    // The app resolves mainnet vs testnet from chain id. A hardcoded testnet
    // URL in the prompt would have it answer about the wrong network.
    expect(GEO_QUERY_SYSTEM_PROMPT).not.toContain('api-testnet.geobrowser.io');
  });

  it('does not reference the content-management repo', () => {
    // Those paths don't exist in this runtime; following them wastes a step and
    // teaches the model that the tool it has isn't the one to use.
    expect(GEO_QUERY_SYSTEM_PROMPT).not.toContain('gql.mjs');
    expect(GEO_QUERY_SYSTEM_PROMPT).not.toContain('src/constants.ts');
  });

  it('forbids scoping a query by space alone', () => {
    // Measured against the live endpoint: spaceId with no typeId is 9-32s and
    // often returns `Unexpected error` instead of data — true even for
    // `first: 0` on a three-entity space. It was the single largest cause of
    // budget timeouts in round 7, so the rule has to survive prompt edits.
    expect(GEO_QUERY_SYSTEM_PROMPT).toContain('Never scope by space alone');
    expect(GEO_QUERY_SYSTEM_PROMPT).toContain('Unexpected error');
  });

  it('records the skill version it was ported from', () => {
    expect(GEO_QUERY_SKILL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
