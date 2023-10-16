import { SmallButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Tick } from '~/design-system/icons/tick';

interface Props {
  isEditor: boolean;
  // vote: "ACCEPTED" | 'REJECTED';
}

export function GovernanceProposalVoteState({ isEditor }: Props) {
  // @TODO add real isActive value
  const isActive = false;

  // @TODO add real status value
  const status = 'ACCEPTED';

  return (
    <>
      <div className="inline-flex flex-[2] items-center justify-center gap-8">
        <div className="flex items-center gap-2 text-metadataMedium">
          <div className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <Tick />
          </div>
          <div className="relative h-1 w-24 overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-green" style={{ width: '100%' }} />
          </div>
          <div>100%</div>
        </div>
        <div className="flex items-center gap-2 text-metadataMedium">
          <div className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <Close />
          </div>
          <div className="relative h-1 w-24 overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-red-01" style={{ width: '0%' }} />
          </div>
          <div>0%</div>
        </div>
      </div>
      {/* @TODO restore */}
      <div className="inline-flex flex-[1] items-center justify-end gap-2 !opacity-0">
        {isActive ? (
          <>
            <SmallButton>Reject</SmallButton>
            <SmallButton>Accept</SmallButton>
          </>
        ) : (
          <StatusBadge status={status} />
        )}
      </div>
    </>
  );
}

type StatusBadgeProps = {
  status: 'ACCEPTED' | 'REJECTED';
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  switch (status) {
    case 'ACCEPTED':
      return (
        <div className="gap-1.5 rounded-sm bg-green/10 px-1.5 py-1 text-smallButton text-xs font-medium leading-none tracking-[-0.17px] text-green">
          You accepted this
        </div>
      );
    case 'REJECTED':
      return (
        <div className="gap-1.5 rounded-sm bg-red-01/10 px-1.5 py-1 text-smallButton text-xs font-medium leading-none tracking-[-0.17px] text-red-01">
          You rejected this
        </div>
      );
    default:
      return <></>;
  }
};
