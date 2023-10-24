'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { useQuery } from '@tanstack/react-query';
import BoringAvatar from 'boring-avatars';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { useAccount, useWalletClient } from 'wagmi';

import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePublish } from '~/core/hooks/use-publish';
import { ID } from '~/core/id';
import { fetchProfilePermissionless } from '~/core/io/subgraph/fetch-profile-permissionless';
import { Services } from '~/core/services';
import { useStatusBar } from '~/core/state/status-bar-store';
import { CreateTripleAction, OmitStrict, Triple } from '~/core/types';
import { NavUtils, getImagePath, sleepWithCallback } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

const isCreateProfileVisible$ = observable(false);

export function useCreateProfile() {
  const isCreateProfileVisible = useSelector(isCreateProfileVisible$);

  const showCreateProfile = useCallback(() => {
    isCreateProfileVisible$.set(true);
  }, []);

  const hideCreateProfile = useCallback(() => {
    isCreateProfileVisible$.set(false);
  }, []);

  return {
    isCreateProfileVisible,
    showCreateProfile,
    hideCreateProfile,
  };
}

/**
 * This is a temporary component for early users to be able to create a profile.
 * Only users that have spaces that did not finish initializing need to go through
 * this process. These are accounts with an onchain Geo profile _and_ a personal space.
 */
export const CreateProfileDialog = () => {
  const { dispatch } = useStatusBar();
  const { makeProposal } = usePublish();
  const { address } = useAccount();
  const { data: wallet } = useWalletClient();
  const { profile: onchainProfile, isLoading } = useGeoProfile(address);

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [status, setStatus] = useState<'idle' | 'creating-profile' | 'done' | 'error'>('idle');

  const { isCreateProfileVisible } = useCreateProfile();

  const { data: profile } = useQuery({
    queryKey: ['profile-triples-in-space', onchainProfile?.homeSpace, onchainProfile?.id],
    queryFn: async () => {
      if (!onchainProfile) {
        return null;
      }

      const result = await fetchProfilePermissionless({
        address: onchainProfile.account,
      });

      return result ?? null;
    },
  });

  if (!address || isLoading || !isCreateProfileVisible) return null;

  async function onRunOnboardingWorkflow() {
    if (address && wallet && onchainProfile) {
      const onchainIdFromProfileId = onchainProfile.id.split('–')[1];

      if (!onchainIdFromProfileId) {
        console.log(`No onchain profile id found skipping profile creation for id ${onchainProfile.id}`);
        return;
      }

      const actions: CreateTripleAction[] = [];

      // Add triples for a Person entity
      if (name !== '') {
        const nameTripleWithoutId: OmitStrict<Triple, 'id'> = {
          entityId: onchainProfile.id,
          entityName: name ?? '',
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          space: onchainProfile.homeSpace,
          value: {
            type: 'string',
            value: name,
            id: ID.createValueId(),
          },
        };

        actions.push({
          type: 'createTriple',
          // @TODO: Somehow link to on-chain profilePerson
          id: ID.createTripleId(nameTripleWithoutId),
          ...nameTripleWithoutId,
        });
      }

      if (avatar !== '') {
        const avatarTripleWithoutId: OmitStrict<Triple, 'id'> = {
          entityId: onchainProfile.id,
          entityName: name ?? '',
          attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
          attributeName: 'Avatar',
          space: onchainProfile.homeSpace,
          value: {
            type: 'image',
            value: avatar,
            id: ID.createValueId(),
          },
        };

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(avatarTripleWithoutId),
          ...avatarTripleWithoutId,
        });
      }

      const typeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        entityId: onchainProfile.id,
        entityName: name ?? '',
        space: onchainProfile.homeSpace,
        value: {
          type: 'entity',
          name: 'Person',
          id: SYSTEM_IDS.PERSON_TYPE,
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(typeTriple),
        ...typeTriple,
      });

      // Add triples for creating a space configuration entity
      const spaceConfigurationId = ID.createEntityId();

      const spaceTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        entityId: spaceConfigurationId,
        entityName: `${name ?? address}'s Space`,
        space: onchainProfile.homeSpace,
        value: {
          type: 'entity',
          name: 'Space',
          id: SYSTEM_IDS.SPACE_CONFIGURATION,
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(spaceTriple),
        ...spaceTriple,
      });

      const spaceNameTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.NAME,
        attributeName: 'Name',
        entityId: spaceConfigurationId,
        entityName: `${name ?? address}'s Space`,
        space: onchainProfile.homeSpace,
        value: {
          type: 'string',
          value: `${name ?? address}'s Space`,
          id: ID.createValueId(),
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(spaceNameTriple),
        ...spaceNameTriple,
      });

      try {
        setStatus('creating-profile');

        await makeProposal({
          actions,
          name: `Creating profile for ${address}`,
          spaceId: onchainProfile.homeSpace,
          onChangePublishState: reviewState => dispatch({ type: 'SET_REVIEW_STATE', payload: reviewState }),
        });

        console.log('Profile created:', { profileEntityId: onchainProfile.id, spaceAddress: onchainProfile.homeSpace });

        dispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });
        setStatus('done');

        // want to show the "complete" state for 3s
        await sleepWithCallback(() => {
          dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
        }, 3000);
      } catch (e: unknown) {
        if (e instanceof Error) {
          if (e.message.startsWith('Publish failed: TransactionExecutionError: User rejected the request.')) {
            setStatus('idle');
            dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
            return;
          }

          setStatus('error');
          dispatch({ type: 'ERROR', payload: e.message });
        }
      }
    }
  }

  // Note: set open to true or to isOnboardingVisible to see the onboarding flow
  // Currently stubbed as we don't have a way to create a profile yet
  // Also note that setting open to true will cause SSR issues in dev mode
  return (
    <Command.Dialog open={Boolean(onchainProfile && !profile)} label="Onboarding profile">
      <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center bg-grey-04/50">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15 }}
            className="relative z-10 flex h-full w-full items-start justify-center"
          >
            <ModalCard key="card">
              <StepHeader />
              <StepOnboarding
                onNext={onRunOnboardingWorkflow}
                address={address}
                name={name}
                setName={setName}
                avatar={avatar}
                setAvatar={setAvatar}
                status={status}
                space={onchainProfile?.homeSpace ?? null}
              />
            </ModalCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </Command.Dialog>
  );
};

