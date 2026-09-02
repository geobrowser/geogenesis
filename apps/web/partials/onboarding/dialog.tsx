'use client';

import { useLogout } from '@geogenesis/auth';
import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useRouter } from 'next/navigation';

import type { BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { ROOT_SPACE } from '~/core/constants';
import { useImageWithFallback } from '~/core/hooks/use-image-with-fallback';
import { SUPPRESS_ONBOARDING_PARAM, useOnboarding } from '~/core/hooks/use-onboarding';
import { searchResultMatchesAllowedTypes } from '~/core/hooks/use-search';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { ID } from '~/core/id';
import { uploadGeoImage } from '~/core/sdk/geo-client';
import { hasSeenAssistantAtom, isChatOpenAtom } from '~/core/state/chat-store';
import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';
import { E } from '~/core/sync/orm';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type { SearchResult } from '~/core/types';
import { devLog } from '~/core/utils/dev-log';
import { NavUtils, validateEntityId } from '~/core/utils/utils';

import { Breadcrumb } from '~/design-system/breadcrumb';
import { Button, SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { FallbackImage } from '~/design-system/fallback-image';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Camera } from '~/design-system/icons/camera';
import { CheckedCircleCheckedSmall } from '~/design-system/icons/check-circle-checked-small';
import { CheckedCircleUncheckedSmall } from '~/design-system/icons/check-circle-unchecked-small';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { RightArrowDiagonalSmall } from '~/design-system/icons/right-arrow-diagonal-small';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Trash } from '~/design-system/icons/trash';
import { Spacer } from '~/design-system/spacer';
import { Tag } from '~/design-system/tag';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

import { type OnboardingStep, shouldOpenOnboardingDialog } from './onboarding-dialog-visibility';
import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

export const nameAtom = atomWithStorage<string>('onboardingName', '');
export const topicIdAtom = atomWithStorage<string>('onboardingEntityId', '');
export const avatarAtom = atomWithStorage<string>('onboardingAvatar', '');
export const spaceIdAtom = atomWithStorage<string>('onboardingSpaceId', '');

/**
 * Topic picks from the 'interested-in' step. Onboarding no longer blocks on space
 * creation, so these are persisted for the background PendingPersonalSpaceRunner,
 * which applies them (membership proposals) once a real spaceId exists, then clears them.
 */
export const selectedTopicIdsAtom = atomWithStorage<string[]>('onboardingSelectedTopics', []);

type Step = OnboardingStep;

const stepOrder: Partial<Record<Step, number>> = {
  start: 1,
  'interested-in': 2,
};

const stepByOrder = Object.fromEntries(Object.entries(stepOrder).map(([step, order]) => [order, step])) as Record<
  number,
  Step
>;

// 'enter-profile' and 'create-space' linger in the type only to normalize
// values persisted by an older version of the flow — see effectiveStep.
export const stepAtom = atomWithStorage<Step>('onboardingStep', 'start');

const ONBOARDING_DESTINATION = NavUtils.toExplore();
// How long the completion screen shows before we route the user onward. The
// personal space keeps creating in the background regardless.
const COMPLETION_ANIMATION_MS = 3000;
const TERMS_AND_CONDITIONS_URL = 'https://docs.google.com/document/d/106bM0qopWGJ8aAausnO7LYtkkDJz__xc/edit';

const ONBOARDING_PERSONAL_SEARCH_TYPES = [SystemIds.SPACE_TYPE, SystemIds.PROJECT_TYPE, SystemIds.PERSON_TYPE];

function filterExactNameMatches(results: SearchResult[], name: string, allowedTypes: string[]): SearchResult[] {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return [];
  return results.filter(
    r => (r.name ?? '').trim().toLowerCase() === normalized && searchResultMatchesAllowedTypes(r, allowedTypes)
  );
}

