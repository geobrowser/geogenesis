'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { ROLE_ATTRIBUTE } from '@geogenesis/ids/system-ids';
import cx from 'classnames';
import Link from 'next/link';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { Services } from '~/core/services';
import { Triple as TripleType } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';

import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { Avatar } from '~/design-system/avatar';
import { SmallButton, SquareButton } from '~/design-system/button';
import { DeletableChipButton } from '~/design-system/chip';
import { CheckCircle } from '~/design-system/icons/check-circle';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { Warning } from '~/design-system/icons/warning';
import { Menu } from '~/design-system/menu';
import { PopoverMenu } from '~/design-system/popover-menu';
import { Text } from '~/design-system/text';

import { NoAvatar } from './no-avatar';
import type { Role } from './types';
import type { TeamMember as TeamMemberType } from '~/app/space/[id]/team/page';

type EditTeamMemberProps = {
  teamMember: TeamMemberType;
  spaceId: string;
};

type Status = 'initial' | 'edited' | 'updated' | 'linked' | 'unlinked' | 'removed';

export const EditTeamMember = ({ teamMember, spaceId }: EditTeamMemberProps) => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('initial');
  const hasEditedTeamMember = !['initial', 'edited'].includes(status);
  const isDisabled = ['updated', 'linked', 'unlinked', 'removed'].includes(status);

  const [avatar, setAvatar] = useState<string | null>(() => teamMember.avatar);
  const [name, setName] = useState<string>(() => teamMember.name);

  const [role, setRole] = useState<any>(() => teamMember.roleTriple);
  const initialRoleName = getInitialRoleName(teamMember.roleTriple);
  const [roleName, setRoleName] = useState<string | null>(() => initialRoleName);
  const initialRoleEntityId = getInitialRoleEntityId(teamMember.roleTriple);
  const [roleEntityId, setRoleEntityId] = useState<string | null>(() => initialRoleEntityId);

  const roleUrl: string | null = role
    ? roleEntityId === initialRoleEntityId
      ? `/space/${role.space}/${role.value.id}`
      : `/space/${role.nameTripleSpace}/${role.id}`
    : null;

  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);

  const { create, remove } = useActionsStore();

  useEffect(() => {
    if (avatar !== teamMember.avatar || name !== teamMember.name || roleEntityId !== initialRoleEntityId) {
      setStatus('edited');
    } else {
      setStatus('initial');
    }
  }, [avatar, initialRoleEntityId, name, roleEntityId, teamMember.avatar, teamMember.name]);

  const onOpenChange = () => {
    setOpen(!open);
  };

  const handleUpdateTeamMember = async () => {
    const entity = await Subgraph.fetchEntity({ id: teamMember.entityId });

    if (!entity) return;

    const entityId = teamMember.entityId;
    const isLinked = teamMember.linked;
    let linkedEntity = null;

    if (isLinked) {
      linkedEntity = await Subgraph.fetchEntity({ id: entityId });
    }

    const spaceTriples = entity.triples.filter(triple => triple.space === spaceId);

    // Avatar conditions
    const spaceAvatar = spaceTriples.find(triple => triple.attributeId === SYSTEM_IDS.AVATAR_ATTRIBUTE);
    const hasAvatar = !!avatar;
    const hasChangedAvatar = teamMember.avatar !== avatar;
    const hasRemovedAvatar = !!teamMember.avatar && !avatar;
    const hasSpaceAvatar = !!spaceAvatar;

    // Update avatar attribute
    if (hasChangedAvatar) {
      if (hasSpaceAvatar) {
        if (hasRemovedAvatar) {
          remove(spaceAvatar);
        } else if (hasAvatar) {
          remove(spaceAvatar);
          create(
            Triple.withId({
              ...spaceAvatar,
              value: {
                ...spaceAvatar.value,
                type: 'image',
                value: Value.toImageValue(avatar),
              },
            })
          );
        }
      } else if (hasAvatar) {
        create(
          Triple.withId({
            space: spaceId,
            entityId: entityId,
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
    }

    // Name conditions
    const spaceName = spaceTriples.find(triple => triple.attributeId === SYSTEM_IDS.NAME);
    const hasChangedName = teamMember.name !== name;
    const hasRemovedName = isLinked && linkedEntity && name === Entity.name(linkedEntity.triples);
    const hasSpaceName = !!spaceName;

    // Update name attribute
    if (hasChangedName) {
      if (hasSpaceName) {
        if (hasRemovedName) {
          remove(spaceName);
        } else {
          remove(spaceName);
          create(
            Triple.withId({
              ...spaceName,
              value: {
                ...spaceName.value,
                type: 'string',
                value: name,
              },
            })
          );
        }
      } else {
        create(
          Triple.withId({
            space: spaceId,
            entityId,
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
    }

    // Role conditions
    const spaceRole = spaceTriples.find(triple => triple.attributeId === ROLE_ATTRIBUTE);
    const hasChangedRole = roleEntityId !== initialRoleEntityId;
    const hasSpaceRole = !!spaceRole;
    const hasRole = !!roleEntityId && !!roleName;

    // Update role attribute
    if (hasChangedRole && hasSpaceRole && hasRole) {
      remove(spaceRole);
      create(
        Triple.withId({
          ...spaceRole,
          value: {
            ...spaceRole.value,
            type: 'entity',
            id: roleEntityId,
            name: roleName,
          },
        })
      );
    }

    setStatus('updated');
  };

  const handleChangeRole = (role: Role) => {
    setRole(role);
    setRoleName(role.name ?? 'No entity name');
    setRoleEntityId(role.id);
  };

  const handleClearRole = () => {
    setRole(null);
    setRoleName(null);
    setRoleEntityId(null);
  };

  const handleCancel = async () => {
    setAvatar(teamMember.avatar);
    setName(teamMember.name);
    setRole(teamMember.roleTriple);
    setRoleName(initialRoleName);
    setRoleEntityId(initialRoleEntityId);
    setStatus('initial');
  };

  const handleLinkTeamMember = async () => {
    const entityId = prompt('Paste the Geo user’s ID...')?.trim();

    if (!entityId) return;

    const [linkedEntity, existingEntity] = await Promise.all([
      Subgraph.fetchEntity({ id: entityId }),
      Subgraph.fetchEntity({ id: teamMember.entityId }),
    ]);

    if (!linkedEntity || !existingEntity) return;

    const spaceTriples = existingEntity.triples.filter(triple => triple.space === spaceId);

    spaceTriples.forEach(triple => {
      // Remove person type
      if (triple.value.id === SYSTEM_IDS.PERSON_TYPE) {
        remove(triple);
      } else {
        // Update entity id of existing name/role (and possibly avatar) triples
        remove(triple);
        create(
          Triple.withId({
            space: triple.space,
            entityId: entityId,
            entityName: triple.entityName,
            attributeId: triple.attributeId,
            attributeName: triple.attributeName,
            value: triple.value,
          })
        );
      }
    });

    setStatus('linked');
  };

  const handleUnlinkTeamMember = async () => {
    const entity = await Subgraph.fetchEntity({ id: teamMember.entityId });

    if (!entity) return;

    const newEntityId = ID.createEntityId();

    const spaceTriples = entity.triples.filter(triple => triple.space === spaceId);

    // Update entity id of existing role (and possibly name/avatar) triples
    spaceTriples.forEach(triple => {
      remove(triple);
      create(
        Triple.withId({
          space: triple.space,
          entityId: newEntityId,
          entityName: triple.entityName,
          attributeId: triple.attributeId,
          attributeName: triple.attributeName,
          value: triple.value,
        })
      );
    });

    const nameSpaceTriple = spaceTriples.find(triple => triple.attributeId === SYSTEM_IDS.NAME);

    // Add name attribute (if not already in space triples)
    if (!nameSpaceTriple) {
      create(
        Triple.withId({
          space: spaceId,
          entityId: newEntityId,
          entityName: teamMember.name,
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: {
            type: 'string',
            id: ID.createValueId(),
            value: teamMember.name,
          },
        })
      );
    }

    const avatarSpaceTriple = spaceTriples.find(triple => triple.attributeId === SYSTEM_IDS.AVATAR_ATTRIBUTE);

    // Add avatar (if person has an avatar and its not already in space triples)
    if (!avatarSpaceTriple && teamMember.avatar) {
      create(
        Triple.withId({
          space: spaceId,
          entityId: newEntityId,
          entityName: teamMember.name,
          attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
          attributeName: 'Avatar',
          value: {
            type: 'image',
            id: ID.createValueId(),
            value: teamMember.avatar,
          },
        })
      );
    }

    // Add person type
    create(
      Triple.withId({
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.TYPES,
        entityName: teamMember.name,
        attributeName: 'Types',
        space: spaceId,
        value: {
          type: 'entity',
          id: SYSTEM_IDS.PERSON_TYPE,
          name: 'Person',
        },
      })
    );

    setStatus('unlinked');
  };

  const handleRemoveTeamMember = async () => {
    const entity = await Subgraph.fetchEntity({ id: teamMember.entityId });

    if (!entity) return;

    const spaceTriples = entity.triples.filter(triple => triple.space === spaceId);

    spaceTriples.forEach(triple => {
      remove(triple);
    });

    setStatus('removed');
  };

  const { storageClient } = Services.useServices();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadAvatar = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleChangeAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const file = event.target.files[0];
      const ipfsUri = await storageClient.uploadFile(file);
      const imageValue = Value.toImageValue(ipfsUri);
      setAvatar(imageValue);
      setIsAvatarMenuOpen(false);
    }
  };

  const handleResetAvatar = () => {
    setAvatar(teamMember.avatar);
    setIsAvatarMenuOpen(false);
  };

  const handleClearAvatar = () => {
    setAvatar(null);
    setIsAvatarMenuOpen(false);
  };

  return (
    <div className="relative w-full rounded-lg border border-grey-02 p-4">
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <div className="inline-flex flex-col items-center justify-center gap-2">
            <div className="relative h-[48px] w-[48px] overflow-clip rounded">
              {avatar ? <Avatar size={48} square avatarUrl={avatar} /> : <NoAvatar />}
            </div>
            {!hasEditedTeamMember && (
              <PopoverMenu
                isOpen={isAvatarMenuOpen}
                onOpenChange={setIsAvatarMenuOpen}
                menu={
                  <>
                    <SquareButton onClick={handleUploadAvatar} icon={<Upload />} />
                    {avatar !== teamMember.avatar && <SquareButton onClick={handleResetAvatar} icon={<RetrySmall />} />}
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
          <div className={cx(isDisabled && 'pointer-events-none', 'border-b border-divider pb-2')}>
            <input
              value={name ?? ''}
              onChange={({ currentTarget: { value } }) => setName(value)}
              className="relative z-10 h-auto w-full text-body font-medium focus:outline-none"
            />
          </div>
          <div className={cx(isDisabled && 'pointer-events-none', 'mt-4 border-b border-divider pb-2')}>
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
                <DeletableChipButton href={roleUrl ?? ''} onClick={handleClearRole}>
                  {roleName}
                </DeletableChipButton>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 flex h-[1.5625rem] items-center justify-between gap-4">
        {status === 'initial' && (
          <>
            <div>
              {teamMember.linked ? (
                <Link
                  href={`/space/${teamMember.space}/${teamMember.entityId}`}
                  className="flex items-center gap-2 text-metadataMedium"
                >
                  <CheckCircle />
                  <div>Linked</div>
                </Link>
              ) : (
                <div className="flex items-center gap-2 text-metadataMedium text-orange">
                  <Warning />
                  <div>Not linked</div>
                </div>
              )}
            </div>
            <div>
              <Menu
                open={open}
                onOpenChange={onOpenChange}
                align="end"
                trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
                className="relative z-100 max-w-[5.8rem] whitespace-nowrap"
              >
                {teamMember.linked ? (
                  <button
                    key="unlink"
                    onClick={handleUnlinkTeamMember}
                    className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
                  >
                    <Text variant="button" className="hover:!text-text">
                      Unlink
                    </Text>
                  </button>
                ) : (
                  <button
                    key="link"
                    onClick={handleLinkTeamMember}
                    className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
                  >
                    <Text variant="button" className="hover:!text-text">
                      Link
                    </Text>
                  </button>
                )}
                <button
                  onClick={handleRemoveTeamMember}
                  className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
                >
                  <Text variant="button" className="hover:!text-text">
                    Remove
                  </Text>
                </button>
              </Menu>
            </div>
          </>
        )}
        {status === 'edited' && (
          <>
            <div className="flex-1">
              <SmallButton onClick={handleCancel} variant="secondary" className="w-full !shadow-none">
                Cancel
              </SmallButton>
            </div>
            <div className="flex-1">
              <SmallButton
                onClick={handleUpdateTeamMember}
                variant="primary"
                className="w-full !shadow-none"
                disabled={role === null}
              >
                Save changes
              </SmallButton>
            </div>
          </>
        )}
        {status === 'updated' && (
          <div className="flex items-center gap-2 text-metadataMedium text-orange">
            <Warning />
            <div>Pending update</div>
          </div>
        )}
        {status === 'linked' && (
          <div className="flex items-center gap-2 text-metadataMedium text-orange">
            <Warning />
            <div>Pending link</div>
          </div>
        )}
        {status === 'unlinked' && (
          <div className="flex items-center gap-2 text-metadataMedium text-orange">
            <Warning />
            <div>Pending unlink</div>
          </div>
        )}
      </div>
      {status === 'removed' && (
        <div>
          <div className="absolute inset-px z-100 flex items-center justify-center rounded-lg bg-white">
            <div className="flex items-center gap-2 text-metadataMedium text-orange">
              <Warning />
              <div>Pending deletion</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getInitialRoleName = (role: TripleType): string => {
  if (role.value.type === 'entity') {
    return role.value.name ?? 'No entity name';
  } else {
    return 'No entity name';
  }
};

const getInitialRoleEntityId = (role: TripleType): string => role.value.id;
