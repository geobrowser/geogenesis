'use client';

import { useAtom } from 'jotai';
import { ScopeProvider } from 'jotai-scope';

import { useEffect } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useEditable } from '~/core/state/editable-store';

import { AddTeamMember } from './add-team-member';
import {
  addedTeamMemberAtom,
  draftMembersAtom,
  teamMemberAvatarAtom,
  teamMemberNameAtom,
  teamMemberRoleAtom,
  teamMemberStepAtom,
} from './atoms';
import { EditTeamMember, TeamMember } from './team-member';
import { TeamMember as TeamMemberType } from '~/app/space/[id]/team/page';

type TeamMembersProps = {
  spaceId: string;
  teamMembers: Array<TeamMemberType>;
};

export const TeamMembers = ({ spaceId, teamMembers = [] }: TeamMembersProps) => {
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);
  const isEditMode = isEditor && editable;

  const [draftMembers, setDraftMembers] = useAtom(draftMembersAtom);

  useEffect(() => {
    if (!isEditMode) {
      setDraftMembers([0]);
    }
  }, [isEditMode, setDraftMembers]);

  // @TODO remove console.info for teamMembers
  console.info('teamMembers:', teamMembers);

  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-6">
      {isEditMode && (
        <>
          {draftMembers.map(key => {
            return (
              <ScopeProvider
                key={key}
                atoms={[
                  teamMemberStepAtom,
                  teamMemberAvatarAtom,
                  teamMemberNameAtom,
                  teamMemberRoleAtom,
                  addedTeamMemberAtom,
                ]}
              >
                <AddTeamMember spaceId={spaceId} />
              </ScopeProvider>
            );
          })}
        </>
      )}
      {isEditMode ? (
        <>
          {teamMembers.map(teamMember => (
            <EditTeamMember key={teamMember} teamMember={teamMember} />
          ))}
        </>
      ) : (
        <>
          {teamMembers.map(teamMember => (
            <TeamMember key={teamMember} teamMember={teamMember} />
          ))}
        </>
      )}
    </div>
  );
};
