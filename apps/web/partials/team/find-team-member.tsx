'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { ROLE_ATTRIBUTE } from '@geogenesis/ids/system-ids';
import cx from 'classnames';
import { useAtom, useSetAtom } from 'jotai';

import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { fetchEntityType } from '~/core/io/fetch-entity-type';
import { Services } from '~/core/services';
import { Entity as EntityType } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';

import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { Avatar } from '~/design-system/avatar';
import { SmallButton, SquareButton } from '~/design-system/button';
import { DeletableChipButton } from '~/design-system/chip';
import { Close } from '~/design-system/icons/close';
import { InfoSmall } from '~/design-system/icons/info-small';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { Warning } from '~/design-system/icons/warning';
import { PopoverMenu } from '~/design-system/popover-menu';
import { Tooltip } from '~/design-system/tooltip';

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

const VALID_ENTITY_ID_LENGTHS = [36, 44];

type FindTeamMemberProps = {
  spaceId: string;
};

export const FindTeamMember = ({ spaceId }: FindTeamMemberProps) => {
  const setStep = useSetAtom(teamMemberStepAtom);
  const [avatar, setAvatar] = useAtom(teamMemberAvatarAtom);
  const [name, setName] = useAtom(teamMemberNameAtom);
  const [role, setRole] = useAtom(teamMemberRoleAtom);
  const [hasAddedTeamMember, setHasAddedTeamMember] = useAtom(addedTeamMemberAtom);
  const [draftMembers, setDraftMembers] = useAtom(draftMembersAtom);

  const [entityId, setEntityId] = useState<string>('');

  const [person, setPerson] = useState<EntityType | null>(null);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [linkedAvatar, setLinkedAvatar] = useState<string | null>(null);
  const [hasFoundPerson, setHasFoundPerson] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);

  const [, setToast] = useToast();
  const { create } = useActionsStore();

  const handleAddLinkedTeamMember = () => {
    if (!person || !name || !role) return;

    const linkedEntityId = person.id;

    // Add name attribute
    if (linkedName !== name) {
      create(
        Triple.withId({
          space: spaceId,
          entityId: linkedEntityId,
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
    }

    // Add avatar attribute
    if (avatar && linkedAvatar !== avatar) {
      create(
        Triple.withId({
          space: spaceId,
          entityId: linkedEntityId,
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
        entityId: linkedEntityId,
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

    setHasAddedTeamMember(true);
    setToast(<TeamMemberCreatedToast name={name} entityId={linkedEntityId} spaceId={spaceId} linked={true} />);
    setDraftMembers([draftMembers.length, ...draftMembers]);
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
    setLinkedName(null);
    setLinkedAvatar(null);
    setHasFoundPerson(false);
    setStep('start');
  };

  const handleOnChangeEntityId = useCallback(
    async ({ currentTarget: { value } }: ChangeEvent<HTMLInputElement>) => {
      if (error) return;

      const entityIdLength = value.trim().length;
      const isValidEntityId = VALID_ENTITY_ID_LENGTHS.includes(entityIdLength);

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
            setLinkedName(Entity.name(person?.triples ?? []));
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
              {!hasAddedTeamMember && (
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
              )}
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
                {error && (
                  <div className="absolute inset-0 z-10 flex h-full w-full items-center bg-white">
                    <div className="-mt-4 text-errorMessage text-red-01">
                      Oops! It looks like there’s an issue. You need to enter a valid Person ID.
                    </div>
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
                onClick={handleAddLinkedTeamMember}
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
