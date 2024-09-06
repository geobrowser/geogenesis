'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import cx from 'classnames';
import { useAtom, useSetAtom } from 'jotai';

import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { useWriteOps } from '~/core/database/write';
import { useToast } from '~/core/hooks/use-toast';
import { Subgraph } from '~/core/io';
import { Entity } from '~/core/io/dto/entities';
import { TypeId } from '~/core/io/schema';
import { Services } from '~/core/services';
import { Entities } from '~/core/utils/entity';
import { Images } from '~/core/utils/images';
import { Values } from '~/core/utils/value';

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
import { cachedFetchEntityType } from '~/app/space/(entity)/[id]/[entityId]/cached-entity-type';

type FindTeamMemberProps = {
  spaceId: string;
};

export const FindTeamMember = ({ spaceId }: FindTeamMemberProps) => {
  const { ipfs } = Services.useServices();
  const setStep = useSetAtom(teamMemberStepAtom);
  const [avatar, setAvatar] = useAtom(teamMemberAvatarAtom);
  const [name, setName] = useAtom(teamMemberNameAtom);
  const [role, setRole] = useAtom(teamMemberRoleAtom);
  const roleUrl = role ? `/space/${role.nameTripleSpace}/${role.id}` : '';
  const [hasAddedTeamMember, setHasAddedTeamMember] = useAtom(addedTeamMemberAtom);
  const [draftMembers, setDraftMembers] = useAtom(draftMembersAtom);

  const [entityId, setEntityId] = useState<string>('');

  const [person, setPerson] = useState<Entity | null>(null);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [linkedAvatar, setLinkedAvatar] = useState<string | null>(null);
  const [hasFoundPerson, setHasFoundPerson] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);

  const [, setToast] = useToast();
  const { upsertMany } = useWriteOps();

  const handleAddLinkedTeamMember = () => {
    if (!person || !name || !role) return;

    const linkedEntityId = person.id;
    const triplesToWrite: Parameters<typeof upsertMany>[0] = [];

    // Add name attribute
    if (linkedName !== name) {
      // Add name attribute
      triplesToWrite.push({
        entityId: linkedEntityId,
        entityName: name,
        attributeId: SYSTEM_IDS.NAME,
        attributeName: 'Name',
        value: {
          type: 'TEXT',
          value: name,
        },
      });
    }

    // Add avatar attribute
    if (avatar && linkedAvatar !== avatar) {
      const [typeTriple, urlTriple] = Images.createImageEntityTriples({
        imageSource: Values.toImageValue(avatar),
        spaceId,
      });

      // Create the image entity
      triplesToWrite.push(typeTriple);
      triplesToWrite.push(urlTriple);

      // @TODO(relations): Add image support
      // Set the image entity reference on the current entity
      // triplesToWrite.push({
      //   entityId: linkedEntityId,
      //   entityName: name,
      //   attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
      //   attributeName: 'Avatar',
      //   value: {
      //     type: 'IMAGE',
      //     value: typeTriple.entityId,
      //     image: Values.toImageValue(avatar),
      //   },
      // });
    }

    // Add role attribute
    triplesToWrite.push({
      entityId: linkedEntityId,
      entityName: name,
      attributeId: SYSTEM_IDS.ROLE_ATTRIBUTE,
      attributeName: 'Role',
      value: {
        type: 'ENTITY',
        value: role.id,
        name: role.name,
      },
    });

    upsertMany(triplesToWrite, spaceId);

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

      const entityId = value.trim();
      setEntityId(entityId);

      const [person, types] = await Promise.all([
        Subgraph.fetchEntity({
          id: entityId,
        }),
        cachedFetchEntityType(entityId),
      ]);

      if (person) {
        if (types.includes(TypeId(SYSTEM_IDS.PERSON_TYPE))) {
          const avatar = Entities.avatar(person?.relationsOut);
          setAvatar(avatar);
          setName(Entities.name(person?.triples ?? []));
          setPerson(person);
          setLinkedName(Entities.name(person?.triples ?? []));
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
    },
    [setAvatar, setName, error]
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadAvatar = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleOnChangeAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const file = event.target.files[0];
      const ipfsUri = await ipfs.uploadFile(file);
      const imageValue = Values.toImageValue(ipfsUri);
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
                        <div className="cursor-pointer">
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
                    alreadySelectedIds={[]}
                    filterByTypes={[{ typeId: SYSTEM_IDS.ROLE_ATTRIBUTE, typeName: 'Role' }]}
                    attributeId={SYSTEM_IDS.ROLE_ATTRIBUTE}
                    className="!h-auto !font-medium"
                  />
                ) : (
                  <div className="flex h-[29px] items-center text-body font-medium">
                    <DeletableChipButton href={roleUrl} onClick={handleResetRole}>
                      {role.name}
                    </DeletableChipButton>
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
