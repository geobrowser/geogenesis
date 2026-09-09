import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_GUEST_SYSTEM_PROMPT, DEFAULT_MEMBER_SYSTEM_PROMPT } from './chat-system-prompt';

// The tool modules pull in the AI SDK; the registry shape is all we need.
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => ({}) }));

const { memberReadTools, readTools } = await import('./tools/read');

describe('geoQuery availability', () => {
  it('is a member-only tool, not a base one', () => {
    // The route builds a guest's tool set from `readTools` alone, so this is
    // the gate: anything in here is reachable signed-out.
    expect(Object.keys(memberReadTools)).toContain('geoQuery');
    expect(Object.keys(readTools)).not.toContain('geoQuery');
  });

  it('is not described to guests', () => {
    // Not the same as the deliberate "you do not have research/webFetch"
    // disclaimer — that tells the model what it lacks. Describing geoQuery as
    // usable would have a guest call a tool it was never given.
    expect(DEFAULT_GUEST_SYSTEM_PROMPT).not.toContain('geoQuery');
  });

  it('is described to members, with its routing rules', () => {
    expect(DEFAULT_MEMBER_SYSTEM_PROMPT).toContain('geoQuery');
    // Both halves of the routing decision have to be stated, or the model
    // either never reaches for it or reaches for it on every lookup.
    expect(DEFAULT_MEMBER_SYSTEM_PROMPT).toContain('Go straight to');
    expect(DEFAULT_MEMBER_SYSTEM_PROMPT).toContain("Don't use it");
  });

  it('tells members not to deny existence on a geoQuery miss', () => {
    // geoQuery reads published data only. Letting it be the basis for "that
    // doesn't exist" means telling someone the entity they created a minute
    // ago — and can see on screen — isn't there.
    expect(DEFAULT_MEMBER_SYSTEM_PROMPT).toContain('no published match');
  });
});
