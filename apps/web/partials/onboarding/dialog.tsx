'use client';

import { Ipfs, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { Content, Overlay, Portal, Root } from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';

import cx from 'classnames';
import { Effect } from 'effect';
import { motion } from 'framer-motion';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useRouter } from 'next/navigation';

import { FEATURED_BROWSE_SPACES } from '~/core/browse/featured-spaces';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import {
  CURIOUS_EXPLORER_ROLE,
  DEVELOPER_ROLE,
  DOMAIN_EXPERT_ROLE,
  GEO_ROLES_PROPERTY,
  ROOT_SPACE,
} from '~/core/constants';
import { useCreatePersonalSpace } from '~/core/hooks/use-create-personal-space';
import { useImageWithFallback } from '~/core/hooks/use-image-with-fallback';
import { SUPPRESS_ONBOARDING_PARAM, useOnboarding } from '~/core/hooks/use-onboarding';
import { proposeAddMemberDirect } from '~/core/hooks/use-propose-add-member';
import { searchResultMatchesAllowedTypes } from '~/core/hooks/use-search';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { ID } from '~/core/id';
import { getSpace } from '~/core/io/queries';
import { queryClient } from '~/core/query-client';
import { hasSeenAssistantAtom, isChatOpenAtom } from '~/core/state/chat-store';
import { useReportError } from '~/core/state/status-bar-store';
import { E } from '~/core/sync/orm';
import { storage } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type { SearchResult } from '~/core/types';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { describeError } from '~/core/utils/error-diagnostics';
import { NavUtils, sleep } from '~/core/utils/utils';

import { Breadcrumb } from '~/design-system/breadcrumb';
import { Button, SquareButton } from '~/design-system/button';
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

export const nameAtom = atomWithStorage<string>('onboardingName', '');
export const topicIdAtom = atomWithStorage<string>('onboardingEntityId', '');
export const avatarAtom = atomWithStorage<string>('onboardingAvatar', '');
export const spaceIdAtom = atomWithStorage<string>('onboardingSpaceId', '');

type Step =
  | 'start'
  | 'existing-entity-match'
  | 'describe-you'
  | 'interested-in'
  | 'create-space'
  | 'completed'
  | 'done';

const stepOrder: Partial<Record<Step, number>> = {
  start: 1,
  'describe-you': 2,
  'interested-in': 3,
};

const stepByOrder = Object.fromEntries(Object.entries(stepOrder).map(([step, order]) => [order, step])) as Record<
  number,
  Step
>;

export const stepAtom = atomWithStorage<Step>('onboardingStep', 'start');

const workflowSteps: Array<Step> = ['create-space', 'completed'];

const ONBOARDING_DESTINATION = NavUtils.toExplore();

const ONBOARDING_PERSONAL_SEARCH_TYPES = [SystemIds.SPACE_TYPE, SystemIds.PROJECT_TYPE, SystemIds.PERSON_TYPE];

function filterExactNameMatches(results: SearchResult[], name: string, allowedTypes: string[]): SearchResult[] {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return [];
  return results.filter(
    r => (r.name ?? '').trim().toLowerCase() === normalized && searchResultMatchesAllowedTypes(r, allowedTypes)
  );
}

