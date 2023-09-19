import { cva } from 'class-variance-authority';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Tick } from '~/design-system/icons/tick';

interface Props {
  isEditor: boolean;
  // vote: "ACCEPTED" | 'REJECTED';
}

export function GovernanceProposalVoteState({ isEditor }: Props) {
  return (
    <div className="flex items-center gap-8">
      <div className="flex items-center gap-2 text-metadataMedium">
        <p>Accepted</p>
        <div className="rounded-small rounded-lg h-1 w-[76px] bg-green" />
        <p>100%</p>
        {isEditor && <VoteAcceptButton userVote="ACCEPTED" />}
      </div>

      <div className="flex items-center gap-2 text-metadataMedium">
        <p>Rejected</p>
        <div className="rounded-small rounded-lg h-1 w-[76px] bg-divider" />
        <p>0%</p>
        {isEditor && <VoteRejectButton userVote="ACCEPTED" />}
      </div>
    </div>
  );
}

const voteButtonStyles = cva(
  'relative box-border flex h-6 w-6 items-center justify-center rounded-sm border p-1  transition duration-200 ease-in-out focus:outline-none',
  {
    variants: {
      ACCEPTED: {
        true: 'bg-green text-white border-green cursor-not-allowed',
      },
      REJECTED: {
        true: 'bg-red-01 text-white border-red-01 cursor-not-allowed',
      },
      DISABLED: {
        true: 'bg-divider text-grey-03 border-divider cursor-not-allowed',
      },
    },
    defaultVariants: {
      ACCEPTED: true,
    },
  }
);

interface VoteButtonProps {
  userVote?: 'ACCEPTED' | 'REJECTED';
}

function VoteAcceptButton({ userVote }: VoteButtonProps) {
  if (!userVote) {
    return <SquareButton icon="tick" />;
  }

  return (
    <button className={voteButtonStyles({ ACCEPTED: true, DISABLED: userVote !== 'ACCEPTED' })}>
      <Tick />
    </button>
  );
}

function VoteRejectButton({ userVote }: VoteButtonProps) {
  if (!userVote) {
    return <SquareButton icon="close" />;
  }

  return (
    <button className={voteButtonStyles({ ACCEPTED: false, DISABLED: userVote !== 'REJECTED' })}>
      <Close />
    </button>
  );
}
