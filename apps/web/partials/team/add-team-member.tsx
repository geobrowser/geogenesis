'use client';

import { useAtomValue } from 'jotai';

import { teamMemberStepAtom } from './atoms';
import { CreateTeamMember } from './create-team-member';
import { FindTeamMember } from './find-team-member';
import { SelectFindOrCreate } from './select-find-or-create';

type AddTeamMemberProps = {
  spaceId: string;
};

export const AddTeamMember = ({ spaceId }: AddTeamMemberProps) => {
  const step = useAtomValue(teamMemberStepAtom);

  switch (step) {
    case 'start':
      return <SelectFindOrCreate />;
    case 'find':
      return <FindTeamMember spaceId={spaceId} />;
    case 'create':
      return <CreateTeamMember spaceId={spaceId} />;
    default:
      break;
  }
};
