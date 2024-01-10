'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import cx from 'classnames';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import Link from 'next/link';

import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { Subgraph } from '~/core/io';
import { fetchEntityType } from '~/core/io/fetch-entity-type';
import { Services } from '~/core/services';
import { useEditable } from '~/core/state/editable-store';
import { Entity as EntityType } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Value } from '~/core/utils/value';

import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { Avatar } from '~/design-system/avatar';
import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { DeletableChipButton } from '~/design-system/chip';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { InfoSmall } from '~/design-system/icons/info-small';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';
import { Tick } from '~/design-system/icons/tick';
import { Trash } from '~/design-system/icons/trash';
import { Unlink } from '~/design-system/icons/unlink';
import { Upload } from '~/design-system/icons/upload';
import { Menu } from '~/design-system/menu';
import { PopoverMenu } from '~/design-system/popover-menu';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

import { teamMemberAvatarAtom, teamMemberNameAtom, teamMemberRoleAtom, teamMemberStepAtom } from './atoms';

type TeamMembersProps = {
  spaceId: string;
  teamMembers: Array<any>;
};

type Role = { id: string; name: string | null } | EntityType;

export const TeamMembers = ({ spaceId, teamMembers = [] }: TeamMembersProps) => {
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);
  const isEditMode = isEditor && editable;

  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-6">
      {isEditMode && <FindOrCreateTeamMember spaceId={spaceId} />}
      {teamMembers.map(teamMember => (
        <TeamMember key={teamMember} teamMember={teamMember} />
      ))}
    </div>
  );
};

type FindOrCreateTeamMemberProps = {
  spaceId: string;
};

