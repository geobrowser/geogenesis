import { describe, expect, it } from 'vitest';

import { participantAvatarUrl } from './participant-avatar';

describe('participantAvatarUrl', () => {
  it('qualifies a bare CID so the gateway chain can resolve it', () => {
    expect(participantAvatarUrl('QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o')).toBe(
      'ipfs://QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o'
    );
  });

  // The bug this exists for: prefixing an already-qualified value yields `ipfs://ipfs://…`, whose
  // hash parses out empty and resolves to the bare gateway root — a valid URL that 404s.
  it('leaves an already-qualified ipfs value alone', () => {
    expect(participantAvatarUrl('ipfs://QmT78z')).toBe('ipfs://QmT78z');
  });

  it('leaves values the browser can already fetch alone', () => {
    expect(participantAvatarUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png');
    expect(participantAvatarUrl('http://cdn.example/a.png')).toBe('http://cdn.example/a.png');
    expect(participantAvatarUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(participantAvatarUrl('/local/a.png')).toBe('/local/a.png');
  });

  it('reports nothing for an absent or blank value, so callers draw the generated avatar', () => {
    expect(participantAvatarUrl(null)).toBeUndefined();
    expect(participantAvatarUrl(undefined)).toBeUndefined();
    expect(participantAvatarUrl('')).toBeUndefined();
    expect(participantAvatarUrl('   ')).toBeUndefined();
  });

  it('trims surrounding whitespace before qualifying', () => {
    expect(participantAvatarUrl('  QmT78z  ')).toBe('ipfs://QmT78z');
  });
});