export const OnboardingDialog = () => {
  const { isOnboardingVisible } = useOnboarding();
  const router = useRouter();
  const tx = useSmartAccountTransaction({ address: SPACE_REGISTRY_ADDRESS });

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
  const [selectedRolesIds, setSelectedRolesIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);

  const [featuredSpaces, setFeaturedSpaces] = useState<BrowseSpaceRow[]>([]);

  const [step, setStep] = useAtom(stepAtom);
  const [entityMatchCandidates, setEntityMatchCandidates] = useState<SearchResult[]>([]);

  const reportError = useReportError();

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
      setStep('start');
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

  // Fetch featured spaces if the step is 'interested-in'
  useEffect(() => {
    if (step !== 'interested-in') return;

    fetchBrowseSidebarData(undefined)
      .then(data => setFeaturedSpaces(data.featured))
      .catch(() => {
        setFeaturedSpaces(FEATURED_BROWSE_SPACES.map(s => ({ ...s, image: null, unnamed: false })));
      });
  }, [step]);

  const address = smartAccount?.account.address;

  if (!address) return null;

  type CreatePersonalSpaceTopicArg = { topicIdForPublish?: string };

  async function createSpace(options?: CreatePersonalSpaceTopicArg) {
    if (!address) return;

    const effectiveTopicId = options?.topicIdForPublish !== undefined ? options.topicIdForPublish : topicId;

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

      // re-fetch space
      const space = await Effect.runPromise(getSpace(spaceId));

      // create relations for selected roles
      if (selectedRolesIds.length > 0 && space) {
        for (const roleId of selectedRolesIds) {
          createRelation(spaceId, roleId, 'Geo roles', space?.entity.id, GEO_ROLES_PROPERTY);
        }
      }

      // Membership proposals for selected interest spaces
      if (smartAccount) {
        for (const targetSpaceId of selectedTopicIds) {
          try {
            const targetSpace = await Effect.runPromise(getSpace(targetSpaceId));
            if (!targetSpace?.address) continue;

            await proposeAddMemberDirect({
              spaceId: targetSpaceId,
              targetMemberSpaceId: spaceId,
              personalSpaceId: spaceId,
              space: targetSpace,
              tx,
            });
          } catch (error) {
            console.error('Membership proposal failed for', targetSpaceId, error);
          }
        }
      }

      setStep('completed');
    } catch (error) {
      console.error(error);
      // Drop back to the form step so the user has a recovery path even if
      // they dismiss the global error toast — there's no close affordance
      // on the StepComplete ("Creating space...") screen.
      setStep('interested-in');
      const message = describeError(error);
      reportError(`Space creation failed: ${message}`, () => {
        setStep('create-space');
        createSpace(options);
      });
    }
  }

  function createRelation(
    spaceId: string,
    roleEntityId: string,
    propertyName: string,
    fromEntityId: string,
    propertyId: string
  ) {
    storage.relations.set({
      id: ID.createEntityId(),
      entityId: spaceId,
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generate(),

      type: {
        id: propertyId,
        name: propertyName,
      },

      fromEntity: {
        id: fromEntityId,
        name: null,
      },

      toEntity: {
        id: roleEntityId,
        name: null,
        value: roleEntityId,
      },
    });
  }

  async function onCompleteOnboard() {
    if (!address || !smartAccount) return;
    setStep('create-space');
    createSpace({ topicIdForPublish: '' });
  }

  const handleSelectRoles = (id: string) => {
    if (selectedRolesIds.includes(id)) {
      setSelectedRolesIds(
        selectedRolesIds.filter(roleId => {
          return roleId !== id;
        })
      );
    } else {
      setSelectedRolesIds([...selectedRolesIds, id]);
    }
  };

  const handleSelectTopics = (id: string) => {
    if (selectedTopicIds.includes(id)) {
      setSelectedTopicIds(
        selectedTopicIds.filter(roleId => {
          return roleId !== id;
        })
      );
    } else {
      setSelectedTopicIds([...selectedTopicIds, id]);
    }
  };

  const handleNextStep = (step: Step) => {
    setStep(step);
  };

  async function onProfileContinue(exactMatches: SearchResult[]) {
    if (!address || !smartAccount) return;

    if (exactMatches.length > 0) {
      setEntityMatchCandidates(exactMatches);
      setStep('existing-entity-match');
    } else {
      setTopicId('');
      setStep('describe-you');
    }
  }

  // `stepAtom` is persisted via atomWithStorage, but entityMatchCandidates
  // is local state. On a refresh while the stored step is
  // 'existing-entity-match' the candidates array would be empty — render
  // StepOnboarding during that window so we don't flash an empty match
  // step for a frame before the reset effect kicks in.
  const effectiveStep = step === 'existing-entity-match' && entityMatchCandidates.length === 0 ? 'start' : step;

  return (
    <Root open={isOnboardingVisible}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text opacity-20" />
        <Content className="fixed inset-0 z-1000 flex h-full w-full items-start justify-center p-6">
          <ModalCard childKey="card" effectiveStep={effectiveStep}>
            <StepHeader onClearEntityMatches={() => setEntityMatchCandidates([])} />
            {effectiveStep === 'start' && <StepWelcome onProfileContinue={onProfileContinue} />}
            {effectiveStep === 'existing-entity-match' && (
              <StepExistingEntityMatch
                candidates={entityMatchCandidates}
                onSkip={async () => {
                  setTopicId('');
                  setStep('describe-you');
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
            {effectiveStep === 'describe-you' && (
              <StepDescribeYou
                handleSelectRoles={handleSelectRoles}
                selectedRolesIds={selectedRolesIds}
                handleNextStep={handleNextStep}
              />
            )}
            {effectiveStep === 'interested-in' && (
              <StepInterestedIn
                selectedTopicIds={selectedTopicIds}
                handleSelectTopics={handleSelectTopics}
                onCompleteOnboard={onCompleteOnboard}
                featuredSpaces={featuredSpaces}
                name={name}
              />
            )}

            {workflowSteps.includes(effectiveStep) && <StepComplete />}
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
      className={`pointer-events-auto relative z-100 mt-40 flex ${effectiveStep === 'create-space' ? 'h-[245px]' : 'h-[485px]'} w-full max-w-[360px] flex-col overflow-hidden rounded-md border border-grey-02 bg-white p-6 pt-8 shadow-dropdown`}
    >
      {children}
    </motion.div>
  );
};

const STEPS_WITH_HEADER = ['start', 'describe-you', 'interested-in', 'existing-entity-match'] as const;
type StepWithHeader = (typeof STEPS_WITH_HEADER)[number];

type DotConfig = { width: 'w-4' | 'w-8'; active: boolean };

const DOT_CONFIGS: Record<StepWithHeader, [DotConfig, DotConfig, DotConfig, DotConfig?]> = {
  welcome: [
    { width: 'w-8', active: true },
    { width: 'w-4', active: false },
    { width: 'w-4', active: false },
  ],
  'describe-you': [
    { width: 'w-4', active: true },
    { width: 'w-8', active: true },
    { width: 'w-4', active: false },
  ],
  'interested-in': [
    { width: 'w-4', active: true },
    { width: 'w-4', active: true },
    { width: 'w-8', active: true },
    { width: 'w-4', active: false },
  ],
  'existing-entity-match': [
    { width: 'w-8', active: true },
    { width: 'w-4', active: false },
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

const StepHeader = ({ onClearEntityMatches }: { onClearEntityMatches: () => void }) => {
  const [step, setStep] = useAtom(stepAtom);

  if (step === 'create-space' || step === 'completed') return null;

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

function StepWelcome({ onProfileContinue }: StepOnboardingProps) {
  const setStep = useSetAtom(stepAtom);

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
    <>
      <div className="flex h-full flex-col justify-between">
        <StepContents childKey="start">
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
                onClick={() => fileInputRef.current?.click()}
              />
            )}
            <div className="absolute right-0 bottom-0 h-6 w-6">
              <SquareButton
                disabled={avatar === ''}
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
        <Button
          disabled={name.length === 0}
          onClick={handleContinue}
          className={`${name.length === 0 ? 'bg-[#F0F0F0]' : 'bg-ctaHover'} h-6 w-full rounded-md pt-0 pr-0 pb-0 pl-0 text-[1rem] leading-4 font-normal`}
        >
          Continue
        </Button>
      </div>
    </>
  );
}

type StepOnboardingProps = {
  onProfileContinue: (exactMatches: SearchResult[]) => void;
};

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
          className={`h-6 w-full rounded-md bg-ctaHover pt-0 pr-0 pb-0 pl-0 text-[1rem] leading-4 font-normal`}
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
              <Text variant="metadataMedium" ellipsize className="">
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

function StepDescribeYou({
  handleSelectRoles,
  selectedRolesIds,
  handleNextStep,
}: {
  handleSelectRoles: (id: string) => void;
  selectedRolesIds: string[];
  handleNextStep: (step: Step) => void;
}) {
  const describedRoles = [
    {
      label: 'Domain expert',
      description: 'I want to upload documents and articles',
      id: DOMAIN_EXPERT_ROLE,
      emoji: '📚',
    },
    {
      label: 'Developer',
      description: 'I want to add content programmatically',
      id: DEVELOPER_ROLE,
      emoji: '⌨️',
    },
    {
      label: 'Domain expert',
      description: 'I just want to browse',
      id: CURIOUS_EXPLORER_ROLE,
      emoji: '👀',
    },
  ];
  return (
    <>
      <div className="flex h-full flex-col justify-between">
        <StepContents childKey="start">
          <div className="w-full">
            <Text as="h3" variant="bodySemibold" className="mx-auto text-center text-2xl leading-[29px]">
              What best describes you?
            </Text>
            <Text
              as="p"
              variant="body"
              className="mx-auto mt-2 text-center text-[16px] leading-5 font-normal text-grey-04"
            >
              We’ll use this to tailor your onboarding experience
            </Text>
          </div>
        </StepContents>
        <div className="mt-[32px] flex grow flex-col items-center justify-start gap-2">
          {describedRoles.map(role => {
            return (
              <div
                key={`role-id-${role.id}`}
                role="button"
                onClick={() => handleSelectRoles(role.id)}
                className={`flex h-[70px] w-full cursor-pointer items-center justify-start rounded-md border p-4 ${selectedRolesIds.includes(role.id) ? 'border-[#2A2B2E]' : 'border-grey-02'}`}
              >
                <span className="text-2xl">{role.emoji}</span>
                <div className="ml-5 flex flex-col">
                  <span className="text-[19px] leading-[19px] font-semibold text-[#2A2B2E]">{role.label}</span>
                  <span className="mt-1 text-[14px] leading-[14px] font-normal text-grey-04">{role.description}</span>
                </div>
              </div>
            );
          })}
        </div>
        <Button
          onClick={() => handleNextStep('interested-in')}
          className={`h-6 w-full rounded-md bg-ctaHover pt-0 pr-0 pb-0 pl-0 text-[1rem] leading-4 font-normal`}
        >
          Continue
        </Button>
      </div>
    </>
  );
}

function StepExpertIn({
  handleSelectExpertise,
  selectedExpertiseIds,
  handleNextStep,
}: {
  handleSelectExpertise: (id: string) => void;
  selectedExpertiseIds: string[];
  handleNextStep: (step: Step) => void;
}) {
  const describedExpertise = [
    {
      label: 'Science',
      id: '1',
    },
    {
      label: 'Art',
      id: '2',
    },
    {
      label: 'Medicine',
      id: '3',
    },
    {
      label: 'History',
      id: '4',
    },
    {
      label: 'Society',
      id: '5',
    },
    {
      label: 'Politics',
      id: '6',
    },
    {
      label: 'Policy',
      id: '7',
    },
    {
      label: 'Another',
      id: '8',
    },
    {
      label: 'Another',
      id: '9',
    },
    {
      label: 'Another',
      id: '10',
    },
  ];

  return (
    <>
      <div className="flex h-full flex-col justify-between">
        <StepContents childKey="start">
          <div className="w-full">
            <Text as="h3" variant="bodySemibold" className="mx-auto text-center text-2xl leading-[29px]">
              What are you an expert in?
            </Text>
            <Text
              as="p"
              variant="body"
              className="mx-auto mt-2 text-center text-[16px] leading-5 font-normal text-grey-04"
            >
              Choose what fits best
            </Text>
          </div>
        </StepContents>
        <div className="flex h-full flex-wrap content-start items-start justify-center gap-1 pt-[32px]">
          {describedExpertise.map(expertise => {
            return (
              <div
                role="button"
                onClick={() => handleSelectExpertise(expertise.id)}
                className={`flex cursor-pointer items-center justify-start rounded-[40px] border px-4 py-3 ${selectedExpertiseIds.includes(expertise.id) ? 'border-[#2A2B2E]' : 'border-grey-02'}`}
              >
                <span className="text-[16px] leading-[10px] font-normal text-[#2A2B2E]">{expertise.label}</span>
              </div>
            );
          })}
        </div>
        <Button
          onClick={() => handleNextStep('interested-in')}
          className={`min-h-6 w-full rounded-md bg-ctaHover pt-0 pr-0 pb-0 pl-0 text-[1rem] leading-4 font-normal`}
        >
          Continue
        </Button>
      </div>
    </>
  );
}

function StepInterestedIn({
  handleSelectTopics,
  selectedTopicIds,
  onCompleteOnboard,
  featuredSpaces,
  name,
}: {
  handleSelectTopics: (id: string) => void;
  selectedTopicIds: string[];
  onCompleteOnboard: () => void;
  featuredSpaces: BrowseSpaceRow[];
  name: string;
}) {
  return (
    <>
      <div className="flex h-full flex-col justify-between">
        <StepContents childKey="start">
          <div className="w-full">
            <Text as="h3" variant="bodySemibold" className="mx-auto text-center text-2xl leading-[29px]">
              What are you interested in?
            </Text>
            <Text
              as="p"
              variant="body"
              className="mx-auto mt-2 text-center text-[16px] leading-5 font-normal text-grey-04"
            >
              We need copy for this subline @{name}
            </Text>
          </div>
        </StepContents>
        <div className="flex h-full flex-wrap content-start items-start justify-center gap-1 pt-[32px]">
          {featuredSpaces.map(expertise => {
            return (
              <div
                key={`interested-topic-${expertise.id}`}
                role="button"
                onClick={() => handleSelectTopics(expertise.id)}
                className={`flex cursor-pointer items-center justify-start rounded-[40px] border px-4 py-3 ${selectedTopicIds.includes(expertise.id) ? 'border-[#2A2B2E]' : 'border-grey-02'}`}
              >
                <div className="relative mr-[10px] h-4 w-4">
                  <FallbackImage
                    value={expertise.image ?? ''}
                    sizes="16px"
                    className="max-h-4 max-w-4 rounded-full bg-red-01"
                  />
                </div>

                <span className="text-[16px] leading-[10px] font-normal text-[#2A2B2E]">{expertise.name}</span>
              </div>
            );
          })}
        </div>
        <Button
          onClick={onCompleteOnboard}
          className={`min-h-6 w-full rounded-md bg-ctaHover pt-0 pr-0 pb-0 pl-0 text-[1rem] leading-4 font-normal`}
        >
          Create profile
        </Button>
      </div>
    </>
  );
}

function StepComplete() {
  const step = useAtomValue(stepAtom);
  const avatar = useAtomValue(avatarAtom);

  const { src, onError } = useImageWithFallback(avatar);

  return (
    <>
      <StepContents childKey="start">
        <div className="flex w-full flex-col items-center pt-3">
          <img
            className="mb-5 h-[50px] w-[50px] rounded-full"
            src={src ?? '/images/onboarding/no-avatar.png'}
            onError={onError}
          />
          <Text as="h3" variant="bodySemibold" className={cx('mx-auto text-center text-2xl!')}>
            Creating your space...
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center text-base!">
            Your space is your area to curate and rank collections, write posts, complete your profile etc.
          </Text>
          {step !== 'completed' && <Spacer height={32} />}
        </div>
      </StepContents>
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
const OnboardingAvatarPreview = ({ avatar }: { avatar: string }) => {
  const { src, onError } = useImageWithFallback(avatar);

  return (
    <>
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
    </>
  );
};
