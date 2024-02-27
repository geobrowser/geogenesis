'use client';

import { useSetAtom } from 'jotai';

import { teamMemberStepAtom } from './atoms';

export const SelectFindOrCreate = () => {
  const setStep = useSetAtom(teamMemberStepAtom);

  return (
    <div className="w-full rounded-lg border border-grey-02 p-4">
      <div className="flex h-full flex-col justify-between">
        <button onClick={() => setStep('find')} className="flex items-center gap-4">
          <div className="relative h-[48px] w-[48px] flex-shrink-0 overflow-clip rounded">
            <img src="/images/team/find-member.png" alt="" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-tableCell font-medium text-ctaPrimary">Link existing user to your team</div>
            <div className="text-grey-04">Add someone using their Geo Person ID</div>
          </div>
        </button>
        <hr className="my-4 h-px w-full border-none bg-divider" />
        <button onClick={() => setStep('create')} className="flex items-center gap-4">
          <div className="relative h-[48px] w-[48px] flex-shrink-0 overflow-clip rounded">
            <img src="/images/team/create-member.png" alt="" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-tableCell font-medium text-ctaPrimary">Create unlinked team member</div>
            <div className="text-grey-04">For team members who aren’t on Geo yet</div>
          </div>
        </button>
      </div>
    </div>
  );
};
