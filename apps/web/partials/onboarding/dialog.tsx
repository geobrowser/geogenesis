'use client';

import { Ipfs, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { Content, Overlay, Portal, Root } from '@radix-ui/react-dialog';

import * as React from 'react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useRouter } from 'next/navigation';

import { useQueryClient } from '@tanstack/react-query';

import { ROOT_SPACE } from '~/core/constants';
import { useCreatePersonalSpace } from '~/core/hooks/use-create-personal-space';
import { useImageWithFallback } from '~/core/hooks/use-image-with-fallback';
import { SUPPRESS_ONBOARDING_PARAM, useOnboarding } from '~/core/hooks/use-onboarding';
import { searchResultMatchesAllowedTypes } from '~/core/hooks/use-search';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { queryClient } from '~/core/query-client';
import { E } from '~/core/sync/orm';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { hasSeenAssistantAtom, isChatOpenAtom } from '~/core/state/chat-store';
import type { SearchResult } from '~/core/types';
import { NavUtils, sleep } from '~/core/utils/utils';

import { Breadcrumb } from '~/design-system/breadcrumb';
import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { NewTab } from '~/design-system/icons/new-tab';
import { QuestionCircle } from '~/design-system/icons/question-circle';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { Spacer } from '~/design-system/spacer';
import { Tag } from '~/design-system/tag';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';
import { Truncate } from '~/design-system/truncate';

export const nameAtom = atomWithStorage<string>('onboardingName', '');
export const topicIdAtom = atomWithStorage<string>('onboardingEntityId', '');
export const avatarAtom = atomWithStorage<string>('onboardingAvatar', '');
export const spaceIdAtom = atomWithStorage<string>('onboardingSpaceId', '');

type Step = 'start' | 'enter-profile' | 'existing-entity-match' | 'create-space' | 'completed' | 'done';

export const stepAtom = atomWithStorage<Step>('onboardingStep', 'start');

const workflowSteps: Array<Step> = ['create-space', 'completed'];

const ONBOARDING_DESTINATION = NavUtils.toExplore();

const ONBOARDING_PERSONAL_SEARCH_TYPES = [SystemIds.SPACE_TYPE, SystemIds.PROJECT_TYPE, SystemIds.PERSON_TYPE];

function filterExactNameMatches(results: SearchResult[], name: string, allowedTypes: string[]): SearchResult[] {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return [];
  return results.filter(
    r =>
      (r.name ?? '').trim().toLowerCase() === normalized && searchResultMatchesAllowedTypes(r, allowedTypes)
  );
}

export const OnboardingDialog = () => {
  const { isOnboardingVisible } = useOnboarding();
  const router = useRouter();

  const { smartAccount } = useSmartAccount();
  const name = useAtomValue(nameAtom);
  const avatar = useAtomValue(avatarAtom);
  const topicId = useAtomValue(topicIdAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setName = useSetAtom(nameAtom);
  const { createPersonalSpace } = useCreatePersonalSpace();
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setChatOpen = useSetAtom(isChatOpenAtom);
  const [hasSeenAssistant, setHasSeenAssistant] = useAtom(hasSeenAssistantAtom);

  const [step, setStep] = useAtom(stepAtom);
  const [entityMatchCandidates, setEntityMatchCandidates] = useState<SearchResult[]>([]);

  // Show retry immediately if workflow already started before initial render
  const [showRetry, setShowRetry] = useState(() => workflowSteps.includes(step));

  // Warm the router cache for the explore destination once the onboarding
  // dialog is actually visible, so the post-creation redirect lands
  // instantly. Skipping for non-onboarding tabs avoids pointless prefetch.
  useEffect(() => {
    if (!isOnboardingVisible) return;
    router.prefetch(ONBOARDING_DESTINATION);
  }, [isOnboardingVisible, router]);

  // Track whether this tab ever had the onboarding dialog visible. Used
  // to scope side-effects (step resets, redirects) to the tab that was
  // actually driving onboarding, not e.g. a suppressed entity-preview tab.
  const wasOnboardingActiveRef = useRef(false);
  useEffect(() => {
    if (isOnboardingVisible) wasOnboardingActiveRef.current = true;
  }, [isOnboardingVisible]);

  useEffect(() => {
    // Only resolve stale state on tabs where the dialog is actually
    // being shown. Otherwise a second tab (e.g. entity preview opened
    // from the match step) would reset `stepAtom` and, via the cross-tab
    // atomWithStorage sync, clobber the original tab's progress.
    if (!isOnboardingVisible) return;
    if (step === 'existing-entity-match' && entityMatchCandidates.length === 0) {
      setStep('enter-profile');
    }
  }, [isOnboardingVisible, step, entityMatchCandidates.length, setStep]);

  // Fire the post-creation redirect as soon as step flips to 'completed'.
  // Gated on wasOnboardingActiveRef (not the live isOnboardingVisible)
  // because usePersonalSpaceId flips isRegistered=true at this point and
  // hides the dialog; a suppressed preview tab never sets the ref, so it
  // won't auto-navigate away. Chat and redirect fire together.
  useEffect(() => {
    if (!wasOnboardingActiveRef.current) return;
    if (step !== 'completed') return;
    if (!hasSeenAssistant) {
      setChatOpen(true);
      setHasSeenAssistant(true);
    }
    router.push(ONBOARDING_DESTINATION);
    setStep('done');
  }, [step, router, setStep, hasSeenAssistant, setChatOpen, setHasSeenAssistant]);

  const address = smartAccount?.account.address;

  if (!address) return null;

  type CreatePersonalSpaceTopicArg = { topicIdForPublish?: string };

  async function createSpace(options?: CreatePersonalSpaceTopicArg) {
    if (!address) return;

    const effectiveTopicId =
      options?.topicIdForPublish !== undefined ? options.topicIdForPublish : topicId;

    try {
      const spaceId = await createPersonalSpace({
        spaceName: name,
        spaceImage: avatar,
        topicId: effectiveTopicId || undefined,
      });

      if (!spaceId) {
        throw new Error(`Creating space failed`);
      }

      // Forces the profile to be refetched
      await queryClient.invalidateQueries({ queryKey: ['profile', address] });

      setSpaceId(spaceId);
      setStep('completed');
    } catch (error) {
      setShowRetry(true);
      console.error(error);
    }
  }

  async function onProfileContinue(exactMatches: SearchResult[]) {
    if (!address || !smartAccount) return;

    setShowRetry(false);

    if (exactMatches.length > 0) {
      setEntityMatchCandidates(exactMatches);
      setStep('existing-entity-match');
    } else {
      setTopicId('');
      setStep('create-space');
      await sleep(100);
      createSpace({ topicIdForPublish: '' });
    }
  }

  async function onRunOnboardingWorkflow() {
    if (!address || !smartAccount) return;

    setShowRetry(false);

    switch (step) {
      case 'create-space':
        createSpace();
        break;
    }
  }

  // `stepAtom` is persisted via atomWithStorage, but entityMatchCandidates
  // is local state. On a refresh while the stored step is
  // 'existing-entity-match' the candidates array would be empty — render
  // StepOnboarding during that window so we don't flash an empty match
  // step for a frame before the reset effect kicks in.
  const effectiveStep =
    step === 'existing-entity-match' && entityMatchCandidates.length === 0 ? 'enter-profile' : step;

  return (
    <Root open={isOnboardingVisible}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text opacity-20" />
        <Content className="fixed inset-0 z-1000 flex h-full w-full items-start justify-center">
            <ModalCard childKey="card">
              <StepHeader onClearEntityMatches={() => setEntityMatchCandidates([])} />
              {effectiveStep === 'start' && <StepStart />}
              {effectiveStep === 'enter-profile' && <StepOnboarding onProfileContinue={onProfileContinue} />}
              {effectiveStep === 'existing-entity-match' && (
                <StepExistingEntityMatch
                  candidates={entityMatchCandidates}
                  onSkip={async () => {
                    setTopicId('');
                    setStep('create-space');
                    await sleep(100);
                    createSpace({ topicIdForPublish: '' });
                  }}
                  onSelect={async (entityId, entityName) => {
                    setTopicId(entityId);
                    if (entityName) setName(entityName);
                    setStep('create-space');
                    await sleep(100);
                    createSpace({ topicIdForPublish: entityId });
                  }}
                />
              )}
              {workflowSteps.includes(effectiveStep) && (
                <StepComplete onRetry={onRunOnboardingWorkflow} showRetry={showRetry} />
              )}
            </ModalCard>
        </Content>
      </Portal>
    </Root>
  );
};

type ModalCardProps = {
  childKey: string;
  children: React.ReactNode;
};

const ModalCard = ({ childKey, children }: ModalCardProps) => {
  return (
    <motion.div
      key={childKey}
      initial={{ opacity: 0, bottom: -5 }}
      animate={{ opacity: 1, bottom: 0 }}
      exit={{ opacity: 0, bottom: -5 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="pointer-events-auto relative z-100 mt-40 flex h-[440px] w-full max-w-[360px] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

const StepHeader = ({ onClearEntityMatches }: { onClearEntityMatches: () => void }) => {
  const [step, setStep] = useAtom(stepAtom);
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);

  const showBack = step === 'enter-profile' || step === 'existing-entity-match';

  const handleBack = () => {
    if (step === 'existing-entity-match') {
      onClearEntityMatches();
      setStep('enter-profile');
      return;
    }
    setName('');
    setTopicId('');
    if (step === 'enter-profile') {
      setStep('start');
    }
  };

  return (
    <div className="relative z-20 flex items-center justify-between pb-2">
      <div className="rotate-180">
        {showBack && (
          <SquareButton icon={<RightArrowLongSmall />} onClick={handleBack} className="border-none! bg-transparent!" />
        )}
      </div>
    </div>
  );
};

type StepContentsProps = {
  childKey: string;
  children: React.ReactNode;
};

const StepContents = ({ childKey, children }: StepContentsProps) => {
  return (
    <motion.div
      key={childKey}
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

function StepStart() {
  const setStep = useSetAtom(stepAtom);

  return (
    <>
      <div className="space-y-8">
        <StepContents childKey="start">
          <div className="w-full">
            <Text as="h3" variant="bodySemibold" className="mx-auto text-center text-2xl!">
              Create your first space
            </Text>
            <Text as="p" variant="body" className="mx-auto mt-2 text-center text-base!">
              This space will represent you. After, you can create spaces on any topic - including projects or groups
              you're a part of - linked with any Geo accounts.
            </Text>
          </div>
        </StepContents>
        <div className="relative aspect-video">
          <img src="/images/onboarding/0.png" alt="" className="inline-block h-full w-full" />
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-4">
        <Button onClick={() => setStep('enter-profile')} className="w-full">
          Start
        </Button>
      </div>
    </>
  );
}

type StepOnboardingProps = {
  onProfileContinue: (exactMatches: SearchResult[]) => void;
};

function StepOnboarding({ onProfileContinue }: StepOnboardingProps) {
  const [name, setName] = useAtom(nameAtom);
  const [, setTopicId] = useAtom(topicIdAtom);

  const [avatar, setAvatar] = useAtom(avatarAtom);

  const { store } = useSyncEngine();
  const cache = useQueryClient();

  const [isSearching, setIsSearching] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const validName = name.trim().length > 0;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setIsUploadingAvatar(true);
    try {
      const { cid } = await Ipfs.uploadImage({ blob: file }, 'TESTNET', true);
      setAvatar(cid);
    } catch (error) {
      console.error('Avatar upload failed:', error);
    } finally {
      setIsUploadingAvatar(false);
      // Clear so re-selecting the same file fires onChange again.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleContinue = async () => {
    if (isSearching) return;
    setTopicId('');
    setIsSearching(true);
    try {
      const trimmedName = name.trim();
      // Use the same GraphQL fuzzy search the global search uses, so
      // results include space name/image for consistent display. Bump
      // first to 100 so exact matches aren't truncated out when there
      // are many fuzzy hits ranked above them.
      const results = await E.findFuzzy({
        store,
        cache,
        where: {
          name: { fuzzy: trimmedName },
          types: ONBOARDING_PERSONAL_SEARCH_TYPES.map(t => ({ id: { equals: t } })),
        },
        first: 100,
        skip: 0,
      });
      const exactMatches = filterExactNameMatches(results, trimmedName, ONBOARDING_PERSONAL_SEARCH_TYPES);
      onProfileContinue(exactMatches);
    } catch (error) {
      console.error('Exact-match search failed, proceeding without matches:', error);
      onProfileContinue([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <StepContents childKey="onboarding">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="overflow-hidden rounded-lg bg-cover bg-center shadow-lg">
              <div className="group relative overflow-hidden rounded-lg">
                {avatar ? (
                  <OnboardingAvatarPreview avatar={avatar} onRemove={() => setAvatar('')} />
                ) : (
                  <img src="/images/onboarding/no-avatar.png" alt="" className="size-[152px] object-cover" />
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 pb-4">
            <SmallButton
              icon={isUploadingAvatar ? <Dots /> : <Upload />}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
            </SmallButton>
            <input
              ref={fileInputRef}
              accept="image/png, image/jpeg"
              onChange={handleChange}
              type="file"
              className="hidden"
            />
          </div>
        </div>
      </StepContents>
      <div className="flex w-full flex-col items-center justify-center gap-3">
        <input
          value={name}
          onChange={event => {
            setName(event.target.value);
          }}
          placeholder="Your name..."
          aria-label="Your name"
          spellCheck={false}
          className="relative z-100 block w-full px-2 py-1 text-center text-mediumTitle text-2xl placeholder:text-grey-02 focus:outline-hidden"
        />
      </div>
      <div className="absolute inset-x-4 bottom-4 flex">
        <div className="absolute top-0 right-0 left-0 z-100 flex -translate-y-full justify-center pb-4">
          <Tooltip
            trigger={
              <div className="inline-flex cursor-pointer items-center gap-1 text-grey-04">
                <Text as="h3" variant="footnote" className="text-center">
                  Personal access controls
                </Text>
                <div>
                  <QuestionCircle />
                </div>
              </div>
            }
            label="A vote isn’t required to publish edits in this space"
            position="top"
          />
        </div>
        <Button disabled={!validName || isSearching || isUploadingAvatar} onClick={handleContinue} className="w-full">
          {isSearching ? (
            <span className="inline-flex h-[1.125rem] items-center">
              <Dots />
            </span>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </div>
  );
}

type StepExistingEntityMatchProps = {
  candidates: SearchResult[];
  onSkip: () => void;
  onSelect: (entityId: string, entityName: string | null) => void;
};

function StepExistingEntityMatch({ candidates, onSkip, onSelect }: StepExistingEntityMatchProps) {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const selectedResult = candidates.find(c => c.id === selectedEntityId) ?? null;

  const handlePrimary = () => {
    if (selectedResult) {
      onSelect(selectedResult.id, selectedResult.name);
    } else {
      onSkip();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 pb-4">
        <Text as="h3" variant="bodySemibold" className="text-center text-2xl!">
          Is this you?
        </Text>
        <Text as="p" variant="body" className="text-center text-base!">
          Looks like your name exists on Geo. If one of these is you, claim it! Otherwise, let&apos;s make you a fresh
          profile.
        </Text>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-grey-02 bg-white">
        {candidates.map((result, index) => (
          <MatchCard
            key={result.id}
            result={result}
            isSelected={selectedEntityId === result.id}
            hasDivider={index < candidates.length - 1}
            onSelect={() => setSelectedEntityId(prev => (prev === result.id ? null : result.id))}
          />
        ))}
      </div>
      <div className="shrink-0 pt-4">
        <Button type="button" onClick={handlePrimary} className="w-full">
          {selectedResult ? 'Use existing profile' : 'Create a profile'}
        </Button>
      </div>
    </div>
  );
}

type MatchCardProps = {
  result: SearchResult;
  isSelected: boolean;
  hasDivider: boolean;
  onSelect: () => void;
};

function MatchCard({ result, isSelected, hasDivider, onSelect }: MatchCardProps) {
  const [space, ...otherSpaces] = result.spaces;
  const spaceName = space?.name ?? null;
  const spaceImg = space?.image ?? null;
  const spaceTypes = (space && result.typesBySpace?.[space.spaceId]) ?? result.types;
  const showBreadcrumbs = Boolean(spaceName) || spaceTypes.length > 0;
  const showBreadcrumbChevron = Boolean(spaceName) && spaceTypes.length > 0;

  return (
    <div className={cx('relative', hasDivider && 'border-b border-divider')}>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cx(
          'flex w-full cursor-pointer flex-col p-2 pr-8 transition-colors duration-150 focus:outline-hidden',
          isSelected ? 'bg-divider' : 'hover:bg-grey-01 focus-visible:bg-grey-01'
        )}
      >
        <div className="flex w-full items-center leading-4">
          <Text variant="metadataMedium" ellipsize className="leading-4.5">
            {result.name ?? result.id}
          </Text>
        </div>
        {showBreadcrumbs && (
          <>
            <Spacer height={4} />
            <div className="flex items-center gap-1.5 overflow-hidden">
              {spaceName && <Breadcrumb img={spaceImg}>{spaceName}</Breadcrumb>}
              {showBreadcrumbChevron && (
                <span style={{ rotate: '270deg' }}>
                  <ChevronDownSmall color="grey-04" />
                </span>
              )}
              {spaceTypes.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {spaceTypes
                    .filter((type, i, self) => self.findIndex(t => t.id === type.id) === i)
                    .map(type => (
                      <Tag key={type.id}>{type.name}</Tag>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
        {result.description && (
          <>
            <Spacer height={4} />
            <Truncate maxLines={3} shouldTruncate variant="footnote">
              <Text variant="footnote">{result.description}</Text>
            </Truncate>
          </>
        )}
        {otherSpaces.length > 0 && (
          <>
            <Spacer height={4} />
            <div className="flex items-center text-footnoteMedium text-grey-04">
              <div className="flex">
                {otherSpaces.slice(0, 3).map(s => (
                  <div
                    key={s.spaceId}
                    className="-ml-[4px] h-[14px] w-[14px] overflow-clip rounded-sm border border-white first:ml-0"
                  >
                    <NativeGeoImage value={s.image} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="ml-1">
                + {otherSpaces.length} {otherSpaces.length === 1 ? 'space' : 'spaces'}
              </div>
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          const entitySpaceId = result.spaces[0]?.spaceId ?? ROOT_SPACE;
          window.open(
            `${NavUtils.toEntity(entitySpaceId, result.id)}?${SUPPRESS_ONBOARDING_PARAM}=1`,
            '_blank',
            'noopener,noreferrer'
          );
        }}
        aria-label="Open entity in new tab"
        className="absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded text-grey-04 hover:bg-grey-02 hover:text-text"
      >
        <NewTab />
      </button>
    </div>
  );
}

type StepCompleteProps = {
  onRetry: () => void;
  showRetry: boolean;
};

const retryMessage: Record<Step, string> = {
  start: '',
  'enter-profile': '',
  'existing-entity-match': '',
  'create-space': 'Space creation failed',
  completed: '',
  done: '',
};

function StepComplete({ onRetry, showRetry }: StepCompleteProps) {
  const step = useAtomValue(stepAtom);

  const hasCompleted = step === 'completed';

  return (
    <>
      <StepContents childKey="start">
        <div className="flex w-full flex-col items-center pt-3">
          <Text as="h3" variant="bodySemibold" className={cx('mx-auto text-center text-2xl!')}>
            {step === 'completed' ? `Finalizing details...` : `Creating space...`}
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center text-base!">
            Get ready to experience a new way of creating and sharing knowledge.
          </Text>
          {step !== 'completed' && (
            <>
              <Spacer height={32} />
              {showRetry && (
                <p className="mt-4 text-center text-smallButton">
                  {retryMessage[step]}{' '}
                  <button onClick={onRetry} className="text-ctaPrimary">
                    Retry
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4">
        <div className="absolute top-0 right-0 left-0 z-10 flex -translate-y-1/2 justify-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-white shadow-card">
            <Dots />
          </div>
        </div>
        <div className="relative z-0">
          <Animation active={hasCompleted} />
        </div>
      </div>
    </>
  );
}

export const Animation = ({ active = false }) => {
  return (
    <div className="relative flex h-[272px] w-[328px] items-center justify-center overflow-clip rounded bg-gradient-geo">
      <div className="absolute top-3 -left-5">
        <div
          className={cx('transition duration-300', active ? 'translate-x-2 translate-y-2 opacity-50' : 'opacity-20')}
        >
          <img src="/images/onboarding/top-left.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute -top-6 -right-20">
        <div
          className={cx('transition duration-300', active ? '-translate-x-2 translate-y-2 opacity-50' : 'opacity-20')}
        >
          <img src="/images/onboarding/top-right.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute top-0 -right-16 bottom-0 flex items-center">
        <div className={cx('transition duration-300', active ? '-translate-x-2 opacity-50' : 'opacity-20')}>
          <img src="/images/onboarding/right-middle.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute -right-48 -bottom-8">
        <div
          className={cx('transition duration-300', active ? '-translate-x-2 -translate-y-2 opacity-50' : 'opacity-20')}
        >
          <img src="/images/onboarding/right-bottom.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute -bottom-4 -left-4">
        <div
          className={cx('transition duration-300', active ? 'translate-x-2 -translate-y-2 opacity-50' : 'opacity-20')}
        >
          <img src="/images/onboarding/left-bottom.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="relative z-1000 -mb-6">
        <img src="/images/onboarding/main.png" alt="" className="h-auto w-[246px]" />
      </div>
      <div className="absolute bottom-8 left-3">
        <div className={cx('transition duration-300', active ? '-translate-y-2 opacity-100' : 'opacity-0')}>
          <img src="/images/onboarding/left-middle-float.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute top-12 -right-16">
        <div className={cx('transition duration-300', active ? 'translate-y-2 opacity-100' : 'opacity-0')}>
          <img src="/images/onboarding/right-middle-float.png" alt="" className="w-1/2" />
        </div>
      </div>
    </div>
  );
};

// Helper component for avatar preview with fallback
const OnboardingAvatarPreview = ({ avatar, onRemove }: { avatar: string; onRemove: () => void }) => {
  const { src, onError } = useImageWithFallback(avatar);

  return (
    <>
      <div
        style={{
          backgroundImage: `url(${src})`,
          height: 152,
          width: 152,
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Hidden img to trigger fallback if needed */}
        <img src={src} onError={onError} alt="" style={{ display: 'none' }} />
      </div>
      <div className="absolute top-0 right-0 p-1.5 opacity-0 transition-opacity duration-200 ease-in-out group-hover:opacity-100">
        <SquareButton disabled={avatar === ''} onClick={onRemove} icon={<Trash />} />
      </div>
    </>
  );
};
