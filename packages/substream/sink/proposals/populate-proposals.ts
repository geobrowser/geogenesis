import { Effect } from 'effect';

import type { ContentProposal, MembershipProposal, SubspaceProposal } from '../zod';

export function writeContentProposals(proposals: ContentProposal[]): Effect.Effect<never, never, void> {
  return Effect.gen(function* (unwrap) {
    console.log('Writing content proposal to database');
  });
}

export function writeMembershipProposals(proposals: MembershipProposal[]): Effect.Effect<never, never, void> {
  return Effect.gen(function* (unwrap) {
    console.log('Writing membership proposal to database');
  });
}

export function writeSubspaceProposals(proposals: SubspaceProposal[]): Effect.Effect<never, never, void> {
  return Effect.gen(function* (unwrap) {
    console.log('Writing subspace proposal to database');
  });
}