type ModalCardProps = {
  key: string;
  children: React.ReactNode;
};

const ModalCard = ({ key, children }: ModalCardProps) => {
  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, bottom: -5 }}
      animate={{ opacity: 1, bottom: 0 }}
      exit={{ opacity: 0, bottom: -5 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="pointer-events-auto relative z-10 mt-32 aspect-square h-full max-h-[440px] w-full max-w-[360px] overflow-hidden rounded border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

const StepHeader = () => {
  const { hideCreateProfile } = useCreateProfile();

  return (
    <div className="relative z-20 flex items-center justify-end pb-2">
      <SquareButton icon="close" onClick={hideCreateProfile} />
    </div>
  );
};

type StepContentsProps = {
  key: string;
  children: React.ReactNode;
};

const StepContents = ({ key, children }: StepContentsProps) => {
  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, right: -20 }}
      animate={{ opacity: 1, left: 0, right: 0 }}
      exit={{ opacity: 0, left: -20 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="relative"
    >
      {children}
    </motion.div>
  );
};

type StepOnboardingProps = {
  onNext: () => void;
  address: string;
  name: string;
  setName: (name: string) => void;
  avatar: string;
  setAvatar: (hash: string) => void;
  status: 'idle' | 'creating-profile' | 'done' | 'error';
  space: string | null;
};

function StepOnboarding({ onNext, address, name, setName, avatar, setAvatar, status, space }: StepOnboardingProps) {
  const validName = name.length > 0;
  const { storageClient } = Services.useServices();
  const { hideCreateProfile } = useCreateProfile();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const ipfsUri = await storageClient.uploadFile(file);
      const imageValue = Value.toImageValue(ipfsUri);
      setAvatar(imageValue);
    }
  };

  return (
    <>
      <StepContents key="onboarding">
        <div className="flex w-full justify-center">
          <div className="inline-block pb-4">
            <input
              placeholder="Name..."
              className="block px-2 py-1 text-center !text-2xl text-mediumTitle placeholder:opacity-25 focus:!outline-none"
              value={name}
              onChange={({ currentTarget: { value } }) => setName(value)}
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-center pb-4">
          <div className="rounded border-8 border-white bg-cover bg-center shadow-card">
            <div className="overflow-hidden rounded">
              {avatar ? (
                <div
                  style={{
                    backgroundImage: `url(${getImagePath(avatar)})`,
                    height: 154,
                    width: 154,
                    backgroundSize: 'cover',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              ) : (
                <BoringAvatar size={154} name={address} variant="beam" square />
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 pb-4">
          <label htmlFor="avatar-file" className="inline-block cursor-pointer text-center hover:underline">
            <SmallButton icon="upload" onClick={handleFileInputClick}>
              Upload
            </SmallButton>
          </label>
          {avatar !== '' && (
            <div>
              <SquareButton onClick={() => setAvatar('')} icon="trash" />
            </div>
          )}
          <input
            ref={fileInputRef}
            accept="image/png, image/jpeg"
            id="avatar-file"
            onChange={handleChange}
            type="file"
            className="hidden"
          />
        </div>
        <Text as="h3" variant="body" className="text-center !text-base">
          You can update this later.
        </Text>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 flex">
        {space && (
          <>
            {status === 'done' && (
              <Link href={NavUtils.toSpace(space)} onClick={hideCreateProfile} className="w-full">
                <Button variant="primary" className="w-full">
                  View Home Space
                </Button>
              </Link>
            )}
            {status === 'idle' && (
              <Button variant="secondary" disabled={!validName} onClick={onNext} className="w-full">
                Create profile
              </Button>
            )}
            {status === 'creating-profile' && (
              <Button variant="secondary" disabled onClick={onNext} className="w-full">
                Creating profile...
              </Button>
            )}
            {status === 'error' && (
              <Button variant="secondary" className="w-full border border-red-01">
                Something went wrong
              </Button>
            )}
          </>
        )}
      </div>
    </>
  );
}
