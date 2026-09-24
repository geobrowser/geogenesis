import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { ClaimsPageClient } from './claims-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * A space's claims, as their own browse surface.
 *
 * Full-bleed, like the debates feed on the sibling route: no content container here, because
 * `Main` drops its own max-width and padding on this route and `SpaceChromeGate` strips the space
 * header and tabs from it. Both are reached from Overview's Activity card rather than from the tab
 * bar, and framing either inside the tab bar makes it read as a section of the space page instead
 * of the thing you navigated to.
 */
export default async function ClaimsPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  /*
   * Keyed on the space so a navigation between two of them remounts rather than reuses.
   *
   * Everything this page holds belongs to one space: the sort, the search, and above all the
   * picked topics, whose ids mean nothing in another space and would narrow its list to nothing.
   * React reuses an element of the same type across a route-param change, so without this they
   * all carry over — which is also what let the rows query hold the previous space's claims.
   */
  return <ClaimsPageClient key={params.id} spaceId={params.id} />;
}