const FindOrCreateTeamMember = ({ spaceId }: FindOrCreateTeamMemberProps) => {
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

const SelectFindOrCreate = () => {
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

type FindTeamMemberProps = {
  spaceId: string;
};

const FindTeamMember = ({ spaceId }: FindTeamMemberProps) => {
  const setStep = useSetAtom(teamMemberStepAtom);
  const [avatar, setAvatar] = useAtom(teamMemberAvatarAtom);
  const [name, setName] = useAtom(teamMemberNameAtom);
  const [role, setRole] = useAtom(teamMemberRoleAtom);

  const [entityId, setEntityId] = useState<string>('');

  const [person, setPerson] = useState<EntityType | null>(null);
  const [linkedAvatar, setLinkedAvatar] = useState<string | null>(null);
  const [hasFoundPerson, setHasFoundPerson] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);

  const handleAddLinkedTeamMember = () => {
    console.info(`handle add linked team member`);
  };

  const handleChangeRole = (role: Role) => {
    setRole(role);
  };

  const handleResetRole = () => {
    setRole(null);
  };

  const handleCancel = () => {
    setAvatar(null);
    setName(null);
    setRole(null);
    setPerson(null);
    setLinkedAvatar(null);
    setHasFoundPerson(false);
    setStep('start');
  };

  const handleOnChangeEntityId = useCallback(
    async ({ currentTarget: { value } }: ChangeEvent<HTMLInputElement>) => {
      if (error) return;

      const isValidEntityId = value.trim().length === 36;

      if (!isValidEntityId) {
        setEntityId(value);
      } else {
        const entityId = value.trim();
        setEntityId(entityId);

        const person = await Subgraph.fetchEntity({
          id: entityId,
        });

        if (person) {
          const types = await fetchEntityType({
            id: entityId,
          });

          if (types.includes(SYSTEM_IDS.PERSON_TYPE)) {
            const avatar = Entity.avatar(person?.triples);
            setAvatar(avatar);
            setName(Entity.name(person?.triples ?? []));
            setPerson(person);
            setLinkedAvatar(avatar);
            setHasFoundPerson(true);
          } else {
            setEntityId('');
            setError(true);
          }
        } else {
          setEntityId('');
          setError(true);
        }
      }
    },
    [setAvatar, setName, error]
  );

  const { storageClient } = Services.useServices();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadAvatar = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleOnChangeAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const ipfsUri = await storageClient.uploadFile(file);
      const imageValue = Value.toImageValue(ipfsUri);
      setAvatar(imageValue);
      setIsAvatarMenuOpen(false);
    }
  };

  const handleResetAvatar = () => {
    setAvatar(linkedAvatar);
    setIsAvatarMenuOpen(false);
  };

  const handleClearAvatar = () => {
    setAvatar(null);
    setIsAvatarMenuOpen(false);
  };

  const handleClearError = () => {
    if (!error) return;

    setEntityId('');
    setError(false);
  };

  const isDisabled = !name || !role;

  return (
    <div className="relative w-full rounded-lg border border-grey-02 p-4">
      <div className="relative z-10 flex gap-4">
        <div className="flex-shrink-0">
          {!hasFoundPerson ? (
            <div className="relative h-[48px] w-[48px] overflow-clip rounded">
              <NoAvatar />
            </div>
          ) : (
            <div className="inline-flex flex-col items-center justify-center gap-2">
              <div className={cx('relative h-[48px] w-[48px] overflow-clip rounded')}>
                {avatar ? <Avatar size={48} square avatarUrl={avatar} /> : <NoAvatar />}
              </div>
              <PopoverMenu
                isOpen={isAvatarMenuOpen}
                onOpenChange={setIsAvatarMenuOpen}
                menu={
                  <>
                    <SquareButton onClick={handleUploadAvatar} icon={<Upload />} />
                    {hasFoundPerson && avatar !== linkedAvatar && (
                      <SquareButton onClick={handleResetAvatar} icon={<RetrySmall />} />
                    )}
                    {avatar !== null && <SquareButton onClick={handleClearAvatar} icon={<Trash />} />}
                  </>
                }
                position="top"
              />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg"
            id="avatar-file"
            className="hidden"
            onChange={handleOnChangeAvatar}
          />
        </div>
        <div className="relative w-full">
          <div
            onClick={handleClearError}
            className={cx('relative border-b pb-2', !error ? 'border-divider' : 'cursor-pointer border-red-01')}
          >
            {!hasFoundPerson ? (
              <input
                value={entityId ?? ''}
                onChange={handleOnChangeEntityId}
                placeholder="Paste the Geo user’s ID..."
                className={cx(
                  'relative z-10 m-0 h-auto w-full bg-transparent p-0 text-body font-medium placeholder:text-grey-02 focus:outline-none',
                  error && '!cursor-pointer'
                )}
              />
            ) : (
              <input
                value={name ?? ''}
                onChange={({ currentTarget: { value } }) => setName(value)}
                className="relative z-10 h-auto w-full text-body font-medium focus:outline-none"
              />
            )}
            <div className="absolute bottom-2 right-0 top-0 z-20 inline-flex items-center justify-center bg-white">
              {!error && (
                <>
                  {!hasFoundPerson ? (
                    <Tooltip
                      trigger={
                        <div>
                          <InfoSmall />
                        </div>
                      }
                      label={`You can copy a user’s Person ID from the ... on their profile page`}
                      position="top"
                    />
                  ) : (
                    <a
                      href={`https://geobrowser.io/space/0xb4476a42a66ec1356a58d300555169e17db6756c/${entityId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <RightArrowLong />
                    </a>
                  )}
                </>
              )}
              {error && <Close />}
            </div>
          </div>
          <div className="relative mt-4 border-b border-divider pb-2">
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
            {error && (
              <div className="absolute inset-0 z-10 flex h-full w-full items-center bg-white">
                <div className="-mt-4 text-errorMessage text-red-01">
                  Oops! It looks like there’s an issue. You need to enter a valid Person ID.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-4">
        <div className="flex-1">
          <SmallButton onClick={handleCancel} variant="secondary" className="w-full !shadow-none">
            Cancel
          </SmallButton>
        </div>
        <div className="flex-1">
          <SmallButton
            onClick={handleAddLinkedTeamMember}
            variant="primary"
            disabled={isDisabled}
            className="w-full !shadow-none"
          >
            Add team member
          </SmallButton>
        </div>
      </div>
    </div>
  );
};

const NoAvatar = () => <img src="/images/team/no-avatar.png" alt="" className="h-full w-full object-contain" />;

type CreateTeamMemberProps = {
  spaceId: string;
};

const CreateTeamMember = ({ spaceId }: CreateTeamMemberProps) => {
  const setStep = useSetAtom(teamMemberStepAtom);
  const [avatar, setAvatar] = useAtom(teamMemberAvatarAtom);
  const [name, setName] = useAtom(teamMemberNameAtom);
  const [role, setRole] = useAtom(teamMemberRoleAtom);

  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);

  const handleAddUnlinkedTeamMember = () => {
    console.info(`handle add unlinked team member`);
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
    <div className="w-full rounded-lg border border-grey-02 p-4">
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <div className="inline-flex flex-col items-center justify-center gap-2">
            <div className="relative h-[48px] w-[48px] overflow-clip rounded">
              {avatar ? <Avatar size={48} square avatarUrl={avatar} /> : <NoAvatar />}
            </div>
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
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-4">
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
      </div>
    </div>
  );
};

const TeamMember = ({ teamMember }: any) => {
  const [open, setOpen] = useState(false);

  const onOpenChange = () => {
    setOpen(!open);
  };

  return (
    <div className="w-full rounded-lg border border-grey-02 p-4">
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <div className="overflow-clip rounded">
            <Avatar size={48} square />
          </div>
        </div>
        <div className="w-full">
          <div className="border-b border-divider pb-2">
            <div className="text-body font-medium">Name {teamMember}</div>
          </div>
          <div className="mt-4 border-b border-divider pb-2">
            <div className="text-body font-medium">Role</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex h-[1.5625rem] items-center justify-between">
        <div className="flex items-center gap-2 text-metadataMedium">
          <div className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <Tick />
          </div>
          <div>Linked</div>
        </div>
        <div>
          <Menu
            open={open}
            onOpenChange={onOpenChange}
            align="end"
            trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
            className="max-w-[5.8rem] whitespace-nowrap"
          >
            <Link href={`/`} className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg">
              <Text variant="button" className="hover:!text-text">
                Something
              </Text>
            </Link>
          </Menu>
        </div>
      </div>
    </div>
  );
};
