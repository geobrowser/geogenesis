import { describe, expect, it } from 'vitest';

import { GITHUB_PROPERTY, LINKEDIN_PROPERTY, X_PROPERTY, profileLinks } from './profile-links';

const value = (propertyId: string, text: string) => ({ property: { id: propertyId }, value: text });

describe('profileLinks', () => {
  it('builds a URL from a handle', () => {
    expect(profileLinks([value(X_PROPERTY, 'journeyingjew')])).toEqual([
      { propertyId: X_PROPERTY, label: 'X', handle: 'journeyingjew', href: 'https://x.com/journeyingjew' },
    ]);
  });

  // The reference account carries all three properties with two of them empty.
  // Three greyed icons read as a broken profile.
  it('leaves out a property with no handle in it', () => {
    const links = profileLinks([
      value(X_PROPERTY, 'journeyingjew'),
      value(GITHUB_PROPERTY, ''),
      value(LINKEDIN_PROPERTY, '   '),
    ]);

    expect(links.map(link => link.label)).toEqual(['X']);
  });

  it('keeps a fixed order however the values arrive', () => {
    const links = profileLinks([
      value(LINKEDIN_PROPERTY, 'preston'),
      value(GITHUB_PROPERTY, 'preston'),
      value(X_PROPERTY, 'preston'),
    ]);

    expect(links.map(link => link.label)).toEqual(['X', 'GitHub', 'LinkedIn']);
  });

  // Nesting a URL inside the format gives https://x.com/https://x.com/them.
  it('takes a pasted URL as it stands', () => {
    const [link] = profileLinks([value(X_PROPERTY, 'https://x.com/someone')]);

    expect(link?.href).toBe('https://x.com/someone');
    expect(link?.handle).toBe('x.com/someone');
  });

  it('drops a leading @ before building the URL', () => {
    expect(profileLinks([value(X_PROPERTY, '@someone')])[0]?.href).toBe('https://x.com/someone');
  });

  it('ignores properties it does not know', () => {
    expect(profileLinks([value('a126ca530c8e48d5b88882c734c38935', 'Preston Mantel')])).toEqual([]);
  });
});
