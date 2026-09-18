import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { cache } from 'react';

import { fetchEditorSpaceIds } from '~/core/io/subgraph/fetch-editor-space-ids';
import { fetchMemberSpaces } from '~/core/io/subgraph/fetch-member-spaces';

const EMPTY_CONTEXT = { editorIds: [] as string[], myProposalSpaceIds: [] as string[] };

/**
 * Both queries below take `memberSpaceId` as a GraphQL `UUID!`, so a caller has to hand over a real
 * space id — and `Profile.spaceId` is not guaranteed to be one.
 *
 * `fetchProfile` returns `defaultProfile(walletAddress, walletAddress)` on all three of its failure
 * paths (address fails validation, the REST call fails, the response fails to decode), which puts a
 * `0x…` wallet address in the space-id field. Callers checked it for truthiness, which a non-empty
 * address passes, so the address reached the API and both queries came back 400: `Variable
 * "$memberSpaceId" got invalid value "0x77b3…"; Invalid UUID`. 274 occurrences, and it renders the
 * governance space pickers empty for exactly the users whose profile lookup already failed.
 *
 * Guarded here rather than at each call site: this is the one function that turns a profile's
 * `spaceId` into UUID-typed queries, and there are four entry points into it (`/home`, `/explore`,
 * and the activity and explore feed routes). `core/types.ts` gives this instruction for
 * `Profile.id` for the same reason; `spaceId` carries the same hazard.
 */
export const getGovernanceHomeSpaceContext = cache(async (memberSpaceId: string) => {
  if (!IdUtils.isValid(memberSpaceId)) return EMPTY_CONTEXT;

  const [editorIds, memberSpaces] = await Promise.all([
    fetchEditorSpaceIds(memberSpaceId),
    fetchMemberSpaces(memberSpaceId),
  ]);

  const memberIds = memberSpaces.map(s => s.id).filter(id => id !== memberSpaceId);
  const myProposalSpaceIds = [...new Set([...editorIds, ...memberIds])];

  return { editorIds, myProposalSpaceIds };
});
