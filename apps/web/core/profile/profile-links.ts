/**
 * The handles a person publishes alongside their profile (GEO-2859).
 *
 * Verified against the graph on 2026-09-15. Each holds a handle, not a URL —
 * `journeyingjew`, not `https://x.com/journeyingjew` — so the link is built from
 * the format below rather than from the value.
 *
 * `Accounts` is not among them. That is the wallet address, which the About row
 * shows separately and which nobody would describe as a social link.
 */
export const X_PROPERTY = '0d6259784b3c4b57a86fde45c997c73c';
export const GITHUB_PROPERTY = '9eedefa860ae4ac19a04805054a4b094';
export const LINKEDIN_PROPERTY = 'cdf139bce610446cac42d57cd7967478';

export type ProfileLink = {
  propertyId: string;
  label: string;
  handle: string;
  href: string;
};

const FORMATS: { propertyId: string; label: string; url: (handle: string) => string }[] = [
  { propertyId: X_PROPERTY, label: 'X', url: handle => `https://x.com/${handle}` },
  { propertyId: GITHUB_PROPERTY, label: 'GitHub', url: handle => `https://github.com/${handle}` },
  {
    propertyId: LINKEDIN_PROPERTY,
    label: 'LinkedIn',
    url: handle => `https://www.linkedin.com/in/${handle}`,
  },
];

/**
 * The links worth rendering, in a fixed order.
 *
 * Only the ones carrying a handle. The reference account has all three
 * properties and two of them empty — three greyed icons read as a broken
 * profile, where one link reads as a person who uses one network.
 *
 * A handle someone has pasted as a full URL is taken as-is rather than nested
 * inside the format, because `https://x.com/https://x.com/them` is worse than
 * trusting what they typed.
 */
export function profileLinks(values: { property: { id: string }; value: string }[]): ProfileLink[] {
  const byProperty = new Map<string, string>();

  for (const value of values) {
    const handle = value.value.trim();
    if (handle !== '') byProperty.set(value.property.id, handle);
  }

  return FORMATS.flatMap(({ propertyId, label, url }) => {
    const handle = byProperty.get(propertyId);
    if (handle === undefined) return [];

    const isUrl = /^https?:\/\//i.test(handle);

    return [
      {
        propertyId,
        label,
        handle: isUrl ? handle.replace(/^https?:\/\/(www\.)?/i, '') : handle,
        href: isUrl ? handle : url(handle.replace(/^@/, '')),
      },
    ];
  });
}
