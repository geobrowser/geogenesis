import { notFound } from 'next/navigation';

import { fetchProposal } from '~/core/io/subgraph';

interface Props {
  params: { proposalId: string };
}

export default async function ProposalPage({ params }: Props) {
  const proposal = await fetchProposal({ id: params.proposalId });

  if (!proposal) {
    notFound();
  }

  return <div>{proposal.name}</div>;
}
