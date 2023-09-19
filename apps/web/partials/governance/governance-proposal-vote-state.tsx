export function GovernanceProposalVoteState() {
  return (
    <div className="flex items-center gap-8">
      <div className="flex items-center gap-2 text-metadataMedium">
        <p>Accepted</p>
        <div className="rounded-small rounded-lg h-1 w-[76px] bg-green" />
        <p>100%</p>
      </div>

      <div className="flex items-center gap-2 text-metadataMedium">
        <p>Rejected</p>
        <div className="rounded-small rounded-lg h-1 w-[76px] bg-divider" />
        <p>0%</p>
      </div>
    </div>
  );
}
