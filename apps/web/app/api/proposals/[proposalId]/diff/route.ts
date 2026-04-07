import { NextResponse } from 'next/server';

import { fetchProposalDiffs } from '~/core/io/subgraph/fetch-proposal-diffs';

export async function GET(
  request: Request,
  context: { params: Promise<{ proposalId: string }> }
) {
  const { proposalId } = await context.params;
  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get('spaceId');

  if (!proposalId || !spaceId) {
    return NextResponse.json({ error: 'proposalId and spaceId are required' }, { status: 400 });
  }

  try {
    const diffs = await fetchProposalDiffs(proposalId, spaceId);
    return NextResponse.json({ diffs });
  } catch (e) {
    console.error('[api/proposals/diff]', proposalId, e);
    return NextResponse.json({ error: 'Failed to fetch proposal diffs' }, { status: 500 });
  }
}
