'use client';

interface Props {
  proposalId: string;
  children: React.ReactNode;
}

export function GovernanceProposalsListItem({ children, proposalId }: Props) {
  return (
    <button className="w-full py-6" onClick={() => console.log('Hello', proposalId)}>
      {children}
    </button>
  );
}
