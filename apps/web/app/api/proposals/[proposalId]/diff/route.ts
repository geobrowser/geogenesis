import { NextResponse } from 'next/server';

import { fetchProposalDiffs } from '~/core/io/subgraph/fetch-proposal-diffs';

export async function GET(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await context.params;
  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get('spaceId');

  if (!proposalId || !spaceId) {
    return NextResponse.json({ error: 'proposalId and spaceId are required' }, { status: 400 });
  }

  try {
    const result = await fetchProposalDiffs(proposalId, spaceId);

    if (result.status === 'not_cached') {
      return NextResponse.json({ error: 'Edit blob not cached for this proposal' }, { status: 404 });
    }

    if (result.status === 'encoding_error') {
      return NextResponse.json({ error: 'Edit blob failed GRC-20 validation and cannot be decoded' }, { status: 422 });
    }

    return NextResponse.json({ diffs: result.entities });
  } catch (e) {
    console.error('[api/proposals/diff]', proposalId, e);
    return NextResponse.json({ error: 'Failed to fetch proposal diffs' }, { status: 500 });
  }
}
