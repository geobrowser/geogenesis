'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { ROLE_ATTRIBUTE } from '@geogenesis/ids/system-ids';
import { useAtom, useSetAtom } from 'jotai';

import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { Services } from '~/core/services';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';

import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { Avatar } from '~/design-system/avatar';
import { SmallButton, SquareButton } from '~/design-system/button';
import { DeletableChipButton } from '~/design-system/chip';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { Warning } from '~/design-system/icons/warning';
import { PopoverMenu } from '~/design-system/popover-menu';

import {
  addedTeamMemberAtom,
  draftMembersAtom,
  teamMemberAvatarAtom,
  teamMemberNameAtom,
  teamMemberRoleAtom,
  teamMemberStepAtom,
} from './atoms';
import { NoAvatar } from './no-avatar';
import { TeamMemberCreatedToast } from './toast';
import type { Role } from './types';

type CreateTeamMemberProps = {
  spaceId: string;
};

export const CreateTeamMember = ({ spaceId }: CreateTeamMemberProps) => {
  const setStep = useSetAtom(teamMemberStepAtom);
  const [avatar, setAvatar] = useAtom(teamMemberAvatarAtom);
  const [name, setName] = useAtom(teamMemberNameAtom);
  const [role, setRole] = useAtom(teamMemberRoleAtom);
  const [hasAddedTeamMember, setHasAddedTeamMember] = useAtom(addedTeamMemberAtom);
  const [draftMembers, setDraftMembers] = useAtom(draftMembersAtom);

  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);

  const [, setToast] = useToast();
  const { create } = useActionsStore();

  const handleAddUnlinkedTeamMember = () => {
    if (!name || !role) return;

    const newEntityId = ID.createEntityId();

    // Add name attribute
    create(
      Triple.withId({
        space: spaceId,
        entityId: newEntityId,
        entityName: name,
        attributeId: SYSTEM_IDS.NAME,
        attributeName: 'Name',
        value: {
          type: 'string',
          id: ID.createValueId(),
          value: name,
        },
      })
    );

    // Add avatar attribute
    if (avatar) {
      create(
        Triple.withId({
          space: spaceId,
          entityId: newEntityId,
          entityName: name,
          attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
          attributeName: 'Avatar',
          value: {
            type: 'image',
            id: ID.createValueId(),
            value: Value.toImageValue(avatar),
          },
        })
      );
    }

    // Add role attribute
    create(
      Triple.withId({
        space: spaceId,
        entityId: newEntityId,
        entityName: name,
        attributeId: ROLE_ATTRIBUTE,
        attributeName: 'Role',
        value: {
          type: 'entity',
          id: role.id,
          name: role.name,
        },
      })
    );

    // Add person type
    create(
      Triple.withId({
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.TYPES,
        entityName: name,
        attributeName: 'Types',
        space: spaceId,
        value: {
          type: 'entity',
          id: SYSTEM_IDS.PERSON_TYPE,
          name: 'Person',
        },
      })
    );

    setHasAddedTeamMember(true);
    setToast(<TeamMemberCreatedToast name={name} entityId={newEntityId} spaceId={spaceId} linked={false} />);
    setDraftMembers([draftMembers.length, ...draftMembers]);
  };

  const handleCancel = () => {
    setAvatar(null);
    setName(null);
    setRole(null);
    setStep('start');
  };

  const handleChangeRole = (role: Role) => {
    setRole(role);
  };

  const handleResetRole = () => {
    setRole(null);
  };

  const { storageClient } = Services.useServices();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadAvatar = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleChangeAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const ipfsUri = await storageClient.uploadFile(file);
      const imageValue = Value.toImageValue(ipfsUri);
      setAvatar(imageValue);
      setIsAvatarMenuOpen(false);
    }
  };

  const handleClearAvatar = () => {
    setAvatar(null);
    setIsAvatarMenuOpen(false);
  };

  const isDisabled = !name || !role;

  return (
    <div className="relative w-full rounded-lg border border-grey-02 p-4">
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <div className="inline-flex flex-col items-center justify-center gap-2">
            <div className="relative h-[48px] w-[48px] overflow-clip rounded">
              {avatar ? <Avatar size={48} square avatarUrl={avatar} /> : <NoAvatar />}
            </div>
            {!hasAddedTeamMember && (
              <PopoverMenu
                isOpen={isAvatarMenuOpen}
                onOpenChange={setIsAvatarMenuOpen}
                menu={
                  <>
                    <SquareButton onClick={handleUploadAvatar} icon={<Upload />} />
                    {avatar !== null && <SquareButton onClick={handleClearAvatar} icon={<Trash />} />}
                  </>
                }
                position="top"
              />
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg"
            id="avatar-file"
            className="hidden"
            onChange={handleChangeAvatar}
          />
        </div>
        <div className="w-full">
          <div className="border-b border-divider pb-2">
            <input
              value={name ?? ''}
              onChange={({ currentTarget: { value } }) => setName(value)}
              placeholder="Name..."
              className="relative z-10 h-auto w-full text-body font-medium placeholder:text-grey-02 focus:outline-none"
            />
          </div>
          <div className="mt-4 border-b border-divider pb-2">
            {!hasAddedTeamMember ? (
              <>
                {!role ? (
                  <EntityTextAutocomplete
                    spaceId={spaceId}
                    placeholder="Find or create role..."
                    onDone={handleChangeRole}
                    itemIds={[]}
                    allowedTypes={[{ typeId: '9c1922f1-d7a2-47d1-841d-234cb2f56991', typeName: 'Role' }]}
                    attributeId="9c1922f1-d7a2-47d1-841d-234cb2f56991"
                    className="!h-auto !font-medium"
                  />
                ) : (
                  <div className="flex h-[29px] items-center text-body font-medium">
                    <DeletableChipButton onClick={handleResetRole}>{role.name}</DeletableChipButton>
                  </div>
                )}
              </>
            ) : (
              <div className="text-body font-medium">{role?.name}</div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 flex h-[1.5625rem] gap-4">
        {!hasAddedTeamMember ? (
          <>
            <div className="flex-1">
              <SmallButton onClick={handleCancel} variant="secondary" className="w-full !shadow-none">
                Cancel
              </SmallButton>
            </div>
            <div className="flex-1">
              <SmallButton
                onClick={handleAddUnlinkedTeamMember}
                variant="primary"
                disabled={isDisabled}
                className="w-full !shadow-none"
              >
                Add team member
              </SmallButton>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-metadataMedium text-orange">
            <Warning />
            <div>Unpublished</div>
          </div>
        )}
      </div>
      {hasAddedTeamMember && <div className="absolute inset-0 z-20 cursor-not-allowed" />}
    </div>
  );
};