export const OnboardingDialog = () => {
  const { isOnboardingVisible, hideOnboarding } = useOnboarding();
  const router = useRouter();

  const { smartAccount } = useSmartAccount();
  const setTopicId = useSetAtom(topicIdAtom);
  const setName = useSetAtom(nameAtom);
  const setPending = useSetAtom(pendingPersonalSpaceAtom);
  const setChatOpen = useSetAtom(isChatOpenAtom);
  const [hasSeenAssistant, setHasSeenAssistant] = useAtom(hasSeenAssistantAtom);

  const [selectedTopicIds, setSelectedTopicIds] = useAtom(selectedTopicIdsAtom);
  const [featuredSpaces, setFeaturedSpaces] = useState<BrowseSpaceRow[]>([]);
  const [featuredStatus, setFeaturedStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  const [step, setStep] = useAtom(stepAtom);
  const [entityMatchCandidates, setEntityMatchCandidates] = useState<SearchResult[]>([]);

  // Flows like "Add my ranking" record where the user was headed before being
  const [postOnboardingRedirect, setPostOnboardingRedirect] = useAtom(postOnboardingRedirectAtom);
  const destination = postOnboardingRedirect || ONBOARDING_DESTINATION;

  const dismissOnboarding = React.useCallback(() => {
    hideOnboarding();
    setPostOnboardingRedirect(null);
  }, [hideOnboarding, setPostOnboardingRedirect]);

  // Warm the router cache for the destination once the onboarding
  // dialog is actually visible, so the post-creation redirect lands
  // instantly. Skipping for non-onboarding tabs avoids pointless prefetch.
  useEffect(() => {
    if (!isOnboardingVisible) return;
    router.prefetch(destination);
  }, [isOnboardingVisible, router, destination]);

  useEffect(() => {
    // Only resolve stale state on tabs where the dialog is actually
    // being shown. Otherwise a second tab (e.g. entity preview opened
    // from the match step) would reset `stepAtom` and, via the cross-tab
    // atomWithStorage sync, clobber the original tab's progress.
    if (!isOnboardingVisible) return;
    if (step === 'existing-entity-match' && entityMatchCandidates.length === 0) {
      setStep('start');
    }
  }, [isOnboardingVisible, step, entityMatchCandidates.length, setStep]);

  // Play the completion screen for a beat, then send the user where they were
  // headed. Decoupling the redirect from the synchronous `setPending` (which
  // hides the dialog via `shouldOnboard`) also makes the navigation reliable.
  useEffect(() => {
    if (step !== 'completed') return;
    const timeout = setTimeout(() => {
      devLog('[onboarding] completion animation done → navigating to %s', destination);
      router.push(destination);
      setStep('done');
      dismissOnboarding();
    }, COMPLETION_ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [step, destination, router, setStep, dismissOnboarding]);

  // Fetch featured spaces for the 'interested-in' step. This is the same featured-space
  // traversal the Browse sidebar uses. `featuredError` distinguishes a failed fetch from a
  // genuinely empty result, so the step can offer a retry instead of dead-ending on an empty
  // card (Create profile requires a pick, and onboarding can't be dismissed.
  const loadFeaturedSpaces = React.useCallback(() => {
    setFeaturedStatus('loading');
    fetchBrowseSidebarData(undefined)
      .then(data => {
        setFeaturedSpaces(data.featured);
        setFeaturedStatus(data.featuredError ? 'error' : 'loaded');
      })
      .catch(error => {
        console.error('[onboarding] failed to load featured spaces', error);
        setFeaturedSpaces([]);
        setFeaturedStatus('error');
      });
  }, []);

  useEffect(() => {
    if (step !== 'interested-in') return;
    loadFeaturedSpaces();
  }, [step, loadFeaturedSpaces]);

  const address = smartAccount?.account.address;

  if (!address) return null;

  // Optimistic onboarding: stop blocking on the (30s–3min) personal-space
  // creation chain. Pre-generate the person entity id (`topicId`), hand the
  // job to the always-mounted PendingPersonalSpaceRunner, and let the user
  // straight through to where they were headed. They feel logged in instantly;
  // creation finishes in the background, then their `pending:` edits remap to
  // the real spaceId. The runner also applies the role/topic picks collected
  // above, since those need a real spaceId to attach to.
  function beginOptimisticOnboarding(matchedTopicId: string) {
    if (!address) return;
    const topicId = validateEntityId(matchedTopicId) ? matchedTopicId : ID.createEntityId();
    devLog('[onboarding] begin optimistic onboarding, topicId=%s', topicId);
    setTopicId(topicId);
    // Kick off the background personal-space creation immediately.
    setPending({ topicId, address, status: 'pending' });

    if (!hasSeenAssistant) {
      setChatOpen(true);
      setHasSeenAssistant(true);
    }

    // Show the completion screen; the effect above routes the user onward
    // once it has played.
    setStep('completed');
  }

  async function onProfileContinue(exactMatches: SearchResult[]) {
    if (!address || !smartAccount) return;

    if (exactMatches.length > 0) {
      setEntityMatchCandidates(exactMatches);
      setStep('existing-entity-match');
    } else {
      setTopicId('');
      setStep('interested-in');
    }
  }

  function onCompleteOnboard() {
    if (!address || !smartAccount) return;
    beginOptimisticOnboarding('');
  }

  const handleSelectTopics = (id: string) => {
    setSelectedTopicIds(prev => (prev.includes(id) ? prev.filter(topicId => topicId !== id) : [...prev, id]));
  };

  // `stepAtom` is persisted via atomWithStorage, but entityMatchCandidates
  // is local state. On a refresh while the stored step is
  // 'existing-entity-match' the candidates array would be empty — render
  // StepWelcome during that window so we don't flash an empty match
  // step for a frame before the reset effect kicks in.
  const effectiveStep: Step =
    step === 'enter-profile' ||
    step === 'create-space' ||
    (step === 'existing-entity-match' && entityMatchCandidates.length === 0)
      ? 'start'
      : step;

  return (
    // Stay open through the completion screen — `setPending` flips
    // `isOnboardingVisible` false, but we want it to finish first.
    <Root open={shouldOpenOnboardingDialog(isOnboardingVisible, step)}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text opacity-20" />
        <Content
          aria-describedby={undefined}
          // No escape: a user without a personal space who dismisses this gets
          // stuck (can't publish). Onboarding must run to completion.
          onEscapeKeyDown={e => e.preventDefault()}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
          className="fixed inset-0 z-1000 flex h-full w-full items-start justify-center p-6"
        >
          <Title className="sr-only">Set up your Geo account</Title>
          <ModalCard childKey="card" effectiveStep={effectiveStep}>
            <StepHeader step={effectiveStep} onClearEntityMatches={() => setEntityMatchCandidates([])} />
            {effectiveStep === 'start' && <StepWelcome onProfileContinue={onProfileContinue} />}
            {effectiveStep === 'existing-entity-match' && (
              <StepExistingEntityMatch
                candidates={entityMatchCandidates}
                onSkip={() => {
                  setTopicId('');
                  setStep('interested-in');
                }}
                onSelect={(entityId, entityName) => {
                  if (entityName) setName(entityName);
                  beginOptimisticOnboarding(entityId);
                }}
              />
            )}
            {effectiveStep === 'interested-in' && (
              <StepInterestedIn
                selectedTopicIds={selectedTopicIds}
                handleSelectTopics={handleSelectTopics}
                onCompleteOnboard={onCompleteOnboard}
                featuredSpaces={featuredSpaces}
                status={featuredStatus}
                onRetry={loadFeaturedSpaces}
              />
            )}
            {effectiveStep === 'completed' && <StepComplete />}
          </ModalCard>
        </Content>
      </Portal>
    </Root>
  );
};

type ModalCardProps = {
  childKey: string;
  children: React.ReactNode;
  effectiveStep: Step;
};

const ModalCard = ({ childKey, children, effectiveStep }: ModalCardProps) => {
  return (
    <motion.div
      key={childKey}
      initial={{ opacity: 0, bottom: -5 }}
      animate={{ opacity: 1, bottom: 0 }}
      exit={{ opacity: 0, bottom: -5 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className={`pointer-events-auto relative z-100 mt-40 flex ${effectiveStep === 'completed' ? 'h-[245px] px-6 py-10' : 'h-[485px] p-6 pt-8'} w-full max-w-[360px] flex-col overflow-hidden rounded-md border border-grey-02 bg-white shadow-dropdown`}
    >
      {children}
    </motion.div>
  );
};

const STEPS_WITH_HEADER = ['start', 'interested-in', 'existing-entity-match'] as const;
type StepWithHeader = (typeof STEPS_WITH_HEADER)[number];

type DotConfig = { width: 'w-4' | 'w-8'; active: boolean };

const DOT_CONFIGS: Record<StepWithHeader, DotConfig[]> = {
  start: [
    { width: 'w-8', active: true },
    { width: 'w-4', active: false },
  ],
  'interested-in': [
    { width: 'w-4', active: true },
    { width: 'w-8', active: true },
  ],
  'existing-entity-match': [
    { width: 'w-8', active: true },
    { width: 'w-4', active: false },
  ],
};

const StepDots = ({ step }: { step: StepWithHeader }) => (
  <div className="flex w-full items-center justify-center gap-[7px]">
    {DOT_CONFIGS[step].map((dot, i) => (
      <span key={i} className={`h-[5px] rounded-[50px] ${dot?.width} ${dot?.active ? 'bg-[#2A2B2E]' : 'bg-grey-02'}`} />
    ))}
  </div>
);

// `step` is the normalized effectiveStep, so a legacy value persisted by an
// older version of the flow still renders the header for the step it maps to.
const StepHeader = ({ step, onClearEntityMatches }: { step: Step; onClearEntityMatches: () => void }) => {
  const setStep = useSetAtom(stepAtom);
  // Cleanup runs via the app-root useGeoLogoutCleanup; this only triggers it.
  const { logout } = useLogout();

  if (!STEPS_WITH_HEADER.includes(step as StepWithHeader)) return null;

  const showBack = step === 'existing-entity-match' || (stepOrder[step] ?? 0) > 1;

  const handleBack = () => {
    if (step === 'existing-entity-match') {
      onClearEntityMatches();
      setStep('start');
      return;
    }
    setStep(stepByOrder[(stepOrder[step] ?? 0) - 1] ?? 'start');
  };

  return (
    <div className="relative z-20 mb-6 flex h-4 w-full items-center justify-center">
      {showBack && (
        <div className="absolute left-0 rotate-180">
          <SquareButton icon={<RightArrowLongSmall />} onClick={handleBack} className="border-none! bg-transparent!" />
        </div>
      )}
      <StepDots step={step as StepWithHeader} />
      {/* Onboarding can't be dismissed, so logout is the only way out. */}
      <button
        type="button"
        onClick={() => logout()}
        className="absolute right-0 text-smallButton text-grey-04 transition-colors hover:text-text"
      >
        Log out
      </button>
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

type StepOnboardingProps = {
  onProfileContinue: (exactMatches: SearchResult[]) => void;
};

function StepWelcome({ onProfileContinue }: StepOnboardingProps) {
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
      const { cid } = await uploadGeoImage({ blob: file });
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
    <div className="flex h-full flex-col justify-between">
      <StepContents childKey="welcome">
        <div className="w-full">
          <Text as="h3" variant="bodySemibold" className="mx-auto text-center text-2xl leading-[29px]">
            Welcome to Geo 👋
          </Text>
          <Text
            as="p"
            variant="body"
            className="mx-auto mt-2 text-center text-[16px] leading-5 font-normal text-grey-04"
          >
            What should we call you?
          </Text>
        </div>
      </StepContents>
      <div className="mt-[58px] flex grow flex-col items-center justify-start">
        <div className="group relative h-20 w-20">
          {avatar ? (
            <OnboardingAvatarPreview avatar={avatar} />
          ) : (
            <img
              className="cursor-pointer rounded-full"
              src="/images/onboarding/no-avatar.png"
              alt=""
              onClick={() => fileInputRef.current?.click()}
            />
          )}
          <div className="absolute right-0 bottom-0 h-6 w-6">
            <SquareButton
              onClick={() => {
                if (avatar) {
                  setAvatar('');
                } else fileInputRef.current?.click();
              }}
              icon={avatar ? <Trash /> : <Camera />}
            />
          </div>
        </div>

        <input
          ref={fileInputRef}
          accept="image/png, image/jpeg"
          onChange={handleChange}
          type="file"
          className="hidden"
        />
        <div className="mt-6 flex w-full flex-col items-center justify-center gap-3">
          <input
            value={name}
            onChange={event => {
              setName(event.target.value);
            }}
            placeholder="Name..."
            aria-label="Name"
            spellCheck={false}
            className="relative z-100 block w-full px-2 py-1 text-center text-mediumTitle text-2xl placeholder:text-grey-02 focus:outline-hidden"
          />
        </div>
      </div>
      <div className="relative">
        <div className="absolute top-0 right-0 left-0 z-100 flex -translate-y-full justify-center pb-4">
          <Text as="p" variant="footnote" className="text-center text-grey-04">
            All content is public and shared onchain.
            <br />
            By signing up, you agree to our{' '}
            <a
              href={TERMS_AND_CONDITIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text underline decoration-text underline-offset-2"
            >
              Terms &amp; Conditions
            </a>
          </Text>
        </div>
        <Button
          disabled={!validName || isSearching || isUploadingAvatar}
          onClick={handleContinue}
          className={`${!validName ? 'bg-[#F0F0F0]' : 'bg-ctaHover'} h-6 w-full rounded-md pt-0 pr-0 pb-0 pl-0 text-[1rem] leading-4 font-normal`}
        >
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
        <Text as="h3" variant="bodySemibold" className="text-center text-2xl leading-[29px]">
          Is this you?
        </Text>
        <Text as="p" variant="body" className="text-center text-[16px] leading-5 font-normal text-grey-04">
          Looks like your name exists on Geo. If one of these is you, claim it! Otherwise, create a fresh profile.
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
        <Button
          type="button"
          onClick={handlePrimary}
          className="h-6 w-full rounded-md bg-ctaHover pt-0 pr-0 pb-0 pl-0 text-[1rem] leading-4 font-normal"
        >
          Continue
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
          'flex w-full cursor-pointer flex-col py-4 pr-8 pl-3 transition-colors duration-150 focus:outline-hidden',
          isSelected ? 'bg-grey-01' : 'hover:bg-grey-01 focus-visible:bg-grey-01'
        )}
      >
        <div className="flex">
          <div className="min-w-3 pt-1">
            {isSelected ? <CheckedCircleCheckedSmall /> : <CheckedCircleUncheckedSmall />}
          </div>
          <div className="ml-3">
            <div className="flex w-full items-center">
              <Text variant="metadataMedium" ellipsize>
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
                          <Tag className="bg-[#F0F0F0]" key={type.id}>
                            {type.name}
                          </Tag>
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
        </div>
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
        className="absolute top-1/2 right-2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-grey-04 hover:bg-grey-02 hover:text-text"
      >
        <RightArrowDiagonalSmall />
      </button>
    </div>
  );
}

function StepInterestedIn({
  handleSelectTopics,
  selectedTopicIds,
  onCompleteOnboard,
  featuredSpaces,
  status,
  onRetry,
}: {
  handleSelectTopics: (id: string) => void;
  selectedTopicIds: string[];
  onCompleteOnboard: () => void;
  featuredSpaces: BrowseSpaceRow[];
  status: 'loading' | 'loaded' | 'error';
  onRetry: () => void;
}) {
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const canCreateProfile = featuredSpaces.length > 0 ? selectedTopicIds.length > 0 : true;

  return (
    <div className="flex h-full flex-col justify-between">
      <StepContents childKey="interested-in">
        <div className="w-full">
          <Text as="h3" variant="bodySemibold" className="mx-auto text-center text-2xl leading-[29px]">
            What are you interested in?
          </Text>
          <Text
            as="p"
            variant="body"
            className="mx-auto mt-2 text-center text-[16px] leading-5 font-normal text-grey-04"
          >
            Select the first spaces you want to join
          </Text>
        </div>
      </StepContents>
      {isLoading ? (
        <div className="flex h-full items-center justify-center pt-[32px]">
          <Dots />
        </div>
      ) : isError ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 pt-[32px] text-center">
          <Text as="p" variant="body" className="text-[16px] leading-5 font-normal text-grey-04">
            We couldn&apos;t load spaces to join. Check your connection and try again.
          </Text>
        </div>
      ) : (
        <div className="flex h-full flex-wrap content-start items-start justify-center gap-1 pt-[32px]">
          {featuredSpaces.map(featuredSpace => {
            return (
              <div
                key={`interested-topic-${featuredSpace.id}`}
                role="button"
                onClick={() => handleSelectTopics(featuredSpace.id)}
                className={`flex cursor-pointer items-center justify-start rounded-[40px] border px-4 py-3 ${selectedTopicIds.includes(featuredSpace.id) ? 'border-[#2A2B2E]' : 'border-grey-02'}`}
              >
                <div className="relative mr-[10px] h-4 w-4">
                  <FallbackImage
                    value={featuredSpace.image ?? ''}
                    sizes="16px"
                    className="max-h-4 max-w-4 rounded-full bg-red-01"
                  />
                </div>

                <span className="text-[16px] leading-[10px] font-normal text-[#2A2B2E]">{featuredSpace.name}</span>
              </div>
            );
          })}
        </div>
      )}
      {isError ? (
        <Button
          onClick={onRetry}
          className="min-h-6 w-full rounded-md bg-ctaHover pt-0 pr-0 pb-0 pl-0 text-[1rem] leading-4 font-normal"
        >
          Try again
        </Button>
      ) : (
        <Button
          onClick={onCompleteOnboard}
          disabled={isLoading || !canCreateProfile}
          className={cx(
            'min-h-6 w-full rounded-md pt-0 pr-0 pb-0 pl-0 text-[1rem] leading-4 font-normal',
            !isLoading && canCreateProfile && 'bg-ctaHover'
          )}
        >
          Create profile
        </Button>
      )}
    </div>
  );
}

function StepComplete() {
  const avatar = useAtomValue(avatarAtom);

  const { src, onError } = useImageWithFallback(avatar);

  return (
    <StepContents childKey="completed">
      <div className="flex w-full flex-col items-center">
        <img
          className="mb-5 h-[50px] w-[50px] rounded-full"
          src={src ?? '/images/onboarding/no-avatar.png'}
          onError={onError}
          alt=""
        />
        <Text
          as="h3"
          variant="bodySemibold"
          className="mx-auto text-center text-[24px]! leading-[29px]! font-semibold! tracking-[-0.75px]"
        >
          Creating your space...
        </Text>
        <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center text-[16px]! leading-[20px]! font-normal!">
          Your space is your area to curate and rank
          <br />
          collections, write posts, complete your
          <br />
          profile etc.
        </Text>
      </div>
    </StepContents>
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
const OnboardingAvatarPreview = ({ avatar }: { avatar: string }) => {
  const { src, onError } = useImageWithFallback(avatar);

  return (
    <div
      style={{
        backgroundImage: `url(${src})`,
        height: 80,
        width: 80,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        borderRadius: 100,
      }}
    >
      {/* Hidden img to trigger fallback if needed */}
      <img src={src} onError={onError} alt="" style={{ display: 'none' }} />
    </div>
  );
};
