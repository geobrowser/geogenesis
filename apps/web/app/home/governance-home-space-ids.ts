import * as Effect from 'effect/Effect';

import { getSpacesWhereMember } from '~/core/io/queries';
import { fetchEditorSpaceIds } from '~/core/io/subgraph/fetch-editor-space-ids';

export async function getGovernanceHomeSpaceContext(memberSpaceId: string) {
  const [editorIds, memberSpaces] = await Promise.all([
    fetchEditorSpaceIds(memberSpaceId),
    Effect.runPromise(getSpacesWhereMember(memberSpaceId)),
  ]);

  const memberIds = memberSpaces.map(s => s.id).filter(id => id !== memberSpaceId);
  const myProposalSpaceIds = [...new Set([...editorIds, ...memberIds])];

  return { editorIds, myProposalSpaceIds };
}
